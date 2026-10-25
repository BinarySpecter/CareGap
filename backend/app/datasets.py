"""Dataset profiles and routing selection.

A profile is an explicit, versioned dataset release. The API loads exactly one
profile per process (``CAREGAP_ACTIVE_DATASET``). There is no synthetic fallback
for a real-data profile: if a release is missing or invalid, startup fails with
an actionable error instead of serving different data under the same label.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import BACKEND_DIR, Settings
from app.services.routing import (
    NetworkRoadRouter,
    RouterUnavailableError,
    RoutingModelInfo,
    StraightLineFallbackRouter,
    SyntheticRoadRouter,
    TravelTimeRouter,
)

logger = logging.getLogger(__name__)

DATA_ROOT = BACKEND_DIR / "app" / "data"


class DatasetUnavailableError(RuntimeError):
    """The configured dataset release is missing, invalid, or incompatible."""


@dataclass(frozen=True)
class DatasetProfile:
    id: str
    label: str
    data_dir: Path
    is_synthetic: bool
    router: str


PROFILES: dict[str, DatasetProfile] = {
    "delhi-pilot": DatasetProfile(
        id="delhi-pilot",
        label="Delhi pilot (Census 2011 + OpenStreetMap)",
        data_dir=DATA_ROOT / "delhi",
        is_synthetic=False,
        router="osm_network",
    ),
    "caregap-demo": DatasetProfile(
        id="caregap-demo",
        label="Synthetic demonstration district",
        data_dir=DATA_ROOT / "demo",
        is_synthetic=True,
        router="synthetic_grid",
    ),
}


def get_profile(dataset_id: str) -> DatasetProfile:
    profile = PROFILES.get(dataset_id)
    if profile is None:
        raise DatasetUnavailableError(
            f"Unknown dataset profile '{dataset_id}'. "
            f"Supported profiles: {', '.join(sorted(PROFILES))}."
        )
    return profile


def resolve_data_dir(profile: DatasetProfile, settings: Settings) -> Path:
    override = settings.dataset_dir.strip()
    if override:
        return Path(override).expanduser().resolve()
    return profile.data_dir


def load_manifest(data_dir: Path) -> dict[str, Any]:
    path = data_dir / "dataset.json"
    if not path.is_file():
        raise DatasetUnavailableError(
            f"Dataset manifest is missing at {path}. "
            "Build the release with backend/scripts/build_delhi_dataset.py "
            "(Delhi) or backend/scripts/generate_demo_data.py (synthetic demo)."
        )
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatasetUnavailableError(
            f"Dataset manifest at {path} is not readable JSON: {exc}"
        ) from exc
    if not isinstance(manifest, dict):
        raise DatasetUnavailableError(f"Dataset manifest at {path} is not an object")
    return manifest


def release_id(manifest: dict[str, Any]) -> str:
    value = manifest.get("release") or manifest.get("generated_at") or "unversioned"
    return str(value)


def build_dataset_router(
    profile: DatasetProfile, data_dir: Path, manifest: dict[str, Any]
) -> TravelTimeRouter:
    if profile.router == "synthetic_grid":
        roads = data_dir / "roads.geojson"
        try:
            return SyntheticRoadRouter.from_geojson(
                json.loads(roads.read_text(encoding="utf-8"))
            )
        except (OSError, ValueError, KeyError, RouterUnavailableError) as exc:
            # This fallback exists only for the explicitly synthetic profile and
            # is labelled in every API response.
            logger.warning(
                "Synthetic demo road grid unavailable (%s); using the labelled "
                "straight-line fallback.",
                exc,
            )
            return StraightLineFallbackRouter()

    if profile.router == "osm_network":
        path = data_dir / "routing.npz"
        if not path.is_file():
            raise DatasetUnavailableError(
                f"Road-network artifact is missing at {path}. Rebuild the Delhi "
                "release with backend/scripts/build_delhi_dataset.py."
            )
        road_model = manifest.get("road_model") or {}
        info = RoutingModelInfo(
            id="osm_network",
            label=str(road_model.get("name", "OpenStreetMap road-network estimate")),
            description=str(
                road_model.get(
                    "description",
                    "Shortest path over an OpenStreetMap road graph with documented "
                    "road-class speeds. Not live traffic or public transport.",
                )
            ),
            is_estimate=True,
            live_traffic=False,
            warnings=tuple(str(item) for item in road_model.get("warnings", [])),
        )
        try:
            return NetworkRoadRouter.from_npz(path, model_info=info)
        except RouterUnavailableError as exc:
            raise DatasetUnavailableError(
                f"The Delhi road network could not be loaded from {path}: {exc}"
            ) from exc

    raise DatasetUnavailableError(f"Unknown router kind '{profile.router}'")
