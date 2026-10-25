from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Area, Dataset, Facility

logger = logging.getLogger(__name__)

DEMO_DATASET_ID = "caregap-demo"
DEMO_DATA_DIR = Path(__file__).resolve().parent / "data" / "demo"


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def ensure_demo_dataset(session: Session, data_dir: Path | None = None) -> Dataset:
    """Idempotently load the bundled synthetic dataset.

    The demo dataset is seeded only when the dataset ID is absent. Existing rows
    are never overwritten silently, so imported or edited data is preserved.
    """
    base = data_dir or DEMO_DATA_DIR
    existing = session.get(Dataset, DEMO_DATASET_ID)
    if existing is not None:
        return existing

    meta = load_json(base / "dataset.json")
    areas_geojson = load_json(base / "areas.geojson")
    facilities_geojson = load_json(base / "facilities.geojson")

    area_features = areas_geojson.get("features", [])
    facility_features = facilities_geojson.get("features", [])
    if not area_features:
        raise RuntimeError("Demo dataset has no areas; regenerate with the demo script.")
    if not facility_features:
        raise RuntimeError("Demo dataset has no facilities; regenerate with the demo script.")

    dataset = Dataset(
        id=DEMO_DATASET_ID,
        name=meta["name"],
        description=meta["description"],
        is_synthetic=bool(meta.get("is_synthetic", True)),
        meta=meta,
    )
    session.add(dataset)
    session.flush()

    for feature in area_features:
        props = feature["properties"]
        session.add(
            Area(
                id=props["area_id"],
                dataset_id=DEMO_DATASET_ID,
                name=props["name"],
                population=int(props["population"]),
                vulnerability_index=float(props.get("vulnerability_index", 0.5)),
                geometry=feature["geometry"],
                centroid_lon=float(props["centroid_lon"]),
                centroid_lat=float(props["centroid_lat"]),
                area_km2=float(props.get("area_km2", 0.0)),
                quadrant=str(props.get("quadrant", "")),
            )
        )

    for feature in facility_features:
        props = feature["properties"]
        lon, lat = feature["geometry"]["coordinates"][:2]
        session.add(
            Facility(
                id=props["facility_id"],
                dataset_id=DEMO_DATASET_ID,
                name=props["name"],
                facility_type=props["facility_type"],
                services=list(props.get("services", [])),
                lon=float(lon),
                lat=float(lat),
                data_status=str(props.get("data_status", "synthetic")),
            )
        )

    session.commit()
    logger.info(
        "Seeded demo dataset with %d areas and %d facilities",
        len(area_features),
        len(facility_features),
    )
    return dataset


def dataset_counts(session: Session, dataset_id: str) -> tuple[int, int]:
    area_count = session.scalar(select(func.count()).select_from(Area).where(Area.dataset_id == dataset_id))
    facility_count = session.scalar(
        select(func.count()).select_from(Facility).where(Facility.dataset_id == dataset_id)
    )
    return int(area_count or 0), int(facility_count or 0)
