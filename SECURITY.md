# Security Policy

## Supported scope

CareGap is a local pilot and decision-support project. It is not approved for
processing real patient-identifiable information and must not be deployed
publicly without the review in [docs/security.md](docs/security.md).

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository
owner via the private GitHub security advisory workflow:
`Security -> Advisories -> Report a vulnerability`.

Include the affected version/commit, reproduction steps, and potential impact.
Do not include real credentials or personal data in reports.

## Security controls in this repository

- Configuration and secrets are read from environment variables.
- `.env` files are gitignored; only `.env.example` placeholders are committed.
- Uploaded import files are size-limited and validated by type and schema.
- CORS is restricted to configured origins; optional TrustedHost allow-list.
- Security headers are set; API errors do not return internal details.
- Real-data releases are validated at startup and never fall back to synthetic
  data.
- `CAREGAP_READ_ONLY=true` disables scenario creation and imports for a public
  demonstration. `CAREGAP_ENABLE_DOCS=false` removes the OpenAPI UI.
- No authentication, authorisation, rate limiting, or audit trail is included by
  default. Public deployment requires them, plus TLS and managed secrets.

## Out of scope

Denial-of-service testing against third-party services, social engineering,
and testing environments you do not own or have permission to use.
