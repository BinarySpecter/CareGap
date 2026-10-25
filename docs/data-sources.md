# Data sources and provenance

## Current dataset: synthetic demonstration data

**Everything in the analysis dataset is synthetic.** It does not describe a real
administrative boundary, real people, real facilities, or real roads.

| Item | Details |
| --- | --- |
| Dataset ID | `caregap-demo` |
| Name | CareGap Synthetic Demo District |
| Generator | `backend/scripts/generate_demo_data.py` |
| Seed | `20261024` |
| Geography | Synthetic polygon near Pune, Maharashtra (invented boundary) |
| Areas | 96 Voronoi-derived population areas; synthetic population and vulnerability |
| Population | 3,571,121 modelled people (not a real count) |
| Facilities | 6 fictional facilities with invented service suitability |
| Road network | Synthetic 2.0 km grid with plausible speed classes |
| Travel times | Deterministic model estimates, not live traffic |
| Projection | WGS84 for interchange; UTM zone 43N for measurement |
| Generated files | `areas.geojson`, `facilities.geojson`, `roads.geojson`, `road_nodes.geojson`, `dataset.json` |
| Location | `backend/app/data/demo/` |

Regeneration is deterministic apart from documented seed/time metadata. See
`backend/app/data/demo/README.md`. All figures in screenshots and docs are from
this synthetic dataset.

### Source register (live in the app)

| Source | Type | Publisher | Licence / terms | Retrieved | Limitations |
| --- | --- | --- | --- | --- | --- |
| CareGap synthetic demonstration dataset | Synthetic | CareGap project | Proprietary repository licence (see `LICENSE`; all rights reserved) | Generated locally | Synthetic boundary, population, vulnerability, facilities, and roads; not a real place |

## Basemap

The interactive map uses raster tiles from `tile.openstreetmap.org` with visible
attribution: © OpenStreetMap contributors. The basemap is used only as geographic
context; the analysis does not use OSM road or facility data.

**Production note:** the public OSM tile service is not intended for heavy or
commercial traffic. Before deploying, configure a tile provider with an
appropriate plan, URL, and attribution. The basemap is not part of the
accessibility calculation and is absent if tiles are unavailable; overlays still
render.

An earlier implementation used keyless CARTO tiles. They were replaced because
the provider now returns watermarked "API KEY REQUIRED" tiles without a key.

## Candidate real-data sources (not ingested)

These are candidates for a future real-data pilot. **None has been downloaded,
licensed, or used in this build.** Each must be reviewed for dataset-specific
licence, currency, coverage, completeness, and fitness before use.

| Source | Potential use | Checks required |
| --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org/) | Facility locations, road networks | ODbL attribution/share-alike; completeness varies; facility tagging may not imply service availability; no live traffic |
| [data.gov.in](https://data.gov.in/) | Official district health and population datasets | Dataset-specific licence/NDSAP terms; update frequency; boundary version; metadata |
| [WorldPop](https://www.worldpop.org/) | Gridded population estimates | CC BY 4.0 terms, methodology/version, temporal alignment, age/sex breakdowns, aggregation bias |
| [NFHS](https://rchiips.org/nfhs/) | District health and vulnerability indicators | Survey design, small-area uncertainty, indicator definitions, use restrictions |
| State/district health society directories | Facility inventory and service tags | Official source, retrieval date, completeness, permission to reuse, contact validation |
| [Census of India](https://censusindia.gov.in/) | Population denominators and administrative boundaries | Licence, boundary vintage, ward/village aggregation, delimitation changes |

Do not scrape sources in violation of their terms. Do not substitute synthetic
values for missing real data without labelling.

## Data status in the interface

- Every dataset exposes `is_synthetic`, `data_status`, source metadata, seed, and
  limitations via `/api/v1/meta`.
- The UI labels the demo as synthetic in the header, scanner, map notes,
  analytics, data page, and landing page.
- Imported facilities are marked `imported`; proposed facilities are marked
  `proposed`.
- Facility presence never verifies staffing, hours, stock, affordability, or
  quality.
- Missing facility records do not prove that care is absent.

## Import provenance

Each import creates a row in `import_runs` with filename, kind, status, row
counts, validation errors, and timestamp. Imported records receive generated
IDs; existing records are not replaced. Facility imports are duplicate-checked
against normalised names within 50 m; area imports within 200 m.

## Privacy

No patient-identifiable data is accepted, stored, or displayed. The demo uses
area-level synthetic aggregates only. A future real deployment must not upload
patient records through the facility-import path and requires a privacy review,
access control, retention policy, and audit trail.
