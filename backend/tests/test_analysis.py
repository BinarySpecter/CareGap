from __future__ import annotations

import pytest

from app.services.analysis import (
    AnalysisArea,
    AnalysisFacility,
    analyze,
    compare_access,
)
from app.services.routing import StraightLineFallbackRouter, SyntheticRoadRouter


def test_baseline_demo_summary_is_consistent(demo_areas, demo_facilities, road_router):
    result = analyze(demo_areas, demo_facilities, "primary_care", 30, road_router)
    summary = result.summary
    assert summary.total_population == sum(area.population for area in demo_areas)
    assert 0 < summary.covered_population < summary.total_population
    assert 0 < summary.coverage_percent < 100
    assert summary.wards_total == len(demo_areas)
    assert summary.wards_over_threshold > 0
    distribution_population = sum(bucket["population"] for bucket in summary.distribution)
    assert distribution_population == summary.total_population
    assert distribution_population == sum(area.population for area in demo_areas)


def test_threshold_is_configurable_and_monotonic(demo_areas, demo_facilities, road_router):
    tight = analyze(demo_areas, demo_facilities, "primary_care", 15, road_router)
    loose = analyze(demo_areas, demo_facilities, "primary_care", 45, road_router)
    assert loose.summary.covered_population >= tight.summary.covered_population
    assert loose.summary.wards_over_threshold <= tight.summary.wards_over_threshold
    tight_by_id = {item.area.id: item.travel_time_minutes for item in tight.areas}
    loose_by_id = {item.area.id: item.travel_time_minutes for item in loose.areas}
    assert tight_by_id == loose_by_id


def test_service_suitability_is_enforced():
    areas = [
        AnalysisArea(
            id="A1",
            name="Area 1",
            population=1_000,
            vulnerability_index=0.5,
            area_km2=1.0,
            centroid_lon=73.86,
            centroid_lat=18.52,
            quadrant="Central",
            geometry={},
        )
    ]
    diagnostics_only = AnalysisFacility(
        id="F1",
        name="Diagnostic centre",
        facility_type="diagnostic_centre",
        services=("diagnostics",),
        lon=73.87,
        lat=18.53,
    )
    result = analyze(areas, [diagnostics_only], "primary_care", 30, StraightLineFallbackRouter())
    assert result.summary.suitable_facility_count == 0
    assert result.summary.covered_population == 0
    assert result.summary.wards_over_threshold == 1
    assert result.areas[0].travel_time_minutes is None
    assert result.areas[0].nearest_facility_id is None

    diagnostics = analyze(areas, [diagnostics_only], "diagnostics", 30, StraightLineFallbackRouter())
    assert diagnostics.summary.covered_population == 1_000
    assert diagnostics.areas[0].travel_time_minutes is not None


def test_unreachable_without_any_suitable_facility():
    area = AnalysisArea(
        id="A1",
        name="Only area",
        population=5_000,
        vulnerability_index=0.2,
        area_km2=2.0,
        centroid_lon=73.86,
        centroid_lat=18.52,
        quadrant="Central",
        geometry={},
    )
    result = analyze([area], [], "primary_care", 30, StraightLineFallbackRouter())
    assert result.summary.unreachable_wards == 1
    assert result.summary.coverage_percent == 0
    assert result.summary.weighted_mean_travel_time is None


def test_added_primary_care_clinic_never_worsens_access(
    demo_areas, demo_facilities, road_router: SyntheticRoadRouter
):
    baseline = analyze(demo_areas, demo_facilities, "primary_care", 30, road_router)
    underserved = max(
        (item for item in baseline.areas if not item.covered),
        key=lambda item: item.area.population,
    ).area
    candidate = AnalysisFacility(
        id="proposed",
        name="Proposed clinic",
        facility_type="primary_care_clinic",
        services=("primary_care", "maternal_health"),
        lon=underserved.centroid_lon,
        lat=underserved.centroid_lat,
    )
    proposed = analyze(
        demo_areas,
        [*demo_facilities, candidate],
        "primary_care",
        30,
        road_router,
    )
    comparison = compare_access(baseline, proposed)

    assert proposed.summary.covered_population >= baseline.summary.covered_population
    assert comparison.newly_covered_population > 0
    assert comparison.coverage_gain_percentage_points >= 0
    assert comparison.wards_worsened == 0
    assert comparison.remaining_uncovered_population <= (
        baseline.summary.total_population - baseline.summary.covered_population
    )

    base_by_id = {item.area.id: item for item in baseline.areas}
    for area in proposed.areas:
        base = base_by_id[area.area.id]
        if base.travel_time_minutes is not None:
            assert area.travel_time_minutes is not None
            assert area.travel_time_minutes <= base.travel_time_minutes + 0.05
    if comparison.weighted_mean_travel_time_change is not None:
        assert comparison.weighted_mean_travel_time_change <= 0.05


def test_comparison_rejects_mismatched_analyses(demo_areas, demo_facilities, road_router):
    baseline = analyze(demo_areas, demo_facilities, "primary_care", 30, road_router)
    other = analyze(demo_areas, demo_facilities, "primary_care", 45, road_router)
    with pytest.raises(ValueError):
        compare_access(baseline, other)


def test_equity_group_is_population_weighted(demo_areas, demo_facilities, road_router):
    baseline = analyze(demo_areas, demo_facilities, "primary_care", 30, road_router)
    area = max(
        (item for item in baseline.areas if not item.covered),
        key=lambda item: item.area.population,
    ).area
    candidate = AnalysisFacility(
        id="proposed",
        name="Proposed clinic",
        facility_type="primary_care_clinic",
        services=("primary_care",),
        lon=area.centroid_lon,
        lat=area.centroid_lat,
    )
    proposed = analyze(
        demo_areas, [*demo_facilities, candidate], "primary_care", 30, road_router
    )
    comparison = compare_access(baseline, proposed)
    equity = comparison.equity
    assert 0 < equity.worst_served_population_share <= 0.25
    assert equity.worst_served_area_count >= 1
    assert equity.worst_served_population <= baseline.summary.total_population
    assert equity.proposed_coverage_percent >= equity.baseline_coverage_percent
    assert (equity.mean_travel_time_improvement or 0) >= 0


def test_weighted_statistics_are_bounded(demo_areas, demo_facilities, road_router):
    result = analyze(demo_areas, demo_facilities, "primary_care", 30, road_router)
    summary = result.summary
    times = [item.travel_time_minutes for item in result.areas if item.travel_time_minutes is not None]
    assert summary.weighted_mean_travel_time is not None
    assert summary.weighted_median_travel_time is not None
    assert summary.weighted_p90_travel_time is not None
    assert min(times) - 1e-6 <= summary.weighted_mean_travel_time <= max(times) + 1e-6
    assert summary.weighted_median_travel_time <= summary.weighted_p90_travel_time + 1e-6


def test_invalid_threshold_is_rejected(demo_areas, demo_facilities, road_router):
    with pytest.raises(ValueError):
        analyze(demo_areas, demo_facilities, "primary_care", 0, road_router)
