"""Generate CareGap's deterministic synthetic demonstration dataset.

Everything produced by this script is synthetic: administrative boundaries,
population values, vulnerability indices, facilities, and the road network do
not describe real places or real health services. Coordinates are placed near
Pune, Maharashtra only so that the demo renders in a familiar geographic
context. See the repository README and docs/data-sources.md.

Usage:
    .venv/bin/python backend/scripts/generate_demo_data.py
"""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import MultiPoint, Point, Polygon, mapping
from shapely import transform as shapely_transform
from shapely.ops import voronoi_diagram

SEED = 20261024
CENTER_LON = 73.86
CENTER_LAT = 18.52
DISTRICT_RADIUS_X_KM = 26.0
DISTRICT_RADIUS_Y_KM = 19.0
TARGET_WARDS = 96
GRID_SPACING_KM = 2.0
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "app" / "data" / "demo"

UTM = "EPSG:32643"  # UTM zone 43N, appropriate for the Pune region.
TO_UTM = Transformer.from_crs("EPSG:4326", UTM, always_xy=True)
TO_WGS84 = Transformer.from_crs(UTM, "EPSG:4326", always_xy=True)

FACILITY_TYPES: dict[str, dict[str, object]] = {
    "district_hospital": {
        "label": "District hospital",
        "services": ["primary_care", "maternal_health", "diagnostics", "emergency"],
    },
    "primary_health_centre": {
        "label": "Primary health centre",
        "services": ["primary_care", "maternal_health", "diagnostics"],
    },
    "community_health_centre": {
        "label": "Community health centre",
        "services": ["primary_care", "maternal_health"],
    },
    "diagnostic_centre": {
        "label": "Diagnostic centre",
        "services": ["diagnostics"],
    },
    "maternal_health_centre": {
        "label": "Maternal health centre",
        "services": ["maternal_health"],
    },
}


def utm_point(dx_km: float, dy_km: float) -> Point:
    cx, cy = TO_UTM.transform(CENTER_LON, CENTER_LAT)
    return Point(cx + dx_km * 1000.0, cy + dy_km * 1000.0)


def district_polygon() -> Polygon:
    """An irregular synthetic district boundary (not a real administrative unit)."""
    center = Point(TO_UTM.transform(CENTER_LON, CENTER_LAT))
    vertices = []
    for i in range(96):
        theta = 2.0 * math.pi * i / 96
        radial = (
            1.0
            + 0.075 * math.sin(3 * theta + 0.7)
            + 0.035 * math.sin(7 * theta + 2.1)
            + 0.018 * math.sin(13 * theta + 4.2)
        )
        x = center.x + math.cos(theta) * DISTRICT_RADIUS_X_KM * 1000 * radial
        y = center.y + math.sin(theta) * DISTRICT_RADIUS_Y_KM * 1000 * radial
        vertices.append((x, y))
    return Polygon(vertices).buffer(0)


def make_wards(district: Polygon, rng: random.Random) -> list[Polygon]:
    minx, miny, maxx, maxy = district.bounds
    cols, rows = 10, 10
    candidate_points: list[Point] = []
    for row in range(rows):
        for col in range(cols):
            x = minx + (col + 0.5 + rng.uniform(-0.38, 0.38)) * (maxx - minx) / cols
            y = miny + (row + 0.5 + rng.uniform(-0.38, 0.38)) * (maxy - miny) / rows
            candidate_points.append(Point(x, y))

    # Nudge points outside the district toward its centroid until they are inside.
    centroid = district.centroid
    adjusted = []
    for point in candidate_points:
        for _ in range(40):
            if district.contains(point):
                break
            point = Point(
                point.x * 0.9 + centroid.x * 0.1,
                point.y * 0.9 + centroid.y * 0.1,
            )
        if district.contains(point):
            adjusted.append(point)

    envelope = district.buffer(2000).envelope
    cells = voronoi_diagram(MultiPoint(adjusted), envelope=envelope, edges=False).geoms
    wards = []
    for cell in cells:
        clipped = cell.intersection(district)
        if clipped.is_empty:
            continue
        if clipped.geom_type == "MultiPolygon":
            clipped = max(clipped.geoms, key=lambda g: g.area)
        if clipped.area < 400_000:  # discard slivers (< 0.4 km2)
            continue
        wards.append(clipped)

    wards.sort(key=lambda geom: (-geom.centroid.y, geom.centroid.x))
    return wards[:TARGET_WARDS]


def population_for(ward: Polygon) -> int:
    centroid = ward.centroid
    urban_a = utm_point(6.0, 1.5)
    urban_b = utm_point(-4.5, -1.5)
    dist_a = centroid.distance(urban_a) / 1000.0
    dist_b = centroid.distance(urban_b) / 1000.0
    density = (
        7_200 * math.exp(-(dist_a**2) / (2 * 6.0**2))
        + 3_800 * math.exp(-(dist_b**2) / (2 * 5.0**2))
        + 900
    )
    area_km2 = ward.area / 1_000_000
    return int(round(density * area_km2))


def vulnerability_for(ward: Polygon) -> float:
    centroid = ward.centroid
    urban_a = utm_point(6.0, 1.5)
    urban_b = utm_point(-4.5, -1.5)
    distance = min(
        centroid.distance(urban_a) / 1000.0,
        centroid.distance(urban_b) / 1000.0,
    )
    distance_component = min(distance / 28.0, 1.0)
    vertex = rng_for(centroid).random()
    value = 0.62 * distance_component + 0.38 * vertex
    return round(min(0.95, max(0.05, value)), 3)


def rng_for(centroid: Point) -> random.Random:
    # Stable per-area randomness, independent of iteration order.
    return random.Random(SEED + int(centroid.x) * 31 + int(centroid.y) * 17)


def quadrant_name(centroid: Point) -> str:
    cx, cy = TO_UTM.transform(CENTER_LON, CENTER_LAT)
    ns = "North" if centroid.y >= cy else "South"
    ew = "East" if centroid.x >= cx else "West"
    return f"{ns}{ew}"


def build_roads(district: Polygon) -> tuple[list[dict], list[dict]]:
    """Return (node features, edge features) for a synthetic street grid.

    The grid deliberately looks synthetic on the map. It is a deterministic
    demonstration network, not OpenStreetMap or a live routing service.
    """
    minx, miny, maxx, maxy = district.bounds
    pad = 900.0
    minx, miny, maxx, maxy = minx - pad, miny - pad, maxx + pad, maxy + pad
    spacing = GRID_SPACING_KM * 1000
    cols = int(math.ceil((maxx - minx) / spacing)) + 1
    rows = int(math.ceil((maxy - miny) / spacing)) + 1
    nodes = []
    node_index: dict[tuple[int, int], str] = {}
    for row in range(rows):
        for col in range(cols):
            x = minx + col * spacing
            y = miny + row * spacing
            node_id = f"N{row:02d}{col:02d}"
            node_index[(row, col)] = node_id
            lon, lat = TO_WGS84.transform(x, y)
            nodes.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                    "properties": {"node_id": node_id},
                }
            )

    edges = []
    seen = set()

    def road_speed(row: int, col: int, diagonal: bool) -> tuple[int, str]:
        if diagonal:
            return 20, "local"
        if row == rows // 2 or col == cols // 2:
            return 48, "arterial"
        if (row + col) % 5 == 0:
            return 36, "collector"
        return 24, "local"

    def add_edge(a: tuple[int, int], b: tuple[int, int], diagonal: bool) -> None:
        if a not in node_index or b not in node_index:
            return
        key = tuple(sorted((node_index[a], node_index[b])))
        if key in seen:
            return
        seen.add(key)
        ax = minx + a[1] * spacing
        ay = miny + a[0] * spacing
        bx = minx + b[1] * spacing
        by = miny + b[0] * spacing
        length = math.hypot(bx - ax, by - ay) / 1000.0
        speed, road_class = road_speed(a[0], a[1], diagonal)
        lon1, lat1 = TO_WGS84.transform(ax, ay)
        lon2, lat2 = TO_WGS84.transform(bx, by)
        edges.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [round(lon1, 6), round(lat1, 6)],
                        [round(lon2, 6), round(lat2, 6)],
                    ],
                },
                "properties": {
                    "from_node": node_index[a],
                    "to_node": node_index[b],
                    "speed_kph": speed,
                    "road_class": road_class,
                    "length_km": round(length, 4),
                },
            }
        )

    for row in range(rows):
        for col in range(cols):
            if col + 1 < cols:
                add_edge((row, col), (row, col + 1), False)
            if row + 1 < rows:
                add_edge((row, col), (row + 1, col), False)
            if row + 1 < rows and col + 1 < cols and (row + col) % 3 == 0:
                add_edge((row, col), (row + 1, col + 1), True)
            if row + 1 < rows and col - 1 >= 0 and (row + col) % 3 == 1:
                add_edge((row, col), (row + 1, col - 1), True)

    return nodes, edges


def feature_collection(features: list[dict], name: str) -> dict:
    return {"type": "FeatureCollection", "name": name, "features": features}


def main() -> None:
    rng = random.Random(SEED)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    district = district_polygon()
    wards = make_wards(district, rng)

    area_features = []
    for index, ward in enumerate(wards, start=1):
        centroid = ward.centroid
        lon, lat = TO_WGS84.transform(centroid.x, centroid.y)
        population = population_for(ward)
        area_id = f"A{index:03d}"
        area_features.append(
            {
                "type": "Feature",
                "geometry": ward_and_reproject(ward),
                "properties": {
                    "area_id": area_id,
                    "name": f"Ward {index:02d}",
                    "population": population,
                    "vulnerability_index": vulnerability_for(ward),
                    "area_km2": round(ward.area / 1_000_000, 3),
                    "centroid_lon": round(lon, 6),
                    "centroid_lat": round(lat, 6),
                    "quadrant": quadrant_name(centroid),
                    "population_source": "synthetic",
                    "vulnerability_source": "synthetic",
                },
            }
        )

    facility_specs = [
        ("District Hospital", "district_hospital", 6.0, 2.8),
        ("North Primary Health Centre", "primary_health_centre", 1.0, 13.0),
        ("East Primary Health Centre", "primary_health_centre", 19.0, -2.0),
        ("Central Community Health Centre", "community_health_centre", -2.0, 1.0),
        ("East Diagnostic Centre", "diagnostic_centre", 7.0, -5.0),
        ("North Maternal Health Centre", "maternal_health_centre", -9.0, 7.0),
    ]
    facility_features = []
    for index, (name, facility_type, dx, dy) in enumerate(facility_specs, start=1):
        point = utm_point(dx, dy)
        # Snap facilities inside the district so every existing facility is within the demo geography.
        if not district.contains(point):
            point = district.centroid
        lon, lat = TO_WGS84.transform(point.x, point.y)
        facility_features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                "properties": {
                    "facility_id": f"F{index:03d}",
                    "name": name,
                    "facility_type": facility_type,
                    "facility_type_label": FACILITY_TYPES[facility_type]["label"],
                    "services": FACILITY_TYPES[facility_type]["services"],
                    "data_status": "synthetic",
                },
            }
        )

    nodes, edges = build_roads(district)
    total_population = sum(f["properties"]["population"] for f in area_features)
    all_coords = []
    for feature in area_features:
        stack = [feature["geometry"]["coordinates"]]
        while stack:
            item = stack.pop()
            if isinstance(item, (list, tuple)) and len(item) == 2 and all(
                isinstance(v, (int, float)) for v in item
            ):
                all_coords.append(item)
            elif isinstance(item, (list, tuple)):
                stack.extend(item)
    west = min(c[0] for c in all_coords)
    south = min(c[1] for c in all_coords)
    east = max(c[0] for c in all_coords)
    north = max(c[1] for c in all_coords)

    dataset = {
        "dataset_id": "caregap-demo",
        "name": "CareGap Synthetic Demo District",
        "short_name": "Demo District",
        "description": (
            "A fully synthetic district created to demonstrate CareGap's accessibility "
            "analysis. It does not represent an actual administrative boundary, real "
            "population counts, real facilities, or real roads."
        ),
        "geography": {
            "region": "Pune region, Maharashtra, India (synthetic polygon)",
            "center": [CENTER_LON, CENTER_LAT],
            "crs": "EPSG:4326",
            "projected_crs": UTM,
            "area_km2": round(district.area / 1_000_000, 2),
            "bbox": [round(west, 6), round(south, 6), round(east, 6), round(north, 6)],
        },
        "is_synthetic": True,
        "data_status": "synthetic",
        "seed": SEED,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generator": "backend/scripts/generate_demo_data.py",
        "counts": {
            "areas": len(area_features),
            "facilities": len(facility_features),
            "road_nodes": len(nodes),
            "road_edges": len(edges),
            "population": total_population,
        },
        "road_model": {
            "name": "Synthetic street grid",
            "description": (
                "A deterministic 2.0 km grid with plausible district road speeds. "
                "Travel times are model estimates, not live traffic or turn-by-turn routing."
            ),
            "grid_spacing_km": GRID_SPACING_KM,
            "local_access_speed_kph": 18,
            "speed_classes_kph": {"arterial": 48, "collector": 36, "local": 24, "diagonal_local": 20},
        },
        "sources": [
            {
                "id": "synthetic-demo",
                "name": "CareGap synthetic demonstration dataset",
                "publisher": "CareGap project",
                "type": "synthetic",
                "url": "backend/app/data/demo/README.md",
                "retrieved_at": "generated locally",
                "licence": "Repository licence (see LICENSE)",
                "coverage": "Synthetic Demo District near Pune, Maharashtra",
                "limitations": [
                    "Not a real administrative boundary",
                    "Population and vulnerability values are synthetic",
                    "Facilities are fictional",
                    "Road network is a synthetic grid, not OpenStreetMap",
                ],
            }
        ],
        "limitations": [
            "Travel time is estimated from a synthetic grid network and does not include live traffic.",
            "Population is a ward-level estimate, not a residence-level count.",
            "Facility capacity, staffing, opening hours, cost, and quality are not modelled.",
            "The demo maps six facilities. Missing facilities in the synthetic inventory do not prove that care is absent.",
            "Coverage within a travel-time threshold is not the same as receiving quality care.",
            "Vulnerability index is synthetic and must not be used for real policy decisions.",
        ],
    }

    (OUTPUT_DIR / "areas.geojson").write_text(
        json.dumps(feature_collection(area_features, "caregap-demo-areas"), indent=2) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "facilities.geojson").write_text(
        json.dumps(feature_collection(facility_features, "caregap-demo-facilities"), indent=2) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "roads.geojson").write_text(
        json.dumps(feature_collection(edges, "caregap-demo-roads"), indent=2) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "road_nodes.geojson").write_text(
        json.dumps(feature_collection(nodes, "caregap-demo-road-nodes"), indent=2) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "dataset.json").write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")

    print(f"Generated {len(area_features)} synthetic wards, {len(facility_features)} facilities")
    print(f"Population total: {total_population:,}; road edges: {len(edges)}")
    print(f"Output: {OUTPUT_DIR}")


def ward_and_reproject(geom: dict | Polygon) -> dict:
    """Reproject a UTM geometry to WGS84 before serialising as GeoJSON."""
    if isinstance(geom, Polygon):
        projected = shapely_transform(
            geom,
            lambda coords: [
                [TO_WGS84.transform(x, y)[0], TO_WGS84.transform(x, y)[1]]
                for x, y in coords
            ],
        )
        mapped = mapping(projected)
        return round_coordinates(mapped)
    raise TypeError("Expected a shapely Polygon")


def round_coordinates(geometry: dict) -> dict:
    def round_coords(value):
        if isinstance(value, (list, tuple)):
            if len(value) == 2 and all(isinstance(v, (int, float)) for v in value):
                return [round(float(value[0]), 6), round(float(value[1]), 6)]
            return [round_coords(v) for v in value]
        return value

    return {
        "type": geometry["type"],
        "coordinates": round_coords(geometry["coordinates"]),
    }


if __name__ == "__main__":
    main()
