# Delhi pilot

**Release:** `delhi-pilot-2026.10-r1` · **Dataset ID:** `delhi-pilot` ·
**Status:** private pilot, not publicly deployed.

CareGap Delhi is a geographic accessibility pilot for the National Capital
Territory of Delhi. It is a planning model built from public data. It is not an
official Delhi government product and is not endorsed by any agency.

## Scope

| Item | Decision |
| --- | --- |
| Study boundary | NCT of Delhi, OpenStreetMap administrative relation 1942586 (`admin_level=4`, `ISO3166-2=IN-DL`) |
| Boundary area | 1,482.04 km² (geodesic); official reference 1,483 km² |
| Analysis units | Municipal ward / charge polygons: 272 MCD wards, 9 NDMC charges, 8 Delhi Cantonment charges, 1 unassigned Yamuna riverbed polygon |
| Population | Census of India 2011 ward-level Primary Census Abstract |
| Population reference date | 1 March 2011 (historical baseline) |
| Represented population | **16,000,745** people in 272 MCD wards |
| Not represented | **787,196** people (4.7% of the 2011 NCT total): NDMC, Cantonment, rural village population inside wards, and boundary mismatch |
| Facilities | OpenStreetMap healthcare features inside the NCT boundary |
| Roads | OpenStreetMap drivable ways inside the NCT boundary |
| Surrounding NCR | **Not included.** Gurugram, Faridabad, Noida, and Ghaziabad are not in the study population, boundary, or facility inventory |
| Cross-border routing | Not modelled. The road graph is clipped to Delhi |

### Administrative vintage

The ward layer is the 272-ward municipal structure created after the 2011
census, plus NDMC and Cantonment charges. The population table is the 2011
Census ward PCA. Ward numbers are the join key and **all 272 matched exactly**.
This is a historical 2011 baseline. The 2022 municipal delimitation (250 wards)
is not represented, and Census 2011 must not be joined to current wards without a
new crosswalk.

The 17 NDMC/Cantonment charge polygons and the unassigned riverbed polygon carry
`population: null`. The census publishes NDMC (257,803) and Cantonment (110,351)
totals, but not a defensible charge-level split, so no value is invented. These
areas are analysed for travel time and shown on the map but excluded from
population denominators.

## Sources

| Source | Publisher | Licence | Retrieved | Used for |
| --- | --- | --- | --- | --- |
| OSM relation 1942586 | OpenStreetMap contributors | ODbL 1.0 | 2026-10-25 (OSM snapshot 2026-10-25T00:46:01Z) | Study boundary |
| Delhi municipal wards | DataMeet Municipal_Spatial_Data | CC BY-SA 2.5 India | 2026-10-25 | 272 wards + 18 charges |
| Census 2011 ward PCA (state code 07) | Office of the Registrar General & Census Commissioner, India | Government of India public data | 2026-10-25 | Ward population |
| District population table | Directorate of Economics & Statistics, GNCT Delhi | Government of NCT of Delhi public data | 2026-10-25 | Cross-check of the 16,787,941 NCT total |
| OSM healthcare features | OpenStreetMap contributors | ODbL 1.0 | 2026-10-25 | Facility inventory |
| OSM drivable roads | OpenStreetMap contributors | ODbL 1.0 | 2026-10-25 | Travel-time graph |

Raw files are git-ignored under `data/raw/delhi/`. The fetch script records
SHA-256 checksums in `SOURCES.json`. See [data sources](data-sources.md) for the
full register and limitations.

## What was measured

### Facilities

| Step | Count |
| --- | --- |
| OSM elements in extract | 1,856 |
| Excluded as non-care or out of scope | 472 |
| Duplicates merged (same normalised name within 150 m) | 16 |
| Facilities written | **1,368** |
| Outside study boundary | 0 |
| Unnamed facilities retained | 48 |
| Assigned to a ward | 1,367 |
| With a mapped street address | 957 |
| Operating status unknown | 1,368 |

Categories: 664 hospitals, 357 clinics, 241 dispensaries, 50 health centres, 56
diagnostic laboratories. Services are attributed only from tags: 1,312 primary
care, 64 diagnostics, 29 emergency (`emergency=yes`), 19 maternal health
(birthing centre or obstetric/gynaecology tags). A hospital tagged without an
emergency or maternal tag is **not** counted as providing those services.

Facility presence does not verify staffing, hours, equipment, stock,
affordability, or quality. OSM completeness is unknown; a missing record is not
evidence that care is absent.

### Routing

- 125,452 drivable OSM ways; 532,088 nodes after keeping the largest connected
  component (99.5% of raw nodes); 620,076 undirected edges.
- Class speeds: motorway 80, trunk 60, primary 50, secondary 40, tertiary 35,
  unclassified 30, residential 25, living street 15 km/h; links slightly slower.
  A parsable `maxspeed` tag can only lower the class speed.
- Local access: straight-line × 1.25 at 15 km/h to the nearest road node.
- One-way restrictions, turn restrictions, congestion, public transport,
  walking, and cycling are **not** modelled.
- Zero areas and zero facilities are unreachable in the baseline matrix.

### Baseline findings (maternal health, 15 minutes)

| Metric | Value |
| --- | --- |
| Represented population | 16,000,745 |
| Covered | 13,854,200 (86.58%) |
| Outside the threshold | 2,146,545 people in 35 wards |
| Population-weighted mean | 9.81 min |
| Population-weighted median | 9.58 min |
| Population-weighted p90 | 15.46 min |
| Suitable facilities | 19 |

These are modelled access estimates, not observed care. At the same threshold,
primary care is 100% covered in the mapped inventory (1,312 facilities),
diagnostics is 93.6%, and emergency is 93.1%. The difference is a property of the
mapped inventory and tag completeness, not a measured difference in real service
availability.

## Release manifest

The machine-readable manifest is
`backend/app/data/delhi/dataset.json`, exposed at `/api/v1/meta`. It includes:

- dataset ID, release, status, generator, generation timestamp;
- geography, CRS, area, bounding box, analysis unit;
- population reference year, represented and unrepresented totals;
- counts of areas, populated areas, facilities, road nodes, and edges;
- the source register with URLs, dates, licences, and limitations;
- routing assumptions and warnings;
- validation summary and known gaps;
- capabilities (facility import enabled, area import disabled).

Committed artifacts:

| File | Size | Contents |
| --- | --- | --- |
| `dataset.json` | ~24 KB | Manifest |
| `areas.geojson` | ~1.5 MB | 290 ward/charge polygons |
| `facilities.geojson` | ~1.2 MB | 1,368 facilities with provenance |
| `boundary.geojson` | ~69 KB | NCT boundary |
| `routing.npz` | ~10.6 MB | Road graph, area/facility snaps, baseline matrix, area-to-area matrix |
| `quality.json` | ~23 KB | Detailed validation results |

## Reproduction

```bash
.venv/bin/pip install -r backend/requirements-data.txt
.venv/bin/python backend/scripts/fetch_delhi_sources.py
.venv/bin/python backend/scripts/build_delhi_dataset.py
```

The build is deterministic apart from the generation timestamp. It fails if the
Census join is incomplete or the population total changes unexpectedly. To load
a newly built release into an existing database, run
`backend/scripts/refresh_dataset.py --dataset delhi-pilot`.

## Known issues and gaps

1. **Historical population.** Census 2011 is not current population.
2. **Partial denominator.** 4.7% of the 2011 NCT population is outside the
   denominators; the map marks those areas as population-unavailable.
3. **No vulnerability input.** Equity weighting is disabled. The worst-served
   group is defined by baseline travel time only.
4. **Facility inventory.** OSM completeness and tag quality vary. Operating
   status is unknown for every facility.
5. **Coarse geography.** Ward representative points conceal intra-ward
   differences, including informal settlements.
6. **Routing.** No live traffic, one-way restrictions, turn restrictions,
   public transport, walking, or seasonal access.
7. **Boundary mismatch.** Ward polygons and the OSM boundary differ by 0.35%
   after clipping; 44 wards had slivers outside the boundary removed (10.5 km²).
8. **No authentication.** Mutating endpoints must be disabled or protected
   before public exposure.

The full data-quality report is generated at
[`docs/data-quality-report.md`](data-quality-report.md).
