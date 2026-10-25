from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.analysis import AnalysisArea, AnalysisFacility
from app.services.routing import SyntheticRoadRouter, build_router

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "data" / "demo"


def load_demo_areas() -> list[AnalysisArea]:
    with (DATA_DIR / "areas.geojson").open(encoding="utf-8") as handle:
        features = json.load(handle)["features"]
    return [
        AnalysisArea(
            id=feature["properties"]["area_id"],
            name=feature["properties"]["name"],
            population=feature["properties"]["population"],
            vulnerability_index=feature["properties"]["vulnerability_index"],
            area_km2=feature["properties"]["area_km2"],
            centroid_lon=feature["properties"]["centroid_lon"],
            centroid_lat=feature["properties"]["centroid_lat"],
            quadrant=feature["properties"]["quadrant"],
            geometry=feature["geometry"],
        )
        for feature in features
    ]


def load_demo_facilities() -> list[AnalysisFacility]:
    with (DATA_DIR / "facilities.geojson").open(encoding="utf-8") as handle:
        features = json.load(handle)["features"]
    return [
        AnalysisFacility(
            id=feature["properties"]["facility_id"],
            name=feature["properties"]["name"],
            facility_type=feature["properties"]["facility_type"],
            services=tuple(feature["properties"]["services"]),
            lon=feature["geometry"]["coordinates"][0],
            lat=feature["geometry"]["coordinates"][1],
        )
        for feature in features
    ]


@pytest.fixture(scope="session")
def demo_areas() -> list[AnalysisArea]:
    return load_demo_areas()


@pytest.fixture(scope="session")
def demo_facilities() -> list[AnalysisFacility]:
    return load_demo_facilities()


@pytest.fixture(scope="session")
def road_router() -> SyntheticRoadRouter:
    router = build_router()
    assert isinstance(router, SyntheticRoadRouter)
    return router


@pytest.fixture()
def app(tmp_path: Path):
    settings = Settings(
        env="test",
        database_url=f"sqlite:///{tmp_path / 'caregap-test.db'}",
        cors_origins="http://localhost:3000",
    )
    return create_app(settings)


@pytest.fixture()
def client(app) -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def area_payload(area: AnalysisArea) -> dict[str, Any]:
    return {
        "area_id": area.id,
        "name": area.name,
        "population": area.population,
        "vulnerability_index": area.vulnerability_index,
    }
