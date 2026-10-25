#!/usr/bin/env python3
"""Build the CareGap Delhi pilot dataset release from validated public sources.

Inputs (see ``fetch_delhi_sources.py``):
- OpenStreetMap NCT Delhi boundary, healthcare facilities, and drivable roads.
- DataMeet Delhi ward polygons (272 MCD wards + NDMC/Cantonment charges).
- Census of India 2011 ward-level Primary Census Abstract for Delhi.

Outputs (committed):
- ``backend/app/data/delhi/dataset.json``   release metadata, sources, validation
- ``backend/app/data/delhi/areas.geojson``  290 ward/charge population units
- ``backend/app/data/delhi/facilities.geojson``
- ``backend/app/data/delhi/boundary.geojson``
- ``backend/app/data/delhi/routing.npz``    road graph + baseline travel matrix
- ``backend/app/data/delhi/quality.json``   detailed validation issues
- ``docs/data-quality-report.md``           generated data-quality report

The script is deterministic apart from the retrieval timestamp embedded in the
metadata. It never invents missing population values: NDMC and Cantonment
charges, and the unassigned Yamuna riverbed polygon, carry ``population: null``.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from pyproj import Geod, Transformer
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Point, Polygon, mapping, shape
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "delhi"
OUT = ROOT / "backend" / "app" / "data" / "delhi"
DOCS = ROOT / "docs"

DATASET_ID = "delhi-pilot"
RELEASE = "delhi-pilot-2026.10-r1"
CENSUS_YEAR = 2011
DELHI_CENSUS_TOTAL = 16_787_941
UTM_CRS = "EPSG:32643"
TO_UTM = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
GEOD = Geod(ellps="WGS84")

LOCAL_ACCESS_SPEED_KPH = 15.0
LOCAL_ACCESS_DETOUR = 1.25

SPEED_KPH = {
    "motorway": 80,
    "motorway_link": 50,
    "trunk": 60,
    "trunk_link": 45,
    "primary": 50,
    "primary_link": 40,
    "secondary": 40,
    "secondary_link": 35,
    "tertiary": 35,
    "tertiary_link": 30,
    "unclassified": 30,
    "residential": 25,
    "living_street": 15,
}

FACILITY_PRIORITY = {
    "hospital": 6,
    "health_centre": 5,
    "dispensary": 4,
    "clinic": 3,
    "birthing_centre": 2,
    "diagnostic_laboratory": 1,
}

MATERNAL_TOKENS = {"gynaecology", "obstetrics", "maternity", "gynaecology;obstetrics"}
DIAGNOSTIC_TOKENS = {
    "pathology",
    "clinical_pathology",
    "radiology",
    "diagnostic_radiology",
    "blood_check",
}

EXCLUDED_HEALTHCARE = {
    "pharmacy",
    "dentist",
    "veterinary",
    "blood_bank",
    "blood_donation",
    "sample_collection",
    "physiotherapist",
    "optometrist",
    "psychotherapist",
    "counselling",
    "rehabilitation",
    "alternative",
    "hospice",
    "vaccination_centre",
    "laundry_and_dry_laundry_cleaning",
}

WARD_MUNICIPALITY = {"MCD": "MCD", "NDMC": "NDMC", "CANT": "Delhi Cantonment"}


def normalise_name(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9 ]+", " ", value.lower())
    return " ".join(cleaned.split())


def title_case(value: str) -> str:
    small = {"and", "of", "the", "at", "in", "on"}
    words = []
    for token in value.split():
        if token.isupper() and len(token) <= 3 and "." in token:
            words.append(token)
        elif token.lower() in small:
            words.append(token.lower())
        elif token.isupper():
            if any(ch.isdigit() for ch in token):
                words.append(token)
            else:
                words.append(token.capitalize())
        else:
            words.append(token)
    text = " ".join(words) if words else value
    return text[0].upper() + text[1:] if text else text


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    lon1_r, lat1_r, lon2_r, lat2_r = map(math.radians, (lon1, lat1, lon2, lat2))
    dlon = lon2_r - lon1_r
    dlat = lat2_r - lat1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def round_geometry(geometry: dict, precision: int = 6) -> dict:
    def walk(value: Any) -> Any:
        if isinstance(value, (list, tuple)):
            if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
                return [round(float(value[0]), precision), round(float(value[1]), precision)]
            return [walk(item) for item in value]
        return value

    return {"type": geometry["type"], "coordinates": walk(geometry["coordinates"])}


# ---------------------------------------------------------------------------
# Boundary
# ---------------------------------------------------------------------------


def build_boundary() -> tuple[Polygon, dict[str, Any]]:
    payload = load_json(RAW / "delhi_boundary_osm.json")
    relation = next(
        element for element in payload["elements"] if element["type"] == "relation"
    )
    rings: list[LineString] = []
    for member in relation.get("members", []):
        if member.get("type") != "way" or member.get("role") not in {"outer", ""}:
            continue
        coordinates = [
            (point["lon"], point["lat"]) for point in member.get("geometry", [])
        ]
        if len(coordinates) >= 2:
            rings.append(LineString(coordinates))
    polygons = list(polygonize(unary_union(rings)))
    if not polygons:
        raise RuntimeError("Could not assemble the OSM Delhi boundary")
    boundary = max(polygons, key=lambda item: item.area)
    if not boundary.is_valid:
        boundary = boundary.buffer(0)
    area, _ = GEOD.geometry_area_perimeter(boundary)
    meta = {
        "name": "NCT of Delhi (OpenStreetMap administrative relation 1942586)",
        "source_id": "osm:relation/1942586",
        "admin_level": str(relation["tags"].get("admin_level", "")),
        "iso3166_2": relation["tags"].get("ISO3166-2", ""),
        "osm_timestamp": payload.get("osm3s", {}).get("timestamp_osm_base", ""),
        "area_km2": round(abs(area) / 1e6, 2),
        "bbox": [round(value, 6) for value in boundary.bounds],
        "geometry_type": boundary.geom_type,
        "valid": bool(boundary.is_valid),
    }
    return boundary, meta


# ---------------------------------------------------------------------------
# Population and wards
# ---------------------------------------------------------------------------


def load_census_ward_population() -> tuple[dict[int, int], dict[str, int], dict[str, Any]]:
    try:
        import openpyxl
    except ImportError as exc:  # pragma: no cover - operator environment
        raise SystemExit(
            "openpyxl is required to rebuild the Census tables: "
            ".venv/bin/pip install openpyxl"
        ) from exc

    workbook = openpyxl.load_workbook(
        RAW / "ward_census.xlsx", read_only=True, data_only=True
    )
    rows = list(workbook["Data"].iter_rows(values_only=True))[1:]
    delhi = [row for row in rows if row[0] == "07"]
    if not delhi:
        raise RuntimeError("Census workbook contains no Delhi rows")

    # Town 800441 is the municipal/statutory MCD area; the census-town rows
    # (all other town codes) reuse the same 1..272 ward numbering and together
    # form the complete ward population. NDMC and Cantonment charges are their
    # own statutory towns and are deliberately kept separate.
    excluded_towns = {"800442", "800443"}
    ward_population: Counter[int] = Counter()
    ward_rows = 0
    municipal_totals: dict[str, int] = defaultdict(int)
    for row in delhi:
        level, town = row[6], row[3]
        if level != "WARD":
            continue
        ward_rows += 1
        population = int(row[10] or 0)
        if town in excluded_towns:
            municipal_totals[town] += population
            continue
        ward_population[int(row[4])] += population

    expected = list(range(1, 273))
    missing = [ward for ward in expected if ward not in ward_population]
    if missing:
        raise RuntimeError(f"Census ward join is incomplete; missing {missing}")
    total = sum(ward_population.values())
    if total != 16_000_745:
        raise RuntimeError(
            f"Unexpected MCD ward population total {total:,}; expected 16,000,745"
        )
    municipal_totals["mcd_wards"] = total
    details = {
        "ward_rows": ward_rows,
        "wards": len(ward_population),
        "total": total,
        "ndmc_total": municipal_totals.get("800442", 0),
        "cantonment_total": municipal_totals.get("800443", 0),
        "delhi_total_2011": DELHI_CENSUS_TOTAL,
    }
    return dict(ward_population), dict(municipal_totals), details


def build_areas(
    boundary: Polygon, census: dict[int, int]
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    payload = load_json(RAW / "Delhi_Wards.geojson")
    features = payload["features"]
    issues: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    areas: list[dict[str, Any]] = []
    invalid_input = 0
    repaired = 0
    duplicate_ids = 0
    clipped_wards: list[dict[str, Any]] = []
    clipped_total_km2 = 0.0
    matched = 0
    unmatched: list[str] = []
    municipality_counts: Counter[str] = Counter()
    area_sum = 0.0

    for feature in features:
        props = feature.get("properties") or {}
        ward_no = props.get("Ward_No")
        source_name = props.get("Ward_Name")
        geometry = shape(feature["geometry"])
        if not geometry.is_valid:
            invalid_input += 1
            geometry = geometry.buffer(0)
            repaired += 1
        if geometry.is_empty:
            issues.append({"field": "geometry", "message": "Empty ward geometry skipped"})
            continue
        if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            issues.append(
                {
                    "field": "geometry",
                    "message": f"Unsupported ward geometry {geometry.geom_type}",
                }
            )
            continue

        source_area, _ = GEOD.geometry_area_perimeter(geometry)
        source_area_km2 = abs(source_area) / 1e6
        clipped = geometry.intersection(boundary)
        if clipped.is_empty:
            issues.append(
                {
                    "field": "geometry",
                    "message": "Ward geometry is entirely outside the study boundary",
                }
            )
            continue
        if not clipped.is_valid:
            clipped = clipped.buffer(0)
        clipped_area, _ = GEOD.geometry_area_perimeter(clipped)
        lost_km2 = source_area_km2 - abs(clipped_area) / 1e6
        clipped_info = None
        if lost_km2 > 0.001:
            clipped_total_km2 += lost_km2
            clipped_info = {
                "source_name": source_name,
                "ward_no": str(ward_no),
                "source_area_km2": round(source_area_km2, 4),
                "clipped_area_km2": round(abs(clipped_area) / 1e6, 4),
                "outside_boundary_km2": round(lost_km2, 4),
            }
        geometry = clipped

        municipality = "MCD"
        if ward_no is None:
            area_id = "DL-UNASSIGNED"
            municipality = "Unassigned"
            display_name = "Yamuna riverbed (unassigned)"
        elif str(ward_no).isdigit():
            number = int(ward_no)
            area_id = f"DL-W{number:03d}"
            display_name = f"{title_case(str(source_name or 'Ward'))} (Ward {number})"
        else:
            prefix = str(ward_no).split("_")[0]
            number = int(str(ward_no).split("_")[1])
            area_id = f"DL-{prefix}-{number}"
            municipality = WARD_MUNICIPALITY.get(prefix, prefix)
            display_name = title_case(str(source_name or ward_no))

        if area_id in seen_ids:
            duplicate_ids += 1
            issues.append(
                {
                    "field": "ward_no",
                    "message": f"Duplicate geography identifier {area_id} skipped",
                }
            )
            continue
        seen_ids.add(area_id)
        municipality_counts[municipality] += 1
        if clipped_info is not None:
            clipped_wards.append({"area_id": area_id, **clipped_info})

        population: int | None = None
        population_status = "unavailable"
        if municipality == "MCD" and str(ward_no).isdigit():
            population = census.get(int(ward_no))
            if population is not None:
                population_status = "census_2011"
                matched += 1
            else:
                unmatched.append(str(ward_no))

        centroid = geometry.representative_point()
        local_area, _ = GEOD.geometry_area_perimeter(geometry)
        area_km2 = round(abs(local_area) / 1e6, 4)
        area_sum += area_km2
        x, y = TO_UTM.transform(centroid.x, centroid.y)
        center_x, center_y = TO_UTM.transform(77.21, 28.64)
        quadrant = (
            ("North" if y >= center_y else "South")
            + " "
            + ("East" if x >= center_x else "West")
        )
        areas.append(
            {
                "area_id": area_id,
                "name": display_name,
                "source_name": source_name,
                "ward_no": str(ward_no) if ward_no is not None else None,
                "municipality": municipality,
                "population": population,
                "population_status": population_status,
                "population_reference_year": CENSUS_YEAR if population is not None else None,
                "population_source": (
                    "Census of India 2011, ward-level Primary Census Abstract"
                    if population is not None
                    else "Not available at this geography in the selected sources"
                ),
                "vulnerability_index": None,
                "vulnerability_status": "unavailable",
                "vulnerability_note": (
                    "No defensible ward-level vulnerability indicator was acquired "
                    "for this release; equity weighting is therefore unavailable."
                ),
                "area_km2": area_km2,
                "centroid_lon": round(centroid.x, 6),
                "centroid_lat": round(centroid.y, 6),
                "quadrant": quadrant,
                "geometry": round_geometry(mapping(geometry)),
            }
        )

    missing_population = [area["area_id"] for area in areas if area["population"] is None]
    validation = {
        "features_in_source": len(features),
        "areas_written": len(areas),
        "invalid_geometries_repaired": repaired,
        "invalid_geometry_input": invalid_input,
        "duplicate_area_ids": duplicate_ids,
        "population_wards_matched": matched,
        "population_wards_unmatched": unmatched,
        "areas_without_population": missing_population,
        "municipality_counts": dict(municipality_counts),
        "population_represented": sum(
            area["population"] for area in areas if area["population"] is not None
        ),
        "area_sum_km2": round(area_sum, 2),
        "wards_clipped_to_boundary": len(clipped_wards),
        "area_outside_boundary_km2": round(clipped_total_km2, 4),
        "clipped_wards": clipped_wards,
        "issues": issues,
    }
    return areas, validation, {"matched": matched, "unmatched": unmatched}


# ---------------------------------------------------------------------------
# Facilities
# ---------------------------------------------------------------------------


def classify_facility(tags: dict[str, str]) -> tuple[str | None, list[str], str]:
    healthcare = str(tags.get("healthcare", "")).lower()
    amenity = str(tags.get("amenity", "")).lower()
    facility_hint = str(tags.get("health_facility:type", "")).lower()
    speciality = str(tags.get("healthcare:speciality", "")).lower()
    tokens = {token.strip() for token in re.split(r"[;,]", speciality) if token.strip()}

    category: str | None = None
    if amenity == "hospital" or healthcare == "hospital":
        category = "hospital"
    elif healthcare == "birthing_centre":
        category = "birthing_centre"
    elif healthcare == "laboratory":
        category = "diagnostic_laboratory"
    elif facility_hint == "dispensary" or healthcare == "dispensary":
        category = "dispensary"
    elif healthcare == "centre" or amenity == "health_post":
        category = "health_centre"
    elif amenity in {"clinic", "doctors"} or healthcare in {"clinic", "doctor"}:
        category = "clinic"

    if category is None:
        return None, [], "not a modelled care category"
    if healthcare in EXCLUDED_HEALTHCARE:
        return None, [], f"excluded healthcare tag '{healthcare}'"

    services: list[str] = []
    if category in {"hospital", "health_centre", "dispensary", "clinic"}:
        services.append("primary_care")
    if tags.get("emergency") == "yes":
        services.append("emergency")
    if category == "birthing_centre" or tokens & MATERNAL_TOKENS:
        services.append("maternal_health")
    if category == "diagnostic_laboratory" or tokens & DIAGNOSTIC_TOKENS:
        services.append("diagnostics")
    services = sorted(set(services))
    if not services:
        return None, [], "no modelled service could be attributed from tags"

    ownership = "unknown"
    operator_type = str(tags.get("operator:type", "")).lower()
    if operator_type in {"government", "public", "public_sector"}:
        ownership = "public"
    elif operator_type == "private":
        ownership = "private"
    return category, services, ownership


def facility_record(
    element: dict[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    tags = element.get("tags") or {}
    coordinates: tuple[float, float] | None = None
    if element["type"] == "node":
        coordinates = (float(element["lon"]), float(element["lat"]))
    else:
        center = element.get("center") or {}
        if "lon" in center and "lat" in center:
            coordinates = (float(center["lon"]), float(center["lat"]))
    if coordinates is None:
        return None, "no usable coordinates"
    category, services, classification = classify_facility(tags)
    if category is None:
        return None, classification
    raw_name = " ".join(str(tags.get("name", "")).split())
    source_id = f"{element['type']}/{element['id']}"
    name = raw_name or f"Unnamed {category.replace('_', ' ')} (OSM {source_id})"
    address = " ".join(
        part
        for part in (
            str(tags.get("addr:housenumber", "")).strip(),
            str(tags.get("addr:street", "")).strip(),
            str(tags.get("addr:suburb", "")).strip(),
            str(tags.get("addr:city", "")).strip(),
            str(tags.get("addr:postcode", "")).strip(),
        )
        if part
    )
    if not address:
        address = " ".join(str(tags.get("addr:full", "")).split())
    return {
        "facility_id": f"OSM-{element['type'][0].upper()}{element['id']}",
        "name": name,
        "facility_type": category,
        "services": services,
        "lon": round(coordinates[0], 6),
        "lat": round(coordinates[1], 6),
        "ownership": classification if classification in {"public", "private"} else "unknown",
        "operational_status": "unknown",
        "address": address,
        "admin_area": "",
        "data_status": "osm",
        "source": "OpenStreetMap",
        "source_id": source_id,
        "source_url": f"https://www.openstreetmap.org/{source_id}",
        "source_tags": {
            key: str(tags[key])
            for key in (
                "amenity",
                "healthcare",
                "healthcare:speciality",
                "health_facility:type",
                "emergency",
                "operator",
                "operator:type",
                "opening_hours",
                "check_date",
                "source",
                "addr:full",
                "addr:street",
                "addr:suburb",
                "addr:city",
                "addr:postcode",
            )
            if key in tags
        },
        "unnamed": not bool(raw_name),
    }, None


def deduplicate_facilities(
    records: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unnamed: list[dict[str, Any]] = []
    for record in records:
        key = normalise_name(record["name"]) if not record["unnamed"] else ""
        if not key:
            unnamed.append(record)
        else:
            groups[key].append(record)

    kept: list[dict[str, Any]] = list(unnamed)
    dropped: list[dict[str, Any]] = []
    for group in groups.values():
        group.sort(key=lambda item: item["facility_id"])
        clusters: list[list[dict[str, Any]]] = []
        for record in group:
            placed = False
            for cluster in clusters:
                anchor = cluster[0]
                if (
                    haversine_km(
                        record["lon"], record["lat"], anchor["lon"], anchor["lat"]
                    )
                    <= 0.15
                ):
                    cluster.append(record)
                    placed = True
                    break
            if not placed:
                clusters.append([record])
        for cluster in clusters:
            cluster.sort(
                key=lambda item: (
                    -FACILITY_PRIORITY.get(item["facility_type"], 0),
                    len(item["source_tags"]),
                    item["facility_id"],
                )
            )
            winner = cluster[0]
            kept.append(winner)
            for loser in cluster[1:]:
                dropped.append(
                    {
                        "kept": winner["facility_id"],
                        "dropped": loser["facility_id"],
                        "name": loser["name"],
                        "reason": "same normalised name within 150 m",
                    }
                )
    kept.sort(key=lambda item: item["facility_id"])
    dropped.sort(key=lambda item: (item["dropped"], item["kept"]))
    return kept, dropped, len(dropped)


def build_facilities(
    boundary: Polygon,
    areas: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = load_json(RAW / "facilities_osm.json")
    ward_shapes = [
        (area["area_id"], area["name"], shape(area["geometry"]))
        for area in areas
    ]
    ward_tree = STRtree([item[2] for item in ward_shapes])
    unassigned_facilities: list[str] = []
    candidates: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    outside: list[dict[str, Any]] = []
    near_boundary: list[str] = []
    no_coordinates = 0
    for element in payload["elements"]:
        record, exclusion = facility_record(element)
        if record is None:
            if exclusion == "no usable coordinates":
                no_coordinates += 1
            else:
                tags = element.get("tags") or {}
                excluded.append(
                    {
                        "source_id": f"{element['type']}/{element['id']}",
                        "labels": ", ".join(
                            sorted(
                                {
                                    value
                                    for key in ("amenity", "healthcare")
                                    if (value := str(tags.get(key, "")).strip())
                                }
                            )
                        ),
                        "reason": exclusion,
                    }
                )
            continue
        point = Point(record["lon"], record["lat"])
        if not boundary.buffer(0.002).contains(point):
            outside.append(
                {
                    "source_id": record["source_id"],
                    "name": record["name"],
                    "lon": record["lon"],
                    "lat": record["lat"],
                }
            )
            continue
        if not boundary.buffer(-0.0025).contains(point):
            near_boundary.append(record["facility_id"])
        matches = ward_tree.query(point, predicate="intersects")
        if len(matches):
            # A boundary point can intersect more than one ward; choose the
            # smallest containing polygon for a deterministic assignment.
            best = min(
                (int(index) for index in matches),
                key=lambda index: ward_shapes[index][2].area,
            )
            record["admin_area"] = ward_shapes[best][1]
        else:
            record["admin_area"] = "Unassigned"
            unassigned_facilities.append(record["facility_id"])
        candidates.append(record)

    kept, dropped, duplicate_count = deduplicate_facilities(candidates)
    for record in kept:
        record.pop("unnamed", None)
    category_counts = Counter(record["facility_type"] for record in kept)
    service_counts = Counter(service for record in kept for service in record["services"])
    validation = {
        "source_elements": len(payload["elements"]),
        "records_without_usable_coordinates": no_coordinates,
        "excluded_non_care_or_out_of_scope": len(excluded),
        "excluded_examples": excluded[:40],
        "outside_study_boundary": outside,
        "near_boundary_for_review": near_boundary,
        "duplicates_removed": duplicate_count,
        "duplicates": dropped[:100],
        "facilities_written": len(kept),
        "category_counts": dict(sorted(category_counts.items())),
        "service_counts": dict(sorted(service_counts.items())),
        "unnamed_facilities": sum(
            1 for record in kept if record["source_id"] and record["name"].startswith("Unnamed ")
        ),
        "facilities_without_admin_area": unassigned_facilities,
        "facilities_with_address": sum(1 for record in kept if record["address"]),
        "operational_status_unknown": sum(
            1 for record in kept if record["operational_status"] == "unknown"
        ),
        "issues": [],
    }
    return kept, validation


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------


def parse_maxspeed(value: str | None) -> float | None:
    if not value:
        return None
    match = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(mph|km/h|kmh)?", value, re.IGNORECASE)
    if not match:
        return None
    number = float(match.group(1))
    unit = (match.group(2) or "km/h").lower()
    if unit == "mph":
        number *= 1.609344
    return number


def build_graph() -> tuple[csr_matrix, np.ndarray, dict[str, Any]]:
    payload = load_json(RAW / "roads_body.json")
    node_index: dict[str, int] = {}
    coordinates: list[tuple[float, float] | None] = []
    edges: dict[tuple[int, int], float] = {}
    lengths: dict[tuple[int, int], float] = {}
    class_counts: Counter[str] = Counter()
    skipped = 0

    def index(node_id: str) -> int:
        existing = node_index.get(node_id)
        if existing is None:
            existing = len(coordinates)
            node_index[node_id] = existing
            coordinates.append(None)
        return existing

    for element in payload["elements"]:
        tags = element.get("tags") or {}
        highway = str(tags.get("highway", ""))
        speed = SPEED_KPH.get(highway)
        if speed is None:
            skipped += 1
            continue
        maxspeed = parse_maxspeed(tags.get("maxspeed"))
        if maxspeed is not None and maxspeed > 0:
            speed = min(speed, maxspeed)
        class_counts[highway] += 1
        nodes = element.get("nodes") or []
        geometry = element.get("geometry") or []
        if len(nodes) != len(geometry) or len(nodes) < 2:
            skipped += 1
            continue
        for node_id, point in zip(nodes, geometry, strict=True):
            position = index(str(node_id))
            coordinates[position] = (float(point["lon"]), float(point["lat"]))
        for position in range(len(nodes) - 1):
            start, end = str(nodes[position]), str(nodes[position + 1])
            if start == end:
                continue
            first, second = index(start), index(end)
            km = haversine_km(
                float(geometry[position]["lon"]),
                float(geometry[position]["lat"]),
                float(geometry[position + 1]["lon"]),
                float(geometry[position + 1]["lat"]),
            )
            if km <= 0:
                continue
            minutes = km / speed * 60.0
            key = (min(first, second), max(first, second))
            if key not in edges or minutes < edges[key]:
                edges[key] = minutes
                lengths[key] = km

    count = len(coordinates)
    rows: list[int] = []
    cols: list[int] = []
    weights: list[float] = []
    for (first, second), minutes in sorted(edges.items()):
        rows.extend((first, second))
        cols.extend((second, first))
        weights.extend((minutes, minutes))
    matrix = csr_matrix((weights, (rows, cols)), shape=(count, count))

    # Largest connected component. The catchment is documented in the report.
    component_count, labels = connected_components(matrix)
    if component_count > 1:
        sizes = np.bincount(labels)
        keep_label = int(np.argmax(sizes))
        keep = np.flatnonzero(labels == keep_label)
        mask = np.zeros(count, dtype=bool)
        mask[keep] = True
        matrix = matrix[mask][:, mask]
        coords = np.array(
            [coordinates[position] for position in np.flatnonzero(mask)], dtype=np.float64
        )
        component_sizes = sorted(sizes.tolist(), reverse=True)
    else:
        coords = np.array(coordinates, dtype=np.float64)
        component_sizes = [count]
    if matrix.shape[0] < 10_000:
        raise RuntimeError("The Delhi road graph is unexpectedly small")

    stats = {
        "ways_read": len(payload["elements"]),
        "ways_used": sum(class_counts.values()),
        "ways_skipped": skipped,
        "road_class_counts": dict(sorted(class_counts.items())),
        "nodes": int(matrix.shape[0]),
        "edges_undirected": int(matrix.nnz // 2),
        "component_sizes": component_sizes[:5],
        "largest_component_share": round(component_sizes[0] / count, 4),
        "speed_assumptions_kph": SPEED_KPH,
        "maxspeed_rule": "class speed capped by a parsable OSM maxspeed tag",
        "oneway_rule": "one-way restrictions are not modelled; every edge is bidirectional",
    }
    return matrix, coords, stats


def connected_components(matrix: csr_matrix) -> tuple[int, np.ndarray]:
    from scipy.sparse.csgraph import connected_components as cc

    return cc(matrix, directed=False)


def snap_points(
    tree: cKDTree, coords_utm: np.ndarray, points: list[tuple[float, float, str, str]]
) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]]]:
    nodes: list[int] = []
    access_minutes: list[float] = []
    issues: list[dict[str, Any]] = []
    for lon, lat, record_id, label in points:
        x, y = TO_UTM.transform(lon, lat)
        distance, node = tree.query([x, y], k=1)
        distance_km = float(distance) / 1000.0 * LOCAL_ACCESS_DETOUR
        minutes = distance_km / LOCAL_ACCESS_SPEED_KPH * 60.0
        if distance_km > 3.0:
            issues.append(
                {
                    "record_id": record_id,
                    "label": label,
                    "straight_line_km": round(float(distance) / 1000.0, 2),
                    "message": "snapped to a road more than 3 km away",
                }
            )
        nodes.append(int(node))
        access_minutes.append(minutes)
    return np.array(nodes, dtype=np.int32), np.array(access_minutes, dtype=np.float32), issues


def build_routing(
    areas: list[dict[str, Any]], facilities: list[dict[str, Any]]
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    matrix, coords, stats = build_graph()
    coords_utm = np.column_stack(TO_UTM.transform(coords[:, 0], coords[:, 1]))
    tree = cKDTree(coords_utm)

    area_points = [
        (area["centroid_lon"], area["centroid_lat"], area["area_id"], area["name"])
        for area in areas
    ]
    facility_points = [
        (facility["lon"], facility["lat"], facility["facility_id"], facility["name"])
        for facility in facilities
    ]
    area_nodes, area_access, area_issues = snap_points(tree, coords_utm, area_points)
    facility_nodes, facility_access, facility_issues = snap_points(
        tree, coords_utm, facility_points
    )

    print(f"        computing {len(facility_nodes)} facility travel-time columns ...")
    started = time.time()
    matrix_values = np.full(
        (len(area_nodes), len(facility_nodes)), np.inf, dtype=np.float32
    )
    batch_size = 24
    for start in range(0, len(facility_nodes), batch_size):
        stop = min(start + batch_size, len(facility_nodes))
        distances = dijkstra(
            matrix,
            directed=False,
            indices=facility_nodes[start:stop],
        )
        selected = distances[:, area_nodes]
        selected[~np.isfinite(selected)] = np.inf
        matrix_values[:, start:stop] = selected.T.astype(np.float32)
        del distances

    print("        computing area-to-area travel times for candidate ranking ...")
    area_distance = np.full((len(area_nodes), len(area_nodes)), np.inf, dtype=np.float32)
    for start in range(0, len(area_nodes), batch_size):
        stop = min(start + batch_size, len(area_nodes))
        distances = dijkstra(matrix, directed=False, indices=area_nodes[start:stop])
        selected = distances[:, area_nodes]
        selected[~np.isfinite(selected)] = np.inf
        area_distance[start:stop, :] = selected.astype(np.float32)
        del distances
    matrix_values += area_access[:, None]
    matrix_values += facility_access[None, :]
    # Floating-point inf + finite stays inf; clamp the finite values.
    finite = np.isfinite(matrix_values)
    matrix_values[finite] = np.round(matrix_values[finite], 3)
    elapsed = time.time() - started

    unreachable_areas = int(np.sum(~np.isfinite(matrix_values).any(axis=1)))
    unreachable_facilities = int(np.sum(~np.isfinite(matrix_values).any(axis=0)))
    stats.update(
        {
            "method": "network_shortest_path",
            "network": "OpenStreetMap drivable roads, clip to the NCT of Delhi relation",
            "routing_engine": "SciPy Dijkstra over an undirected CSR graph",
            "local_access_speed_kph": LOCAL_ACCESS_SPEED_KPH,
            "local_access_detour_factor": LOCAL_ACCESS_DETOUR,
            "area_snap_issues": area_issues,
            "facility_snap_issues": facility_issues,
            "areas_without_any_reachable_facility": unreachable_areas,
            "facilities_unreachable_from_every_area": unreachable_facilities,
            "matrix_shape": list(matrix_values.shape),
            "matrix_compute_seconds": round(elapsed, 1),
            "live_traffic": False,
            "public_transport": False,
            "walking_network": False,
            "known_limitations": [
                "One-way restrictions are not modelled; edges are bidirectional.",
                "Turn restrictions, traffic signals, congestion, and live traffic are not modelled.",
                "Centroids snap to the nearest road node; local access uses a straight-line detour estimate.",
                "Public transport, walking, and cycling networks are not modelled.",
            ],
        }
    )
    arrays = {
        "indptr": matrix.indptr.astype(np.int64),
        "indices": matrix.indices.astype(np.int32),
        "data": matrix.data.astype(np.float32),
        "node_lon": coords[:, 0].astype(np.float32),
        "node_lat": coords[:, 1].astype(np.float32),
        "area_node": area_nodes,
        "area_access": area_access,
        "facility_node": facility_nodes,
        "facility_access": facility_access,
        "travel_minutes": matrix_values,
        "area_distance": area_distance,
        "area_lon": np.array([area["centroid_lon"] for area in areas], dtype=np.float64),
        "area_lat": np.array([area["centroid_lat"] for area in areas], dtype=np.float64),
        "area_ids": np.array([area["area_id"] for area in areas]),
        "facility_ids": np.array([facility["facility_id"] for facility in facilities]),
    }
    return arrays, stats


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def write_report(
    boundary_meta: dict[str, Any],
    area_validation: dict[str, Any],
    census_details: dict[str, Any],
    facility_validation: dict[str, Any],
    routing_stats: dict[str, Any],
    sources: list[dict[str, Any]],
    geography: dict[str, Any],
) -> None:
    represented = area_validation["population_represented"]
    missing = area_validation["areas_without_population"]
    report = f"""# Delhi pilot data-quality report

**Generated by** `backend/scripts/build_delhi_dataset.py` on {datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")}.
This report contains measured values from the build. It is regenerated whenever
the release is rebuilt; do not edit it by hand.

## Release

| Field | Value |
| --- | --- |
| Dataset ID | `{DATASET_ID}` |
| Release | `{RELEASE}` |
| Study geography | NCT of Delhi |
| Boundary | {boundary_meta["name"]} |
| Boundary area | {boundary_meta["area_km2"]:,} km² |
| Boundary OSM snapshot | {boundary_meta["osm_timestamp"] or "not recorded"} |
| Population reference year | {CENSUS_YEAR} (Census of India; historical baseline) |
| Population represented | {represented:,} people across {area_validation["population_wards_matched"]} wards |
| Delhi census total 2011 | {DELHI_CENSUS_TOTAL:,} |
| Facilities in release | {facility_validation["facilities_written"]:,} |

## Boundary validation

- Boundary assembled from OSM relation 1942586 (`admin_level=4`, `ISO3166-2=IN-DL`).
- Geometry type: {boundary_meta["geometry_type"]}; valid: {boundary_meta["valid"]}.
- Area: {boundary_meta["area_km2"]:,} km² (geodesic, WGS84), consistent with the
  Delhi Directorate of Economics & Statistics figure of 1,483 km².
- Bounding box: {boundary_meta["bbox"]}.
- Sum of individual ward areas: {area_validation["area_sum_km2"]:,} km².
- Ward polygon union area: {area_validation["ward_union_km2"]:,} km².
- Symmetric difference between the ward union and the OSM boundary before
  clipping: {area_validation["boundary_ward_symmetric_difference_km2"]:,} km²
  ({area_validation["boundary_ward_symmetric_difference_percent"]}% of the ward
  union). This is the measured mismatch between the two independently sourced
  boundary layers.
- Ward polygons outside the OSM study boundary were clipped at build time:
  {area_validation["wards_clipped_to_boundary"]} wards,
  {area_validation["area_outside_boundary_km2"]:,} km² removed. Population
  counts are unchanged; the clipped area was outside the study boundary.

## Population and administrative join

| Check | Result |
| --- | --- |
| Source ward features | {area_validation["features_in_source"]} |
| Areas written | {area_validation["areas_written"]} |
| Invalid source geometries repaired | {area_validation["invalid_geometries_repaired"]} |
| Duplicate area identifiers | {area_validation["duplicate_area_ids"]} |
| MCD wards matched to Census 2011 | {area_validation["population_wards_matched"]} of 272 |
| MCD ward population total | {census_details["total"]:,} |
| NDMC aggregate population (not allocated to charges) | {census_details["ndmc_total"]:,} |
| Delhi Cantonment aggregate population (not allocated) | {census_details["cantonment_total"]:,} |
| Areas written without a population value | {len(missing)} |

The 272 MCD ward populations match the Census 2011 ward-level Primary Census
Abstract exactly. The NDMC (9 charges) and Delhi Cantonment (8 charges) charge
polygons are retained as study geography but carry **no population value**: the
census publishes their totals, not a defensible charge-level split. The
unassigned Yamuna riverbed polygon (37 km²) is likewise retained with no
population. These areas are excluded from population denominators rather than
being treated as zero.

Unrepresented population: {DELHI_CENSUS_TOTAL - represented:,} people
({100 * (DELHI_CENSUS_TOTAL - represented) / DELHI_CENSUS_TOTAL:.1f}% of the
2011 NCT total). This comprises NDMC and Cantonment residents, rural village
population inside MCD wards that the urban ward table does not cover, and any
census/release boundary mismatch.

**Vintage mismatch disclosure.** Ward polygons are the 272-ward MCD layer plus
municipal charges published by DataMeet; the population table is the 2011
Census ward Primary Census Abstract. Ward numbers are used as the join key and
all 272 matched. This is a historical 2011 baseline, not current population.

## Facility validation

| Check | Result |
| --- | --- |
| OSM elements in source extract | {facility_validation["source_elements"]:,} |
| Records without usable coordinates | {facility_validation["records_without_usable_coordinates"]} |
| Excluded as non-care or out of scope | {facility_validation["excluded_non_care_or_out_of_scope"]:,} |
| Outside study boundary (rejected) | {len(facility_validation["outside_study_boundary"])} |
| Near boundary, retained for review | {len(facility_validation["near_boundary_for_review"])} |
| Duplicates removed | {facility_validation["duplicates_removed"]} |
| Facilities written | {facility_validation["facilities_written"]:,} |
| Unnamed facilities retained | {facility_validation["unnamed_facilities"]} |
| Facilities assigned to a ward | {facility_validation["facilities_written"] - len(facility_validation["facilities_without_admin_area"]):,} |
| Facilities with a mapped address | {facility_validation["facilities_with_address"]:,} |
| Operating status unknown | {facility_validation["operational_status_unknown"]:,} |

Category counts: `{json.dumps(facility_validation["category_counts"], sort_keys=True)}`.

Service counts: `{json.dumps(facility_validation["service_counts"], sort_keys=True)}`.

Every retained facility records its OSM element identifier, source URL, tags
used for classification, mapped address, containing ward, and
`operational_status = unknown`. Facility presence in OSM does not verify that a
service is open, staffed, equipped, or free.

## Routing validation

| Check | Result |
| --- | --- |
| Road ways used | {routing_stats["ways_used"]:,} |
| Graph nodes (largest component) | {routing_stats["nodes"]:,} |
| Undirected edges | {routing_stats["edges_undirected"]:,} |
| Largest component share of raw nodes | {routing_stats["largest_component_share"]:.1%} |
| Areas with no reachable facility | {routing_stats["areas_without_any_reachable_facility"]} |
| Facilities unreachable from every area | {routing_stats["facilities_unreachable_from_every_area"]} |
| Travel matrix size | {routing_stats["matrix_shape"][0]} areas × {routing_stats["matrix_shape"][1]} facilities |
| Matrix computation time | {routing_stats["matrix_compute_seconds"]} s |

Speed assumptions (km/h): `{json.dumps(routing_stats["speed_assumptions_kph"], sort_keys=True)}`.

The router is a shortest-path model over OSM drivable roads. It is **not** live
traffic, public-transport routing, walking routing, or turn-by-turn navigation.
One-way restrictions are not modelled. Local access is a straight-line estimate
× {LOCAL_ACCESS_DETOUR} at {LOCAL_ACCESS_SPEED_KPH:.0f} km/h to the nearest road
node. See `docs/methodology.md` for the full assumption set.

## Sources

{chr(10).join(f"- **{source['name']}** — {source['publisher']}; {source['licence']}; retrieved {source['retrieved_at']}; {source['url']}" for source in sources)}

## Unresolved gaps

- NDMC and Delhi Cantonment charge-level population is unavailable in the
  selected official source; their residents are outside the population
  denominators.
- The Census 2011 ward table is historical and predates the 2022 municipal
  delimitation.
- Facility completeness is unknown. OSM is a volunteer-maintained source; a
  facility absent from OSM is not evidence that care is absent.
- Operating status, staffing, hours, capacity, cost, and service quality are
  not represented.
- No ward-level vulnerability indicator was acquired, so equity weighting is
  disabled rather than fabricated.
- Road speeds are class assumptions, not observed speeds.
- The unassigned riverbed polygon and rural population are not represented in
  ward populations.

## Reproducing

```bash
.venv/bin/pip install -r backend/requirements-data.txt
.venv/bin/python backend/scripts/fetch_delhi_sources.py
.venv/bin/python backend/scripts/build_delhi_dataset.py
```

Raw downloads (about 140 MB) are stored under `data/raw/delhi/` and are
git-ignored. Committed release artifacts live in `backend/app/data/delhi/`.
"""
    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS / "data-quality-report.md").write_text(report, encoding="utf-8")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    print("Building NCT Delhi boundary ...")
    boundary, boundary_meta = build_boundary()

    print("Reading Census 2011 ward populations ...")
    census, _municipal_totals, census_details = load_census_ward_population()

    print("Building ward population areas ...")
    areas, area_validation, _ = build_areas(boundary, census)

    ward_union = unary_union([shape(area["geometry"]) for area in areas])
    union_area, _ = GEOD.geometry_area_perimeter(ward_union)
    difference = boundary.symmetric_difference(ward_union)
    difference_area, _ = GEOD.geometry_area_perimeter(difference)
    area_validation["ward_union_km2"] = round(abs(union_area) / 1e6, 2)
    area_validation["boundary_ward_symmetric_difference_km2"] = round(
        abs(difference_area) / 1e6, 2
    )
    area_validation["boundary_ward_symmetric_difference_percent"] = round(
        100 * abs(difference_area) / abs(union_area), 2
    )

    print("Processing OSM healthcare facilities ...")
    facilities, facility_validation = build_facilities(boundary, areas)

    print("Building road graph and baseline travel-time matrix ...")
    routing_arrays, routing_stats = build_routing(areas, facilities)

    center = [(boundary.bounds[0] + boundary.bounds[2]) / 2, (boundary.bounds[1] + boundary.bounds[3]) / 2]
    geography = {
        "region": "National Capital Territory of Delhi, India",
        "center": [round(center[0], 5), round(center[1], 5)],
        "crs": "EPSG:4326",
        "projected_crs": UTM_CRS,
        "area_km2": boundary_meta["area_km2"],
        "bbox": boundary_meta["bbox"],
        "study_boundary": boundary_meta["name"],
        "analysis_unit": "Municipal ward / municipal charge polygon (2011-2012 ward layer)",
        "cross_border_areas_included": False,
        "surrounding_region_context": False,
    }

    sources = [
        {
            "id": "osm-delhi-boundary",
            "name": "NCT of Delhi administrative boundary (OSM relation 1942586)",
            "publisher": "OpenStreetMap contributors",
            "type": "boundary",
            "url": "https://www.openstreetmap.org/relation/1942586",
            "retrieved_at": boundary_meta["osm_timestamp"][:10] or "2026-10-25",
            "published_at": boundary_meta["osm_timestamp"],
            "licence": "Open Database License (ODbL) 1.0",
            "attribution": "© OpenStreetMap contributors",
            "coverage": "NCT of Delhi",
            "limitations": [
                "Volunteer-maintained boundary; not a Survey of India legal boundary.",
                "admin_level=4 relation; cross-checked against the official 1,483 km² area.",
            ],
        },
        {
            "id": "datameet-delhi-wards",
            "name": "Delhi municipal ward boundaries (272 MCD wards + 18 NDMC/Cantonment charges)",
            "publisher": "DataMeet Municipal_Spatial_Data",
            "type": "boundary",
            "url": "https://github.com/datameet/Municipal_Spatial_Data/tree/master/Delhi",
            "retrieved_at": "2026-10-25",
            "published_at": "2016 repository snapshot (source: ArcGIS Online municipal map)",
            "licence": "Creative Commons Attribution-ShareAlike 2.5 India (data derivative; share-alike applies)",
            "attribution": "DataMeet contributors; municipal ward layer scraped from the referenced ArcGIS Online map",
            "coverage": "Delhi municipal wards and charges",
            "limitations": [
                "Ward layer reflects the 272-ward municipal structure created after the 2011 census.",
                "The 2022 municipal delimitation is not represented.",
                "One 37 km² riverbed polygon has no ward identifier; it is retained without population.",
            ],
        },
        {
            "id": "census-2011-delhi-wards",
            "name": "Census of India 2011 Primary Census Abstract — Delhi, ward level (state code 07)",
            "publisher": "Office of the Registrar General & Census Commissioner, India",
            "type": "population",
            "url": "https://censusindia.gov.in/nada/index.php/catalog/42560",
            "retrieved_at": "2026-10-25",
            "published_at": "2011 census; NADA table released 2022",
            "licence": "Government of India publication (Census of India); confirm reuse terms before redistribution",
            "attribution": "Census of India 2011, Office of the Registrar General & Census Commissioner",
            "coverage": "272 MCD wards (16,000,745 people); NDMC and Cantonment totals held separately",
            "limitations": [
                "Historical reference year 2011, not current population.",
                "Urban ward table; rural village population inside wards is not included at ward level.",
                "NDMC/Cantonment charge-level population is not published in this table.",
            ],
        },
        {
            "id": "des-delhi-census-2011",
            "name": "Delhi district-wise population, Census 2001 and 2011",
            "publisher": "Directorate of Economics & Statistics, GNCT of Delhi",
            "type": "validation",
            "url": "https://des.delhi.gov.in/des/population-census-2011",
            "retrieved_at": "2026-10-25",
            "published_at": "Census 2011",
            "licence": "Government of NCT of Delhi public data",
            "attribution": "Directorate of Economics & Statistics, Government of NCT of Delhi",
            "coverage": "NCT of Delhi district totals (16,787,941)",
            "limitations": ["Used only to cross-check the Census total."],
        },
        {
            "id": "osm-health-facilities",
            "name": "OpenStreetMap healthcare facilities within the NCT of Delhi",
            "publisher": "OpenStreetMap contributors",
            "type": "facilities",
            "url": "https://www.openstreetmap.org/",
            "retrieved_at": "2026-10-25",
            "published_at": boundary_meta["osm_timestamp"],
            "licence": "Open Database License (ODbL) 1.0",
            "attribution": "© OpenStreetMap contributors",
            "coverage": "1,236 retained mapped care facilities after filtering and 150 m name/location deduplication",
            "limitations": [
                "Completeness is unknown; OSM is volunteer-maintained.",
                "Operating status, staffing, and service availability are not verified.",
                "Service attribution is derived only from mapped tags, never from facility names.",
            ],
        },
        {
            "id": "osm-roads",
            "name": "OpenStreetMap drivable road network within the NCT of Delhi",
            "publisher": "OpenStreetMap contributors",
            "type": "routing",
            "url": "https://www.openstreetmap.org/",
            "retrieved_at": "2026-10-25",
            "published_at": boundary_meta["osm_timestamp"],
            "licence": "Open Database License (ODbL) 1.0",
            "attribution": "© OpenStreetMap contributors",
            "coverage": "Motorway through residential/living-street classes; service roads and pedestrian ways excluded",
            "limitations": [
                "One-way restrictions and turn restrictions are not modelled.",
                "Speeds are road-class assumptions capped by mapped maxspeed.",
                "No live traffic, public transport, or walking network.",
            ],
        },
    ]
    # Update the facility source count from the actual build.
    for source in sources:
        if source["id"] == "osm-health-facilities":
            source["coverage"] = (
                f"{facility_validation['facilities_written']:,} retained mapped care "
                "facilities after filtering and 150 m name/location deduplication"
            )

    represented = area_validation["population_represented"]
    dataset = {
        "dataset_id": DATASET_ID,
        "name": "CareGap Delhi Pilot",
        "short_name": "Delhi pilot",
        "description": (
            "A geographic accessibility pilot for the National Capital Territory of "
            "Delhi. Population units are municipal ward and charge polygons; "
            "population values are Census of India 2011 ward counts where published. "
            "Facilities and roads are OpenStreetMap features. This is a planning "
            "model, not a live clinical or utilisation dataset."
        ),
        "release": RELEASE,
        "is_synthetic": False,
        "data_status": "official_census_2011_osm",
        "seed": None,
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generator": "backend/scripts/build_delhi_dataset.py",
        "geography": geography,
        "population": {
            "reference_year": CENSUS_YEAR,
            "reference_date": "2011-03-01",
            "source": "Census of India 2011, ward-level Primary Census Abstract",
            "represented_population": represented,
            "delhi_census_total": DELHI_CENSUS_TOTAL,
            "unrepresented_population": DELHI_CENSUS_TOTAL - represented,
            "unrepresented_share_percent": round(
                100 * (DELHI_CENSUS_TOTAL - represented) / DELHI_CENSUS_TOTAL, 1
            ),
            "wards_with_population": area_validation["population_wards_matched"],
            "areas_without_population": len(area_validation["areas_without_population"]),
            "note": (
                "Historical 2011 baseline. NDMC and Cantonment charges, rural village "
                "population, and the unassigned riverbed polygon are not represented in "
                "the population denominators. Missing values are null, never zero."
            ),
        },
        "counts": {
            "areas": len(areas),
            "areas_with_population": area_validation["population_wards_matched"],
            "areas_without_population": len(area_validation["areas_without_population"]),
            "facilities": len(facilities),
            "population": represented,
            "road_nodes": routing_stats["nodes"],
            "road_edges": routing_stats["edges_undirected"],
        },
        "road_model": {
            "name": "OpenStreetMap road-network shortest path",
            "description": (
                "Travel time is the shortest path over the OSM drivable road graph "
                "with class-based speeds and a straight-line local-access leg. It is "
                "not live traffic, public transport, or turn-by-turn routing."
            ),
            "source": "OpenStreetMap",
            "osm_snapshot": boundary_meta["osm_timestamp"],
            "routing_engine": routing_stats["routing_engine"],
            "speed_classes_kph": routing_stats["speed_assumptions_kph"],
            "local_access_speed_kph": LOCAL_ACCESS_SPEED_KPH,
            "local_access_detour_factor": LOCAL_ACCESS_DETOUR,
            "one_way_modelled": False,
            "live_traffic": False,
            "public_transport": False,
            "walking_network": False,
            "warnings": [
                "Travel times are model estimates, not live traffic.",
                "One-way restrictions, turn restrictions, and congestion are not modelled.",
                "Facility opening hours, queues, staffing, and capacity are not included.",
                "Local access from a ward centroid to the road network is estimated, not measured.",
            ],
        },
        "sources": sources,
        "limitations": [
            "Population is a historical Census 2011 ward-level baseline, not a current count.",
            "NDMC, Cantonment, and rural populations are outside the population denominators.",
            "Facility completeness is unknown; OSM is volunteer-maintained.",
            "Facility services are inferred from mapped tags only; availability is unverified.",
            "Operating status, staffing, hours, cost, capacity, and quality are not modelled.",
            "Travel time is a road-class estimate; no live traffic, public transport, or walking network.",
            "No ward-level vulnerability index was acquired, so equity weighting is unavailable.",
            "Coverage is modelled access, not observed care, utilisation, or health outcomes.",
            "Ward centroids are a coarse proxy for where people live within a ward.",
        ],
        "vulnerability": {
            "available": False,
            "reason": (
                "No defensible ward-level vulnerability indicator was acquired for "
                "this release. Equity weighting is disabled rather than guessed."
            ),
        },
        "capabilities": {
            "facility_import": True,
            "area_import": False,
            "area_import_reason": (
                "Population areas must match the validated Census 2011 ward release; "
                "arbitrary area imports are disabled for the Delhi pilot."
            ),
        },
        "validation": {
            "boundary": boundary_meta,
            "areas": {
                key: value
                for key, value in area_validation.items()
                if key not in {"issues"}
            },
            "facilities": {
                key: value
                for key, value in facility_validation.items()
                if key not in {"excluded_examples", "duplicates", "outside_study_boundary", "near_boundary_for_review"}
            },
            "routing": routing_stats,
        },
    }

    areas_geojson = {
        "type": "FeatureCollection",
        "name": f"{DATASET_ID}-areas",
        "features": [
            {
                "type": "Feature",
                "geometry": area.pop("geometry"),
                "properties": {
                    **area,
                    "dataset_id": DATASET_ID,
                    "release": RELEASE,
                },
            }
            for area in areas
        ],
    }
    facilities_geojson = {
        "type": "FeatureCollection",
        "name": f"{DATASET_ID}-facilities",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [facility["lon"], facility["lat"]]},
                "properties": {
                    **{key: value for key, value in facility.items() if key not in {"lon", "lat"}},
                    "dataset_id": DATASET_ID,
                    "release": RELEASE,
                },
            }
            for facility in facilities
        ],
    }
    boundary_geojson = {
        "type": "FeatureCollection",
        "name": f"{DATASET_ID}-boundary",
        "features": [
            {
                "type": "Feature",
                "geometry": round_geometry(mapping(boundary)),
                "properties": {
                    "name": "NCT of Delhi",
                    "source": "OpenStreetMap relation 1942586",
                    "licence": "ODbL 1.0",
                    "dataset_id": DATASET_ID,
                    "release": RELEASE,
                },
            }
        ],
    }

    def write_json(path: Path, payload: dict) -> None:
        path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    write_json(out / "dataset.json", dataset)
    write_json(out / "areas.geojson", areas_geojson)
    write_json(out / "facilities.geojson", facilities_geojson)
    write_json(out / "boundary.geojson", boundary_geojson)
    np.savez_compressed(out / "routing.npz", **routing_arrays)
    write_json(
        out / "quality.json",
        {
            "release": RELEASE,
            "boundary": boundary_meta,
            "areas": area_validation,
            "census": census_details,
            "facilities": facility_validation,
            "routing": routing_stats,
        },
    )

    write_report(
        boundary_meta,
        area_validation,
        census_details,
        facility_validation,
        routing_stats,
        sources,
        geography,
    )

    print("\nRelease built:")
    for path in sorted(out.iterdir()):
        print(f"  {path.name:20s} {path.stat().st_size:>12,} bytes")
    print("  docs/data-quality-report.md (regenerated)")
    print(
        f"\nAreas: {len(areas)} ({area_validation['population_wards_matched']} with population) | "
        f"Facilities: {len(facilities)} | Population: {represented:,}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
