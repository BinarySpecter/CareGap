# Security Policy

## Supported scope

CareGap is a local demonstration and decision-support project. It is not
approved for processing real patient-identifiable information and must not be
deployed publicly without a security review.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the
repository owner via the private GitHub security advisory workflow:
`Security -> Advisories -> Report a vulnerability`.

Include the affected version/commit, reproduction steps, and potential impact.
Do not include real credentials or personal data in reports.

## Security controls in this repository

- Configuration and secrets are read from environment variables.
- `.env` files are gitignored; only `.env.example` placeholders are committed.
- Uploaded import files are size-limited and validated by type and schema.
- CORS is restricted to configured origins.
- API errors do not return internal database or stack-trace details.
- No authentication is included in the local MVP. Public deployment requires
  authentication, authorisation, rate limiting, TLS, and managed secrets.

## Out of scope

Denial-of-service testing against third-party services, social engineering,
and testing environments you do not own or have permission to use.
