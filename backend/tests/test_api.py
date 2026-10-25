from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_and_root(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["dataset_loaded"] is True
    assert client.get("/").status_code == 200


def test_meta_exposes_catalog_and_provenance(client: TestClient):
    response = client.get("/api/v1/meta")
    assert response.status_code == 200
    payload = response.json()
    assert payload["api_version"] == "v1"
    assert len(payload["services"]) == 4
    assert len(payload["interventions"]) == 6
    assert payload["dataset"]["is_synthetic"] is True
    assert payload["dataset"]["counts"]["areas"] == 96
    assert payload["routing"]["live_traffic"] is False
    assert payload["data_notice"]


def test_overview_uses_generated_analysis(client: TestClient):
    response = client.get("/api/v1/overview", params={"service": "primary_care", "threshold_minutes": 30})
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["total_population"] == 3_571_121
    assert 0 < payload["summary"]["coverage_percent"] < 100
    assert payload["summary"]["wards_over_threshold"] > 0
    assert len(payload["areas"]["features"]) == 96
    assert len(payload["facilities"]) == 6
    assert payload["catchment"]["features"]
    first = payload["areas"]["features"][0]["properties"]
    assert "travel_time_minutes" in first
    assert "covered" in first
    assert first["population"] > 0
    assert payload["dataset"]["data_status"] == "synthetic"


def test_overview_rejects_invalid_parameters(client: TestClient):
    assert client.get("/api/v1/overview", params={"service": "unknown"}).status_code == 422
    assert (
        client.get("/api/v1/overview", params={"threshold_minutes": 1}).status_code == 422
    )


def test_default_threshold_is_service_specific(client: TestClient):
    response = client.get("/api/v1/overview", params={"service": "maternal_health"})
    assert response.status_code == 200
    assert response.json()["threshold_minutes"] == 15
    response = client.get("/api/v1/overview", params={"service": "emergency"})
    assert response.status_code == 200
    assert response.json()["threshold_minutes"] == 60


def test_analysis_post_matches_get_accessibility(client: TestClient):
    payload = {"service": "primary_care", "threshold_minutes": 30}
    post = client.post("/api/v1/analysis", json=payload)
    get = client.get("/api/v1/accessibility", params=payload)
    assert post.status_code == 200
    assert get.status_code == 200
    assert post.json()["summary"] == get.json()["summary"]
    assert len(post.json()["areas"]) == 96


def test_facilities_filter_and_pagination(client: TestClient):
    response = client.get(
        "/api/v1/facilities", params={"service": "diagnostics", "limit": 2, "offset": 0}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] >= 1
    assert len(payload["items"]) <= 2
    assert all("diagnostics" in item["services"] for item in payload["items"])
    assert all(item["data_status"] == "synthetic" for item in payload["items"])


def test_areas_pagination(client: TestClient):
    response = client.get("/api/v1/areas", params={"limit": 10, "offset": 5})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 96
    assert len(payload["areas"]["features"]) == 10


def test_scenario_creation_and_simulation(client: TestClient, demo_areas):
    area = max((item for item in demo_areas if item.quadrant == "SouthWest"), key=lambda item: item.population)
    create = client.post(
        "/api/v1/scenarios",
        json={
            "name": "Southwest clinic",
            "service": "primary_care",
            "threshold_minutes": 30,
            "interventions": [
                {
                    "intervention_type": "primary_care_clinic",
                    "name": "Southwest clinic",
                    "lon": area.centroid_lon,
                    "lat": area.centroid_lat,
                }
            ],
        },
    )
    assert create.status_code == 201, create.text
    scenario = create.json()
    assert scenario["interventions"][0]["id"].startswith("SCN-")
    assert scenario["service"] == "primary_care"

    simulate = client.post(f"/api/v1/scenarios/{scenario['id']}/simulate")
    assert simulate.status_code == 200, simulate.text
    payload = simulate.json()
    assert payload["baseline"]["covered_population"] <= payload["proposed"]["covered_population"]
    assert payload["delta"]["newly_covered_population"] >= 0
    assert (
        payload["delta"]["newly_covered_population"]
        == payload["proposed"]["covered_population"]
        - payload["baseline"]["covered_population"]
    )
    assert payload["delta"]["wards_worsened"] == 0
    assert len(payload["areas"]["features"]) == 96
    assert payload["proposed_facilities"][0]["data_status"] == "proposed"
    assert payload["equity"]["worst_served_population"] > 0
    assert payload["assumptions"]
    assert payload["data_notice"]
    assert payload["delta"]["remaining_uncovered_population"] == (
        payload["proposed"]["total_population"] - payload["proposed"]["covered_population"]
    )
    props = payload["areas"]["features"][0]["properties"]
    assert "travel_time_baseline" in props
    assert "travel_time_proposed" in props


def test_scenario_rejects_outside_point(client: TestClient):
    response = client.post(
        "/api/v1/scenarios",
        json={
            "service": "primary_care",
            "threshold_minutes": 30,
            "interventions": [
                {"intervention_type": "primary_care_clinic", "lon": 75.0, "lat": 19.0}
            ],
        },
    )
    assert response.status_code == 422


def test_scenario_rejects_incompatible_service(client: TestClient):
    response = client.post(
        "/api/v1/scenarios",
        json={
            "service": "diagnostics",
            "threshold_minutes": 30,
            "interventions": [
                {"intervention_type": "mobile_clinic", "lon": 73.86, "lat": 18.52}
            ],
        },
    )
    assert response.status_code == 422


def test_scenario_not_found(client: TestClient):
    assert client.get("/api/v1/scenarios/not-real").status_code == 404
    assert client.post("/api/v1/scenarios/not-real/simulate").status_code == 404


def test_recommendations_contract(client: TestClient):
    response = client.get(
        "/api/v1/recommendations",
        params={
            "service": "primary_care",
            "threshold_minutes": 30,
            "intervention_type": "primary_care_clinic",
            "equity_weight": 0.35,
            "limit": 4,
            "set_size": 2,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["candidate_source"].startswith("96")
    assert len(payload["candidates"]) == 4
    assert payload["candidates"][0]["rank"] == 1
    assert payload["candidates"][0]["explanation"]
    assert payload["recommended_set"]["facilities"]
    assert set(payload["comparison"]) == {"max_coverage", "equity_weighted"}
    assert payload["baseline"]["total_population"] == 3_571_121
    assert payload["methodology"]["score_formula"]
    assert payload["limitations"]


def test_recommendations_reject_incompatible_service(client: TestClient):
    response = client.get(
        "/api/v1/recommendations",
        params={"intervention_type": "diagnostic_centre", "service": "primary_care"},
    )
    assert response.status_code == 422


def test_facility_import_flow(client: TestClient):
    csv_content = (
        "name,facility_type,lon,lat,services\n"
        "API Import Clinic,primary_health_centre,73.800,18.500,primary_care;diagnostics\n"
    )
    response = client.post(
        "/api/v1/data/import",
        files={"file": ("facilities.csv", csv_content.encode(), "text/csv")},
        data={"kind": "facilities"},
    )
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["status"] == "completed"
    assert report["rows_imported"] == 1
    facilities = client.get("/api/v1/facilities").json()
    assert facilities["total"] == 7
    imports = client.get("/api/v1/data/imports").json()
    assert imports["total"] == 1
    assert imports["items"][0]["rows_imported"] == 1


def test_import_validation_report_and_history(client: TestClient):
    csv_content = (
        "name,facility_type,lon,lat\n"
        "Bad Clinic,not_a_type,999,999\n"
    )
    response = client.post(
        "/api/v1/data/import",
        files={"file": ("bad.csv", csv_content.encode(), "text/csv")},
        data={"kind": "facilities"},
    )
    assert response.status_code == 201
    report = response.json()
    assert report["status"] == "failed"
    assert report["rows_imported"] == 0
    assert report["errors"]
    history = client.get("/api/v1/data/imports").json()
    assert history["total"] == 1
    assert history["items"][0]["status"] == "failed"


def test_import_format_error_is_422(client: TestClient):
    response = client.post(
        "/api/v1/data/import",
        files={"file": ("notes.txt", b"not an import", "text/plain")},
        data={"kind": "facilities"},
    )
    assert response.status_code == 422
    assert "Unsupported file type" in response.json()["detail"]


def test_import_size_limit(client: TestClient):
    oversized = b"name,facility_type,lon,lat\n" + b"x" * (2_097_152 + 1)
    response = client.post(
        "/api/v1/data/import",
        files={"file": ("huge.csv", oversized, "text/csv")},
        data={"kind": "facilities"},
    )
    assert response.status_code == 413


def test_cors_allows_configured_origin(client: TestClient):
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_error_shape_uses_detail(client: TestClient):
    response = client.get("/api/v1/overview", params={"service": "bad"})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_scenarios_list(client: TestClient, demo_areas):
    area = demo_areas[0]
    client.post(
        "/api/v1/scenarios",
        json={
            "service": "primary_care",
            "threshold_minutes": 30,
            "interventions": [
                {"intervention_type": "primary_care_clinic", "lon": area.centroid_lon, "lat": area.centroid_lat}
            ],
        },
    )
    response = client.get("/api/v1/scenarios")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["interventions"]
