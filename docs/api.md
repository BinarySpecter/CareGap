# API reference

Base URL: `http://localhost:8000`. Interactive OpenAPI documentation:
`/docs`; ReDoc: `/redoc`.

All routes below are versioned under `/api/v1` except the health probe. The
local build has no authentication and is not intended for public exposure.
Requests are JSON unless noted; responses are JSON. Dates are ISO-8601 UTC.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service, version, dataset-loaded status. |
| GET | `/api/v1/meta` | Dataset provenance, services, interventions, facility types, thresholds, routing model. |
| GET | `/api/v1/overview` | Baseline summary + area GeoJSON + facilities + dissolved catchment. |
| GET | `/api/v1/facilities` | Paginated facility list; optional `service`, `facility_type`. |
| GET | `/api/v1/areas` | Paginated area GeoJSON (basic attributes). |
| GET | `/api/v1/accessibility` | Baseline summary + per-area access metrics. |
| POST | `/api/v1/analysis` | Same as accessibility, with a validated JSON body. |
| POST | `/api/v1/scenarios` | Validate and persist a proposed intervention scenario. |
| GET | `/api/v1/scenarios` | Recent scenarios (`limit` 1–50, newest first). |
| GET | `/api/v1/scenarios/{id}` | Fetch a stored scenario. |
| GET/POST | `/api/v1/scenarios/{id}/simulate` | Recompute baseline vs proposed and return comparison + GeoJSON. |
| GET | `/api/v1/recommendations` | Rank candidate locations and greedy sets. |
| POST | `/api/v1/data/import` | Multipart CSV/GeoJSON import with validation report. |
| GET | `/api/v1/data/imports` | Import run history (`limit` 1–100). |

## Common parameters

- `service`: one of `primary_care`, `maternal_health`, `diagnostics`,
  `emergency`. Defaults to the service-specific default threshold when omitted.
- `threshold_minutes`: integer 5–180. UI presets are 15, 30, 45, 60, 90.
- `intervention_type`: `primary_care_clinic`, `mobile_clinic`,
  `diagnostic_centre`, `medical_camp`.
- `equity_weight`: 0–1. Default 0.35.
- `set_size`: 1–5. `strategy`: `equity_weighted` or `max_coverage`.

## Examples

```bash
curl -s 'http://localhost:8000/api/v1/overview?service=primary_care&threshold_minutes=30'

curl -s -X POST http://localhost:8000/api/v1/scenarios \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Southwest clinic",
    "service": "primary_care",
    "threshold_minutes": 30,
    "interventions": [{
      "intervention_type": "primary_care_clinic",
      "name": "Southwest clinic",
      "lon": 73.727,
      "lat": 18.378
    }]
  }'
# Use the returned id:
curl -s -X POST http://localhost:8000/api/v1/scenarios/<id>/simulate

curl -s 'http://localhost:8000/api/v1/recommendations?service=primary_care&threshold_minutes=30&intervention_type=primary_care_clinic&set_size=3'
```

CSV import:

```bash
curl -s -X POST http://localhost:8000/api/v1/data/import \
  -F 'kind=facilities' \
  -F 'file=@facilities.csv;type=text/csv'
```

## Response shape highlights

`AccessSummary` includes total/covered population, coverage percent,
population-weighted mean/median/p90 travel time, ward counts, suitable facility
count, and a travel-time distribution. `OverviewResponse` also contains an area
FeatureCollection and a dissolved catchment polygon.

`ScenarioSimulationResponse` includes `baseline`, `proposed`, `delta`, `equity`,
`areas` (baseline/proposed per ward), `facilities`, `proposed_facilities`,
catchments, improvements, residual gaps, assumptions, warnings, and a data notice.

`RecommendationsResponse` includes the baseline, ranked candidates with score
components/metrics/beneficiaries/explanations, a recommended greedy set, both
strategy sets, weights, methodology text, assumptions, and limitations.

## Errors

| Status | Meaning |
| --- | --- |
| 404 | Dataset/scenario not found. |
| 409 | Database conflict, invalid stored scenario, or missing dataset areas. |
| 413 | Import exceeds the configured size limit. |
| 422 | Validation failure, invalid service/threshold, incompatible intervention, or point outside district. |
| 500 | Unexpected server error; details are logged, not returned. |

Validation errors follow FastAPI’s standard `detail` payload. Business-rule
errors use a string `detail`.

## Limits and CORS

- Imports: 2 MB default (`CAREGAP_MAX_IMPORT_BYTES`), 5,000 rows.
- Scenarios: 1–5 interventions, all of one type.
- Recommendation candidates: up to 20 returned; set size up to 5.
- CORS origins: `CAREGAP_CORS_ORIGINS` (default local development origins).
- No authentication, rate limiting, or multi-tenant isolation exists in v0.1.

## Versioning

Routing paths and response shapes are versioned as `v1`. Breaking contract
changes would require a new version. Database schema changes are managed with
Alembic (`backend/alembic/versions`).
