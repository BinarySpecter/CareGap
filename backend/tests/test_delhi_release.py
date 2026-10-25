"""Validation tests for the committed Delhi pilot data release.

These tests read the release artifacts directly and assert measured properties.
They do not call external services and are deterministic.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import Point, shape

from app.core.catalog import FACILITY_TYPE_LABELS, SERVICE_IDS
from app.services.geo import valid_coordinate

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "data" / "delhi"


@pytest.fixture(scope="module")
def manifest() -> dict:
    return json.loads((DATA_DIR / "dataset.json").read_text())


@pytest.fixture(scope="module")
def areas() -> list[dict]:
    return json.loads((DATA_DIR / "areas.geojson").read_text())["features"]


@pytest.fixture(scope="module")
def facilities() -> list[dict]:
    return json.loads((DATA_DIR / "facilities.geojson").read_text())["features"]


@pytest.fixture(scope="module")
def boundary():
    payload = json.loads((DATA_DIR / "boundary.geojson").read_text())
    return shape(payload["features"][0]["geometry"])


def test_release_identity_and_provenance(manifest):
    assert manifest["dataset_id"] == "delhi-pilot"
    assert manifest["release"] == "delhi-pilot-2026.10-r1"
    assert manifest["is_synthetic"] is False
    assert manifest["data_status"] == "official_census_2011_osm"
    assert manifest["population"]["reference_year"] == 2011
    assert manifest["geography"]["cross_border_areas_included"] is False
    source_ids = {source["id"] for source in manifest["sources"]}
    assert {"osm-delhi-boundary", "census-2011-delhi-wards", "osm-health-facilities", "osm-roads"} <= source_ids
    for source in manifest["sources"]:
        assert source["licence"], source["id"]
        assert source["url"].startswith("https://") or source["url"].startswith("http://")
    assert manifest["vulnerability"]["available"] is False
    assert manifest["capabilities"]["area_import"] is False


def test_area_ids_population_and_status(manifest, areas):
    ids = [feature["properties"]["area_id"] for feature in areas]
    assert len(ids) == len(set(ids)) == manifest["counts"]["areas"] == 290
    with_population = [
        feature for feature in areas if feature["properties"]["population"] is not None
    ]
    without_population = [
        feature for feature in areas if feature["properties"]["population"] is None
    ]
    assert len(with_population) == 272
    assert len(without_population) == 18
    assert sum(feature["properties"]["population"] for feature in with_population) == 16_000_745
    assert manifest["counts"]["population"] == 16_000_745
    for feature in with_population:
        properties = feature["properties"]
        assert properties["population_status"] == "census_2011"
        assert properties["population_reference_year"] == 2011
        assert properties["population"] > 0
    for feature in without_population:
        properties = feature["properties"]
        assert properties["population_status"] == "unavailable"
        assert properties["vulnerability_index"] is None
        assert properties["vulnerability_status"] == "unavailable"
    assert not any(
        feature["properties"]["vulnerability_index"] is not None for feature in areas
    )


def test_ward_join_covers_every_mcd_ward(areas):
    numbers = sorted(
        int(feature["properties"]["ward_no"])
        for feature in areas
        if feature["properties"]["municipality"] == "MCD"
    )
    assert numbers == list(range(1, 273))
    labels = {feature["properties"]["municipality"] for feature in areas}
    assert labels == {"MCD", "NDMC", "Delhi Cantonment", "Unassigned"}


def test_geometry_validity_and_centroid_ranges(areas):
    for feature in areas:
        geometry = shape(feature["geometry"])
        assert geometry.is_valid, feature["properties"]["area_id"]
        assert not geometry.is_empty
        properties = feature["properties"]
        assert valid_coordinate(properties["centroid_lon"], properties["centroid_lat"])
        assert 76.5 < properties["centroid_lon"] < 77.6
        assert 28.2 < properties["centroid_lat"] < 29.1
        assert properties["area_km2"] > 0


def test_boundary_is_delhi_and_matches_official_area(boundary, manifest):
    assert boundary.is_valid
    assert len(boundary.geoms) == 1 if boundary.geom_type == "MultiPolygon" else True
    area_km2 = manifest["geography"]["area_km2"]
    assert area_km2 == pytest.approx(1482.04, abs=1.0)
    minx, miny, maxx, maxy = boundary.bounds
    assert 76.7 < minx < 77.0
    assert 28.3 < miny < 28.5
    assert 77.2 < maxx < 77.5
    assert 28.8 < maxy < 29.0
    # Every population area must be substantially inside the study boundary.
    for feature in json.loads((DATA_DIR / "areas.geojson").read_text())["features"]:
        geometry = shape(feature["geometry"])
        ratio = geometry.intersection(boundary).area / geometry.area
        assert ratio > 0.9, feature["properties"]["area_id"]


def test_facility_counts_categories_and_provenance(manifest, facilities):
    assert len(facilities) == manifest["counts"]["facilities"] == 1368
    ids = [feature["properties"]["facility_id"] for feature in facilities]
    assert len(ids) == len(set(ids))
    for feature in facilities:
        properties = feature["properties"]
        assert properties["facility_type"] in {
            "hospital",
            "health_centre",
            "dispensary",
            "clinic",
            "birthing_centre",
            "diagnostic_laboratory",
        }
        assert properties["facility_type"] in FACILITY_TYPE_LABELS
        assert properties["services"]
        assert set(properties["services"]) <= set(SERVICE_IDS)
        assert properties["data_status"] == "osm"
        assert properties["source"] == "OpenStreetMap"
        assert re.fullmatch(r"(node|way|relation)/\d+", properties["source_id"])
        assert properties["source_url"].startswith("https://www.openstreetmap.org/")
        assert properties["operational_status"] == "unknown"
        assert properties["admin_area"], properties["source_id"]
        assert isinstance(properties["address"], str)
        lon, lat = feature["geometry"]["coordinates"]
        assert valid_coordinate(lon, lat)
    categories = {feature["properties"]["facility_type"] for feature in facilities}
    assert categories == {
        "hospital",
        "health_centre",
        "dispensary",
        "clinic",
        "diagnostic_laboratory",
    }


def test_facilities_inside_boundary(boundary, facilities):
    outside = []
    for feature in facilities:
        point = Point(feature["geometry"]["coordinates"])
        if not boundary.buffer(0.002).contains(point):
            outside.append(feature["properties"]["facility_id"])
    assert outside == []


def test_no_duplicate_facility_names_within_150_metres(facilities):
    groups: dict[str, list[tuple[float, float]]] = {}
    for feature in facilities:
        name = feature["properties"]["name"].lower()
        if name.startswith("unnamed "):
            continue
        lon, lat = feature["geometry"]["coordinates"]
        groups.setdefault(name, []).append((lon, lat))
    duplicates = []
    for name, points in groups.items():
        for index, (lon, lat) in enumerate(points):
            for other_lon, other_lat in points[index + 1 :]:
                distance = _haversine_km(lon, lat, other_lon, other_lat)
                if distance <= 0.15:
                    duplicates.append((name, distance))
    assert duplicates == []


def test_services_are_tag_derived(manifest, facilities):
    # Every maternal or emergency facility must carry the corresponding tag
    # evidence; names are never used to attribute a service.
    for feature in facilities:
        properties = feature["properties"]
        tags = properties["source_tags"]
        if "emergency" in properties["services"]:
            assert tags.get("emergency") == "yes", properties["source_id"]
        if "maternal_health" in properties["services"]:
            assert (
                tags.get("healthcare") == "birthing_centre"
                or "gynaec" in str(tags.get("healthcare:speciality", "")).lower()
                or "obstetric" in str(tags.get("healthcare:speciality", "")).lower()
                or "matern" in str(tags.get("healthcare:speciality", "")).lower()
            ), properties["source_id"]


def test_routing_artifact_shapes_and_consistency():
    path = DATA_DIR / "routing.npz"
    with np.load(path, allow_pickle=False) as payload:
        graph_indptr = payload["indptr"]
        graph_indices = payload["indices"]
        graph_data = payload["data"]
        travel = payload["travel_minutes"]
        area_distance = payload["area_distance"]
        area_ids = payload["area_ids"]
        facility_ids = payload["facility_ids"]
        area_node = payload["area_node"]
    nodes = len(graph_indptr) - 1
    assert nodes > 500_000
    assert graph_indices.max() < nodes
    assert len(graph_data) == len(graph_indices)
    assert np.all(graph_data > 0)
    assert travel.shape == (len(area_ids), len(facility_ids)) == (290, 1368)
    assert np.isfinite(travel).all()
    assert travel.min() >= 0
    assert travel.max() < 180
    assert area_distance.shape == (290, 290)
    assert np.isfinite(area_distance).all()
    assert np.allclose(np.diag(area_distance), 0.0, atol=1e-6)
    assert np.allclose(area_distance, area_distance.T, atol=1e-5)
    assert area_node.max() < nodes


def test_routing_known_pair_matches_dijkstra():
    """A packaged facility-area time must equal a fresh shortest-path query."""
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import dijkstra

    with np.load(DATA_DIR / "routing.npz", allow_pickle=False) as payload:
        graph = csr_matrix(
            (
                payload["data"].astype(float),
                payload["indices"].astype(int),
                payload["indptr"].astype(int),
            )
        )
        travel = payload["travel_minutes"]
        area_node = payload["area_node"]
        facility_node = payload["facility_node"]
        area_access = payload["area_access"]
        facility_access = payload["facility_access"]
        area_ids = [str(value) for value in payload["area_ids"]]
        facility_ids = [str(value) for value in payload["facility_ids"]]
    area_index = area_ids.index("DL-W077")
    facility_index = facility_ids.index("OSM-N11242142952")
    distances = dijkstra(graph, directed=False, indices=int(facility_node[facility_index]))
    expected = (
        distances[int(area_node[area_index])]
        + float(facility_access[facility_index])
        + float(area_access[area_index])
    )
    assert travel[area_index, facility_index] == pytest.approx(expected, abs=0.01)


def test_quality_report_matches_release(manifest):
    quality = json.loads((DATA_DIR / "quality.json").read_text())
    assert quality["release"] == manifest["release"]
    assert quality["areas"]["population_wards_matched"] == 272
    assert quality["areas"]["population_wards_unmatched"] == []
    assert quality["facilities"]["outside_study_boundary"] == []
    assert quality["routing"]["areas_without_any_reachable_facility"] == 0
    assert quality["routing"]["facilities_unreachable_from_every_area"] == 0
    report = (Path(__file__).resolve().parents[2] / "docs" / "data-quality-report.md").read_text()
    assert manifest["release"] in report
    assert "16,000,745" in report
    assert "1,368" in report


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))
