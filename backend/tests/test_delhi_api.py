"""API contract tests against the real Delhi pilot release."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.datasets import DatasetUnavailableError
from app.main import create_app


def delhi_settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "env": "test",
        "database_url": f"sqlite:///{tmp_path / 'delhi-test.db'}",
        "cors_origins": "http://localhost:3000",
        "active_dataset": "delhi-pilot",
    }
    values.update(overrides)
    return Settings(**values)


@pytest.fixture()
def delhi_client(tmp_path: Path):
    app = create_app(delhi_settings(tmp_path))
    with TestClient(app) as client:
        yield client


def test_meta_identifies_real_dataset_and_limitations(delhi_client: TestClient):
    response = delhi_client.get("/api/v1/meta")
    assert response.status_code == 200
    payload = response.json()
    dataset = payload["dataset"]
    assert dataset["id"] == "delhi-pilot"
    assert dataset["release"] == "delhi-pilot-2026.10-r1"
    assert dataset["is_synthetic"] is False
    assert dataset["data_status"] == "official_census_2011_osm"
    assert dataset["counts"]["areas"] == 290
    assert dataset["counts"]["areas_with_population"] == 272
    assert dataset["counts"]["areas_without_population"] == 18
    assert dataset["counts"]["facilities"] == 1368
    assert dataset["counts"]["population"] == 16_000_745
    assert dataset["population"]["reference_year"] == 2011
    assert dataset["population"]["unrepresented_population"] == 787_196
    assert dataset["vulnerability"]["available"] is False
    assert dataset["capabilities"]["area_import"] is False
    assert payload["routing"]["live_traffic"] is False
    assert payload["routing"]["id"] == "osm_network"
    assert "Census of India 2011" in payload["data_notice"]
    assert "OpenStreetMap" in payload["data_notice"]
    assert "Synthetic" not in payload["data_notice"]
    assert payload["default_service"] == "maternal_health"
    assert payload["default_threshold_minutes"] == 15
    profiles = {item["id"]: item for item in payload["datasets"]}
    assert profiles["delhi-pilot"]["active"] is True
    assert profiles["caregap-demo"]["active"] is False
    assert profiles["caregap-demo"]["is_synthetic"] is True


def test_overview_known_answer_and_missing_population(delhi_client: TestClient):
    response = delhi_client.get(
        "/api/v1/overview",
        params={"service": "maternal_health", "threshold_minutes": 15},
    )
    assert response.status_code == 200
    payload = response.json()
    summary = payload["summary"]
    assert summary["total_population"] == 16_000_745
    assert summary["covered_population"] == 13_854_200
    assert summary["coverage_percent"] == pytest.approx(86.58, abs=0.01)
    assert summary["wards_total"] == 272
    assert summary["areas_total"] == 290
    assert summary["areas_with_population"] == 272
    assert summary["areas_without_population"] == 18
    assert summary["wards_over_threshold"] == 35
    assert summary["population_reference_year"] == 2011
    assert summary["suitable_facility_count"] == 19
    assert payload["dataset"]["release"] == "delhi-pilot-2026.10-r1"
    assert len(payload["facilities"]) == 1368
    assert len(payload["areas"]["features"]) == 290
    feature = payload["areas"]["features"][20]["properties"]
    assert feature["dataset_id"] == "delhi-pilot"
    assert feature["dataset_release"] == "delhi-pilot-2026.10-r1"
    if payload["catchment"]["features"]:
        catchment_properties = payload["catchment"]["features"][0]["properties"]
        assert catchment_properties["dataset_id"] == "delhi-pilot"
        assert catchment_properties["dataset_release"] == "delhi-pilot-2026.10-r1"

    features = payload["areas"]["features"]
    missing = [
        feature
        for feature in features
        if feature["properties"]["area_id"] == "DL-NDMC-1"
    ]
    assert len(missing) == 1
    properties = missing[0]["properties"]
    assert properties["population"] is None
    assert properties["population_included"] is False
    assert properties["population_status"] == "unavailable"
    assert properties["vulnerability_index"] is None
    json_dumps_guard(properties)

    # Primary care is saturated in the mapped inventory; maternal is not.
    saturated = delhi_client.get(
        "/api/v1/overview",
        params={"service": "primary_care", "threshold_minutes": 15},
    ).json()["summary"]
    assert saturated["coverage_percent"] == pytest.approx(100.0)
    assert saturated["wards_over_threshold"] == 0


def json_dumps_guard(properties: dict) -> dict:
    # Sentinel helper: catches accidental NaN or non-JSON values in the response.
    import json

    json.dumps(properties, allow_nan=False)
    return properties


def test_facilities_expose_source_and_service(delhi_client: TestClient):
    response = delhi_client.get(
        "/api/v1/facilities", params={"service": "emergency", "limit": 3}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 29
    assert payload["dataset"]["id"] == "delhi-pilot"
    assert payload["dataset"]["release"] == "delhi-pilot-2026.10-r1"
    assert payload["items"]
    for item in payload["items"]:
        assert item["data_status"] == "osm"
        assert item["source"] == "OpenStreetMap"
        assert item["source_url"].startswith("https://www.openstreetmap.org/")
        assert "emergency" in item["services"]
        assert item["operational_status"] == "unknown"
        assert item["admin_area"]
        assert "source_tags" in item


def test_scenario_uses_active_dataset_and_recomputes(delhi_client: TestClient):
    overview = delhi_client.get(
        "/api/v1/overview",
        params={"service": "maternal_health", "threshold_minutes": 15},
    ).json()
    uncovered = [
        feature["properties"]
        for feature in overview["areas"]["features"]
        if feature["properties"]["population_included"]
        and not feature["properties"]["covered"]
        and feature["properties"]["travel_time_minutes"] is not None
    ]
    target = max(uncovered, key=lambda item: item["population"])
    create = delhi_client.post(
        "/api/v1/scenarios",
        json={
            "name": "Delhi maternal outreach",
            "service": "maternal_health",
            "threshold_minutes": 15,
            "interventions": [
                {
                    "intervention_type": "primary_care_clinic",
                    "name": "Proposed maternal outreach clinic",
                    "lon": target["centroid"][0],
                    "lat": target["centroid"][1],
                }
            ],
        },
    )
    assert create.status_code == 201, create.text
    scenario = create.json()
    assert scenario["dataset_id"] == "delhi-pilot"

    simulate = delhi_client.post(f"/api/v1/scenarios/{scenario['id']}/simulate")
    assert simulate.status_code == 200, simulate.text
    payload = simulate.json()
    assert payload["baseline"]["total_population"] == 16_000_745
    assert payload["baseline"]["covered_population"] == 13_854_200
    assert payload["delta"]["newly_covered_population"] > 0
    assert payload["delta"]["wards_worsened"] == 0
    assert payload["delta"]["newly_covered_population"] == (
        payload["proposed"]["covered_population"]
        - payload["baseline"]["covered_population"]
    )
    assert payload["proposed_facilities"][0]["data_status"] == "proposed"
    assert payload["proposed_facilities"][0]["source"] == "CareGap scenario"
    assert payload["dataset"]["id"] == "delhi-pilot"
    assert payload["dataset"]["release"] == "delhi-pilot-2026.10-r1"
    assert "delhi-pilot-2026.10-r1" in payload["data_notice"]
    scenario_feature = payload["areas"]["features"][0]["properties"]
    assert scenario_feature["dataset_id"] == "delhi-pilot"
    assert scenario_feature["dataset_release"] == "delhi-pilot-2026.10-r1"
    assert payload["equity"]["worst_served_population"] > 0
    assert payload["assumptions"]
    assert payload["warnings"]
    assert len(payload["areas"]["features"]) == 290
    # A proposed facility must never be counted as an existing facility.
    assert all(item["data_status"] == "osm" for item in payload["facilities"])


def test_recommendations_disable_unavailable_equity_weighting(
    delhi_client: TestClient,
):
    response = delhi_client.get(
        "/api/v1/recommendations",
        params={
            "service": "maternal_health",
            "threshold_minutes": 15,
            "intervention_type": "primary_care_clinic",
            "equity_weight": 0.7,
            "limit": 3,
            "set_size": 2,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["dataset_id"] == "delhi-pilot"
    assert payload["release"] == "delhi-pilot-2026.10-r1"
    assert payload["vulnerability_available"] is False
    assert payload["equity_weight"] == 0.0
    assert payload["weights"]["equity"] == 0.0
    assert payload["candidate_source"] == "272 population-area centroids"
    assert payload["candidates"][0]["metrics"]["newly_covered_population"] > 0
    assert payload["recommended_set"]["facilities"]
    assert any(
        "equity weighting was set to zero" in item for item in payload["assumptions"]
    )


def test_import_scoping_and_area_import_block(delhi_client: TestClient):
    csv_content = (
        "name,facility_type,lon,lat,services\n"
        "Validation Test Clinic,clinic,77.210,28.640,primary_care\n"
    )
    response = delhi_client.post(
        "/api/v1/data/import",
        files={"file": ("facilities.csv", csv_content.encode(), "text/csv")},
        data={"kind": "facilities"},
    )
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["dataset_id"] == "delhi-pilot"
    assert report["status"] == "completed"
    assert report["rows_imported"] == 1
    total = delhi_client.get("/api/v1/facilities").json()["total"]
    assert total == 1369
    imported = delhi_client.get(
        "/api/v1/facilities", params={"facility_type": "clinic", "limit": 500}
    ).json()
    created = [
        item for item in imported["items"] if item["name"] == "Validation Test Clinic"
    ]
    assert created and created[0]["source"] == "User import"
    history = delhi_client.get("/api/v1/data/imports").json()
    assert history["total"] == 1
    assert history["items"][0]["dataset_id"] == "delhi-pilot"

    blocked = delhi_client.post(
        "/api/v1/data/import",
        files={
            "file": (
                "areas.geojson",
                b'{"type":"FeatureCollection","features":[]}',
                "application/geo+json",
            )
        },
        data={"kind": "areas"},
    )
    assert blocked.status_code == 403
    assert "Census 2011 ward release" in blocked.json()["detail"]


def test_read_only_mode_blocks_mutations(tmp_path: Path):
    app = create_app(delhi_settings(tmp_path, read_only=True, database_url="sqlite:///:memory:"))
    with TestClient(app) as client:
        meta = client.get("/api/v1/meta")
        assert meta.status_code == 200
        assert meta.json()["read_only"] is True
        scenario = client.post(
            "/api/v1/scenarios",
            json={
                "service": "maternal_health",
                "threshold_minutes": 15,
                "interventions": [
                    {
                        "intervention_type": "primary_care_clinic",
                        "lon": 77.2,
                        "lat": 28.6,
                    }
                ],
            },
        )
        assert scenario.status_code == 403
        upload = client.post(
            "/api/v1/data/import",
            files={"file": ("f.csv", b"name,facility_type,lon,lat\n", "text/csv")},
            data={"kind": "facilities"},
        )
        assert upload.status_code == 403
        assert client.get("/health").json()["read_only"] is True


def test_health_readiness_and_docs_toggle(tmp_path: Path):
    app = create_app(
        delhi_settings(
            tmp_path,
            database_url="sqlite:///:memory:",
            enable_docs=False,
            allowed_hosts="testserver",
        )
    )
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        payload = health.json()
        assert payload["dataset_id"] == "delhi-pilot"
        assert payload["release"] == "delhi-pilot-2026.10-r1"
        assert payload["routing_model"] == "osm_network"
        ready = client.get("/ready")
        assert ready.status_code == 200
        assert ready.json()["status"] == "ready"
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404


def test_missing_release_fails_loudly(tmp_path: Path):
    settings = delhi_settings(
        tmp_path,
        database_url="sqlite:///:memory:",
        dataset_dir=str(tmp_path / "does-not-exist"),
    )
    app = create_app(settings)
    with pytest.raises(DatasetUnavailableError), TestClient(app):
        pass


def test_openapi_documents_active_endpoints(delhi_client: TestClient):
    response = delhi_client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = schema["paths"]
    for path in (
        "/health",
        "/ready",
        "/api/v1/meta",
        "/api/v1/datasets",
        "/api/v1/overview",
        "/api/v1/facilities",
        "/api/v1/areas",
        "/api/v1/scenarios",
        "/api/v1/recommendations",
        "/api/v1/data/import",
    ):
        assert path in paths, path
    meta_schema = schema["components"]["schemas"]["MetaResponse"]
    assert "read_only" in meta_schema["properties"]
    assert "datasets" in meta_schema["properties"]


def test_no_synthetic_records_under_delhi_label(delhi_client: TestClient):
    facilities = delhi_client.get("/api/v1/facilities", params={"limit": 500}).json()
    assert facilities["total"] == 1368
    assert all(item["data_status"] == "osm" for item in facilities["items"])
    assert all(item["source"] == "OpenStreetMap" for item in facilities["items"])
    areas = delhi_client.get("/api/v1/areas", params={"limit": 1000}).json()
    assert areas["total"] == 290
    assert areas["dataset"]["release"] == "delhi-pilot-2026.10-r1"
    statuses = {
        feature["properties"]["population_status"]
        for feature in areas["areas"]["features"]
    }
    assert statuses == {"census_2011", "unavailable"}
    assert all(
        feature["properties"]["dataset_id"] == "delhi-pilot"
        for feature in areas["areas"]["features"]
    )
