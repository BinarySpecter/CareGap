# Contributing to CareGap

CareGap is a decision-support product. Contributions must preserve the
distinction between verified, estimated, and synthetic data.

## Development workflow

1. Create a focused branch from `main`.
2. Install the backend and frontend as described in `README.md`.
3. Add or update tests for every behaviour change.
4. Run the full local check suite before opening a pull request:

   ```bash
   ./scripts/check.sh
   ```

5. Keep commits small and descriptive.
6. Open a pull request using the repository template.

## Engineering rules

- Core accessibility calculations must stay deterministic and covered by tests.
- Never commit `.env` files, credentials, personal data, or patient-identifiable data.
- Do not describe heuristic candidate rankings as globally optimal.
- Label synthetic/demo data visibly in the UI and documentation.
- Do not present straight-line distance as road travel time.
- Any new data source must be added to `docs/data-sources.md` with its URL,
  retrieval date, licence, coverage, and limitations.
- Do not weaken or delete a failing test to make CI pass. Fix the cause or
  document a justified expectation change.

## Reporting problems

Use the issue templates. For security issues, follow `SECURITY.md` instead of
opening a public issue.
