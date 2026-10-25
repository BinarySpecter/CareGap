# API reference

Base URL: `http://localhost:8000`. Interactive OpenAPI documentation:
`/docs`; ReDoc: `/redoc` (both can be disabled with
`CAREGAP_ENABLE_DOCS=false`). Health probes are unversioned; all analytical
routes are under `/api/v1`.

The API has no authentication by default. Do not expose it publicly without
access controls; set `CAREGAP_READ_ONLY=true` to disable mutations for a public
demonstration.

## Dataset identity

Every analytical response identifies the active dataset and release. The active
profile is selected at startup with `CAREGAP_ACTIVE_DATASET` (`delhi-pilot` by
default, or `caregap-demo`). There is no runtime dataset switching and no
synthetic fallback.

`/api/v1/meta` returns the full manifest: source register, population reference
year, represented/unrepresented population, validation summary, capabilities,
routing assumptions, and vulnerability availability.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service, version, dataset/release, routing model, read-only flag. |
| GET | `/ready` | Readiness: database, dataset counts, routing model; 503 when not ready. |
| GET | `/api/v1/datasets` | Known dataset profiles, packaged/active status, release. |
| GET | `/api/v1/meta` | Dataset provenance, services, interventions, facility types, thresholds, routing model. |
| GET | `/api/v1/overview` | Baseline summary + area GeoJSON + facilities + dissolved catchment. |
| GET | `/api/v1/facilities` | Paginated facility list; optional `service`, `facility_type`. |
| GET | `/api/v1/areas` | Paginated area GeoJSON (population status, municipality, centroid). |
| GET | `/api/v1/accessibility` | Baseline summary + per-area access metrics. |
| POST | `/api/v1/analysis` | Same as accessibility, with a validated JSON body. |
| POST | `/api/v1/scenarios` | Validate and persist a proposed intervention scenario. |
| GET | `/api/v1/scenarios` | Recent scenarios for the active dataset (`limit` 1–50). |
| GET | `/api/v1/scenarios/{id}` | Fetch a stored scenario. |
| GET/POST | `/api/v1/scenarios/{id}/simulate` | Recompute baseline vs proposed and return comparison + GeoJSON. |
| GET | `/api/v1/recommendations` | Rank candidate locations and greedy sets. |
| POST | `/api/v1/data/import` | Multipart facility CSV/GeoJSON import with validation report. |
| GET | `/api/v1/data/imports` | Import run history for the active dataset (`limit` 1–100). |

## Common parameters

- `service`: `primary_care`, `maternal_health`, `diagnostics`, `emergency`.
  When `threshold_minutes` is omitted, the service-specific default is used
  (`maternal_health` 15, `primary_care` 30, `diagnostics` 45, `emergency` 60).
- `threshold_minutes`: integer 5–180. UI presets: 15, 30, 45, 60, 90.
- `intervention_type`: `primary_care_clinic`, `mobile_clinic`,
  `diagnostic_centre`, `medical_camp`, `sub_centre`,
  `health_wellness_centre`.
- `equity_weight`: 0–1. Ignored (forced to 0) when the dataset has no
  vulnerability indicator.
- `set_size`: 1–5. `strategy`: `equity_weighted` or `max_coverage`.
- `limit`/`offset` are bounded per endpoint.

## Response conventions

- `dataset`: id, name, release, synthetic flag, data status, geography, counts,
  population, vulnerability, capabilities, validation summary, sources,
  limitations, road model.
- `summary`: population denominator, covered population, coverage percent,
  weighted mean/median/p90, unreachable count, suitable facility count,
  distribution, `areas_total`, `areas_with_population`,
  `areas_without_population`, `population_reference_year`.
- Areas without a population value return `population: null` and
  `population_included: false`; they are excluded from denominators.
- `data_notice` explains the dataset and modelling limits. `warnings` lists
  routing and equity limitations.
- Proposed facilities return `data_status: "proposed"` and are never mixed into
  the existing facility list.

## Examples

```bash
# Dataset manifest and release
curl -s http://localhost:8000/api/v1/meta | jq '.dataset | {id, release, counts, population}'

# Default maternal-health lens
curl -s 'http://localhost:8000/api/v1/overview?service=maternal_health&threshold_minutes=15'

# Emergency access at 15 minutes
curl -s 'http://localhost:8000/api/v1/accessibility?service=emergency&threshold_minutes=15'

# Create a scenario inside Delhi (lon/lat must be inside a ward)
curl -s -X POST http://localhost:8000/api/v1/scenarios \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Maternal outreach pilot",
    "service": "maternal_health",
    "threshold_minutes": 15,
    "interventions": [{
      "intervention_type": "primary_care_clinic",
      "name": "Proposed outreach clinic",
      "lon": 77.2197,
      "lat": 28.6521
    }]
  }'
# Use the returned id:
curl -s -X POST http://localhost:8000/api/v1/scenarios/<id>/simulate

# Candidate ranking (equity weight is forced to 0 for Delhi)
curl -s 'http://localhost:8000/api/v1/recommendations?service=maternal_health&threshold_minutes=15&intervention_type=primary_care_clinic&set_size=3'

# Facility import
curl -s -X POST http://localhost:8000/api/v1/data/import \
  -F 'kind=facilities' \
  -F 'file=@facilities.csv;type=text/csv'

# Readiness
curl -s http://localhost:8000/ready
```

Population-area imports return **403** for the Delhi pilot. Scenario creation
and imports return **403** when `CAREGAP_READ_ONLY=true`.
