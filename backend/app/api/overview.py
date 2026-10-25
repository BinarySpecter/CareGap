from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_session, get_travel_router, require_dataset
from app.api.schemas import (
    AccessibilityResponse,
    AnalysisRequest,
    AreaListResponse,
    FacilityListResponse,
    MetaResponse,
    OverviewResponse,
    ServiceOut,
)
from app.api.serializers import (
    DATA_NOTICE,
    access_features,
    area_access_out,
    area_domain,
    catchment,
    dataset_info,
    facility_domain,
    facility_out,
    feature_collection,
    routing_info,
    summary_out,
)
from app.core.catalog import (
    ALLOWED_THRESHOLDS,
    DEFAULT_SERVICE,
    DEFAULT_THRESHOLD_MINUTES,
    FACILITY_TYPES,
    INTERVENTIONS,
    SERVICE_BY_ID,
    SERVICES,
    is_valid_service,
    is_valid_threshold,
)
from app.models import Area, Facility
from app.services.analysis import AccessibilityResult, analyze
from app.services.routing import TravelTimeRouter

router = APIRouter(prefix="/api/v1", tags=["accessibility"])


def _resolve_threshold(service: str, threshold_minutes: int | None) -> int:
    if not is_valid_service(service):
        raise HTTPException(status_code=422, detail=f"Unknown service '{service}'")
    threshold = (
        threshold_minutes
        if threshold_minutes is not None
        else int(SERVICE_BY_ID[service]["default_threshold_minutes"])
    )
    if not is_valid_threshold(threshold):
        raise HTTPException(
            status_code=422,
            detail="threshold_minutes must be between 5 and 180",
        )
    return threshold


def load_areas(session: Session) -> list[Area]:
    return list(session.scalars(select(Area).order_by(Area.id)).all())


def load_facilities(session: Session) -> list[Facility]:
    return list(session.scalars(select(Facility).order_by(Facility.id)).all())


def _run_analysis(
    session: Session,
    travel_router: TravelTimeRouter,
    service: str,
    threshold_minutes: int,
) -> tuple[AccessibilityResult, list[Facility], list[Area]]:
    areas = load_areas(session)
    facilities = load_facilities(session)
    result = analyze(
        [area_domain(area) for area in areas],
        [facility_domain(facility) for facility in facilities],
        service,
        threshold_minutes,
        travel_router,
    )
    return result, facilities, areas


@router.get("/meta", response_model=MetaResponse)
def meta(
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> MetaResponse:
    dataset = require_dataset(session)
    areas = load_areas(session)
    facilities = load_facilities(session)
    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(facilities),
        total_population=sum(area.population for area in areas),
    )
    return MetaResponse(
        api_version="v1",
        dataset=info,
        services=[ServiceOut(**service) for service in SERVICES],
        interventions=list(INTERVENTIONS),  # type: ignore[arg-type]
        facility_types=[
            {
                "id": key,
                "label": str(value["label"]),
                "services": list(value["services"]),  # type: ignore[arg-type]
            }
            for key, value in FACILITY_TYPES.items()
        ],
        allowed_thresholds=list(ALLOWED_THRESHOLDS),
        default_service=DEFAULT_SERVICE,
        default_threshold_minutes=DEFAULT_THRESHOLD_MINUTES,
        routing=routing_info(travel_router.model_info),
        data_notice=DATA_NOTICE,
    )


@router.get("/overview", response_model=OverviewResponse)
def overview(
    service: str = Query(DEFAULT_SERVICE),
    threshold_minutes: int | None = Query(None, ge=5, le=180),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> OverviewResponse:
    threshold = _resolve_threshold(service, threshold_minutes)
    dataset = require_dataset(session)
    result, facilities, areas = _run_analysis(session, travel_router, service, threshold)
    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(facilities),
        total_population=sum(area.population for area in areas),
    )
    return OverviewResponse(
        dataset=info,
        service=service,
        threshold_minutes=threshold,
        summary=summary_out(result.summary),
        routing=routing_info(result.routing),
        services=[ServiceOut(**item) for item in SERVICES],
        thresholds=list(ALLOWED_THRESHOLDS),
        facilities=[facility_out(facility) for facility in facilities],
        areas=access_features(result.areas),
        catchment=catchment(result.areas, service, threshold, covered=True),
        data_notice=DATA_NOTICE,
    )


@router.get("/facilities", response_model=FacilityListResponse)
def facilities(
    service: str | None = Query(None),
    facility_type: str | None = Query(None),
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: Session = Depends(get_session),
) -> FacilityListResponse:
    if service is not None and not is_valid_service(service):
        raise HTTPException(status_code=422, detail=f"Unknown service '{service}'")
    items = load_facilities(session)
    if service is not None:
        items = [item for item in items if service in (item.services or [])]
    if facility_type is not None:
        items = [item for item in items if item.facility_type == facility_type]
    total = len(items)
    page = items[offset : offset + limit]
    return FacilityListResponse(
        items=[facility_out(item) for item in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/areas", response_model=AreaListResponse)
def areas(
    limit: Annotated[int, Query(ge=1, le=1000)] = 1000,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: Session = Depends(get_session),
) -> AreaListResponse:
    all_areas = load_areas(session)
    total = len(all_areas)
    page = all_areas[offset : offset + limit]
    features = [
        {
            "type": "Feature",
            "geometry": area.geometry,
            "properties": {
                "area_id": area.id,
                "name": area.name,
                "population": area.population,
                "vulnerability_index": area.vulnerability_index,
                "area_km2": area.area_km2,
                "quadrant": area.quadrant,
                "centroid": [area.centroid_lon, area.centroid_lat],
            },
        }
        for area in page
    ]
    return AreaListResponse(
        areas=feature_collection(features, "caregap-areas"),
        total=total,
        limit=limit,
        offset=offset,
    )


def _accessibility_payload(
    session: Session,
    travel_router: TravelTimeRouter,
    service: str,
    threshold_minutes: int,
) -> AccessibilityResponse:
    dataset = require_dataset(session)
    result, facilities, areas = _run_analysis(session, travel_router, service, threshold_minutes)
    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(facilities),
        total_population=sum(area.population for area in areas),
    )
    return AccessibilityResponse(
        dataset=info,
        service=service,
        threshold_minutes=threshold_minutes,
        summary=summary_out(result.summary),
        areas=[area_access_out(item) for item in result.areas],
        routing=routing_info(result.routing),
        data_notice=DATA_NOTICE,
    )


@router.get("/accessibility", response_model=AccessibilityResponse)
def accessibility(
    service: str = Query(DEFAULT_SERVICE),
    threshold_minutes: int | None = Query(None, ge=5, le=180),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> AccessibilityResponse:
    threshold = _resolve_threshold(service, threshold_minutes)
    return _accessibility_payload(session, travel_router, service, threshold)


@router.post("/analysis", response_model=AccessibilityResponse)
def analysis(
    payload: AnalysisRequest,
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> AccessibilityResponse:
    return _accessibility_payload(
        session, travel_router, payload.service, payload.threshold_minutes
    )
