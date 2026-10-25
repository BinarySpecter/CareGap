from __future__ import annotations

from typing import Any

from shapely.geometry import mapping

from app.api.schemas import (
    AccessSummaryOut,
    AreaAccessOut,
    DatasetInfoOut,
    FacilityOut,
    RoutingInfoOut,
)
from app.core.catalog import (
    ALLOWED_THRESHOLDS,
    FACILITY_TYPE_LABELS,
    FACILITY_TYPES,
    INTERVENTIONS,
    SERVICES,
    public_catalog,
)
from app.models import Dataset, Facility
from app.services.analysis import (
    AccessSummary,
    AnalysisArea,
    AnalysisFacility,
    AreaAccess,
    AreaComparison,
)
from app.services.geo import geojson_shape
from app.services.routing import RoutingModelInfo

DATA_NOTICE = (
    "Synthetic demonstration data. Accessibility values are deterministic model "
    "estimates based on a synthetic population, six fictional mapped facilities, and a "
    "synthetic road grid. They are not observed access, real facility availability, or "
    "clinical outcomes."
)

WARNING_TEXT = [
    "Travel times are estimates from the configured routing model, not live traffic.",
    "Coverage ignores facility capacity, staffing, opening hours, cost, and quality.",
    "Absence of a mapped facility does not prove that healthcare is absent.",
    "The demo dataset and vulnerability index are synthetic.",
]


def dataset_info(
    dataset: Dataset,
    area_count: int,
    facility_count: int,
    total_population: int,
) -> DatasetInfoOut:
    meta = dataset.meta or {}
    counts = dict(meta.get("counts") or {})
    counts.update(
        {
            "areas": area_count,
            "facilities": facility_count,
            "population": total_population,
        }
    )
    return DatasetInfoOut(
        id=dataset.id,
        name=dataset.name,
        short_name=str(meta.get("short_name", dataset.name)),
        description=dataset.description,
        is_synthetic=dataset.is_synthetic,
        data_status=str(meta.get("data_status", "synthetic")),
        seed=meta.get("seed"),
        generated_at=meta.get("generated_at"),
        geography=dict(meta.get("geography") or {}),
        counts={key: int(value) for key, value in counts.items()},
        sources=list(meta.get("sources") or []),
        limitations=list(meta.get("limitations") or []),
        road_model=dict(meta.get("road_model") or {}),
    )


def routing_info(info: RoutingModelInfo) -> RoutingInfoOut:
    return RoutingInfoOut(
        id=info.id,
        label=info.label,
        description=info.description,
        is_estimate=info.is_estimate,
        live_traffic=info.live_traffic,
        warnings=list(info.warnings),
    )


def facility_out(facility: Facility) -> FacilityOut:
    return FacilityOut(
        id=facility.id,
        name=facility.name,
        facility_type=facility.facility_type,
        facility_type_label=FACILITY_TYPE_LABELS.get(
            facility.facility_type, facility.facility_type.replace("_", " ").title()
        ),
        services=list(facility.services or []),
        lon=facility.lon,
        lat=facility.lat,
        data_status=facility.data_status,
    )


def proposed_facility_out(
    facility: AnalysisFacility, label: str
) -> FacilityOut:
    return FacilityOut(
        id=facility.id,
        name=facility.name,
        facility_type=facility.facility_type,
        facility_type_label=label,
        services=list(facility.services),
        lon=facility.lon,
        lat=facility.lat,
        data_status="proposed",
    )


def summary_out(summary: AccessSummary) -> AccessSummaryOut:
    return AccessSummaryOut(**summary.to_dict())


def area_access_out(item: AreaAccess) -> AreaAccessOut:
    return AreaAccessOut(**item.to_dict())


def feature_collection(
    features: list[dict[str, Any]], name: str
) -> dict[str, Any]:
    return {"type": "FeatureCollection", "name": name, "features": features}


def access_features(
    access: list[AreaAccess], name: str = "accessibility"
) -> dict[str, Any]:
    features = []
    for item in access:
        props = item.to_dict()
        props.pop("centroid", None)
        props["centroid"] = [item.area.centroid_lon, item.area.centroid_lat]
        features.append(
            {
                "type": "Feature",
                "geometry": item.area.geometry,
                "properties": props,
            }
        )
    return feature_collection(features, name)


def comparison_features(comparisons: list[AreaComparison]) -> dict[str, Any]:
    features = []
    for item in comparisons:
        props = item.to_dict()
        features.append(
            {
                "type": "Feature",
                "geometry": item.area.geometry,
                "properties": props,
            }
        )
    return feature_collection(features, "scenario-comparison")


def catchment(
    access: list[AreaAccess],
    service: str,
    threshold_minutes: int,
    covered: bool,
) -> dict[str, Any]:
    selected = [item for item in access if item.covered is covered]
    geometries = []
    for item in selected:
        try:
            geometries.append(geojson_shape(item.area.geometry))
        except (TypeError, ValueError, KeyError):
            continue
    if not geometries:
        return feature_collection([], f"catchment-{threshold_minutes}")
    from shapely.ops import unary_union

    merged = unary_union(geometries)
    return feature_collection(
        [
            {
                "type": "Feature",
                "geometry": mapping(merged),
                "properties": {
                    "service": service,
                    "threshold_minutes": threshold_minutes,
                    "covered": covered,
                    "areas": len(selected),
                    "population": sum(item.area.population for item in selected),
                    "definition": (
                        "Dissolved union of population areas whose modelled "
                        "nearest-facility travel time is "
                        + ("within" if covered else "outside")
                        + " the selected threshold."
                    ),
                },
            }
        ],
        f"catchment-{threshold_minutes}",
    )


def area_domain(area: Any) -> AnalysisArea:
    return AnalysisArea(
        id=area.id,
        name=area.name,
        population=area.population,
        vulnerability_index=area.vulnerability_index,
        area_km2=area.area_km2,
        centroid_lon=area.centroid_lon,
        centroid_lat=area.centroid_lat,
        quadrant=area.quadrant,
        geometry=area.geometry,
    )


def facility_domain(facility: Facility) -> AnalysisFacility:
    return AnalysisFacility(
        id=facility.id,
        name=facility.name,
        facility_type=facility.facility_type,
        services=tuple(facility.services or []),
        lon=facility.lon,
        lat=facility.lat,
        data_status=facility.data_status,
    )


def catalog_lists() -> tuple[list[dict], list[dict], list[dict], list[int], str, int]:
    catalog = public_catalog()
    return (
        list(catalog["services"]),  # type: ignore[arg-type]
        list(INTERVENTIONS),
        [
            {
                "id": key,
                "label": value["label"],
                "services": value["services"],
            }
            for key, value in FACILITY_TYPES.items()
        ],
        list(ALLOWED_THRESHOLDS),
        str(catalog["default_service"]),
        int(catalog["default_threshold_minutes"]),
    )


def all_services() -> list[dict]:
    return list(SERVICES)
