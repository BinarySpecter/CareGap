"""Validated facility and area imports.

Imports are intentionally conservative: every row is validated, possible
duplicates are reported, and no imported feature silently replaces existing
data. Areas are accepted as GeoJSON polygons; facilities are accepted as CSV or
GeoJSON points. File-size limits are enforced by the API layer.
"""

from __future__ import annotations

import csv
import io
import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from pyproj import Geod
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from app.core.catalog import FACILITY_TYPE_LABELS, FACILITY_TYPE_SERVICES, SERVICE_IDS
from app.services.geo import haversine_km, valid_coordinate

MAX_ROWS = 5_000
MAX_ERRORS = 100
FACILITY_DUPLICATE_KM = 0.05
AREA_DUPLICATE_KM = 0.2


class ImportFormatError(ValueError):
    """The uploaded file cannot be parsed as the requested import kind."""


@dataclass
class ImportIssue:
    row: int | None
    field: str | None
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {"row": self.row, "field": self.field, "message": self.message}


@dataclass
class ParsedImport:
    kind: str
    rows_total: int
    facilities: list[dict[str, Any]] = field(default_factory=list)
    areas: list[dict[str, Any]] = field(default_factory=list)
    issues: list[ImportIssue] = field(default_factory=list)
    duplicates: int = 0

    @property
    def valid_count(self) -> int:
        return len(self.facilities) + len(self.areas)

    def to_report(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "rows_total": self.rows_total,
            "rows_imported": self.valid_count,
            "duplicates_skipped": self.duplicates,
            "errors": [issue.to_dict() for issue in self.issues[:MAX_ERRORS]],
            "errors_truncated": len(self.issues) > MAX_ERRORS,
        }


@dataclass
class ExistingContext:
    facility_names: list[tuple[str, float, float]] = field(default_factory=list)
    areas: list[dict[str, Any]] = field(default_factory=list)
    district_union: BaseGeometry | None = None

    @classmethod
    def from_rows(
        cls, facilities: list[Any], areas: list[Any]
    ) -> ExistingContext:
        context = cls()
        for facility in facilities:
            context.facility_names.append(
                (_normalise_name(facility.name), facility.lon, facility.lat)
            )
        geometries = []
        for area in areas:
            context.areas.append(
                {
                    "name": _normalise_name(area.name),
                    "centroid_lon": area.centroid_lon,
                    "centroid_lat": area.centroid_lat,
                }
            )
            try:
                geometries.append(shape(area.geometry))
            except (TypeError, ValueError, AttributeError):
                continue
        if geometries:
            context.district_union = unary_union(geometries)
        return context


def parse_import(
    filename: str,
    content: bytes,
    kind: str,
    existing: ExistingContext,
) -> ParsedImport:
    if kind not in {"facilities", "areas"}:
        raise ImportFormatError("kind must be 'facilities' or 'areas'")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportFormatError("File must be UTF-8 encoded text") from exc
    if not text.strip():
        raise ImportFormatError("Uploaded file is empty")
    lower = filename.lower()
    if lower.endswith(".csv"):
        if kind != "facilities":
            raise ImportFormatError("Area imports must be uploaded as GeoJSON")
        return parse_facility_csv(text, existing)
    if lower.endswith(".geojson") or lower.endswith(".json"):
        return parse_geojson(text, kind, existing)
    raise ImportFormatError("Unsupported file type. Upload .csv or .geojson/.json")


def parse_facility_csv(text: str, existing: ExistingContext) -> ParsedImport:
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ImportFormatError("CSV file has no header row")
    required = {"name", "facility_type", "lon", "lat"}
    aliases = {"longitude": "lon", "latitude": "lat", "type": "facility_type"}
    field_map = {
        original: aliases.get(_normalise_header(original), _normalise_header(original))
        for original in reader.fieldnames
    }
    missing = required - set(field_map.values())
    if missing:
        raise ImportFormatError(
            "CSV is missing required column(s): " + ", ".join(sorted(missing))
        )

    result = ParsedImport(kind="facilities", rows_total=0)
    for row_number, raw in enumerate(reader, start=2):
        if result.rows_total >= MAX_ROWS:
            result.issues.append(
                ImportIssue(None, None, f"Import limited to {MAX_ROWS} rows")
            )
            break
        if not any((value or "").strip() for value in raw.values() if isinstance(value, str)):
            continue
        result.rows_total += 1
        normalised_row: dict[str, str] = {}
        for key, value in raw.items():
            if key is None:
                continue
            normalised_row[field_map.get(key, _normalise_header(key))] = (
                value or ""
            ).strip()
        facility, issues = _validate_facility_row(
            normalised_row,
            row_number=row_number,
            existing=existing,
            already_seen=[
                (
                    item["name"],
                    item["lon"],
                    item["lat"],
                )
                for item in result.facilities
            ],
        )
        result.issues.extend(issues)
        if facility is not None:
            result.facilities.append(facility)
        if any("duplicate" in issue.message.lower() for issue in issues):
            result.duplicates += 1
    return result


def parse_geojson(
    text: str, kind: str, existing: ExistingContext
) -> ParsedImport:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ImportFormatError("Invalid JSON") from exc
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ImportFormatError("GeoJSON must be a FeatureCollection")
    features = payload.get("features")
    if not isinstance(features, list):
        raise ImportFormatError("GeoJSON FeatureCollection has no features array")
    if len(features) > MAX_ROWS:
        raise ImportFormatError(f"Import limited to {MAX_ROWS} features")

    result = ParsedImport(kind=kind, rows_total=len(features))
    seen: list[tuple[str, float, float]] = []
    for index, feature in enumerate(features, start=1):
        if not isinstance(feature, dict):
            result.issues.append(ImportIssue(index, None, "Feature must be an object"))
            continue
        geometry = feature.get("geometry")
        properties = feature.get("properties") or {}
        if not isinstance(geometry, dict) or not isinstance(properties, dict):
            result.issues.append(
                ImportIssue(index, None, "Feature requires geometry and properties objects")
            )
            continue

        if kind == "facilities":
            facility, issues = _validate_facility_geojson(
                geometry, properties, index, existing, seen
            )
            result.issues.extend(issues)
            if facility is not None:
                seen.append((facility["name"], facility["lon"], facility["lat"]))
                result.facilities.append(facility)
                if any("duplicate" in issue.message.lower() for issue in issues):
                    result.duplicates += 1
        else:
            area, issues = _validate_area_geojson(
                geometry, properties, index, existing, seen
            )
            result.issues.extend(issues)
            if area is not None:
                seen.append(
                    (area["name"], area["centroid_lon"], area["centroid_lat"])
                )
                result.areas.append(area)
                if any("duplicate" in issue.message.lower() for issue in issues):
                    result.duplicates += 1
    return result


def _validate_facility_row(
    row: dict[str, str],
    row_number: int,
    existing: ExistingContext,
    already_seen: list[tuple[str, float, float]],
) -> tuple[dict[str, Any] | None, list[ImportIssue]]:
    issues: list[ImportIssue] = []
    name = " ".join(row.get("name", "").split())
    facility_type = row.get("facility_type", "").strip()
    if not name:
        issues.append(ImportIssue(row_number, "name", "Facility name is required"))
    elif len(name) > 200:
        issues.append(ImportIssue(row_number, "name", "Facility name is too long"))
    if facility_type not in FACILITY_TYPE_LABELS:
        issues.append(
            ImportIssue(
                row_number,
                "facility_type",
                f"Unknown facility_type. Allowed: {', '.join(sorted(FACILITY_TYPE_LABELS))}",
            )
        )

    lon_value = row.get("lon", "").strip()
    lat_value = row.get("lat", "").strip()
    try:
        lon = float(lon_value)
        lat = float(lat_value)
    except ValueError:
        issues.append(
            ImportIssue(row_number, "lon/lat", "lon and lat must be numeric")
        )
        return None, issues
    if not valid_coordinate(lon, lat):
        issues.append(
            ImportIssue(row_number, "lon/lat", "Coordinate is outside valid lon/lat range")
        )
        return None, issues

    services = _parse_services(row.get("services"), issues, row_number, facility_type)
    if issues:
        return None, issues
    _check_facility_duplicate(
        name, lon, lat, existing.facility_names + already_seen, issues, row_number
    )
    if existing.district_union is not None and not existing.district_union.buffer(
        1e-6
    ).contains(Point(lon, lat)):
        issues.append(
            ImportIssue(
                row_number,
                "lon/lat",
                "Facility lies outside the dataset's area boundaries",
            )
        )
    if issues:
        return None, issues

    return {
        "id": f"IMP-{uuid.uuid4().hex[:10].upper()}",
        "name": name,
        "facility_type": facility_type,
        "services": services,
        "lon": lon,
        "lat": lat,
        "data_status": "imported",
        "source": "User import",
        "source_id": "",
        "source_url": "",
        "ownership": "unknown",
        "operational_status": "unknown",
        "source_tags": {},
    }, issues


def _validate_facility_geojson(
    geometry: dict,
    properties: dict,
    row: int,
    existing: ExistingContext,
    already_seen: list[tuple[str, float, float]],
) -> tuple[dict[str, Any] | None, list[ImportIssue]]:
    issues: list[ImportIssue] = []
    if geometry.get("type") != "Point":
        return None, [ImportIssue(row, "geometry", "Facility geometry must be a Point")]
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None, [ImportIssue(row, "geometry", "Point coordinates are invalid")]
    try:
        lon, lat = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None, [ImportIssue(row, "geometry", "Point coordinates are not numeric")]

    name = " ".join(str(properties.get("name", "")).split())
    facility_type = str(properties.get("facility_type", "")).strip()
    if not name:
        issues.append(ImportIssue(row, "name", "Facility name is required"))
    elif len(name) > 200:
        issues.append(ImportIssue(row, "name", "Facility name is too long"))
    if facility_type not in FACILITY_TYPE_LABELS:
        issues.append(
            ImportIssue(
                row,
                "facility_type",
                f"Unknown facility_type. Allowed: {', '.join(sorted(FACILITY_TYPE_LABELS))}",
            )
        )
    if not valid_coordinate(lon, lat):
        issues.append(ImportIssue(row, "geometry", "Coordinate is outside valid lon/lat range"))
        return None, issues

    services_value = properties.get("services")
    services = _parse_services(services_value, issues, row, facility_type)
    _check_facility_duplicate(
        name, lon, lat, existing.facility_names + already_seen, issues, row
    )
    if existing.district_union is not None and not existing.district_union.buffer(
        1e-6
    ).contains(Point(lon, lat)):
        issues.append(
            ImportIssue(
                row,
                "geometry",
                "Facility lies outside the dataset's area boundaries",
            )
        )
    if issues:
        return None, issues
    return {
        "id": f"IMP-{uuid.uuid4().hex[:10].upper()}",
        "name": name,
        "facility_type": facility_type,
        "services": services,
        "lon": lon,
        "lat": lat,
        "data_status": "imported",
        "source": "User import",
        "source_id": "",
        "source_url": "",
        "ownership": "unknown",
        "operational_status": "unknown",
        "source_tags": {},
    }, issues


def _validate_area_geojson(
    geometry: dict,
    properties: dict,
    row: int,
    existing: ExistingContext,
    already_seen: list[tuple[str, float, float]],
) -> tuple[dict[str, Any] | None, list[ImportIssue]]:
    issues: list[ImportIssue] = []
    if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        return None, [
            ImportIssue(row, "geometry", "Area geometry must be a Polygon or MultiPolygon")
        ]
    try:
        geom = shape(geometry)
    except (TypeError, ValueError, AttributeError):
        return None, [ImportIssue(row, "geometry", "Area geometry is invalid")]
    if geom.is_empty or not geom.is_valid or geom.area <= 0:
        return None, [ImportIssue(row, "geometry", "Area geometry is empty or invalid")]

    name = " ".join(str(properties.get("name", "")).split())
    if not name:
        issues.append(ImportIssue(row, "name", "Area name is required"))
    elif len(name) > 160:
        issues.append(ImportIssue(row, "name", "Area name is too long"))
    try:
        population = int(float(properties.get("population")))
    except (TypeError, ValueError):
        issues.append(ImportIssue(row, "population", "Population must be a number"))
        population = 0
    if population <= 0:
        issues.append(ImportIssue(row, "population", "Population must be positive"))
    vulnerability: float | None = None
    raw_vulnerability = properties.get("vulnerability_index")
    if raw_vulnerability not in (None, ""):
        try:
            vulnerability = float(raw_vulnerability)
        except (TypeError, ValueError):
            issues.append(
                ImportIssue(
                    row, "vulnerability_index", "vulnerability_index must be a number"
                )
            )
            vulnerability = None
        if vulnerability is not None and not 0.0 <= vulnerability <= 1.0:
            issues.append(
                ImportIssue(
                    row,
                    "vulnerability_index",
                    "vulnerability_index must be between 0 and 1",
                )
            )

    centroid = geom.centroid
    centroid_lon, centroid_lat = centroid.x, centroid.y
    for other_name, other_lon, other_lat in existing.areas + already_seen:
        if (
            other_name == _normalise_name(name)
            and haversine_km(centroid_lon, centroid_lat, other_lon, other_lat)
            <= AREA_DUPLICATE_KM
        ):
            issues.append(
                ImportIssue(row, "name", "Possible duplicate of an existing area")
            )
            break
    if issues:
        return None, issues

    area_km2 = _area_km2(geometry)
    return {
        "id": f"IMP-{uuid.uuid4().hex[:10].upper()}",
        "name": name,
        "population": population,
        "vulnerability_index": vulnerability,
        "geometry": geometry,
        "centroid_lon": round(centroid_lon, 6),
        "centroid_lat": round(centroid_lat, 6),
        "area_km2": area_km2,
        "quadrant": str(properties.get("quadrant", "Imported"))[:40],
    }, issues


def _area_km2(geometry: dict) -> float:
    geod = Geod(ellps="WGS84")
    area, _ = geod.geometry_area_perimeter(shape(geometry))
    return round(abs(area) / 1_000_000, 4)


def _parse_services(
    value: Any,
    issues: list[ImportIssue],
    row: int,
    facility_type: str,
) -> list[str]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return list(FACILITY_TYPE_SERVICES.get(facility_type, []))
    if isinstance(value, str):
        parts = re.split(r"[,;|]", value)
    elif isinstance(value, list):
        parts = [str(item) for item in value]
    else:
        issues.append(
            ImportIssue(row, "services", "services must be a list or delimited string")
        )
        return []
    services = []
    for raw in parts:
        service = raw.strip()
        if not service:
            continue
        if service not in SERVICE_IDS:
            issues.append(
                ImportIssue(
                    row,
                    "services",
                    f"Unknown service '{service}'. Allowed: {', '.join(SERVICE_IDS)}",
                )
            )
            continue
        services.append(service)
    if not services:
        issues.append(
            ImportIssue(row, "services", "At least one valid service is required")
        )
    return sorted(set(services))


def _check_facility_duplicate(
    name: str,
    lon: float,
    lat: float,
    comparators: list[tuple[str, float, float]],
    issues: list[ImportIssue],
    row: int,
) -> None:
    normalised = _normalise_name(name)
    for other_name, other_lon, other_lat in comparators:
        if (
            other_name == normalised
            and haversine_km(lon, lat, other_lon, other_lat) <= FACILITY_DUPLICATE_KM
        ):
            issues.append(
                ImportIssue(
                    row, "name", "Possible duplicate of an existing facility"
                )
            )
            return


def _normalise_header(header: str) -> str:
    return header.strip().lower().replace(" ", "_")


def _normalise_name(name: str) -> str:
    return " ".join(str(name).strip().lower().split())
