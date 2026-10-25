from __future__ import annotations

import pytest

from app.services.optimization import recommend


def test_recommendations_are_deterministic(demo_areas, demo_facilities, road_router):
    kwargs = {
        "areas": demo_areas,
        "facilities": demo_facilities,
        "service": "primary_care",
        "threshold_minutes": 30,
        "router": road_router,
        "intervention_type": "primary_care_clinic",
        "equity_weight": 0.35,
        "limit": 4,
        "set_size": 2,
        "strategy": "equity_weighted",
    }
    first = recommend(**kwargs)
    second = recommend(**kwargs)
    assert [item["area_id"] for item in first["candidates"]] == [
        item["area_id"] for item in second["candidates"]
    ]
    assert [item["score"] for item in first["candidates"]] == [
        item["score"] for item in second["candidates"]
    ]
    assert [item["area_id"] for item in first["recommended_set"]["facilities"]] == [
        item["area_id"] for item in second["recommended_set"]["facilities"]
    ]


def test_candidate_metrics_are_consistent(demo_areas, demo_facilities, road_router):
    result = recommend(
        areas=demo_areas,
        facilities=demo_facilities,
        service="primary_care",
        threshold_minutes=30,
        router=road_router,
        intervention_type="primary_care_clinic",
        equity_weight=0.35,
        limit=10,
        set_size=3,
    )
    baseline = result["baseline"]
    baseline_uncovered = baseline["total_population"] - baseline["covered_population"]
    for candidate in result["candidates"]:
        metrics = candidate["metrics"]
        assert metrics["newly_covered_population"] >= 0
        assert metrics["newly_covered_areas"] >= 0
        assert metrics["coverage_after_percent"] >= baseline["coverage_percent"]
        assert metrics["remaining_uncovered_population"] <= baseline_uncovered
        breakdown = candidate["score_breakdown"]
        for key in ("coverage_component", "equity_component", "travel_component"):
            assert 0.0 <= breakdown[key] <= 1.0
        assert 0.0 <= candidate["score"] <= 1.0
        assert candidate["explanation"]
    scores = [item["score"] for item in result["candidates"]]
    assert scores == sorted(scores, reverse=True)


def test_recommended_set_is_incremental_and_bounded(demo_areas, demo_facilities, road_router):
    result = recommend(
        areas=demo_areas,
        facilities=demo_facilities,
        service="primary_care",
        threshold_minutes=30,
        router=road_router,
        intervention_type="primary_care_clinic",
        set_size=3,
        strategy="equity_weighted",
    )
    steps = result["recommended_set"]["facilities"]
    assert 1 <= len(steps) <= 3
    assert len({step["area_id"] for step in steps}) == len(steps)
    previous = 0
    for step in steps:
        assert step["marginal_newly_covered_population"] >= 0
        assert step["cumulative_newly_covered_population"] >= previous
        previous = step["cumulative_newly_covered_population"]
    assert result["recommended_set"]["final_coverage_percent"] >= result["baseline"]["coverage_percent"]
    assert result["recommended_set"]["remaining_uncovered_population"] >= 0


def test_two_strategies_produce_valid_comparisons(demo_areas, demo_facilities, road_router):
    result = recommend(
        areas=demo_areas,
        facilities=demo_facilities,
        service="primary_care",
        threshold_minutes=30,
        router=road_router,
        intervention_type="primary_care_clinic",
        set_size=2,
    )
    assert set(result["comparison"]) == {"max_coverage", "equity_weighted"}
    for strategy_result in result["comparison"].values():
        assert strategy_result["total_newly_covered_population"] >= 0
        assert 0 <= strategy_result["final_coverage_percent"] <= 100
        assert strategy_result["strategy"] in {"max_coverage", "equity_weighted"}


def test_intervention_service_compatibility(demo_areas, demo_facilities, road_router):
    with pytest.raises(ValueError):
        recommend(
            areas=demo_areas,
            facilities=demo_facilities,
            service="primary_care",
            threshold_minutes=30,
            router=road_router,
            intervention_type="diagnostic_centre",
        )


def test_invalid_parameters_are_rejected(demo_areas, demo_facilities, road_router):
    with pytest.raises(ValueError):
        recommend(
            areas=demo_areas,
            facilities=demo_facilities,
            service="primary_care",
            threshold_minutes=30,
            router=road_router,
            intervention_type="primary_care_clinic",
            equity_weight=1.5,
        )
    with pytest.raises(ValueError):
        recommend(
            areas=demo_areas,
            facilities=demo_facilities,
            service="primary_care",
            threshold_minutes=30,
            router=road_router,
            intervention_type="primary_care_clinic",
            set_size=10,
        )
