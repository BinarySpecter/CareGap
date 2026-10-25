#!/usr/bin/env python3
"""Fetch the raw public sources used to build the CareGap Delhi pilot release.

This script is an operator tool, not part of the API runtime. It documents the
exact sources, retrieval parameters, and checksums so the release can be
reproduced. Downloads are written to ``data/raw/delhi/`` (git-ignored) and are
never served directly by the application.

Usage:
    .venv/bin/python backend/scripts/fetch_delhi_sources.py [--force]

Notes:
- OpenStreetMap data is fetched from the public Overpass API with a descriptive
  User-Agent. Please respect the Overpass usage policy; the two large queries in
  this script take roughly three minutes in total.
- The Census of India host currently serves an incomplete TLS chain from some
  networks. The download is therefore allowed to fall back to an unverified TLS
  connection, and integrity is established with the SHA-256 digest recorded in
  ``SOURCES.json`` instead. Pass ``--strict-tls`` to refuse that fallback.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw" / "delhi"
USER_AGENT = (
    "CareGapDataPilot/0.1 (healthcare accessibility research; "
    "https://github.com/BinarySpecter/CareGap)"
)
OVERPASS = "https://overpass-api.de/api/interpreter"
DELHI_OSM_RELATION = 1942586
DELHI_OSM_AREA = 3601942586
DRIVABLE_CLASSES = (
    "motorway|trunk|primary|secondary|tertiary|unclassified|residential|"
    "living_street|motorway_link|trunk_link|primary_link|secondary_link|"
    "tertiary_link"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path, *, strict_tls: bool, data: dict | None = None) -> None:
    if destination.exists() and destination.stat().st_size > 0:
        print(f"cached  {destination.name} ({destination.stat().st_size:,} bytes)")
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
    print(f"fetch   {destination.name} ...")
    started = time.time()
    try:
        with urllib.request.urlopen(request, data=body, timeout=900) as response:
            payload = response.read()
    except urllib.error.URLError as exc:
        if strict_tls or not isinstance(exc.reason, ssl.SSLError):
            raise
        print(
            "        TLS certificate verification failed; retrying for this "
            "public download. Integrity will be checked via SHA-256.",
            file=sys.stderr,
        )
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(
            request, data=body, timeout=900, context=context
        ) as response:
            payload = response.read()
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.write_bytes(payload)
    temporary.replace(destination)
    print(
        f"        {len(payload):,} bytes in {time.time() - started:.0f}s"
    )


def overpass(query: str, destination: Path, *, strict_tls: bool) -> None:
    download(
        OVERPASS,
        destination,
        strict_tls=strict_tls,
        data={"data": query},
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-download existing files")
    parser.add_argument("--strict-tls", action="store_true", help="refuse unverified TLS")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    if args.force:
        for child in RAW_DIR.iterdir():
            if child.is_file():
                child.unlink()

    overpass(
        f"[out:json][timeout:120];rel({DELHI_OSM_RELATION});out geom;",
        RAW_DIR / "delhi_boundary_osm.json",
        strict_tls=args.strict_tls,
    )
    overpass(
        (
            f"[out:json][timeout:300];"
            f"(nwr[\"amenity\"~\"^(hospital|clinic|doctors|health_post|dentist)$\"]"
            f"(area:{DELHI_OSM_AREA});"
            f"nwr[\"healthcare\"](area:{DELHI_OSM_AREA}););"
            f"out center tags;"
        ),
        RAW_DIR / "facilities_osm.json",
        strict_tls=args.strict_tls,
    )
    overpass(
        (
            f"[out:json][timeout:600];"
            f"way[highway~\"^({DRIVABLE_CLASSES})$\"](area:{DELHI_OSM_AREA});"
            f"out body geom;"
        ),
        RAW_DIR / "roads_body.json",
        strict_tls=args.strict_tls,
    )

    download(
        "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/"
        "master/Delhi/Delhi_Wards.geojson",
        RAW_DIR / "Delhi_Wards.geojson",
        strict_tls=args.strict_tls,
    )
    download(
        "https://censusindia.gov.in/nada/index.php/catalog/42560/download/46186/"
        "2011-IndiaStateDistSbDistTwnWrd-0000.xlsx",
        RAW_DIR / "ward_census.xlsx",
        strict_tls=args.strict_tls,
    )
    download(
        "https://des.delhi.gov.in/sites/default/files/DES/generic_multiple_files/"
        "_a1_district_wise_population_of_delhi_1.pdf",
        RAW_DIR / "delhi_district_population_census2011.pdf",
        strict_tls=args.strict_tls,
    )

    sources = {
        "retrieved_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": {
            path.name: {
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
            for path in sorted(RAW_DIR.iterdir())
            if path.is_file() and path.suffix != ".part"
        },
        "notes": [
            "OSM data © OpenStreetMap contributors, ODbL 1.0.",
            "Ward boundaries: DataMeet Municipal_Spatial_Data (CC BY-SA 2.5 IN).",
            "Census 2011 ward PCA: Office of the Registrar General & Census Commissioner, India.",
            "District totals cross-check: Directorate of Economics & Statistics, GNCT of Delhi.",
        ],
    }
    (RAW_DIR / "SOURCES.json").write_text(
        json.dumps(sources, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote   {RAW_DIR / 'SOURCES.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
