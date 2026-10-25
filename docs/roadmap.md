# Roadmap

## Shipped in v0.1

- [x] Deterministic synthetic demo dataset and generator.
- [x] FastAPI analysis API with SQLite persistence and Alembic migration.
- [x] Service-suitable nearest-facility travel-time analysis and weighted metrics.
- [x] Interactive MapLibre overview with legend, catchment, and ward inspector.
- [x] Ranked gap explorer with search, filters, sorting, and CSV export.
- [x] Intervention simulator with map placement, real recomputation, before/after,
      equity, residual gaps, and assumptions.
- [x] Candidate ranking with visible components, explanations, concentration
      penalty, greedy sets, and strategy comparison.
- [x] Impact analytics for saved scenarios with charts and residual-gap map.
- [x] Validated facility/area import path with duplicate detection and history.
- [x] Public landing page with live API-driven access scanner.
- [x] Responsive design, reduced-motion handling, loading/empty/error states.
- [x] Backend, frontend, and E2E test suites.
- [x] CI, Dockerfiles, Compose PostgreSQL/PostGIS path, design audit, governance docs.

## Next priorities

1. **Authentication and planning workspaces** — accounts, roles, audit trail,
   saved plans, and team review before any public deployment.
2. **Real district pilot** — licence-cleared facility inventory, authoritative
   population, stakeholder review, and a documented data-quality score.
3. **PostGIS-native geometry** — migrate area and facility geometries, add spatial
   indexes and reproducible spatial data migrations.
4. **Routing service integration** — self-hosted OSRM/Valhalla, realistic travel
   modes, scheduled network updates, and explicit traffic limitations.
5. **Capacity-aware access** — service capacity, staffing, and opening hours with
   uncertainty bands rather than misleading point estimates.
6. **Equity inputs** — governed vulnerability measures with provenance,
   community participation, and sensitivity analysis.
7. **Optimisation experiments** — compare greedy coverage/equity results with
   integer programming or simulated annealing on small candidate sets, retaining
   the deterministic baseline.
8. **Accessibility and performance audit** — screen-reader testing, WCAG review,
   large-dataset performance, and rate limits.
9. **Deployment** — managed Postgres, TLS, observability, backups, tile provider,
   security review, and a staging environment.

## Explicit non-goals for v0.1

- Clinical decision-making or diagnosis.
- Individual patient access or personal health information.
- Live traffic claims.
- Global optimality claims for the heuristic.
- Public deployment without authentication and security review.
