from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    get_active_dataset_id,
    get_session,
    get_travel_router,
    require_active_dataset,
)
from app.api.schemas import RecommendationResponse
from app.api.serializers import area_domain, data_notice, facility_domain
from app.core.catalog import (
    INTERVENTION_BY_ID,
    SERVICE_BY_ID,
    is_valid_service,
    is_valid_threshold,
)
from app.models import Area, Dataset, Facility
from app.services.optimization import recommend
from app.services.routing import TravelTimeRouter

router = APIRouter(prefix="/api/v1", tags=["recommendations"])


@router.get("/recommendations", response_model=RecommendationResponse)
def recommendations(
    service: str = Query("primary_care"),
    threshold_minutes: int | None = Query(None, ge=5, le=180),
    intervention_type: str = Query("primary_care_clinic"),
    equity_weight: Annotated[float, Query(ge=0.0, le=1.0)] = 0.35,
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    set_size: Annotated[int, Query(ge=1, le=5)] = 3,
    strategy: Literal["equity_weighted", "max_coverage"] = "equity_weighted",
    dataset: Dataset = Depends(require_active_dataset),
    active_dataset_id: str = Depends(get_active_dataset_id),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> RecommendationResponse:
    if not is_valid_service(service):
        raise HTTPException(status_code=422, detail=f"Unknown service '{service}'")
    if intervention_type not in INTERVENTION_BY_ID:
        raise HTTPException(status_code=422, detail="Unknown intervention type")
    if service not in INTERVENTION_BY_ID[intervention_type]["services"]:
        raise HTTPException(
            status_code=422,
            detail="Intervention type does not provide the selected service",
        )
    threshold = (
        threshold_minutes
        if threshold_minutes is not None
        else int(SERVICE_BY_ID[service]["default_threshold_minutes"])
    )
    if not is_valid_threshold(threshold):
        raise HTTPException(status_code=422, detail="Invalid threshold")

    areas = list(
        session.scalars(
            select(Area).where(Area.dataset_id == active_dataset_id).order_by(Area.id)
        ).all()
    )
    facilities = list(
        session.scalars(
            select(Facility)
            .where(Facility.dataset_id == active_dataset_id)
            .order_by(Facility.id)
        ).all()
    )
    if not areas:
        raise HTTPException(status_code=409, detail="Dataset has no population areas")

    vulnerability_available = any(area.vulnerability_index is not None for area in areas)
    try:
        payload = recommend(
            areas=[area_domain(area) for area in areas],
            facilities=[facility_domain(facility) for facility in facilities],
            service=service,
            threshold_minutes=threshold,
            router=travel_router,
            intervention_type=intervention_type,
            equity_weight=equity_weight if vulnerability_available else 0.0,
            limit=limit,
            set_size=set_size,
            strategy=strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    payload["dataset_id"] = active_dataset_id
    payload["release"] = dataset.meta.get("release") if dataset.meta else None
    payload["vulnerability_available"] = vulnerability_available
    payload["data_notice"] = data_notice(dataset)
    if not vulnerability_available:
        payload["assumptions"] = [
            *payload.get("assumptions", []),
            "No validated ward-level vulnerability indicator is available in this "
            "dataset, so equity weighting was set to zero. The ranking uses the "
            "coverage and person-minutes components only.",
        ]
        payload["limitations"] = [
            *payload.get("limitations", []),
            "Vulnerability-weighted prioritisation is unavailable for this release.",
        ]
    return RecommendationResponse.model_validate(payload)
