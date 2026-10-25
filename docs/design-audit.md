# CareGap Design Audit

Status: design decision for the public landing page and operational application.
Research date: 2026-10-24. Research method: public HTTP resources, source files, and real
browser screenshots. No InstaLanding MCP connection was used.

## 1. Sources actually inspected

Official library resources:

- `https://instalanding.ai/SKILL.md` — agent workflow, licence, adaptation rules.
- `https://instalanding.ai/prompts.json` — full catalogue metadata (81 entries, MIT).
- `https://instalanding.ai/llms.txt` — catalogue index.
- `https://instalanding.ai/systems.json` — design-system metadata.
- `https://instalanding.ai/motion.json` — motion-study metadata.

Page implementations and briefs inspected in source (not only marketing copy):

| Reference | Brief | Demo source | What was examined |
| --- | --- | --- | --- |
| Halden Clinical Equipment | `halden-clinical-equipment-page.txt` | `halden-clinical.html` and 1440px screenshot | Ink/paper alternation, Geist + Instrument Serif, one cobalt signal, dot-matrix wordmark, 12-check pinned inspection board, mono instrumentation, restrained motion |
| Footnote design system (`footnote@1.0.0`) | system instruction + `tokens.css` + specimen | `footnote-specimen.html` and 1440px screenshot | Source Serif 4 editorial scale, JetBrains Mono labels, warm Flexoki paper, ruled sheets, semantic highlighter marks, quiet motion |
| GEO/LAB Planetary Geography | `geo-lab-planetary-geography-page.txt` | `geolab-planetary-geography.html` (boot state verified, source reviewed) | Contour canvas, reticle/HUD, dot grid, coordinate ticks, ruled instrument cards, measured data annotations |
| Mirador Observability | `mirador-observability-page.txt` | `mirador-observability.html` and 1440px screenshot | Framed data console, persistent rail, context filters, live metric card with real filter-driven values, plate/label hierarchy |
| Calibre Grading Bench | `calibre-grading-bench-page.txt` | `calibre-bench.html` and 1440px screenshot | Evidence/verdict semantics, gauge, claim-by-claim scoring — inspected but not adopted as a primary language |
| SmartCare Clinical AI | `smartcare-clinical-ai-landing-page.txt` | `smartcare-ai.html` and 1440px screenshot | Clinical AI trust cues, HUD ring, governance structure — inspected but rejected as a visual direction |

Licence checks: InstaLanding states MIT for the library. Halden additionally credits the 8B
Reflow template (`https://8b.com/templates/reflow/`, MIT). No reference code, fonts, SVG, or
imagery is copied into CareGap. CareGap uses original implementations of the design
principles below. This document records the attribution lineage.

## 2. Strongest references and why they fit

### Halden Clinical Equipment — clinical credibility and restraint

Halden feels like a working medical service rather than a startup template: ink/paper
alternation, one cobalt signal, monitor green reserved exclusively for live readings, mono
labels, and a dot-matrix wordmark. The 12-check inspection board is the strongest pattern: it
turns an abstract promise into rows of specific, inspectable checks. That is exactly the
register CareGap needs for methodology, model limits, and data provenance.

What to adapt:

- One signal colour for interaction; status colours only for data meaning.
- Persistent mono labels with real units, dataset names, and source status.
- A "model boundary ledger" on the landing page and methodology page that states what is and
  is not modelled, row by row.
- Alternation between paper reading surfaces and dark instrument surfaces.
- Specific typographic contrast: very large display type next to small, tracked mono.

### Footnote — the editorial/public-health voice

Footnote's warm paper, Source Serif 4, mono labels, thin rules, and semantic highlighter
create a human, archival tone. It avoids the sterile SaaS dashboard look. Its rule that a
highlight must mean something (never decoration) is critical for CareGap: highlight only
underserved populations, verified data status, or a named limitation.

What to adapt:

- Source Serif 4 for major statements and numbers, not body UI.
- Warm paper sheets, hairline rules, minimal radii, little or no shadow.
- Uppercase mono kickers and annotations.
- Rough, hand-made highlighter marks for one or two semantic moments per page.
- Quiet motion: reveal and pen-draw, not spectacle.

### GEO/LAB — geospatial instrumentation

GEO/LAB treats a map as an instrument, not wallpaper: contour fields, a pointer reticle,
coordinate rails, measured HUD values, and data-bound waypoints. CareGap should borrow the
information architecture, not the sci-fi cyan cosplay. Replace elevation with travel time,
replace terrain strata with access bands, and use real ward data.

What to adapt:

- Ruled coordinate ticks, scale bars, dot-grid ground, crosshair placement affordances.
- A live "access scanner" visualisation built from the actual API response.
- Data strips that read like instrument output: area ID, population, minutes, facility.
- Map overlays with an explicit legend and source label, not decorative glow.

### Mirador — decision-support console structure

Mirador's best contribution is not its violet glass; it is the operational frame: persistent
rail, compact context filters across the top, a large working canvas, and metric cards whose
values change when the filters change. CareGap's workspace should use that structure with the
calm paper/ink language above.

What to adapt:

- Persistent application rail with labelled destinations.
- A top context bar containing service, threshold, dataset status, and scenario state.
- Main canvas plus a paper inspector panel, not a wall of KPI cards.
- Filter-driven values with visible provenance.

## 3. What would be inappropriate for a serious healthcare product

- Neon cyan/black FUI as the dominant interface. It reads as a game or a spacecraft, undermines
  trust, and hurts long reading sessions.
- Iridescent WebGL or glowing glass used to signal "AI". It implies capability that is not
  evidenced and competes with the map.
- Purple-to-magenta gradients, 3D orbs, and glows (Mirador's palette, Monax's orbs) — attractive
  but generic, and wrong for public-health decision support.
- Orange/red "threat radar" theatre (Calibre). A healthcare gap is not an intrusion alert.
- Fake clinical screenshots, invented facility availability, testimonials, logos, or "98%
  accuracy" claims.
- Scroll hijacking, pinned full-screen sequences, and long intro loaders in a tool people use
  repeatedly.
- Colour-only verdicts. Access bands need labels, patterns, and a legend.
- A landing page that looks like the application dashboard. The landing page must explain;
  the application must operate.

## 4. CareGap design direction: "The Access Ledger"

One coherent language: **a cartographic field ledger meets a calm clinical operations
console**. Warm paper for evidence and explanation; deep ink for maps and instrumentation;
one teal interaction signal; ochre and rose only for measured gaps and warnings.

### Typography

- Display: **Source Serif 4** (400/600/700, italic 400) for headlines and large metric values.
- UI/body: **Geist** (300–600) for navigation, labels, and long interface copy.
- Data/labels: **JetBrains Mono** (400/500) for values, units, coordinates, IDs, and table headers.
- Scale (fluid): display `clamp(2.75rem, 2rem + 4.2vw, 6.4rem)`; section head
  `clamp(2rem, 1.5rem + 2vw, 3.5rem)`; body 15–17px; mono label 10.5–11.5px,
  letter-spacing 0.12–0.14em, uppercase.
- Headlines use tight tracking (−0.02 to −0.035em) and balanced wrapping. No letter-spaced
  serif capital headlines.

### Colour system

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#F7F4EB` | Landing background, app surface |
| `--sheet` | `#FFFDF7` | Raised reading surface |
| `--ink` | `#0C1D1E` | Primary ink, dark map/rail |
| `--field` | `#081A1C` | Dark instrument plates |
| `--ink-2` | `#40514F` | Secondary text |
| `--ink-3` | `#78827B` | Muted annotation |
| `--rule` | `#D8D2C3` | Hairlines and grid |
| `--signal` | `#0E7169` | Interaction, verified, covered |
| `--signal-soft` | `#CBE2DA` | Covered wash |
| `--gap` | `#BC731E` | Outside threshold / attention |
| `--gap-soft` | `#F1DDBE` | Gap wash / highlighter |
| `--critical` | `#A94338` | Highest-severity gap / error |
| `--positive` | `#377A5A` | Improvement / added coverage |
| `--info` | `#2E5C74` | Informational labels |

Rules: teal is the only interactive accent. Ochre and rose are data semantics and never used
for buttons. Never rely on hue alone; pair every band with a label and value.

### Spacing, grid, surfaces

- 4px base scale. Page gutter `clamp(20px, 4vw, 56px)`; max content 1440px.
- Landing uses a visible 12-column ruled grid with hairline separators and margin annotations.
- Sections `clamp(88px, 10vw, 160px)` vertical rhythm; operational pages use a compact 20–28px
  density with clear grouping.
- Surfaces: paper background, sheet panels with 1px rules, radius 4–10px. No glassmorphism.
  Shadows are soft and rare; separation comes from rules and tone.
- Tables use ruled rows, mono numerals, and right-aligned measures.

### Map styling

- Basemap: muted OpenStreetMap raster tiles with a paper background and explicit
  attribution. No live-traffic claim. A production provider with a suitable plan
  is required before scaling tile traffic.
- Choropleth: five ordered access bands from deep teal (within 15 min) through sand to rose
  (outside threshold). Every band has a threshold-labelled legend and the selected threshold is
  drawn explicitly.
- Facilities: ink discs with service-marked centre; proposed facilities: ochre diamond with a
  crosshair; candidate ranks: numbered ochre counters.
- Catchments: thin teal outline and 6–8% fill, never heavy glow.
- Selected areas: 2px ink outline plus a crosshair callout; keyboard users can select from an
  adjacent list.
- Persistent legend, model label ("Synthetic street-grid estimate"), and data notice.
- Placement mode changes the cursor to crosshair and shows a mono instruction chip; points
  outside the district are rejected with an inline error.

### Motion

- One-time entrance reveals (paper sheets sliding 8px, contour lines drawing in once), and
  functional transitions only (map fit, inspector update, simulated scenario).
- No scroll hijacking. No perpetual glow. No entrance loader.
- All animation collapses under `prefers-reduced-motion`.
- Hover states use 1px rule shifts and underline/ink transitions, not scale/shadow jumps.

### Landing vs application

The landing page is an **editorial argument**: a live access scanner built from the API, a
clear problem statement, a working product tour, an intervention-simulator explainer, a data
and model-boundary ledger, and a CTA. It is allowed one dramatic composition and two semantic
highlighter marks.

The application is a **quiet instrument**: no marketing copy, no oversized display type, no
decorative animation inside the map. It is map-first, with persistent context filters, a
labelled rail, paper inspectors, sourced metrics, and working states. The shared type, palette,
rules, and mono annotations keep them recognisably one product.

## 5. Implementation mapping

| Existing CareGap need | Chosen reference logic | Implementation |
| --- | --- | --- |
| Live product proof in hero | GEO/LAB + Mirador | Original SVG access mosaic using real `/overview` GeoJSON; hover/selection; threshold switch; source labels |
| Public positioning | Footnote + Halden | Editorial serif headlines, semantic highlighter, ruled grid, clinical ledger |
| App navigation and context | Mirador | Deep ink rail, paper context bar, service/threshold controls shared across pages |
| Map workspace | GEO/LAB, restrained | MapLibre map, access bands, facility/proposed marker systems, legend, inspector |
| Scenario planning | Mirador + Halden | Configuration panel, map placement, before/after ledger with real API calculations |
| Recommendations | Footnote annotation + Calibre evidence idea | Ranked numbered candidates, component bars, server-generated explanations, methodology/limits |
| Methodology and data pages | Halden inspection board + Footnote | Model-boundary ledger, source register, assumptions, import report |

## 6. Verification commitments

- Implement original React/Tailwind code; do not copy reference HTML/CSS/assets.
- Keep all existing backend calculations, APIs, scenarios, recommendations, and tests.
- Verify desktop (1440), laptop, and mobile (390) renderings in a real browser.
- Check no horizontal overflow, visible focus, reduced-motion behavior, map keyboard fallback,
  loading/empty/error states, and API-derived values.
- Run frontend lint, typecheck, unit tests, production build, backend tests, and CI.
