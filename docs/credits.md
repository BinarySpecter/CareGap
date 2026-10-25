# Credits and attribution

## Design research

CareGap’s interface was designed after inspecting public reference
implementations from the InstaLanding library. The implementations below informed
principles and interaction patterns; CareGap contains original React/CSS code and
does not redistribute their source, fonts, or assets.

| Reference | URL | Licence / attribution |
| --- | --- | --- |
| InstaLanding.ai library and SKILL | https://instalanding.ai/ · https://instalanding.ai/SKILL.md | MIT |
| Halden Clinical Equipment | https://instalanding.ai/p/halden-clinical-equipment-page.txt · https://instalanding.ai/demos/halden-clinical.html | MIT; credits the 8B Reflow template (https://8b.com/templates/reflow/, MIT) |
| Footnote design system | https://instalanding.ai/s/footnote.txt · https://instalanding.ai/systems/footnote/tokens.css | MIT |
| GEO/LAB Planetary Geography | https://instalanding.ai/p/geo-lab-planetary-geography-page.txt · https://instalanding.ai/demos/geolab-planetary-geography.html | MIT |
| Mirador Observability | https://instalanding.ai/p/mirador-observability-page.txt · https://instalanding.ai/demos/mirador-observability.html | MIT |
| SmartCare Clinical AI (inspected, not adopted) | https://instalanding.ai/p/smartcare-clinical-ai-landing-page.txt | MIT |
| Calibre Grading Bench (inspected, not adopted) | https://instalanding.ai/p/calibre-grading-bench-page.txt | MIT |

The design audit is maintained in [docs/design-audit.md](design-audit.md).
Screenshots are from the running CareGap demo, not from the references.

## Basemap

Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
The demo uses the public OSM raster tile service at low volume. A production
deployment must use an appropriate tile plan and retain attribution.

## Fonts

- Source Serif 4 — Frank Grieshammer et al., SIL Open Font License 1.1.
- Geist — Vercel, SIL Open Font License 1.1.
- JetBrains Mono — JetBrains, SIL Open Font License 1.1.

Fonts are served through Next.js font optimisation from the respective
open-source families.

## Software

CareGap uses open-source libraries (Next.js/React, FastAPI, SQLAlchemy, Shapely,
pyproj, NetworkX, MapLibre GL JS, Recharts, and others) under their respective
licences. Dependency versions are pinned in `frontend/package-lock.json`,
`backend/requirements.txt`, and `backend/requirements-postgres.txt`.

## Dataset and geodata

Delhi pilot:

- Population: Census of India 2011 ward-level Primary Census Abstract, Office of
  the Registrar General & Census Commissioner, India.
- Ward boundaries: DataMeet Municipal_Spatial_Data, CC BY-SA 2.5 India.
- Boundary, facilities, and roads: © OpenStreetMap contributors, ODbL 1.0.
- District population cross-check: Directorate of Economics & Statistics, GNCT
  of Delhi.

The synthetic demo dataset was generated in this repository by
`backend/scripts/generate_demo_data.py` and is clearly labelled. Neither dataset
contains patient-identifiable information. See [data sources](data-sources.md).

Screenshots are captured from the running Delhi workspace with
`frontend/scripts/capture-screenshots.mjs`.

CareGap itself is **proprietary and confidential**; all rights are reserved and
no open-source licence is granted. See `LICENSE`. Data files incorporate
third-party material under separate terms; see
[data licences](data-licenses.md).
