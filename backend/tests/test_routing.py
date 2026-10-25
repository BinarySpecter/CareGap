from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.routing import (
    RouterUnavailableError,
    StraightLineFallbackRouter,
    SyntheticRoadRouter,
    build_router,
)
from tests.conftest import DATA_DIR


def test_synthetic_router_metadata(road_router: SyntheticRoadRouter):
    assert road_router.model_info.id == "synthetic_grid"
    assert road_router.model_info.live_traffic is False
    assert road_router.model_info.is_estimate is True
    assert road_router.graph.number_of_nodes() > 100


def test_router_returns_times_for_every_area(demo_areas, demo_facilities, road_router):
    facilities = [facility.to_routing() for facility in demo_facilities if "primary_care" in facility.services]
    matrix = road_router.travel_matrix(
        [
            type("Area", (), {
                "id": area.id,
                "centroid_lon": area.centroid_lon,
                "centroid_lat": area.centroid_lat,
            })()
            for area in demo_areas
        ],
        facilities,
    )
    assert len(matrix) == len(demo_areas)
    for area_id, times in matrix.items():
        assert area_id
        assert times
        assert all(value >= 0 for value in times.values())
        assert all(value < 240 for value in times.values())


def test_adding_facility_never_increases_nearest_time(demo_areas, demo_facilities, road_router):
    from app.services.analysis import AccessibilityResult, AnalysisFacility, analyze

    baseline = analyze(demo_areas, demo_facilities, "primary_care", 30, road_router)
    candidate_area = max(
        (item for item in baseline.areas if not item.covered),
        key=lambda item: item.area.population,
    ).area
    candidate = AnalysisFacility(
        id="candidate",
        name="Candidate",
        facility_type="primary_care_clinic",
        services=("primary_care",),
        lon=candidate_area.centroid_lon,
        lat=candidate_area.centroid_lat,
    )
    proposed = analyze(
        demo_areas, [*demo_facilities, candidate], "primary_care", 30, road_router
    )
    base_by_id = {item.area.id: item for item in baseline.areas}
    assert isinstance(baseline, AccessibilityResult)
    for area in proposed.areas:
        base_time = base_by_id[area.area.id].travel_time_minutes
        if base_time is None:
            continue
        assert area.travel_time_minutes is not None
        assert area.travel_time_minutes <= base_time + 1e-6


def test_fallback_router_is_labelled_and_deterministic(demo_areas, demo_facilities):
    router = StraightLineFallbackRouter()
    assert router.model_info.id == "straight_line_fallback"
    assert any("NOT actual road travel time" in warning or "no road network" in warning.lower()
               for warning in router.model_info.warnings
               ) or "Straight-line" in router.model_info.description
    facilities = [facility.to_routing() for facility in demo_facilities]
    areas = [
        type("Area", (), {
            "id": area.id,
            "centroid_lon": area.centroid_lon,
            "centroid_lat": area.centroid_lat,
        })()
        for area in demo_areas
    ]
    first = router.travel_matrix(areas, facilities)
    second = router.travel_matrix(areas, facilities)
    assert first == second
    assert all(value > 0 for times in first.values() for value in times.values())


def test_build_router_falls_back_for_missing_file(tmp_path: Path):
    router = build_router(tmp_path / "missing.geojson")
    assert isinstance(router, StraightLineFallbackRouter)


def test_synthetic_router_rejects_empty_network(tmp_path: Path):
    payload = {"type": "FeatureCollection", "features": []}
    with pytest.raises(RouterUnavailableError):
        SyntheticRoadRouter.from_geojson(payload)


def test_demo_roads_file_exists_and_has_expected_edges():
    with (DATA_DIR / "roads.geojson").open(encoding="utf-8") as handle:
        roads = json.load(handle)
    assert len(roads["features"]) > 500
