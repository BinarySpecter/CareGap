from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_session, get_travel_router, require_dataset
from app.api.schemas import RecommendationResponse
from app.api.serializers import area_domain, facility_domain
from app.core.catalog import (
    INTERVENTION_BY_ID,
    SERVICE_BY_ID,
    is_valid_service,
    is_valid_threshold,
)
from app.models import Area, Facility
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
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> RecommendationResponse:
    require_dataset(session)
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

    areas = list(session.scalars(select(Area).order_by(Area.id)).all())
    facilities = list(session.scalars(select(Facility).order_by(Facility.id)).all())
    if not areas:
        raise HTTPException(status_code=409, detail="Dataset has no population areas")

    try:
        payload = recommend(
            areas=[area_domain(area) for area in areas],
            facilities=[facility_domain(facility) for facility in facilities],
            service=service,
            threshold_minutes=threshold,
            router=travel_router,
            intervention_type=intervention_type,
            equity_weight=equity_weight,
            limit=limit,
            set_size=set_size,
            strategy=strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return RecommendationResponse.model_validate(payload)
