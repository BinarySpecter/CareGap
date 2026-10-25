from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from shapely.geometry import shape
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.core.catalog import SERVICE_IDS
from app.datasets import (
    DatasetProfile,
    DatasetUnavailableError,
    get_profile,
    load_manifest,
    release_id,
    resolve_data_dir,
)
from app.models import Area, Dataset, Facility
from app.services.geo import valid_coordinate

logger = logging.getLogger(__name__)

DEMO_DATASET_ID = "caregap-demo"
DEMO_DATA_DIR = Path(__file__).resolve().parent / "data" / "demo"


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _feature_properties(feature: dict, kind: str, index: int) -> dict[str, Any]:
    properties = feature.get("properties") if isinstance(feature, dict) else None
    if not isinstance(properties, dict):
        raise DatasetUnavailableError(f"{kind} feature {index} has no properties object")
    return properties


def validate_release(
    manifest: dict[str, Any],
    areas: list[dict],
    facilities: list[dict],
    profile: DatasetProfile,
) -> None:
    if manifest.get("dataset_id") != profile.id:
        raise DatasetUnavailableError(
            f"Manifest dataset_id {manifest.get('dataset_id')!r} does not match "
            f"the configured profile {profile.id!r}."
        )
    if bool(manifest.get("is_synthetic")) != profile.is_synthetic:
        raise DatasetUnavailableError(
            "Manifest synthetic flag does not match the profile. Refusing to "
            "serve synthetic data under a real-data label."
        )
    if not profile.is_synthetic and not manifest.get("release"):
        raise DatasetUnavailableError("Real-data releases must declare a release identifier")
    if not areas:
        raise DatasetUnavailableError("Dataset release contains no population areas")
    if not facilities:
        raise DatasetUnavailableError("Dataset release contains no facilities")

    counts = manifest.get("counts") or {}
    if counts.get("areas") is not None and int(counts["areas"]) != len(areas):
        raise DatasetUnavailableError(
            f"Manifest area count {counts['areas']} does not match {len(areas)} features"
        )
    if counts.get("facilities") is not None and int(counts["facilities"]) != len(facilities):
        raise DatasetUnavailableError(
            "Manifest facility count does not match the facility feature count"
        )

    seen: set[str] = set()
    population_total = 0
    for index, feature in enumerate(areas, start=1):
        properties = _feature_properties(feature, "area", index)
        area_id = str(properties.get("area_id", "")).strip()
        if not area_id or area_id in seen:
            raise DatasetUnavailableError(f"Area feature {index} has a missing or duplicate id")
        seen.add(area_id)
        lon = float(properties.get("centroid_lon", 0.0))
        lat = float(properties.get("centroid_lat", 0.0))
        if not valid_coordinate(lon, lat):
            raise DatasetUnavailableError(f"Area {area_id} has an invalid centroid")
        population = properties.get("population")
        if population is not None:
            if int(population) < 0:
                raise DatasetUnavailableError(f"Area {area_id} has a negative population")
            population_total += int(population)
        vulnerability = properties.get("vulnerability_index")
        if vulnerability is not None and not 0.0 <= float(vulnerability) <= 1.0:
            raise DatasetUnavailableError(
                f"Area {area_id} has a vulnerability index outside [0, 1]"
            )
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") not in {
            "Polygon",
            "MultiPolygon",
        }:
            raise DatasetUnavailableError(f"Area {area_id} does not have polygon geometry")
        if not shape(geometry).is_valid:
            raise DatasetUnavailableError(f"Area {area_id} has an invalid geometry")

    seen.clear()
    for index, feature in enumerate(facilities, start=1):
        properties = _feature_properties(feature, "facility", index)
        facility_id = str(properties.get("facility_id", "")).strip()
        if not facility_id or facility_id in seen:
            raise DatasetUnavailableError(
                f"Facility feature {index} has a missing or duplicate id"
            )
        seen.add(facility_id)
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
        if geometry.get("type") != "Point" or not isinstance(coordinates, list):
            raise DatasetUnavailableError(f"Facility {facility_id} is not a point")
        try:
            lon, lat = float(coordinates[0]), float(coordinates[1])
        except (TypeError, ValueError, IndexError) as exc:
            raise DatasetUnavailableError(
                f"Facility {facility_id} has invalid coordinates"
            ) from exc
        if not valid_coordinate(lon, lat):
            raise DatasetUnavailableError(f"Facility {facility_id} is outside valid ranges")
        unknown = [
            service for service in properties.get("services", []) if service not in SERVICE_IDS
        ]
        if unknown:
            raise DatasetUnavailableError(
                f"Facility {facility_id} references unknown services {unknown}"
            )

    if counts.get("population") is not None and int(counts["population"]) != population_total:
        raise DatasetUnavailableError(
            "Manifest population total does not match the sum of area populations"
        )


def seed_dataset(
    session: Session,
    dataset_id: str,
    *,
    data_dir: Path | None = None,
    replace: bool = False,
) -> Dataset:
    """Idempotently load one validated dataset profile.

    Existing data is never overwritten unless ``replace`` is explicitly set by
    the operator refresh script, and replacement happens in a single
    transaction after the new release has been validated.
    """
    profile = get_profile(dataset_id)
    base = data_dir or profile.data_dir
    manifest = load_manifest(base)
    release = release_id(manifest)
    areas_geojson = load_json(base / "areas.geojson")
    facilities_geojson = load_json(base / "facilities.geojson")
    area_features = areas_geojson.get("features") or []
    facility_features = facilities_geojson.get("features") or []
    validate_release(manifest, area_features, facility_features, profile)

    existing = session.get(Dataset, dataset_id)
    if existing is not None:
        existing_release = release_id(existing.meta or {})
        if existing_release != release:
            if not replace:
                raise DatasetUnavailableError(
                    f"Dataset '{dataset_id}' is already stored at release "
                    f"'{existing_release}', but the packaged release is '{release}'. "
                    "Run backend/scripts/refresh_dataset.py to replace it deliberately, "
                    "or use a fresh database."
                )
            session.query(Area).filter(Area.dataset_id == dataset_id).delete()
            session.query(Facility).filter(Facility.dataset_id == dataset_id).delete()
            existing.name = str(manifest.get("name", existing.name))
            existing.description = str(manifest.get("description", existing.description))
            existing.is_synthetic = profile.is_synthetic
            existing.meta = manifest
            dataset = existing
        else:
            return existing
    else:
        dataset = Dataset(
            id=dataset_id,
            name=str(manifest.get("name", dataset_id)),
            description=str(manifest.get("description", "")),
            is_synthetic=profile.is_synthetic,
            meta=manifest,
        )
        session.add(dataset)
    session.flush()

    for feature in area_features:
        properties = feature["properties"]
        session.add(
            Area(
                id=str(properties["area_id"]),
                dataset_id=dataset_id,
                name=str(properties["name"]),
                population=(
                    int(properties["population"])
                    if properties.get("population") is not None
                    else None
                ),
                population_status=str(
                    properties.get("population_status")
                    or ("synthetic" if profile.is_synthetic else "unknown")
                ),
                population_reference_year=(
                    int(properties["population_reference_year"])
                    if properties.get("population_reference_year") is not None
                    else None
                ),
                vulnerability_index=(
                    float(properties["vulnerability_index"])
                    if properties.get("vulnerability_index") is not None
                    else None
                ),
                geometry=feature["geometry"],
                centroid_lon=float(properties["centroid_lon"]),
                centroid_lat=float(properties["centroid_lat"]),
                area_km2=float(properties.get("area_km2") or 0.0),
                quadrant=str(properties.get("quadrant") or ""),
                municipality=str(properties.get("municipality") or ""),
            )
        )

    for feature in facility_features:
        properties = feature["properties"]
        lon, lat = feature["geometry"]["coordinates"][:2]
        session.add(
            Facility(
                id=str(properties["facility_id"]),
                dataset_id=dataset_id,
                name=str(properties["name"]),
                facility_type=str(properties["facility_type"]),
                services=list(properties.get("services") or []),
                lon=float(lon),
                lat=float(lat),
                data_status=str(properties.get("data_status") or "synthetic"),
                source=str(properties.get("source") or ""),
                source_id=str(properties.get("source_id") or ""),
                source_url=str(properties.get("source_url") or ""),
                ownership=str(properties.get("ownership") or "unknown"),
                operational_status=str(properties.get("operational_status") or "unknown"),
                address=str(properties.get("address") or ""),
                admin_area=str(properties.get("admin_area") or ""),
                source_tags=dict(properties.get("source_tags") or {}),
            )
        )

    session.commit()
    logger.info(
        "Seeded dataset '%s' release '%s' with %d areas and %d facilities",
        dataset_id,
        release,
        len(area_features),
        len(facility_features),
    )
    return dataset


def seed_active_dataset(session: Session, settings: Settings) -> Dataset:
    profile = get_profile(settings.active_dataset)
    return seed_dataset(
        session,
        profile.id,
        data_dir=resolve_data_dir(profile, settings),
        replace=False,
    )


def ensure_demo_dataset(session: Session, data_dir: Path | None = None) -> Dataset:
    """Backwards-compatible helper used by tests and local scripts."""
    return seed_dataset(session, DEMO_DATASET_ID, data_dir=data_dir or DEMO_DATA_DIR)


def dataset_counts(session: Session, dataset_id: str) -> tuple[int, int]:
    area_count = session.scalar(
        select(func.count()).select_from(Area).where(Area.dataset_id == dataset_id)
    )
    facility_count = session.scalar(
        select(func.count()).select_from(Facility).where(Facility.dataset_id == dataset_id)
    )
    return int(area_count or 0), int(facility_count or 0)
