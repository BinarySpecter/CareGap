from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_session
from app.api.schemas import HealthResponse, ReadinessResponse
from app.config import Settings
from app.models import Dataset
from app.seed import dataset_counts

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> HealthResponse:
    dataset_count = session.scalar(select(func.count()).select_from(Dataset)) or 0
    dataset_id = getattr(request.app.state, "dataset_id", settings.active_dataset)
    dataset = session.get(Dataset, dataset_id)
    router_info = getattr(request.app.state, "travel_router", None)
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.version,
        dataset_loaded=dataset_count > 0,
        database="connected",
        environment=settings.env,
        dataset_id=dataset_id,
        release=(
            (dataset.meta or {}).get("release")
            or (dataset.meta or {}).get("generated_at")
            if dataset is not None
            else None
        ),
        routing_model=router_info.model_info.id if router_info is not None else None,
        read_only=settings.read_only,
    )


@router.get("/ready", response_model=ReadinessResponse)
def ready(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> JSONResponse:
    dataset_id = getattr(request.app.state, "dataset_id", settings.active_dataset)
    checks: dict[str, str] = {}
    ready = True
    try:
        session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "failed"
        ready = False
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        checks["dataset"] = "missing"
        ready = False
    else:
        areas, facilities = dataset_counts(session, dataset_id)
        checks["dataset"] = f"{areas} areas, {facilities} facilities"
        if areas == 0 or facilities == 0:
            ready = False
    router_info = getattr(request.app.state, "travel_router", None)
    if router_info is None:
        checks["routing"] = "missing"
        ready = False
    else:
        checks["routing"] = router_info.model_info.id
        if not dataset.is_synthetic and router_info.model_info.id != "osm_network":
            checks["routing"] = "unexpected fallback for a real-data release"
            ready = False
    checks["read_only"] = "true" if settings.read_only else "false"
    payload = ReadinessResponse(
        status="ready" if ready else "not_ready",
        dataset_id=dataset_id,
        checks=checks,
    )
    return JSONResponse(
        status_code=200 if ready else 503,
        content=payload.model_dump(),
    )
