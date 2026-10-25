from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from shapely.geometry import Point
from shapely.ops import unary_union
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    get_active_dataset_id,
    get_session,
    get_travel_router,
    require_active_dataset,
    require_writable,
)
from app.api.schemas import (
    ComparisonDeltaOut,
    EquityOut,
    ImprovementOut,
    ResidualGapOut,
    ScenarioCreate,
    ScenarioListResponse,
    ScenarioOut,
    ScenarioSimulationResponse,
)
from app.api.serializers import (
    area_domain,
    catchment,
    comparison_features,
    data_notice,
    dataset_info,
    dataset_warnings,
    facility_domain,
    facility_out,
    proposed_facility_out,
    routing_info,
    summary_out,
)
from app.core.catalog import INTERVENTION_BY_ID, is_valid_service
from app.models import Area, Dataset, Facility, Scenario
from app.services.analysis import (
    AnalysisFacility,
    analyze,
    compare_access,
)
from app.services.geo import geojson_shape
from app.services.routing import TravelTimeRouter

router = APIRouter(prefix="/api/v1", tags=["scenarios"])


def _scenario_out(scenario: Scenario) -> ScenarioOut:
    return ScenarioOut(
        id=scenario.id,
        dataset_id=scenario.dataset_id,
        name=scenario.name,
        intervention_type=scenario.intervention_type,
        service=scenario.service,
        threshold_minutes=scenario.threshold_minutes,
        interventions=list(scenario.interventions or []),
        created_at=scenario.created_at,
    )


def _dataset_areas(session: Session, dataset_id: str) -> list[Area]:
    return list(
        session.scalars(
            select(Area).where(Area.dataset_id == dataset_id).order_by(Area.id)
        ).all()
    )


def _ensure_points_inside(areas: list[Area], payload: ScenarioCreate) -> None:
    if not areas:
        raise HTTPException(status_code=409, detail="Dataset has no population areas")
    try:
        union = unary_union([geojson_shape(area.geometry) for area in areas])
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=500, detail="Dataset geometry is invalid") from exc
    allowed = union.buffer(0.001)
    for index, intervention in enumerate(payload.interventions, start=1):
        if not allowed.contains(Point(intervention.lon, intervention.lat)):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Intervention {index} lies outside the dataset boundary. "
                    "Place proposed facilities inside the mapped district."
                ),
            )


@router.post("/scenarios", response_model=ScenarioOut, status_code=201)
def create_scenario(
    payload: ScenarioCreate,
    dataset: Dataset = Depends(require_active_dataset),
    session: Session = Depends(get_session),
    _writable: None = Depends(require_writable),
) -> ScenarioOut:
    areas = _dataset_areas(session, dataset.id)
    _ensure_points_inside(areas, payload)
    scenario_id = str(uuid.uuid4())
    short_id = scenario_id[:8]
    label = str(INTERVENTION_BY_ID[payload.interventions[0].intervention_type]["label"])
    interventions = []
    for index, item in enumerate(payload.interventions, start=1):
        interventions.append(
            {
                "id": f"SCN-{short_id}-{index}",
                "intervention_type": item.intervention_type,
                "name": item.name or f"Proposed {label} {index}",
                "lon": item.lon,
                "lat": item.lat,
            }
        )
    scenario = Scenario(
        id=scenario_id,
        dataset_id=dataset.id,
        name=" ".join(payload.name.split()),
        intervention_type=payload.interventions[0].intervention_type,
        service=payload.service,
        threshold_minutes=payload.threshold_minutes,
        interventions=interventions,
    )
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return _scenario_out(scenario)


@router.get("/scenarios", response_model=ScenarioListResponse)
def list_scenarios(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    active_dataset_id: str = Depends(get_active_dataset_id),
    session: Session = Depends(get_session),
) -> ScenarioListResponse:
    total = session.scalar(
        select(func.count())
        .select_from(Scenario)
        .where(Scenario.dataset_id == active_dataset_id)
    ) or 0
    items = list(
        session.scalars(
            select(Scenario)
            .where(Scenario.dataset_id == active_dataset_id)
            .order_by(Scenario.created_at.desc())
            .limit(limit)
        ).all()
    )
    return ScenarioListResponse(items=[_scenario_out(item) for item in items], total=total)


def _get_scenario(session: Session, scenario_id: str, dataset_id: str) -> Scenario:
    scenario = session.get(Scenario, scenario_id)
    if scenario is None or scenario.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.get("/scenarios/{scenario_id}", response_model=ScenarioOut)
def get_scenario(
    scenario_id: str,
    active_dataset_id: str = Depends(get_active_dataset_id),
    session: Session = Depends(get_session),
) -> ScenarioOut:
    return _scenario_out(_get_scenario(session, scenario_id, active_dataset_id))


def _intervention_facilities(
    scenario: Scenario,
) -> tuple[list[AnalysisFacility], dict[str, str], list[str]]:
    facilities: list[AnalysisFacility] = []
    labels: dict[str, str] = {}
    assumptions: list[str] = []
    seen_types = set()
    for item in scenario.interventions or []:
        intervention_type = str(item.get("intervention_type", ""))
        definition = INTERVENTION_BY_ID.get(intervention_type)
        if definition is None:
            raise HTTPException(
                status_code=409,
                detail="Scenario references an unknown intervention type",
            )
        if scenario.service not in definition["services"]:
            raise HTTPException(
                status_code=409,
                detail="Scenario intervention does not provide its selected service",
            )
        label = str(definition["label"])
        labels[intervention_type] = label
        if intervention_type not in seen_types:
            assumptions.extend(str(value) for value in definition["assumptions"])
            seen_types.add(intervention_type)
        facility = AnalysisFacility(
            id=str(item["id"]),
            name=str(item["name"]),
            facility_type=intervention_type,
            services=tuple(definition["services"]),
            lon=float(item["lon"]),
            lat=float(item["lat"]),
            data_status="proposed",
        )
        facilities.append(facility)
    if not facilities:
        raise HTTPException(status_code=409, detail="Scenario has no interventions")
    return facilities, labels, assumptions


@router.get(
    "/scenarios/{scenario_id}/simulate",
    response_model=ScenarioSimulationResponse,
)
@router.post(
    "/scenarios/{scenario_id}/simulate",
    response_model=ScenarioSimulationResponse,
)
def simulate_scenario(
    scenario_id: str,
    active_dataset_id: str = Depends(get_active_dataset_id),
    dataset: Dataset = Depends(require_active_dataset),
    session: Session = Depends(get_session),
    travel_router: TravelTimeRouter = Depends(get_travel_router),
) -> ScenarioSimulationResponse:
    scenario = _get_scenario(session, scenario_id, active_dataset_id)
    if not is_valid_service(scenario.service):
        raise HTTPException(status_code=409, detail="Scenario service is invalid")
    areas = _dataset_areas(session, scenario.dataset_id)
    if not areas:
        raise HTTPException(status_code=409, detail="Dataset has no population areas")
    existing = list(
        session.scalars(
            select(Facility)
            .where(Facility.dataset_id == scenario.dataset_id)
            .order_by(Facility.id)
        ).all()
    )
    proposed, labels, intervention_assumptions = _intervention_facilities(scenario)

    analysis_areas = [area_domain(area) for area in areas]
    base_facilities = [facility_domain(facility) for facility in existing]
    baseline = analyze(
        analysis_areas,
        base_facilities,
        scenario.service,
        scenario.threshold_minutes,
        travel_router,
    )
    proposed_result = analyze(
        analysis_areas,
        [*base_facilities, *proposed],
        scenario.service,
        scenario.threshold_minutes,
        travel_router,
    )
    comparison = compare_access(baseline, proposed_result)

    improvements = sorted(
        (
            item
            for item in comparison.areas
            if item.area.has_population
            and (
                item.newly_covered_population > 0
                or (
                    item.improvement_minutes is not None
                    and item.improvement_minutes > 0.05
                )
            )
        ),
        key=lambda item: (
            -item.newly_covered_population,
            -(item.improvement_minutes if item.improvement_minutes is not None else 0.0),
            item.area.id,
        ),
    )[:10]
    improvement_out = []
    for item in improvements:
        payload = item.to_dict()
        improvement_out.append(
            ImprovementOut(
                area_id=item.area.id,
                name=item.area.name,
                population=item.area.population,
                vulnerability_index=item.area.vulnerability_index,
                travel_time_baseline=payload["travel_time_baseline"],
                travel_time_proposed=payload["travel_time_proposed"],
                improvement_minutes=payload["improvement_minutes"],
                newly_covered_population=item.newly_covered_population,
            )
        )
    residual = sorted(
        (
            item
            for item in comparison.areas
            if not item.covered_proposed and item.area.has_population
        ),
        key=lambda item: (-(item.area.population or 0), item.area.id),
    )[:20]
    residual_out = [
        ResidualGapOut(
            area_id=item.area.id,
            name=item.area.name,
            population=item.area.population,
            travel_time_minutes=item.to_dict()["travel_time_proposed"],
            vulnerability_index=item.area.vulnerability_index,
        )
        for item in residual
    ]

    warnings = [
        *dataset_warnings(dataset),
        *travel_router.model_info.warnings,
        "Proposed interventions are modelled as additional facilities; existing "
        "services are not removed or degraded.",
    ]
    if comparison.wards_worsened > 0:
        warnings.append(
            "Unexpected result: some areas have a longer modelled travel time "
            "after adding a facility."
        )

    assumptions = [
        "Existing facilities remain available and unchanged.",
        "The intervention adds new facilities at the placed points and does not remove services.",
        f"Travel times use the {travel_router.model_info.label.lower()}.",
        "Coverage means the nearest suitable mapped facility is within the selected threshold; capacity, staffing, hours, and quality are not modelled.",
        *intervention_assumptions,
        (
            "Population is synthetic ward-level population assigned to area centroids."
            if dataset.is_synthetic
            else "Population is the Census of India 2011 ward-level count assigned to the ward; intra-ward distribution is not modelled."
        ),
    ]

    info = dataset_info(
        dataset,
        area_count=len(areas),
        facility_count=len(existing),
        total_population=sum(area.population or 0 for area in areas),
    )
    return ScenarioSimulationResponse(
        dataset=info,
        scenario=_scenario_out(scenario),
        service=scenario.service,
        threshold_minutes=scenario.threshold_minutes,
        baseline=summary_out(baseline.summary),
        proposed=summary_out(proposed_result.summary),
        delta=ComparisonDeltaOut(**comparison.delta_dict()),
        equity=EquityOut(**comparison.equity.to_dict()),
        routing=routing_info(travel_router.model_info),
        areas=comparison_features(comparison.areas, dataset),
        facilities=[facility_out(facility) for facility in existing],
        proposed_facilities=[
            proposed_facility_out(facility, labels.get(facility.facility_type, "Proposed"))
            for facility in proposed
        ],
        catchment_baseline=catchment(
            baseline.areas,
            scenario.service,
            scenario.threshold_minutes,
            covered=True,
            dataset=dataset,
        ),
        catchment_proposed=catchment(
            proposed_result.areas,
            scenario.service,
            scenario.threshold_minutes,
            covered=True,
            dataset=dataset,
        ),
        top_improvements=improvement_out,
        residual_gaps=residual_out,
        assumptions=assumptions,
        warnings=list(dict.fromkeys(warnings)),
        data_notice=data_notice(dataset),
    )
