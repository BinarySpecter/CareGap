# Data licences and attribution

CareGap's **source code** is proprietary and confidential (see `LICENSE`). The
**data files** in `backend/app/data/delhi/` incorporate third-party material and
remain subject to the terms below. These terms apply to the data, not to the
CareGap application code.

## OpenStreetMap (boundary, facilities, roads)

- Licence: **Open Database License (ODbL) 1.0**.
- Attribution: **© OpenStreetMap contributors**.
- Covered files/derivatives: the NCT boundary, the facility inventory, the road
  graph, the routing matrix, and the clipped ward geometry where it incorporates
  OSM data.
- ODbL applies to derivative databases. If you redistribute these data files or a
  derivative database, comply with ODbL attribution and share-alike obligations.
- The public OSM tile service is used only as a basemap; production deployments
  must use a tile provider with an appropriate plan and retain attribution.

## Delhi ward boundaries (DataMeet)

- Licence: **Creative Commons Attribution-ShareAlike 2.5 India**.
- Attribution: DataMeet Municipal_Spatial_Data contributors; original layer
  scraped from the referenced ArcGIS Online municipal map.
- The clipped ward layer distributed in this repository is a derivative and is
  made available under the same CC BY-SA 2.5 India terms for the data.
- Share-alike applies to redistribution of the ward geometry or derivatives.

## Census of India 2011

- Publisher: Office of the Registrar General & Census Commissioner, India.
- The ward-level Primary Census Abstract is a Government of India publication.
- The manifest records the source URL (NADA catalog 42560), retrieval date, and
  reference date. **Confirm the applicable Government of India reuse terms
  before redistributing the population table or a substantial derivative.**
- The district totals PDF from the Directorate of Economics & Statistics, GNCT
  of Delhi, is used only as a cross-check.

## Basemap tiles

© OpenStreetMap contributors. Tile usage is subject to the provider's terms.
The public `tile.openstreetmap.org` service is not intended for production
traffic.

## Code dependencies

Open-source libraries retain their own licences. Versions are pinned in
`backend/requirements*.txt`, `frontend/package-lock.json`, and the Dockerfiles.

## No endorsement

CareGap is not affiliated with, endorsed by, or an official product of
OpenStreetMap, DataMeet, the Government of NCT of Delhi, the Census of India, or
any facility operator.
