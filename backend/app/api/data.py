from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_session, require_dataset
from app.api.schemas import (
    ImportReportOut,
    ImportRunListResponse,
    ImportRunOut,
)
from app.config import Settings
from app.models import Area, Facility, ImportRun
from app.seed import DEMO_DATASET_ID
from app.services.importer import (
    ExistingContext,
    ImportFormatError,
    parse_import,
)

router = APIRouter(prefix="/api/v1", tags=["data"])
logger = logging.getLogger(__name__)


def _run_out(run: ImportRun) -> ImportRunOut:
    return ImportRunOut(
        id=run.id,
        dataset_id=run.dataset_id,
        filename=run.filename,
        kind=run.kind,
        status=run.status,
        rows_total=run.rows_total,
        rows_imported=run.rows_imported,
        errors=list(run.errors or []),
        created_at=run.created_at,
    )


@router.get("/data/imports", response_model=ImportRunListResponse)
def import_history(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    session: Session = Depends(get_session),
) -> ImportRunListResponse:
    total = session.scalar(select(func.count()).select_from(ImportRun)) or 0
    runs = list(
        session.scalars(
            select(ImportRun).order_by(ImportRun.created_at.desc()).limit(limit)
        ).all()
    )
    return ImportRunListResponse(items=[_run_out(run) for run in runs], total=total)


@router.post("/data/import", response_model=ImportReportOut, status_code=201)
async def import_data(
    file: Annotated[UploadFile, File()],
    kind: Annotated[Literal["facilities", "areas"], Form()],
    dataset_id: Annotated[str, Form()] = DEMO_DATASET_ID,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> ImportReportOut:
    dataset = require_dataset(session, dataset_id)
    filename = Path(file.filename or "upload").name
    if len(filename) > 255:
        raise HTTPException(status_code=422, detail="Filename is too long")

    content = await file.read(settings.max_import_bytes + 1)
    if len(content) > settings.max_import_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                "Uploaded file exceeds the configured limit of "
                f"{settings.max_import_bytes} bytes"
            ),
        )
    await file.close()

    areas = list(session.scalars(select(Area)))
    facilities = list(session.scalars(select(Facility)))
    context = ExistingContext.from_rows(facilities, areas)

    run_id = str(uuid.uuid4())
    try:
        parsed = parse_import(filename, content, kind, context)
    except ImportFormatError as exc:
        session.add(
            ImportRun(
                id=run_id,
                dataset_id=dataset.id,
                filename=filename,
                kind=kind,
                status="failed",
                rows_total=0,
                rows_imported=0,
                errors=[{"row": None, "field": None, "message": str(exc)}],
            )
        )
        session.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        for item in parsed.facilities:
            session.add(
                Facility(
                    id=item["id"],
                    dataset_id=dataset.id,
                    name=item["name"],
                    facility_type=item["facility_type"],
                    services=item["services"],
                    lon=item["lon"],
                    lat=item["lat"],
                    data_status=item["data_status"],
                )
            )
        for item in parsed.areas:
            session.add(
                Area(
                    id=item["id"],
                    dataset_id=dataset.id,
                    name=item["name"],
                    population=item["population"],
                    vulnerability_index=item["vulnerability_index"],
                    geometry=item["geometry"],
                    centroid_lon=item["centroid_lon"],
                    centroid_lat=item["centroid_lat"],
                    area_km2=item["area_km2"],
                    quadrant=item["quadrant"],
                )
            )
        report = parsed.to_report()
        status = (
            "completed"
            if not parsed.issues
            else ("completed_with_errors" if parsed.valid_count > 0 else "failed")
        )
        session.add(
            ImportRun(
                id=run_id,
                dataset_id=dataset.id,
                filename=filename,
                kind=kind,
                status=status,
                rows_total=parsed.rows_total,
                rows_imported=parsed.valid_count,
                errors=report["errors"],
            )
        )
        session.commit()
    except SQLAlchemyError as exc:
        session.rollback()
        logger.exception("Database error while importing %s", filename)
        raise HTTPException(
            status_code=409,
            detail="Import could not be saved because of a database conflict",
        ) from exc

    logger.info(
        "Import %s completed: %s %s rows, %s valid, %s duplicates",
        run_id,
        kind,
        parsed.rows_total,
        parsed.valid_count,
        parsed.duplicates,
    )
    return ImportReportOut(
        import_id=run_id,
        dataset_id=dataset.id,
        kind=kind,
        status=status,
        rows_total=parsed.rows_total,
        rows_imported=parsed.valid_count,
        duplicates_skipped=parsed.duplicates,
        errors=report["errors"],
        errors_truncated=bool(report["errors_truncated"]),
    )
