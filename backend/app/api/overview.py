from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    get_active_dataset_id,
    get_app_settings,
    get_session,
    get_travel_router,
    require_active_dataset,
)
from app.api.schemas import (
    AccessibilityResponse,
    AnalysisRequest,
    AreaListResponse,
    DatasetProfileOut,
    FacilityListResponse,
    MetaResponse,
    OverviewResponse,
    ServiceOut,
)
from app.api.serializers import (
    access_features,
    area_access_out,
    area_domain,
    catchment,
    data_notice,
    dataset_info,
    facility_domain,
    facility_out,
    feature_collection,
    routing_info,
    summary_out,
)
from app.config import Settings
from app.core.catalog import (
    ALLOWED_THRESHOLDS,
    DEFAULT_LENS_NOTE,
    DEFAULT_SERVICE,
    DEFAULT_THRESHOLD_MINUTES,
    FACILITY_TYPES,
    INTERVENTIONS,
    SERVICE_BY_ID,
    SERVICES,
    is_valid_service,
    is_valid_threshold,
)
from app.datasets import PROFILES, load_manifest, release_id
from app.models import Area, Dataset, Facility
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


def load_areas(session: Session, dataset_id: str) -> list[Area]:
    return list(
        session.scalars(
            select(Area).where(Area.dataset_id == dataset_id).order_by(Area.id)
        ).all()
    )


def load_facilities(session: Session, dataset_id: str) -> list[Facility]:
    return list(
        session.scalars(
            select(Facility)
            .where(Facility.dataset_id == dataset_id)
            .order_by(Facility.id)
        ).all()
    )


def _run_analysis(
    session: Session,
    travel_router: TravelTimeRouter,
    dataset_id: str,
    service: str,
    threshold_minutes: int,
) -> tuple[AccessibilityResult, list[Facility], list[Area]]:
    areas = load_areas(session, dataset_id)
    facilities = load_facilities(session, dataset_id)
    result = analyze(
        [area_domain(area) for area in areas],
        [facility_domain(facility) for facility in facilities],
        service,
        threshold_minutes,
        travel_router,
    )
    return result, facilities, areas


def _facility_types_payload() -> list[dict[str, object]]:
    return [
        {
            "id": key,
            "label": str(value["label"]),
            "services": list(value["services"]),  # type: ignore[arg-type]
        }
        for key, value in FACILITY_TYPES.items()
    ]


def _profiles_payload(active_id: str) -> list[DatasetProfileOut]:
    items = []
    for profile in PROFILES.values():
        available = (profile.data_dir / "dataset.json").is_file()
        release = None
        if available:
            try:
                release = release_id(load_manifest(profile.data_dir))
            except Exception:  # pragma: no cover - informational endpoint
                release = None
        items.append(
            DatasetProfileOut(
                id=profile.id,
                label=profile.label,
                is_synthetic=profile.is_synthetic,
                active=profile.id == active_id,
                available=available,
                release=release,
            )
        )
    return items


@router.get("/meta", response_model=MetaResponse)
def meta(
    active_dataset_id: str = Depends(get_active_dataset_id),
    dataset: Dataset = Depends(require_active_dataset),
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> MetaResponse:
    areas = load_areas(session, active_dataset_id)
    facilities = load_facilities(session, active_dataset_id)
    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(facilities),
        total_population=sum(area.population or 0 for area in areas),
    )
    return MetaResponse(
        api_version="v1",
        dataset=info,
        datasets=_profiles_payload(active_dataset_id),
        services=[ServiceOut(**service) for service in SERVICES],
        interventions=list(INTERVENTIONS),  # type: ignore[arg-type]
        facility_types=_facility_types_payload(),  # type: ignore[arg-type]
        allowed_thresholds=list(ALLOWED_THRESHOLDS),
        default_service=DEFAULT_SERVICE,
        default_threshold_minutes=DEFAULT_THRESHOLD_MINUTES,
        default_lens_note=DEFAULT_LENS_NOTE,
        routing=routing_info(travel_router.model_info),
        data_notice=data_notice(dataset),
        read_only=settings.read_only,
    )


@router.get("/datasets", response_model=list[DatasetProfileOut], tags=["system"])
def datasets(
    active_dataset_id: str = Depends(get_active_dataset_id),
) -> list[DatasetProfileOut]:
    return _profiles_payload(active_dataset_id)


@router.get("/overview", response_model=OverviewResponse)
def overview(
    service: str = Query(DEFAULT_SERVICE),
    threshold_minutes: int | None = Query(None, ge=5, le=180),
    active_dataset_id: str = Depends(get_active_dataset_id),
    dataset: Dataset = Depends(require_active_dataset),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> OverviewResponse:
    threshold = _resolve_threshold(service, threshold_minutes)
    result, facilities, areas = _run_analysis(
        session, travel_router, active_dataset_id, service, threshold
    )
    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(facilities),
        total_population=sum(area.population or 0 for area in areas),
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
        areas=access_features(result.areas, dataset),
        catchment=catchment(
            result.areas, service, threshold, covered=True, dataset=dataset
        ),
        data_notice=data_notice(dataset),
    )


@router.get("/facilities", response_model=FacilityListResponse)
def facilities(
    service: str | None = Query(None),
    facility_type: str | None = Query(None),
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    dataset: Dataset = Depends(require_active_dataset),
    session: Session = Depends(get_session),
) -> FacilityListResponse:
    if service is not None and not is_valid_service(service):
        raise HTTPException(status_code=422, detail=f"Unknown service '{service}'")
    active_dataset_id = dataset.id
    all_items = load_facilities(session, active_dataset_id)
    items = all_items
    if service is not None:
        items = [item for item in items if service in (item.services or [])]
    if facility_type is not None:
        items = [item for item in items if item.facility_type == facility_type]
    total = len(items)
    page = items[offset : offset + limit]
    areas = load_areas(session, active_dataset_id)
    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(all_items),
        total_population=sum(area.population or 0 for area in areas),
    )
    return FacilityListResponse(
        dataset=info,
        items=[facility_out(item) for item in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/areas", response_model=AreaListResponse)
def areas(
    limit: Annotated[int, Query(ge=1, le=1000)] = 1000,
    offset: Annotated[int, Query(ge=0)] = 0,
    dataset: Dataset = Depends(require_active_dataset),
    session: Session = Depends(get_session),
) -> AreaListResponse:
    active_dataset_id = dataset.id
    all_areas = load_areas(session, active_dataset_id)
    total = len(all_areas)
    page = all_areas[offset : offset + limit]
    release = release_id(dataset.meta or {})
    features = [
        {
            "type": "Feature",
            "geometry": area.geometry,
            "properties": {
                "area_id": area.id,
                "name": area.name,
                "population": area.population,
                "population_status": area.population_status,
                "population_reference_year": area.population_reference_year,
                "vulnerability_index": area.vulnerability_index,
                "area_km2": area.area_km2,
                "quadrant": area.quadrant,
                "municipality": area.municipality,
                "centroid": [area.centroid_lon, area.centroid_lat],
                "dataset_id": dataset.id,
                "dataset_release": release,
            },
        }
        for area in page
    ]
    facilities = load_facilities(session, active_dataset_id)
    info = dataset_info(
        dataset,
        area_count=total,
        facility_count=len(facilities),
        total_population=sum(area.population or 0 for area in all_areas),
    )
    return AreaListResponse(
        dataset=info,
        areas=feature_collection(features, f"{active_dataset_id}-areas"),
        total=total,
        limit=limit,
        offset=offset,
    )


def _accessibility_payload(
    session: Session,
    travel_router: TravelTimeRouter,
    dataset: Dataset,
    dataset_id: str,
    service: str,
    threshold_minutes: int,
) -> AccessibilityResponse:
    result, facilities, areas = _run_analysis(
        session, travel_router, dataset_id, service, threshold_minutes
    )
    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(facilities),
        total_population=sum(area.population or 0 for area in areas),
    )
    return AccessibilityResponse(
        dataset=info,
        service=service,
        threshold_minutes=threshold_minutes,
        summary=summary_out(result.summary),
        areas=[area_access_out(item) for item in result.areas],
        routing=routing_info(result.routing),
        data_notice=data_notice(dataset),
    )


@router.get("/accessibility", response_model=AccessibilityResponse)
def accessibility(
    service: str = Query(DEFAULT_SERVICE),
    threshold_minutes: int | None = Query(None, ge=5, le=180),
    active_dataset_id: str = Depends(get_active_dataset_id),
    dataset: Dataset = Depends(require_active_dataset),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> AccessibilityResponse:
    threshold = _resolve_threshold(service, threshold_minutes)
    return _accessibility_payload(
        session, travel_router, dataset, active_dataset_id, service, threshold
    )


@router.post("/analysis", response_model=AccessibilityResponse)
def analysis(
    payload: AnalysisRequest,
    active_dataset_id: str = Depends(get_active_dataset_id),
    dataset: Dataset = Depends(require_active_dataset),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> AccessibilityResponse:
    return _accessibility_payload(
        session,
        travel_router,
        dataset,
        active_dataset_id,
        payload.service,
        payload.threshold_minutes,
    )
