# Security and privacy review

**Scope:** CareGap v0.2.0, Delhi pilot, local/pilot deployment. This is a
review record, not a certification. No legal, security, or regulatory compliance
is claimed.

## Data and privacy

- No patient-identifiable information is collected, accepted, or required.
- The release contains area-level Census 2011 aggregates and public map data.
- Facility imports accept only facility metadata; do not upload patient records.
- No authentication or user accounts exist, so no personal account data is stored.
- Logs record request method/path and errors; they do not log request bodies,
  import file contents, or secrets.

## Implemented controls

| Area | Control |
| --- | --- |
| Secrets | Read from environment variables; `.env` is gitignored; only placeholders in `.env.example`. |
| CORS | Allow-list from `CAREGAP_CORS_ORIGINS`; credentials disabled. |
| Host header | Optional TrustedHost middleware via `CAREGAP_ALLOWED_HOSTS`. |
| Headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`, API `Cache-Control: no-store`. |
| Errors | Unhandled exceptions return a generic 500; stack traces and database internals are not exposed. |
| Uploads | Size limit (2 MB default), UTF-8/schema validation, row cap (5,000), no path traversal from filenames, no code execution. |
| SQL injection | SQLAlchemy parameter binding; no raw SQL from user input. |
| Input validation | Pydantic query/body schemas; bounded thresholds, limits, coordinates, and intervention counts. |
| Dataset integrity | Real-data manifest validation at startup; no synthetic fallback; release mismatch refused. |
| Public demo | `CAREGAP_READ_ONLY=true` disables scenario creation and imports with 403. |
| Docs | `CAREGAP_ENABLE_DOCS=false` removes `/docs`, `/redoc`, and `/openapi.json`. |
| Resource use | Import caps; recommendation candidate count bounded by populated areas; response pagination limits. |
| Database | SQLite local or PostgreSQL with credentials from env; least-privilege user and TLS are deployment requirements. |

## Known gaps

- **No authentication or authorisation.** Any client that can reach the API can
  read it. Mutations are open unless read-only mode is enabled.
- **No built-in rate limiting.** Use a reverse proxy or platform edge for per-IP
  limits and request timeouts. Recommendations can take ~1–2 seconds; protect it.
- **No audit trail** for scenario creation or imports beyond the import-run table.
- **No CSRF protection** because there are no cookies or sessions; adding cookie
  authentication would require CSRF controls.
- **No multi-tenancy.** One active dataset and one shared scenario store.
- **Dependency scan results (2026-10-25):** `npm audit` (including dev
  dependencies) reported 0 vulnerabilities; `pip-audit -r
  backend/requirements.txt` reported no known vulnerabilities. Re-run before
  each release and scan container images.
- **No WAF, HSTS, or TLS termination** in the application; these belong at the
  edge.
- **PostgreSQL privileges** are not provisioned by this repository.

## Recommended before public exposure

1. Put the API behind a reverse proxy with TLS, HSTS, request size limits, and
   per-IP rate limits.
2. Set `CAREGAP_READ_ONLY=true` for the public demo, or add authentication and
   role-based authorisation for mutating endpoints.
3. Set `CAREGAP_ENABLE_DOCS=false` unless the API reference is intentionally
   public.
4. Set `CAREGAP_CORS_ORIGINS` to the exact production origin and
   `CAREGAP_ALLOWED_HOSTS` to the API host.
5. Use a managed secret store; rotate any database password used in testing.
6. Use a least-privilege database user, TLS, backups, and restore tests.
7. Add structured error tracking and uptime monitoring without sensitive data.
8. Run dependency and container scans; patch or document findings.
9. Complete accessibility testing and a public-health domain review.
10. Publish source dates, licences, and limitations alongside the app.
11. Add an audit trail for scenario creation/imports if mutations are enabled.
12. Confirm no patient data can enter through any path.

## Incident and vulnerability reporting

Do not open a public issue for a suspected vulnerability. Use the repository's
private security advisory workflow (`Security -> Advisories -> Report a
vulnerability`). Include the commit, reproduction steps, and impact. Do not
include real credentials or personal data.

## Out of scope

Denial-of-service testing against third-party services, social engineering, and
testing environments you do not own or have permission to use.
