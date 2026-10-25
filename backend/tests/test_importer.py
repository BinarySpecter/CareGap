from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services.importer import ExistingContext, ImportFormatError, parse_import


def demo_context() -> ExistingContext:
    polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [73.60, 18.35],
                [74.10, 18.35],
                [74.10, 18.70],
                [73.60, 18.70],
                [73.60, 18.35],
            ]
        ],
    }
    areas = [
        SimpleNamespace(
            name="Demo area",
            centroid_lon=73.85,
            centroid_lat=18.52,
            geometry=polygon,
        )
    ]
    facilities = [
        SimpleNamespace(name="Existing Clinic", lon=73.84, lat=18.51),
    ]
    return ExistingContext.from_rows(facilities, areas)


def test_valid_csv_facility_import():
    content = (
        b"name,facility_type,longitude,latitude,services\n"
        b"New Rural Clinic,primary_health_centre,73.90,18.50,primary_care;diagnostics\n"
    )
    result = parse_import("facilities.csv", content, "facilities", demo_context())
    assert result.rows_total == 1
    assert result.valid_count == 1
    assert result.duplicates == 0
    assert not result.issues
    facility = result.facilities[0]
    assert facility["name"] == "New Rural Clinic"
    assert facility["services"] == ["diagnostics", "primary_care"]
    assert facility["data_status"] == "imported"
    assert facility["id"].startswith("IMP-")


def test_csv_defaults_services_from_facility_type():
    content = (
        b"Name,Type,Lon,Lat\nNorth Clinic,maternal_health_centre,73.90,18.50\n"
    )
    result = parse_import("facilities.csv", content, "facilities", demo_context())
    assert result.valid_count == 1
    assert result.facilities[0]["services"] == ["maternal_health"]


def test_csv_reports_all_row_errors():
    content = (
        b"name,facility_type,lon,lat,services\n"
        b"Bad Coordinate,primary_health_centre,999,18.5,primary_care\n"
        b"Bad Type,space_clinic,73.9,18.5,primary_care\n"
        b"Bad Service,primary_health_centre,73.9,18.5,teleportation\n"
    )
    result = parse_import("facilities.csv", content, "facilities", demo_context())
    assert result.valid_count == 0
    assert result.rows_total == 3
    fields = {issue.field for issue in result.issues}
    assert "lon/lat" in fields
    assert "facility_type" in fields
    assert "services" in fields


def test_csv_detects_duplicate_name_and_location():
    content = (
        b"name,facility_type,lon,lat,services\n"
        b"existing clinic,primary_health_centre,73.84001,18.51001,primary_care\n"
    )
    result = parse_import("facilities.csv", content, "facilities", demo_context())
    assert result.valid_count == 0
    assert result.duplicates == 1
    assert any("duplicate" in issue.message.lower() for issue in result.issues)


def test_points_outside_dataset_boundary_are_rejected():
    content = (
        b"name,facility_type,lon,lat,services\n"
        b"Outside Clinic,primary_health_centre,75.00,19.50,primary_care\n"
    )
    result = parse_import("facilities.csv", content, "facilities", demo_context())
    assert result.valid_count == 0
    assert any("outside" in issue.message.lower() for issue in result.issues)


def test_missing_required_columns_raise_format_error():
    content = b"name,type\nClinic,primary_health_centre\n"
    with pytest.raises(ImportFormatError):
        parse_import("facilities.csv", content, "facilities", demo_context())


def test_unsupported_file_type_raises():
    with pytest.raises(ImportFormatError):
        parse_import("facilities.xlsx", b"data", "facilities", demo_context())


def test_invalid_json_raises():
    with pytest.raises(ImportFormatError):
        parse_import("facilities.geojson", b"{not json", "facilities", demo_context())


def test_geojson_facility_import():
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [73.90, 18.50]},
                "properties": {
                    "name": "GeoJSON Clinic",
                    "facility_type": "community_health_centre",
                    "services": ["primary_care"],
                },
            }
        ],
    }
    result = parse_import(
        "facilities.geojson",
        json.dumps(payload).encode(),
        "facilities",
        demo_context(),
    )
    assert result.valid_count == 1
    assert result.facilities[0]["name"] == "GeoJSON Clinic"
    assert result.facilities[0]["services"] == ["primary_care"]


def test_geojson_area_import_computes_centroid_and_area():
    ring = [
        [73.80, 18.50],
        [73.82, 18.50],
        [73.82, 18.52],
        [73.80, 18.52],
        [73.80, 18.50],
    ]
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "name": "Imported Ward",
                    "population": 12000,
                    "vulnerability_index": 0.4,
                },
            }
        ],
    }
    result = parse_import(
        "areas.geojson", json.dumps(payload).encode(), "areas", demo_context()
    )
    assert result.valid_count == 1
    area = result.areas[0]
    assert area["name"] == "Imported Ward"
    assert area["population"] == 12000
    assert 73.80 < area["centroid_lon"] < 73.82
    assert area["area_km2"] > 0
    assert area["id"].startswith("IMP-")


def test_geojson_area_rejects_invalid_population_and_geometry():
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [73.9, 18.5]},
                "properties": {"name": "Not an area", "population": 100},
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [73.80, 18.50],
                            [73.82, 18.50],
                            [73.82, 18.52],
                            [73.80, 18.52],
                            [73.80, 18.50],
                        ]
                    ],
                },
                "properties": {"name": "No People", "population": -1},
            },
        ],
    }
    result = parse_import("areas.geojson", json.dumps(payload).encode(), "areas", demo_context())
    assert result.valid_count == 0
    assert len(result.issues) >= 2


def test_area_import_requires_geojson():
    with pytest.raises(ImportFormatError):
        parse_import("areas.csv", b"name,population\nA,1\n", "areas", demo_context())
