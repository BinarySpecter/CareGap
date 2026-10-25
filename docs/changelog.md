# Changelog

All notable changes to CareGap are recorded here. The format follows a practical
interpretation of Keep a Changelog; versions follow semantic versioning for the
application, while the API is separately versioned (`v1`).

## [0.2.0] — 2026-10-25

### Added — Delhi pilot

- Real-data release `delhi-pilot-2026.10-r1`: NCT of Delhi boundary, 290 ward/
  charge polygons, 272 Census 2011 ward populations (16,000,745 represented),
  1,368 OpenStreetMap facilities, and an OSM road graph with a packaged baseline
  travel-time matrix.
- Reproducible data pipeline: documented/checksummed source fetch, deterministic
  build with validation, boundary clipping, facility deduplication, routing
  matrix generation, and a generated data-quality report.
- Dataset profile registry with explicit `delhi-pilot` and `caregap-demo`
  profiles, active-profile selection, release IDs, and startup refusal on release
  mismatch or missing real data. No synthetic fallback.
- Nullable population and vulnerability: population-unavailable areas are
  excluded from denominators and shown explicitly; equity weighting is disabled
  when no validated vulnerability input exists.
- Dataset-scoped API queries, provenance in responses and exports, `/ready`
  endpoint, read-only mode, docs toggle, optional TrustedHost middleware, and
  OSM facility provenance fields.
- Vectorised analysis path and precomputed area-to-area matrix: recommendations
  run in ~2 seconds; scenario simulation in ~0.1–0.2 seconds.
- Migration `3c9a1e6f2b10`: nullable population/vulnerability, provenance
  columns, range constraints; verified on SQLite and PostgreSQL 16/PostGIS 3.4.
- New tests: Delhi release validation, known-answer analytics, packaged router,
  Delhi API contracts, read-only and missing-release failure paths. Totals: 98
  backend, 33 frontend, 9 Playwright.
- Updated landing page, workspace labels, data-sources page, methodology page,
  screenshots, and documentation for the Delhi pilot.

### Changed

- Default service lens is maternal health at 15 minutes; primary care is
  near-saturated in the mapped inventory.
- Default active dataset is `delhi-pilot`.
- API version label is 0.2.0; OpenAPI is served from the app factory.
- Real-data facility imports remain enabled; population-area imports are
  disabled for the Delhi release.

### Known limitations

- Census 2011 historical population; 4.7% of the 2011 NCT population is outside
  the denominators.
- No validated vulnerability input; equity weighting unavailable.
- OSM completeness and service tags unverified; no operating status.
- No live traffic, one-way restrictions, public transport, or walking.
- No authentication or built-in rate limiting; use read-only mode and edge
  controls for a public demo.

## [0.1.0] — 2026-10-25

### Added

- Deterministic synthetic Demo District generator with 96 areas, 6 facilities,
  a 2.0 km street grid, population, vulnerability, provenance, and limitations.
- FastAPI `/health`, `/api/v1/meta`, `/overview`, `/facilities`, `/areas`,
  `/accessibility`, `/analysis`, `/scenarios`, simulation (GET/POST),
  `/recommendations`, and validated data import/history routes.
- SQLAlchemy data model, idempotent demo seed, Alembic initial migration, SQLite
  default and verified PostgreSQL support.
- Service-suitable nearest-facility travel-time analysis with weighted mean,
  median, p90, coverage, distribution, equity group, and non-worsening invariant.
- Greedy candidate ranking with coverage/equity/travel components, concentration
  penalty, explanations, and max-coverage vs equity-weighted comparison.
- CSV/GeoJSON facility and area imports with schema, coordinate, geometry,
  population, boundary, duplicate, size, and row-limit validation; import history.
- Next.js 16 application with public landing page and seven workspace views.
- Live API-driven access scanner, MapLibre access surface, facility/proposed/
  candidate markers, legends, ward inspector, and CSV export.
- Intervention simulator with map placement and manual coordinate entry,
  baseline/proposed/change views, before/after metrics, equity, and assumptions.
- Impact analytics for saved scenarios with distribution/improvement charts,
  residual gaps, scenario map, and equity.
- Data source register, provenance export, import UI, and methodology page.
- Test suites: 64 backend, 29 frontend unit/integration, 9 Playwright E2E.
- GitHub Actions CI (verified green: backend, frontend, E2E), Dependabot,
  Dockerfiles, Compose stack with PostgreSQL/PostGIS.
- Governance and documentation: README, architecture, API, methodology, data
  sources, testing, deployment, design audit, credits, roadmap, changelog,
  contributing, security, code of conduct, issue/PR templates.

### Design

- "Access Ledger" design language: warm paper, deep ink, one teal interaction
  signal, ochre/rose only for data semantics, Source Serif 4 + Geist + JetBrains
  Mono, restrained motion, semantic highlighter marks.
- Original implementation informed by inspected InstaLanding references; no
  third-party code or assets copied. See `docs/design-audit.md`.

### Known limitations

- Synthetic demo data; no real district or facilities.
- Travel-time model uses a synthetic grid, no live traffic.
- Capacity, staffing, hours, cost, quality, and outcomes are not modelled.
- Candidate ranking is a heuristic, not globally optimal.
- No authentication or public deployment.
- PostGIS is enabled in Compose but not used for native geometry yet.
