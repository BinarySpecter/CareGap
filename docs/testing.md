# Testing guide

## Verified results

Last verified locally on 2026-10-25 against the Delhi pilot release
`delhi-pilot-2026.10-r1`:

| Suite | Command | Result |
| --- | --- | --- |
| Backend lint | `cd backend && ../.venv/bin/ruff check app tests` | Passed |
| Backend tests | `cd backend && ../.venv/bin/pytest` | **98 passed** |
| Frontend lint | `cd frontend && npm run lint` | Passed |
| Frontend type check | `cd frontend && npm run typecheck` | Passed |
| Frontend unit tests | `cd frontend && npm test` | **33 passed** (11 files) |
| Production build | `cd frontend && npm run build` | Passed |
| End-to-end | `cd frontend && PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome npx playwright test` | **9 passed** |
| Alembic migration (SQLite) | `alembic upgrade head` / `downgrade base` / `upgrade head` | Passed |
| Existing-data migration | Seed old schema, insert rows, `upgrade head` | Passed (rows preserved, new defaults applied) |
| Alembic migration (PostgreSQL 16/PostGIS 3.4) | Compose database | Passed (up → down → up) |
| Live API against PostgreSQL | Compose database + uvicorn | Passed: `/health`, `/ready`, `/overview` (16,000,745 population, 1,368 facilities, 86.58% maternal coverage at 15 min) |

GitHub Actions was not executed in this offline workspace (no push was
authorized). The equivalent commands were run locally and are listed above; the
remote CI run for the eventual commit is the authoritative CI result. Local
verification alone is not a claim about a newer commit.

## Backend tests (`backend/tests`)

### Release validation (`test_delhi_release.py`)

Reads the committed release directly, without network access:

- dataset ID, release, provenance, source licences, vulnerability availability,
  and capability flags;
- 290 unique area IDs, 272 with population, 18 with `null`, population sum
  16,000,745;
- all 272 MCD ward numbers 1–272 present; municipality classes correct;
- geometry validity, centroid ranges, ward polygons inside the OSM boundary after
  clipping;
- 1,368 unique facilities, allowed categories, non-empty services, OSM source
  IDs/URLs, unknown operational status, coordinates in range;
- facility containment and no same-name duplicates within 150 m;
- tag evidence for every emergency and maternal service;
- routing artifact shapes, finite matrix, symmetric area-to-area matrix, and a
  known facility/area pair recomputed with SciPy;
- quality report and manifest consistency.

### Known-answer analytics (`test_analysis_known_answers.py`)

- Coverage denominator excludes `population: null`; areas with no population are
  still analysed but never counted as zero.
- Distribution totals equal the represented population.
- Dictionary and vectorised analysis paths produce identical summaries and area
  records.
- Additive comparison known answer: newly covered population, coverage gain,
  non-worsening, residual population, and worst-served group.
- Unreachable area with unknown population is not counted.
- Manifest counts and population total are internally consistent.

### Packaged router (`test_network_routing.py`)

- Router metadata, graph size, area/facility counts.
- Known area/facility pair equals the packaged matrix.
- Proposed facility at a ward representative point is fast, finite, and
  consistent between dictionary and array paths.
- A new facility inside Delhi routes to all 290 areas.
- Corrupt or wrong-shaped release artifacts raise clear errors.

### Delhi API (`test_delhi_api.py`)

- `/api/v1/meta` identifies `delhi-pilot`, release, counts, 2011 population,
  787,196 unrepresented people, unavailable vulnerability, disabled area imports,
  OSM routing, and a non-synthetic data notice.
- Overview known answer: 16,000,745 total, 13,854,200 covered, 86.58%,
  35 wards outside, 19 maternal facilities, 290 areas, 18 without population.
- Primary care is saturated at 15 minutes (100%).
- Facility list exposes OSM provenance and 29 emergency facilities.
- Scenario uses the active dataset, recomputes, never counts proposed facilities
  as existing, reports zero worsened areas, and includes release provenance.
- Recommendations expose `dataset_id`, release, `vulnerability_available=false`,
  equity weight 0, non-zero candidate gains, and a non-empty greedy set.
- Facility import works and is dataset-scoped; area import returns 403.
- Read-only mode blocks scenario creation and imports while GETs work.
- `/ready`, `/health`, docs toggle, and missing-release failure without a
  synthetic fallback.
- No synthetic records under the Delhi label.

### Existing demo and engine tests

Geographic validation, projection round-trips, synthetic routing and labelled
fallback, service suitability, threshold monotonicity, weighted statistics,
non-worsening invariant, equity construction, ranking determinism, import
validation, API contracts, CORS, error shape, pagination, and file-size limits.

### Run

```bash
cd backend
../.venv/bin/ruff check app tests
../.venv/bin/pytest
```

Tests use isolated temporary SQLite databases and committed release fixtures.
They do not call external networks.

## Frontend unit tests (`frontend/src/**/*.test.ts(x)`)

- Number, percentage, minutes, coordinate, and signed-change formatting.
- Access-band boundaries, map colour expressions, improvement semantics, and
  coverage statistics with nullable population.
- Point-in-polygon and multipolygon boundary validation.
- API URL building, success parsing, server errors, and network failure messages.
- Accessible service/threshold controls and callbacks.
- Metric tiles, error retry, empty state, inspector content (including
  population/vulnerability unavailable and no-facility cases), distribution
  accessibility, and live API-derived problem statistics.

### Run

```bash
cd frontend
npm test
```

## End-to-end tests (`frontend/e2e/caregap.spec.ts`)

Playwright starts the backend and Next dev server, using an isolated SQLite file
at `/tmp/caregap-e2e.db`. The backend runs the Delhi profile by default.

Covered flows:

1. Landing loads, consumes the live overview API, renders the access scanner with
   Delhi/Census labels, and has no horizontal overflow at desktop width.
2. Overview loads MapLibre (worker, canvas, no map error) and API-computed values.
3. Explore ranks areas, searches a Delhi ward, updates the inspector, downloads a
   CSV, and the CSV includes dataset ID, release, and population status.
4. Simulator places a suggested gap site, runs the scenario, compares on-screen
   newly covered population with a fresh API recomputation, switches map views,
   and exposes assumptions.
5. Impact analytics selects the saved scenario, recomputes it, and shows equity,
   residual gaps, and the scenario map.
6. Recommendations render ranked candidates, explanations, score components, and
   the strategy comparison; rerunning with maximum coverage works.
7. Data Sources validates a real Delhi facility CSV and shows the report/history.
8. Methodology shows testing, limitations, and design record.
9. Mobile workspace navigation opens/closes a dialog and has no horizontal
   overflow at 390 px.

### Run locally

```bash
cd frontend
npx playwright install chromium
# Or use an existing system Chrome:
PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome npx playwright test
```

The config starts servers itself (`reuseExistingServer: false`). Ensure ports
3000 and 8000 are free. HTML report: `playwright-report/`.

## Database and PostGIS verification

SQLite:

```bash
cd backend
CAREGAP_DATABASE_URL=sqlite:////tmp/caregap-migration.db ../.venv/bin/alembic upgrade head
CAREGAP_DATABASE_URL=sqlite:////tmp/caregap-migration.db ../.venv/bin/alembic downgrade base
CAREGAP_DATABASE_URL=sqlite:////tmp/caregap-migration.db ../.venv/bin/alembic upgrade head
```

PostgreSQL 16 + PostGIS 3.4 (Docker Compose), verified locally:

1. `POSTGRES_PASSWORD=<local> docker compose up -d db`.
2. `CAREGAP_DATABASE_URL=postgresql+psycopg://... alembic upgrade head`,
   `downgrade base`, `upgrade head`.
3. Started the API against PostgreSQL; `/health`, `/ready`, and `/overview`
   returned the Delhi release and known coverage values.
4. Removed the Compose stack and local `.env` afterwards; no credentials remain.

## What is not covered

- Load/performance testing at scale, concurrency, or built-in rate limits.
- Real routing-engine integration (OSRM/Valhalla) or live traffic.
- Authentication, authorisation, or audit logging (not implemented).
- Screen-reader testing with NVDA/VoiceOver (keyboard focus, labels, and
  reduced-motion behaviours were implemented).
- Browser matrix beyond Chromium (Firefox/WebKit).
- Visual regression snapshots.
- The complete three-container Compose orchestration in one command. The
  database migration and API-on-PostgreSQL path were verified, and both images
  were built and run individually (web on port 3002 against the live API).
- Public deployment (not performed).

Do not weaken or remove a failing assertion to make a build pass. Fix the cause
or document a justified expectation change.
