# Testing guide

## Verified results

Last verified locally on 2026-10-25:

| Suite | Command | Result |
| --- | --- | --- |
| Backend lint | `cd backend && ../.venv/bin/ruff check app tests` | Passed |
| Backend tests | `cd backend && ../.venv/bin/pytest -q` | 64 passed |
| Frontend lint | `cd frontend && npm run lint` | Passed |
| Frontend type check | `cd frontend && npm run typecheck` | Passed |
| Frontend unit tests | `cd frontend && npm test` | 29 passed (10 files) |
| Production build | `cd frontend && npm run build` | Passed |
| End-to-end | `cd frontend && npx playwright test` | 9 passed |
| Alembic migration (SQLite) | `alembic upgrade head` | Passed |
| Alembic + app against PostgreSQL 16/PostGIS 3.4 | Compose DB + local API | Passed (schema, 96 seeded areas, overview) |

**CI verified:** GitHub Actions run
[40145309253](https://github.com/BinarySpecter/CareGap/actions/runs/40145309253)
passed all three jobs on commit `b55f0a4`: backend lint/tests/migrations
(SQLite and PostgreSQL/PostGIS), frontend lint/typecheck/tests/build, and the
Playwright E2E suite. Re-check the latest run for subsequent commits; local
verification alone is not a claim about a newer commit.

## Backend tests (`backend/tests`)

### Unit and invariant coverage

- Geographic validation and projection round-trips.
- Haversine sanity checks.
- Empty, connected, and fallback routing models; explicit routing labels.
- Every area receives a finite time from suitable facilities.
- Adding a facility never increases any area’s nearest time.
- Service suitability: diagnostic-only facilities do not cover primary care.
- No-suitable-facility areas are uncovered with `None` travel time.
- Threshold changes do not change travel times but do change coverage
  monotonically.
- Population coverage and distribution totals match area population.
- Weighted mean/median/p90 are bounded by the actual values.
- Comparison deltas equal proposed minus baseline; no wards worsen.
- Equity group construction and improvement.
- Candidate ranking determinism, score bounds, non-negative benefits, incremental
  greedy sets, strategy comparison, service compatibility, and invalid inputs.
- Import CSV/GeoJSON parsing, coordinates, service validation, duplicate
  detection, boundary rejection, invalid population/geometry, and format errors.
- API health/meta/overview/analysis/facility/area endpoints, scenario validation
  and round-trip simulation, recommendation contract, imports and history,
  CORS, error shape, pagination, and file-size limits.

### Run

```bash
cd backend
../.venv/bin/ruff check app tests
../.venv/bin/pytest -q
```

Tests use isolated temporary SQLite databases and fixtures from the synthetic
demo GeoJSON. Tests do not call external networks.

## Frontend unit tests (`frontend/src/**/*.test.ts(x)`)

- Number, percentage, minutes, coordinate, and signed-change formatting.
- Access-band boundaries, map colour expressions, improvement semantics,
  ranking, and coverage statistics.
- Point-in-polygon and multipolygon boundary validation.
- API URL building, success parsing, server errors, and network failure messages.
- Accessible service/threshold controls and callbacks.
- Metric tiles, error retry, empty state, inspector content (including no-facility
  cases), distribution accessibility, and live API-derived problem statistics.
- No test asserts a hard-coded fabricated KPI that is disconnected from the API.

### Run

```bash
cd frontend
npm test
```

## End-to-end tests (`frontend/e2e/caregap.spec.ts`)

Playwright starts the backend and Next dev server, using an isolated SQLite file
at `/tmp/caregap-e2e.db`. The backend webServer command enforces
`CAREGAP_DATABASE_URL` and CORS for the test origins.

Covered flows:

1. Landing loads, consumes the live overview API, renders the access scanner, and
   has no horizontal overflow at desktop width.
2. Overview loads MapLibre (worker, canvas, no map error) and API-computed values.
3. Explore ranks areas, filters, updates the inspector, and downloads a real CSV.
4. Simulator places a suggested gap site, runs the scenario, compares on-screen
   newly covered population with a fresh API recomputation, switches map views,
   and exposes assumptions.
5. Impact analytics selects the saved scenario, recomputes it, and shows equity,
   residual gaps, and scenario map.
6. Recommendations render ranked candidates, explanations, score components, and
   the strategy comparison; rerunning with maximum coverage works.
7. Data Sources validates a real CSV upload and shows the import report/history.
8. Methodology shows the invariant, limitations, and design record.
9. Mobile workspace navigation opens/closes a dialog and has no horizontal
   overflow at 390 px.

### Run locally

```bash
cd frontend
npx playwright install chromium
# If using an existing system Chrome instead of the Playwright cache:
PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome npx playwright test
```

The config starts servers itself (`reuseExistingServer: false`). Ensure ports
3000 and 8000 are free. HTML report: `playwright-report/`.

## Database and PostGIS verification

SQLite migration:

```bash
cd backend
CAREGAP_DATABASE_URL=sqlite:////tmp/caregap-migration.db \
  ../.venv/bin/alembic upgrade head
```

PostgreSQL verification performed manually:

1. `POSTGRES_PASSWORD=<local> docker compose up -d db` (PostGIS 16-3.4).
2. `alembic upgrade head` with `CAREGAP_DATABASE_URL=postgresql+psycopg://...`.
3. Started the API against PostgreSQL; `/health` passed, `/overview` returned 96
   areas and the expected 81.41% baseline coverage.
4. Confirmed 96 rows in `areas` and the `postgis` extension installed.

The compose init file mount includes SELinux relabelling (`:ro,Z`) for Fedora.

## What is not covered

- Load/performance testing at scale, concurrency, or rate limits.
- Real routing-engine integration or real facility data validation.
- Authentication, authorisation, or audit logging (not implemented).
- Screen-reader testing with NVDA/VoiceOver (manual accessibility review only;
  keyboard focus, labels, and reduced-motion behaviours were implemented).
- Browser matrix beyond Chromium (Firefox/WebKit).
- Visual regression snapshots.
- The full three-container Docker Compose stack. Both backend and web images were
  built successfully; the backend container was run and health-checked. The web
  container runtime and Compose end-to-end path are not yet verified.

Do not weaken or remove a failing assertion to make a build pass. Fix the cause
or document a justified expectation change.
