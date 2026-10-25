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
from app.datasets import release_id
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

SYNTHETIC_NOTICE = (
    "Synthetic demonstration data. Accessibility values are deterministic model "
    "estimates based on a synthetic population, six fictional mapped facilities, and a "
    "synthetic road grid. They are not observed access, real facility availability, or "
    "clinical outcomes."
)


def data_notice(dataset: Dataset) -> str:
    if dataset.is_synthetic:
        return SYNTHETIC_NOTICE
    meta = dataset.meta or {}
    population = meta.get("population") or {}
    year = population.get("reference_year", "unknown")
    release = release_id(meta)
    return (
        f"Delhi pilot release {release}. Population: Census of India {year} ward "
        "counts (historical baseline; NDMC/Cantonment and rural populations are not "
        "in the denominators). Facilities: OpenStreetMap, unverified for operating "
        "status or service availability. Travel times are modelled from the OSM road "
        "network, not live traffic. Coverage is modelled access, not observed care, "
        "utilisation, or health outcomes."
    )


def dataset_warnings(dataset: Dataset) -> list[str]:
    if dataset.is_synthetic:
        return [
            "Travel times are estimates from the configured routing model, not live traffic.",
            "Coverage ignores facility capacity, staffing, opening hours, cost, and quality.",
            "Absence of a mapped facility does not prove that healthcare is absent.",
            "The demo dataset and vulnerability index are synthetic.",
        ]
    meta = dataset.meta or {}
    population = meta.get("population") or {}
    warnings = [
        "Travel times are estimates from the OpenStreetMap road network, not live traffic.",
        "Coverage ignores facility capacity, staffing, opening hours, cost, and quality.",
        "Facility presence in OpenStreetMap does not prove that a service is available.",
        (
            "Population is a Census of India "
            f"{population.get('reference_year', 'unknown')} ward-level baseline, not a current count."
        ),
        (
            f"{population.get('unrepresented_population', 0):,} Delhi residents "
            "are outside the population denominators (NDMC, Cantonment, rural, and "
            "non-ward geography)."
        ),
        "No validated ward-level vulnerability index is available in this release; equity weighting is disabled.",
    ]
    details = meta.get("road_model") or {}
    warnings.extend(str(item) for item in details.get("warnings", []))
    return list(dict.fromkeys(warnings))


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
        release=release_id(meta),
        seed=meta.get("seed"),
        generated_at=meta.get("generated_at"),
        geography=dict(meta.get("geography") or {}),
        counts={key: int(value) for key, value in counts.items()},
        sources=list(meta.get("sources") or []),
        limitations=list(meta.get("limitations") or []),
        road_model=dict(meta.get("road_model") or {}),
        population=dict(meta.get("population") or {}),
        vulnerability=dict(meta.get("vulnerability") or {}),
        capabilities=dict(meta.get("capabilities") or {}),
        validation_summary=_validation_summary(meta),
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


def _validation_summary(meta: dict[str, Any]) -> dict[str, Any]:
    validation = meta.get("validation") or {}
    areas = validation.get("areas") or {}
    facilities = validation.get("facilities") or {}
    routing = validation.get("routing") or {}
    return {
        "areas_written": areas.get("areas_written"),
        "population_wards_matched": areas.get("population_wards_matched"),
        "population_wards_unmatched": areas.get("population_wards_unmatched"),
        "areas_without_population": len(areas.get("areas_without_population") or []),
        "invalid_geometries_repaired": areas.get("invalid_geometries_repaired"),
        "boundary_ward_symmetric_difference_km2": areas.get(
            "boundary_ward_symmetric_difference_km2"
        ),
        "facilities_source": facilities.get("source_elements"),
        "facilities_written": facilities.get("facilities_written"),
        "facilities_excluded": facilities.get("excluded_non_care_or_out_of_scope"),
        "facilities_outside_boundary": len(facilities.get("outside_study_boundary") or []),
        "facility_duplicates_removed": facilities.get("duplicates_removed"),
        "facilities_operational_status_unknown": facilities.get(
            "operational_status_unknown"
        ),
        "road_nodes": routing.get("nodes"),
        "road_edges": routing.get("edges_undirected"),
        "areas_without_reachable_facility": routing.get(
            "areas_without_any_reachable_facility"
        ),
    }


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
        source=facility.source,
        source_id=facility.source_id,
        source_url=facility.source_url,
        ownership=facility.ownership,
        operational_status=facility.operational_status,
        address=facility.address,
        admin_area=facility.admin_area,
        source_tags=dict(facility.source_tags or {}),
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
        source="CareGap scenario",
        source_id="proposed",
        source_url="",
        ownership="proposed",
        operational_status="proposed",
        address="",
        admin_area="",
        source_tags={},
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
    access: list[AreaAccess],
    dataset: Dataset,
    name: str = "accessibility",
) -> dict[str, Any]:
    features = []
    provenance = {
        "dataset_id": dataset.id,
        "dataset_release": release_id(dataset.meta or {}),
    }
    for item in access:
        props = item.to_dict()
        props.pop("centroid", None)
        props["centroid"] = [item.area.centroid_lon, item.area.centroid_lat]
        props.update(provenance)
        features.append(
            {
                "type": "Feature",
                "geometry": item.area.geometry,
                "properties": props,
            }
        )
    return feature_collection(features, name)


def comparison_features(
    comparisons: list[AreaComparison], dataset: Dataset
) -> dict[str, Any]:
    features = []
    provenance = {
        "dataset_id": dataset.id,
        "dataset_release": release_id(dataset.meta or {}),
    }
    for item in comparisons:
        props = item.to_dict()
        props.update(provenance)
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
    dataset: Dataset | None = None,
) -> dict[str, Any]:
    selected = [
        item
        for item in access
        if item.covered is covered and item.area.has_population
    ]
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
                    "population": sum(item.area.population or 0 for item in selected),
                    "definition": (
                        "Dissolved union of population areas whose modelled "
                        "nearest-facility travel time is "
                        + ("within" if covered else "outside")
                        + " the selected threshold."
                    ),
                    "dataset_id": dataset.id if dataset is not None else "",
                    "dataset_release": (
                        release_id(dataset.meta or {}) if dataset is not None else ""
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
        population_status=area.population_status,
        population_reference_year=area.population_reference_year,
        municipality=area.municipality,
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
