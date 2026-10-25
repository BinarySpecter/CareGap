# Data sources and provenance

The active pilot release is `delhi-pilot-2026.10-r1`. Every value in the
workspace comes from this release or is computed from it by the API. The
synthetic `caregap-demo` profile is a separate, clearly labelled test dataset and
is never mixed with the Delhi records.

## Source register

### 1. Study boundary

| Field | Value |
| --- | --- |
| Publisher | OpenStreetMap contributors |
| Dataset | NCT of Delhi administrative boundary, relation 1942586 |
| URL | <https://www.openstreetmap.org/relation/1942586> |
| Access | Overpass API, `rel(1942586); out geom;` |
| Retrieved | 2026-10-25; OSM base timestamp 2026-10-25T00:46:01Z |
| Licence | Open Database License (ODbL) 1.0 (share-alike applies to derivative databases) |
| Attribution | © OpenStreetMap contributors |
| Coverage | NCT of Delhi, `admin_level=4`, `ISO3166-2=IN-DL` |
| Validation | Valid polygon, 1,482.04 km², consistent with the official 1,483 km² |
| Known omissions | Volunteer-maintained; not a Survey of India legal boundary |

### 2. Ward boundaries

| Field | Value |
| --- | --- |
| Publisher | DataMeet Municipal_Spatial_Data |
| Dataset | Delhi_Wards.geojson |
| URL | <https://github.com/datameet/Municipal_Spatial_Data/tree/master/Delhi> |
| Retrieved | 2026-10-25 |
| Publication date | Repository snapshot from 2016; original layer scraped from an ArcGIS Online municipal map |
| Licence | Creative Commons Attribution-ShareAlike 2.5 India (share-alike applies to derivative ward geometry) |
| Attribution | DataMeet contributors; original municipal map publisher |
| Coverage | 272 MCD wards, 9 NDMC charges, 8 Delhi Cantonment charges, 1 unassigned polygon |
| Validation | 0 invalid geometries; 272 numeric ward IDs 1–272; 44 polygons clipped to the NCT boundary (10.5 km² removed) |
| Known omissions | Pre-2022 delimitation; one 37 km² riverbed polygon has no ward identifier |

### 3. Population

| Field | Value |
| --- | --- |
| Publisher | Office of the Registrar General & Census Commissioner, India |
| Dataset | Census 2011 Primary Census Abstract, Delhi, ward level (state code 07) |
| URL | <https://censusindia.gov.in/nada/index.php/catalog/42560> |
| Retrieved | 2026-10-25 |
| Reference date | 1 March 2011 |
| Licence | Government of India publication (Census of India); confirm reuse terms before redistribution |
| Attribution | Census of India 2011, Office of the Registrar General & Census Commissioner |
| Coverage | 272 MCD wards; 16,000,745 people; NDMC 257,803 and Cantonment 110,351 held separately |
| Validation | All 272 ward numbers joined; total cross-checked against the 16,787,941 NCT total from the Delhi Directorate of Economics & Statistics |
| Known omissions | Historical; urban ward table excludes rural village population; no charge-level NDMC/Cantonment split; no vulnerability indicator |

The cross-check source is the Directorate of Economics & Statistics, GNCT of
Delhi, “District wise population of Delhi, Census 2001 & 2011”
(<https://des.delhi.gov.in/des/population-census-2011>), retrieved 2026-10-25.

### 4. Facilities

| Field | Value |
| --- | --- |
| Publisher | OpenStreetMap contributors |
| Dataset | Healthcare features within the NCT boundary |
| Access | Overpass API: `amenity` in hospital/clinic/doctors/health_post/dentist and all `healthcare=*` features |
| Retrieved | 2026-10-25; OSM base timestamp 2026-10-25T00:46:01Z |
| Licence | Open Database License (ODbL) 1.0 (share-alike applies to derivative databases) |
| Attribution | © OpenStreetMap contributors |
| Coverage | 1,368 retained facilities after filtering and deduplication |
| Validation | 0 outside the boundary; 16 duplicate groups merged only for identical normalised names within 150 m; 1,367 facilities assigned to a containing ward (1 unassigned at the riverbed/boundary edge); 957 have a mapped street address; every record retains its OSM element ID and source URL |
| Known omissions | Completeness unknown; operating status, staffing, hours, and service availability unverified |

486 source records carry `source=OpenGovernmentData` and 244 carry
`health_facility:type=dispensary`; these tags are retained in `source_tags` but
are not treated as independent verification. Services are attributed only from
`amenity`, `healthcare`, `healthcare:speciality`, and `emergency` tags.

### 5. Roads

| Field | Value |
| --- | --- |
| Publisher | OpenStreetMap contributors |
| Dataset | Drivable road network within the NCT boundary |
| Access | Overpass API: `way[highway~motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|*_link]` |
| Retrieved | 2026-10-25 |
| Licence | Open Database License (ODbL) 1.0 (share-alike applies to derivative databases) |
| Attribution | © OpenStreetMap contributors |
| Coverage | 125,452 ways; 532,088-node largest component; 620,076 undirected edges |
| Validation | 99.5% of raw nodes in the largest component; all 290 areas and 1,368 facilities snap to it; 0 unreachable baseline pairs |
| Known omissions | Service roads and pedestrian ways excluded; one-way and turn restrictions not modelled; class speeds are assumptions; no live traffic or public transport |

### 6. Basemap

The interactive map uses raster tiles from `tile.openstreetmap.org` with visible
attribution: © OpenStreetMap contributors. The basemap is geographic context
only; no analysis uses it.

**Production note:** the public OSM tile service is not intended for heavy or
commercial traffic. Configure a tile provider with an appropriate plan, URL, and
attribution before deploying. The basemap is not part of the accessibility
calculation.

## Data licences

The source code is proprietary; the data files carry third-party terms.
OpenStreetMap-derived data is ODbL 1.0, the DataMeet ward layer and its clipped
derivative are CC BY-SA 2.5 India, and the Census tables are Government of India
publications whose reuse terms should be confirmed before redistribution. See
[data licences](data-licenses.md) for details and attribution requirements.

## Dataset separation

| Profile | ID | Status | Routing | Population | Facilities |
| --- | --- | --- | --- | --- | --- |
| Delhi pilot | `delhi-pilot` | `official_census_2011_osm` | OSM network | Census 2011 wards | OSM |
| Synthetic demo | `caregap-demo` | `synthetic` | Synthetic grid | Seeded synthetic | Fictional |

Rules enforced by the code and tests:

- One active profile per process (`CAREGAP_ACTIVE_DATASET`).
- A real-data release must declare a release ID and must not be flagged
  synthetic; the seeder refuses a mismatch.
- A missing or invalid real-data release stops startup. There is no synthetic
  fallback.
- The UI displays the active dataset, release, population year, and routing
  model in the workspace header and on the data-sources page.
- Exports include dataset ID, release, population reference year, routing
  model, and the data notice.
- The synthetic demo cannot be loaded under the Delhi dataset ID.

## Data status in the interface

- `/api/v1/meta` exposes the full manifest, source register, limitations,
  validation summary, capabilities, and vulnerability availability.
- `/api/v1/datasets` lists the known profiles and whether each release is
  packaged and active.
- Facilities are marked `osm`, `imported`, or `proposed`; proposed facilities are
  never counted as existing.
- Population-unavailable areas are grey on the map and excluded from
  denominators.
- Equity controls are disabled when no vulnerability input exists.

## Import provenance

Each import creates an `import_runs` row with filename, kind, status, row counts,
validation errors, timestamp, and dataset ID. Imported facilities receive
generated IDs and `data_status=imported`; existing records are not replaced.
Facility duplicates are checked against normalised names within 50 m. Population
area imports are disabled for the Delhi pilot.

## Reproducing the sources

```bash
.venv/bin/pip install -r backend/requirements-data.txt
.venv/bin/python backend/scripts/fetch_delhi_sources.py
.venv/bin/python backend/scripts/build_delhi_dataset.py
```

Raw downloads are stored under `data/raw/delhi/` (git-ignored, about 140 MB) and
checksummed in `SOURCES.json`. The Census host currently serves an incomplete TLS
chain from some networks; the fetch script falls back to an unverified TLS
connection for that public download and records a SHA-256 digest for integrity.
Pass `--strict-tls` to refuse the fallback.

## Privacy

No patient-identifiable data is accepted, stored, or displayed. The release is
area-level aggregate population and public map data. Do not upload patient
records through the facility-import path. A future real deployment requires a
privacy review, access control, retention policy, and audit trail.
