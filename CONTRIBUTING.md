# Contributing to CareGap

CareGap is a proprietary, private decision-support project. Contributions are
accepted only under the repository owner's terms; no public or open-source
licence is granted. Contributions must preserve the distinction between verified,
estimated, and synthetic data.

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
- Dataset releases must have an explicit release ID, provenance manifest, and
  validation report. Do not mix synthetic and real records in one profile.
- Missing population or vulnerability values must stay `null` and be excluded
  from denominators or scoring. Never substitute invented values.
- A real-data profile must not fall back to synthetic data or a straight-line
  router. Fail loudly with recovery instructions instead.
- Rebuild the Delhi release with `backend/scripts/fetch_delhi_sources.py` and
  `backend/scripts/build_delhi_dataset.py`; do not edit committed artifacts by
  hand.
- Do not weaken or delete a failing test to make CI pass. Fix the cause or
  document a justified expectation change.

## Reporting problems

Use the issue templates. For security issues, follow `SECURITY.md` instead of
opening a public issue.
