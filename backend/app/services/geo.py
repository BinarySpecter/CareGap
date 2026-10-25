from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

UTM_CRS = "EPSG:32643"
_TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
_TO_WGS84 = Transformer.from_crs(UTM_CRS, "EPSG:4326", always_xy=True)

EARTH_RADIUS_KM = 6371.0088


def to_utm(lon: float, lat: float) -> tuple[float, float]:
    return _TO_UTM.transform(lon, lat)


def to_wgs84(x: float, y: float) -> tuple[float, float]:
    return _TO_WGS84.transform(x, y)


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    lon1_r, lat1_r, lon2_r, lat2_r = map(math.radians, (lon1, lat1, lon2, lat2))
    dlon = lon2_r - lon1_r
    dlat = lat2_r - lat1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def valid_coordinate(lon: float, lat: float) -> bool:
    return -180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0


def geojson_shape(geometry: dict[str, Any]) -> BaseGeometry:
    return shape(geometry)


def union_geometries(geometries: Iterable[BaseGeometry]) -> BaseGeometry | None:
    items = [geometry for geometry in geometries if geometry is not None and not geometry.is_empty]
    if not items:
        return None
    return unary_union(items)


def point_geometry(lon: float, lat: float) -> Point:
    return Point(lon, lat)


def round_coordinates(geometry: dict[str, Any], precision: int = 6) -> dict[str, Any]:
    def walk(value: Any) -> Any:
        if isinstance(value, (list, tuple)):
            if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
                return [round(float(value[0]), precision), round(float(value[1]), precision)]
            return [walk(item) for item in value]
        return value

    return {"type": geometry["type"], "coordinates": walk(geometry["coordinates"])}
