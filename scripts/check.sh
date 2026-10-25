#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -x .venv/bin/python ]]; then
  echo "Backend virtualenv not found. Run: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "Frontend dependencies not found. Run: cd frontend && npm ci" >&2
  exit 1
fi

echo "== Backend lint =="
(cd backend && ../.venv/bin/ruff check app tests)

echo "== Backend tests =="
(cd backend && ../.venv/bin/pytest -q)

echo "== Frontend lint =="
(cd frontend && npm run lint)

echo "== Frontend type check =="
(cd frontend && npm run typecheck)

echo "== Frontend unit tests =="
(cd frontend && npm test)

echo "== Frontend production build =="
(cd frontend && npm run build)

echo "== SQLite migrations =="
rm -f /tmp/caregap-check-migrate.db
(cd backend && CAREGAP_DATABASE_URL=sqlite:////tmp/caregap-check-migrate.db ../.venv/bin/alembic upgrade head)
(cd backend && CAREGAP_DATABASE_URL=sqlite:////tmp/caregap-check-migrate.db ../.venv/bin/alembic downgrade base)
(cd backend && CAREGAP_DATABASE_URL=sqlite:////tmp/caregap-check-migrate.db ../.venv/bin/alembic upgrade head)

echo "All local checks passed."
echo "Optional E2E: cd frontend && PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome npx playwright test"
