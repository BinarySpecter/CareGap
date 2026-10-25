"""Tests for the packaged OpenStreetMap network router."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from app.datasets import (
    DatasetUnavailableError,
    build_dataset_router,
    get_profile,
    load_manifest,
)
from app.services.routing import (
    NetworkRoadRouter,
    RouterUnavailableError,
    RoutingArea,
    RoutingFacility,
)

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "data" / "delhi"


@pytest.fixture(scope="module")
def router() -> NetworkRoadRouter:
    profile = get_profile("delhi-pilot")
    manifest = load_manifest(DATA_DIR)
    resolved = build_dataset_router(profile, DATA_DIR, manifest)
    assert isinstance(resolved, NetworkRoadRouter)
    return resolved


def test_router_metadata_and_shape(router: NetworkRoadRouter):
    assert router.model_info.id == "osm_network"
    assert router.model_info.live_traffic is False
    assert router.model_info.is_estimate is True
    assert len(router.area_ids) == 290
    assert len(router.facility_ids) == 1368
    assert router.matrix.shape == (290, 1368)
    assert router.graph.shape[0] > 500_000
    assert router.graph.nnz > 1_000_000


def test_known_pair_uses_packaged_matrix(router: NetworkRoadRouter):
    area = RoutingArea(id="DL-W077", centroid_lon=0.0, centroid_lat=0.0)
    facility_id = "OSM-N11242142952"
    facility = RoutingFacility(
        id=facility_id, name="JNU Health Centre", lon=77.0, lat=28.0, services=("emergency",)
    )
    matrix = router.travel_matrix([area], [facility])
    row = router._area_positions[area.id]
    column = router._facility_positions[facility_id]
    assert matrix[area.id][facility_id] == pytest.approx(
        float(router.matrix[row, column]), abs=1e-6
    )


def test_proposed_facility_at_centroid_is_fast_and_consistent(
    router: NetworkRoadRouter,
):
    index = router.area_ids.index("DL-W085")
    area = RoutingArea(
        id="DL-W085",
        centroid_lon=float(router._area_lon[index]),
        centroid_lat=float(router._area_lat[index]),
    )
    proposed = RoutingFacility(
        id="candidate-DL-W085",
        name="Proposed clinic",
        lon=area.centroid_lon,
        lat=area.centroid_lat,
        services=("primary_care", "maternal_health"),
    )
    dict_matrix = router.travel_matrix([area], [proposed])
    array_matrix = router.travel_matrix_array([area], [proposed])
    value = dict_matrix[area.id][proposed.id]
    assert value == pytest.approx(float(array_matrix[0, 0]), abs=0.001)
    assert value < 1.0
    # Every area is within a plausible road-network travel time of central Delhi.
    assert 0 < value < 60

    all_areas = [
        RoutingArea(id=area_id, centroid_lon=0.0, centroid_lat=0.0)
        for area_id in router.area_ids
    ]
    column = router._facility_column(proposed)
    assert len(column) == 290
    assert min(column.values()) >= 0
    assert max(column.values()) < 180
    assert len(all_areas) == 290


def test_new_facility_inside_delhi_is_routed(router: NetworkRoadRouter):
    proposed = RoutingFacility(
        id="proposed-test",
        name="Proposed test facility",
        lon=77.2103,
        lat=28.6139,
        services=("primary_care",),
    )
    areas = [
        RoutingArea(id=area_id, centroid_lon=0.0, centroid_lat=0.0)
        for area_id in router.area_ids
    ]
    matrix = router.travel_matrix(areas, [proposed])
    times = [matrix[area.id][proposed.id] for area in areas]
    assert len(times) == 290
    assert all(0 <= value < 240 for value in times)
    assert np.isfinite(times).all()


def test_corrupt_release_raises_clear_error(tmp_path: Path):
    profile = get_profile("delhi-pilot")
    manifest = load_manifest(DATA_DIR)
    broken = tmp_path / "routing.npz"
    broken.write_bytes(b"not an npz file")
    with pytest.raises(DatasetUnavailableError):
        build_dataset_router(profile, tmp_path, manifest)


def test_router_rejects_wrong_shape(tmp_path: Path):
    with np.load(DATA_DIR / "routing.npz", allow_pickle=False) as payload:
        arrays = {key: payload[key] for key in payload.files}
    arrays["travel_minutes"] = arrays["travel_minutes"][:10]
    broken = tmp_path / "routing.npz"
    np.savez_compressed(broken, **arrays)
    with pytest.raises(RouterUnavailableError):
        NetworkRoadRouter.from_npz(broken)
