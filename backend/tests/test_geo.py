from __future__ import annotations

import pytest

from app.services.geo import haversine_km, to_utm, to_wgs84, valid_coordinate


def test_haversine_known_distance():
    # One degree of latitude is approximately 111.2 km.
    distance = haversine_km(73.86, 18.52, 73.86, 19.52)
    assert 110.5 < distance < 111.5


def test_haversine_zero():
    assert haversine_km(73.86, 18.52, 73.86, 18.52) == pytest.approx(0.0)


def test_projection_round_trip():
    lon, lat = 73.8421, 18.5304
    x, y = to_utm(lon, lat)
    round_trip_lon, round_trip_lat = to_wgs84(x, y)
    assert round_trip_lon == pytest.approx(lon, abs=1e-9)
    assert round_trip_lat == pytest.approx(lat, abs=1e-9)


@pytest.mark.parametrize(
    ("lon", "lat", "expected"),
    [
        (0.0, 0.0, True),
        (180.0, 90.0, True),
        (-180.0, -90.0, True),
        (180.1, 0.0, False),
        (0.0, 90.1, False),
        (-200.0, 10.0, False),
    ],
)
def test_coordinate_validation(lon: float, lat: float, expected: bool):
    assert valid_coordinate(lon, lat) is expected
