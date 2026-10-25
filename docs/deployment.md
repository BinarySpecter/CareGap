# Deployment guide

**Status: not deployed.** No public endpoint, domain, database service, or paid
resource has been created. The steps below are prepared and locally verified
where stated; public deployment requires the security review in
[docs/security.md](security.md).

## Configuration

Copy `.env.example` to `.env` locally. Never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `CAREGAP_ENV` | Environment label (`development`/`production`). |
| `CAREGAP_ACTIVE_DATASET` | `delhi-pilot` (default) or `caregap-demo`. |
| `CAREGAP_DATABASE_URL` | SQLAlchemy URL. SQLite default; PostgreSQL via `postgresql+psycopg://...`. |
| `CAREGAP_CORS_ORIGINS` | Comma-separated allowed frontend origins. |
| `CAREGAP_LOG_LEVEL` | Python logging level. |
| `CAREGAP_MAX_IMPORT_BYTES` | Upload limit; default 2 MB. |
| `CAREGAP_READ_ONLY` | `true` disables scenario creation and imports. |
| `CAREGAP_ENABLE_DOCS` | `false` disables `/docs`, `/redoc`, `/openapi.json`. |
| `CAREGAP_ALLOWED_HOSTS` | Comma-separated TrustedHost allow-list; empty disables the check. |
| `CAREGAP_DATASET_DIR` | Optional absolute path to a release directory. |
| `NEXT_PUBLIC_API_URL` | Public API origin, baked into the Next client at build time. |
| `POSTGRES_*` | Compose database credentials (placeholders only in `.env.example`). |

## Local (SQLite, no Docker)

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd backend
../.venv/bin/uvicorn app.main:app --reload --port 8000
# second terminal
cd frontend
npm ci
npm run dev
```

The API creates the database, validates the committed release, and builds the
routing model. Delete `backend/caregap.db` to reset. A missing or invalid
real-data release stops startup with an actionable error.

## Docker Compose (PostgreSQL + PostGIS)

```bash
cp .env.example .env
# Replace POSTGRES_PASSWORD in .env with a local-only value.
docker compose up --build
```

Services:

- `db`: `postgis/postgis:16-3.4`, health check, PostGIS extension init.
- `api`: Python 3.12 image; runs `alembic upgrade head` then uvicorn on port 8000.
- `web`: multi-stage Node 24 image using Next standalone output on port 3000.

Defaults: web <http://localhost:3000>, API <http://localhost:8000/docs>.

**Verified locally:** PostgreSQL 16 + PostGIS 3.4 migration upgrade → downgrade
→ upgrade, a live API run against PostgreSQL (Delhi release, 16,000,745
population, 1,368 facilities, 86.58% maternal coverage at 15 minutes), the
readiness probe, and both Docker images. The backend image was run and
health-checked; the web image was run on port 3002 against the live API, and the
landing page and workspace loaded with the Delhi map and 86.6% coverage. The
complete three-container Compose orchestration was not run in one command;
validate it in your environment before relying on it.

## Production-style run

### Backend

```bash
cd backend
CAREGAP_ENV=production \
CAREGAP_ACTIVE_DATASET=delhi-pilot \
CAREGAP_DATABASE_URL='postgresql+psycopg://user:password@host:5432/caregap' \
CAREGAP_CORS_ORIGINS='https://your-web-origin.example' \
CAREGAP_READ_ONLY=true \
CAREGAP_ENABLE_DOCS=false \
CAREGAP_ALLOWED_HOSTS='api.your-domain.example' \
../.venv/bin/alembic upgrade head
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

Do not run multiple workers with SQLite for writes. For PostgreSQL, SQLAlchemy
connections are pooled and request-scoped. `psycopg[binary]` is required for
PostgreSQL (`backend/requirements-postgres.txt`).

### Frontend

```bash
cd frontend
NEXT_PUBLIC_API_URL='https://api.your-domain.example' npm run build
npm run start
# or use the provided Docker image / Next standalone server
```

`next start` warns with `output: "standalone"`; the standalone server or the
Docker image is the supported production path.

### Reverse proxy

Terminate TLS at a reverse proxy or platform edge. Add:

- HTTPS/HSTS, request size limits, timeouts, and per-IP rate limits;
- a strict CORS origin (the API also enforces `CAREGAP_CORS_ORIGINS`);
- `CAREGAP_ALLOWED_HOSTS` matching the public API host;
- access logs without query strings that could contain sensitive data;
- health checks on `/health` and `/ready`.

No specific reverse proxy or hosting account has been configured or tested.

## Database, migrations, and PostGIS

- Alembic is the schema authority. The API also calls `create_all` for local
  convenience; do not rely on it for controlled migrations.
- Migrations: `af8d1f78b2a6` (initial) → `3c9a1e6f2b10` (nullable population,
  provenance columns, range constraints). Verified on SQLite and PostgreSQL,
  including an upgrade with existing rows preserved.
- GeoJSON is stored in JSON columns. PostGIS is enabled in Compose for future
  native geometry adoption; do not claim PostGIS spatial indexes are in use.
- Use a least-privilege database user, TLS, connection limits, and backups.

## Dataset release refresh

Build a new release offline:

```bash
.venv/bin/pip install -r backend/requirements-data.txt
.venv/bin/python backend/scripts/fetch_delhi_sources.py
.venv/bin/python backend/scripts/build_delhi_dataset.py
```

Then replace the stored release deliberately:

```bash
cd backend
CAREGAP_DATABASE_URL=... ../.venv/bin/python scripts/refresh_dataset.py \
  --dataset delhi-pilot --keep-scenarios
```

Normal startup **refuses** to replace a stored dataset whose release ID differs
from the packaged release. This prevents silent data swaps. After a refresh,
re-simulate saved scenarios and re-check exports. Scenario coordinates may no
longer match new ward geography.

## Backup and recovery

- SQLite: stop the API, copy `backend/caregap.db` (or use `sqlite3 .backup`),
  store it encrypted, and test restore on a separate path.
- PostgreSQL: use `pg_dump --format=custom` on a schedule, retain WAL/point-in-
  time recovery if the provider supports it, and test a restore into a scratch
  database before relying on it.
- The committed dataset release is reproducible from public sources and checksums
  in `data/raw/delhi/SOURCES.json`. Back it up with the repository or release
  artifact.
- Recovery: restore the database, run `alembic upgrade head`, start the API, and
  verify `/ready` plus a known coverage query.

## Rollback outline

1. Stop the API and web processes/containers.
2. Restore the previous database backup or run `alembic downgrade` to the prior
   revision if the schema change is reversible.
3. Check out the previous application release and rebuild the web image with the
   matching `NEXT_PUBLIC_API_URL`.
4. If the dataset changed, restore the previous `backend/app/data/delhi/`
   release and run the refresh script or restore the database.
5. Start the API, verify `/health` and `/ready`, then run the demo script.

## Deployment verification checklist

- [ ] `alembic upgrade head` succeeds on a clean database.
- [ ] `/health` returns the expected dataset, release, and routing model.
- [ ] `/ready` returns 200.
- [ ] `/api/v1/meta` shows the release, population year, represented population,
      source dates, and vulnerability availability.
- [ ] Overview shows the expected coverage for a known service/threshold.
- [ ] A population-unavailable area is visible and excluded from denominators.
- [ ] A scenario can be created and simulated (or returns 403 in read-only mode).
- [ ] An export contains dataset ID, release, population year, and routing model.
- [ ] CORS allows only the production origin.
- [ ] `/docs` is disabled if not intended to be public.
- [ ] No secrets in the client bundle or repository.
- [ ] `npm audit` and `pip-audit` are clean or findings are documented.
- [ ] Read-only mode is enabled for a public demo and the UI disables imports
      and scenario creation.
- [ ] Backup restore has been tested.
- [ ] A second person completes the [demo script](demo-script.md) unaided.

## Hosting arrangement (prepared, not provisioned)

A practical arrangement compatible with this project:

- **Web:** a Node 24 container host or Vercel.
- **API:** a container host or VM running the backend image with 2 workers.
- **Database:** managed PostgreSQL 16 with PostGIS available, backups, and
  point-in-time recovery.
- **Tiles:** a tile provider with an appropriate plan and attribution. The public
  OSM tile endpoint is for low-volume demo use only.
- **Edge:** TLS, rate limits, request size limits, and WAF.

No provider-specific configuration has been tested or deployed. Do not claim a
public deployment until it has actually been performed and verified.

## CI

`.github/workflows/ci.yml` runs:

- Backend lint, tests, SQLite migration validation, and PostgreSQL migration
  validation using a PostGIS service.
- Frontend lint, typecheck, unit tests, and production build.
- Playwright E2E with backend and frontend started by the test config against
  the Delhi release.

Local verification for this release: 98 backend tests, 33 frontend unit tests,
9 Playwright tests, frontend build, SQLite and PostgreSQL migrations, and both
Docker images. GitHub Actions was not run in this offline workspace; the remote
run for the eventual commit is the authoritative CI result.
