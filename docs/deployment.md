# Deployment guide

**Status: not deployed.** No public endpoint has been created, no domain was
purchased, and no hosting charges were incurred. Public deployment requires the
security review below.

## Configuration

Copy `.env.example` to `.env` locally. Never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `CAREGAP_ENV` | Environment label (`development`/`production`). |
| `CAREGAP_DATABASE_URL` | SQLAlchemy URL. SQLite default; PostgreSQL via `postgresql+psycopg://...`. |
| `CAREGAP_CORS_ORIGINS` | Comma-separated allowed frontend origins. |
| `CAREGAP_LOG_LEVEL` | Python logging level. |
| `CAREGAP_MAX_IMPORT_BYTES` | Upload limit; default 2 MB. |
| `NEXT_PUBLIC_API_URL` | Public API origin, baked into the Next client at build time. |
| `POSTGRES_*` | Compose database credentials (placeholders only in `.env.example`). |

## Local Docker Compose (verified database path)

```bash
cp .env.example .env
# Set a local-only POSTGRES_PASSWORD in .env.
docker compose up --build
```

Services:

- `db`: `postgis/postgis:16-3.4` with a health check and `postgis` extension init.
- `api`: Python 3.12 image; runs `alembic upgrade head` then uvicorn on port 8000.
- `web`: multi-stage Node 24 image using Next standalone output on port 3000.

Defaults: web <http://localhost:3000>, API <http://localhost:8000/docs>.
`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`; rebuild the web image
with a different build arg for a remote API.

Verification performed: PostgreSQL 16 + PostGIS 3.4 service, Alembic migration,
seeded demo data, health endpoint, and overview response; both backend and web
Docker images built successfully; the backend image was run and health-checked.
The complete three-container Compose stack and the web container runtime have not
yet been run end-to-end and must be validated before deployment. The checked-in
`.dockerignore` files keep build contexts small and exclude local secrets.

## Manual production-style run

### Backend

```bash
cd backend
CAREGAP_ENV=production \
CAREGAP_DATABASE_URL='postgresql+psycopg://user:password@host:5432/caregap' \
CAREGAP_CORS_ORIGINS='https://your-web-origin.example' \
../.venv/bin/alembic upgrade head
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

Do not run multiple workers with SQLite for writes. For Postgres, SQLAlchemy
connections are pooled and request-scoped. `psycopg[binary]` is required for
PostgreSQL (`backend/requirements-postgres.txt`).

### Frontend

```bash
cd frontend
NEXT_PUBLIC_API_URL='https://your-api-origin.example' npm run build
# Use the provided Docker image, or the Next standalone server:
#   copy .next/static and public into .next/standalone, then: node .next/standalone/server.js
```

`next start` warns with `output: "standalone"`; the standalone server or the
Docker image is the supported production path.

### Database and PostGIS

- Keep Alembic as the schema authority. The API also calls `create_all` on
  startup for local convenience; do not rely on it for controlled migrations.
- Today, GeoJSON is stored in JSON columns; PostGIS is enabled in Compose for
  future native geometry adoption. Do not claim PostGIS spatial indexes are in
  use until that migration is implemented.
- Configure backups, connection limits, TLS, and least-privilege database users.

## Hosting options

The app can run on:

- **Web:** Vercel, a Node 24 container host, or the Docker image on a VM.
- **API:** Render, Fly.io, Railway, or a VM running the backend image. A Python
  3.12 runtime or the provided Docker image is required.
- **Database:** managed PostgreSQL 16 with the PostGIS extension available.
- **Tiles:** a production tile provider with attribution and a plan that permits
  your traffic. The public OSM tile endpoint is for low-volume demo use only.

No provider-specific configuration has been tested or deployed.

## Pre-publication security checklist

- [ ] Add authentication and role-based authorisation (public-health planner,
      analyst, administrator, viewer).
- [ ] Add per-user/per-IP rate limiting and request size limits at the edge.
- [ ] Restrict CORS to the exact production origin.
- [ ] Enable TLS everywhere, HSTS, secure cookies if sessions are added.
- [ ] Move secrets to a managed secret store; rotate the local demo password.
- [ ] Use a least-privilege DB user; enable backups and point-in-time recovery.
- [ ] Add audit logging for scenario creation and imports; do not log PHI.
- [ ] Add structured error tracking and uptime monitoring without sensitive data.
- [ ] Run dependency scanning and container image scanning.
- [ ] Complete accessibility testing and a public-health domain review.
- [ ] Review the dataset licence/provenance and publish source dates.
- [ ] Replace synthetic data with clearly sourced data, or keep the synthetic
      label and prevent policy use.
- [ ] Add a real tile provider and review OSM attribution.
- [ ] Perform a privacy impact assessment and confirm no patient data is ever
      accepted.

## CI

`.github/workflows/ci.yml` runs:

- Backend lint, tests, SQLite migration validation, and PostgreSQL migration
  validation using a PostGIS service.
- Frontend lint, typecheck, unit tests, and production build.
- Playwright E2E with backend and frontend started by the test config.

Check the actual workflow run for the pushed commit before claiming CI passes.
