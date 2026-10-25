"""Known-answer tests for nullable population, equity, and array/dict parity."""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pytest

from app.services.analysis import (
    AnalysisArea,
    AnalysisFacility,
    analyze,
    compare_access,
)
from app.services.routing import RoutingModelInfo


@dataclass
class FakeRouter:
    times: dict[str, dict[str, float]]
    model_info: RoutingModelInfo = RoutingModelInfo(
        id="fake",
        label="Fake deterministic router",
        description="Test router",
    )

    def travel_matrix(self, areas, facilities):
        return {
            area.id: {
                facility.id: self.times[area.id][facility.id]
                for facility in facilities
                if facility.id in self.times.get(area.id, {})
            }
            for area in areas
        }

    def travel_matrix_array(self, areas, facilities):
        values = np.full((len(areas), len(facilities)), np.inf, dtype=np.float32)
        for row, area in enumerate(areas):
            for column, facility in enumerate(facilities):
                if facility.id in self.times.get(area.id, {}):
                    values[row, column] = self.times[area.id][facility.id]
        return values


class DictOnlyRouter:
    def __init__(self, times):
        self.times = times
        self.model_info = RoutingModelInfo(
            id="dict_only", label="Dict-only router", description="Test router"
        )

    def travel_matrix(self, areas, facilities):
        return {
            area.id: {
                facility.id: self.times[area.id][facility.id]
                for facility in facilities
                if facility.id in self.times.get(area.id, {})
            }
            for area in areas
        }


def make_area(area_id: str, population: int | None, lon: float, lat: float) -> AnalysisArea:
    return AnalysisArea(
        id=area_id,
        name=area_id,
        population=population,
        vulnerability_index=None,
        area_km2=1.0,
        centroid_lon=lon,
        centroid_lat=lat,
        quadrant="Test",
        geometry={
            "type": "Polygon",
            "coordinates": [
                [
                    [lon, lat],
                    [lon + 0.01, lat],
                    [lon + 0.01, lat + 0.01],
                    [lon, lat + 0.01],
                    [lon, lat],
                ]
            ],
        },
    )


def make_facility(facility_id: str, service: str = "primary_care") -> AnalysisFacility:
    return AnalysisFacility(
        id=facility_id,
        name=facility_id,
        facility_type="clinic",
        services=(service,),
        lon=0.0,
        lat=0.0,
    )


@pytest.fixture()
def scenario():
    areas = [
        make_area("A", 100, 77.00, 28.50),
        make_area("B", 200, 77.10, 28.50),
        make_area("C", None, 77.20, 28.50),
    ]
    facilities = [make_facility("F1"), make_facility("F2")]
    times = {
        "A": {"F1": 5.0, "F2": 60.0},
        "B": {"F1": 40.0, "F2": 50.0},
        "C": {"F1": 100.0, "F2": 90.0},
    }
    return areas, facilities, times


def test_known_answer_summary_excludes_unknown_population(scenario):
    areas, facilities, times = scenario
    result = analyze(areas, facilities, "primary_care", 30, FakeRouter(times))
    summary = result.summary
    assert summary.total_population == 300
    assert summary.covered_population == 100
    assert summary.coverage_percent == pytest.approx(100 / 3, abs=1e-6)
    assert summary.wards_total == 2
    assert summary.areas_total == 3
    assert summary.areas_with_population == 2
    assert summary.areas_without_population == 1
    assert summary.population_reference_year is None
    assert summary.distribution[2]["population"] == 200
    assert sum(bucket["population"] for bucket in summary.distribution) == 300
    assert result.areas[2].travel_time_minutes == pytest.approx(90.0)
    assert result.areas[2].covered is False
    assert result.areas[2].to_dict()["population"] is None
    assert result.areas[2].to_dict()["population_included"] is False


def test_array_and_dict_paths_agree(scenario):
    areas, facilities, times = scenario
    array_result = analyze(areas, facilities, "primary_care", 30, FakeRouter(times))
    dict_result = analyze(
        areas, facilities, "primary_care", 30, DictOnlyRouter(times)
    )
    assert array_result.summary.to_dict() == dict_result.summary.to_dict()
    assert [item.to_dict() for item in array_result.areas] == [
        item.to_dict() for item in dict_result.areas
    ]


def test_compare_access_known_answer_and_non_worsening(scenario):
    areas, facilities, times = scenario
    baseline = analyze(areas, facilities, "primary_care", 30, FakeRouter(times))
    improved_times = {
        "A": {"F1": 5.0, "F2": 60.0, "F3": 4.0},
        "B": {"F1": 40.0, "F2": 50.0, "F3": 8.0},
        "C": {"F1": 100.0, "F2": 90.0, "F3": 20.0},
    }
    proposed = analyze(
        areas,
        [*facilities, make_facility("F3")],
        "primary_care",
        30,
        FakeRouter(improved_times),
    )
    comparison = compare_access(baseline, proposed)
    assert comparison.newly_covered_population == 200
    assert comparison.wards_newly_covered == 1
    assert comparison.wards_worsened == 0
    assert comparison.coverage_gain_percentage_points == pytest.approx(
        (300 / 300 - 100 / 300) * 100
    )
    assert comparison.remaining_uncovered_population == 0
    assert comparison.equity.worst_served_population == 200
    assert comparison.equity.coverage_gain_percentage_points == pytest.approx(100.0)


def test_unreachable_area_with_unknown_population_is_not_counted(scenario):
    areas, facilities, times = scenario
    times = {
        "A": {"F1": 5.0, "F2": 60.0},
        "B": {"F1": 40.0, "F2": 25.0},
        "C": {"F1": 999.0, "F2": 999.0},
    }
    result = analyze(areas, facilities, "primary_care", 30, FakeRouter(times))
    assert result.summary.unreachable_wards == 0
    assert result.areas[2].travel_time_minutes == 999.0
    areas_without = [item for item in result.areas if not item.area.has_population]
    assert len(areas_without) == 1


def test_release_manifest_is_internally_consistent():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app" / "data" / "delhi"
    manifest = json.loads((root / "dataset.json").read_text())
    areas = json.loads((root / "areas.geojson").read_text())["features"]
    facilities = json.loads((root / "facilities.geojson").read_text())["features"]
    assert manifest["dataset_id"] == "delhi-pilot"
    assert manifest["is_synthetic"] is False
    assert manifest["release"].startswith("delhi-pilot-")
    assert manifest["counts"]["areas"] == len(areas)
    assert manifest["counts"]["facilities"] == len(facilities)
    assert manifest["population"]["reference_year"] == 2011
    assert manifest["counts"]["population"] == sum(
        feature["properties"]["population"] or 0 for feature in areas
    )
