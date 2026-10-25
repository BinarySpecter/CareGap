#!/usr/bin/env python3
"""Deliberately replace a stored dataset release with the packaged release.

Normal API startup refuses to replace an existing dataset when its release
identifier differs. This operator script performs the replacement in one
transaction after validating the new release. Existing scenarios remain in the
database but should be re-simulated; their coordinates may no longer match the
new ward geography.

Usage:
    cd backend
    CAREGAP_DATABASE_URL=... ../.venv/bin/python scripts/refresh_dataset.py \
        --dataset delhi-pilot

The script never falls back to synthetic data.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.datasets import (  # noqa: E402
    DatasetUnavailableError,
    get_profile,
    load_manifest,
    release_id,
    resolve_data_dir,
)
from app.db import Base, make_engine, make_session_factory  # noqa: E402
from app.models import Dataset, Scenario  # noqa: E402
from app.seed import seed_dataset  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default="delhi-pilot")
    parser.add_argument(
        "--keep-scenarios",
        action="store_true",
        help="keep stored scenarios after replacement (re-simulate them afterwards)",
    )
    args = parser.parse_args()

    settings = get_settings()
    profile = get_profile(args.dataset)
    data_dir = resolve_data_dir(profile, settings)
    manifest = load_manifest(data_dir)
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    try:
        with factory() as session:
            existing = session.get(Dataset, profile.id)
            old_release = release_id(existing.meta or {}) if existing else None
            print(f"database : {settings.database_url}")
            print(f"dataset  : {profile.id}")
            print(f"current  : {old_release or 'not loaded'}")
            print(f"packaged : {release_id(manifest)}")
            if not args.keep_scenarios:
                scenarios = list(
                    session.scalars(
                        select(Scenario).where(Scenario.dataset_id == profile.id)
                    ).all()
                )
                if scenarios:
                    print(
                        f"refusing to drop {len(scenarios)} stored scenario(s) without "
                        "--keep-scenarios; re-run with --keep-scenarios to preserve them."
                    )
                    return 2
            dataset = seed_dataset(
                session, profile.id, data_dir=data_dir, replace=True
            )
            print(
                f"replaced : {dataset.id} -> {release_id(dataset.meta)} "
                f"({len(dataset.areas)} areas, {len(dataset.facilities)} facilities)"
            )
    except DatasetUnavailableError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
