# Methodology

CareGap is a decision-support model. It estimates geographic access under explicit
assumptions and deliberately separates those estimates from observed care,
capacity, quality, and health outcomes.

## 1. Accessibility definition

For service `s`, threshold `T`, population area `i`, suitable facility set `F_s`:

```text
t_i = min over f in F_s of travel_time(i, f)
covered_i = 1 if t_i <= T else 0
coverage = sum(pop_i * covered_i) / sum(pop_i)
weighted_mean_time = sum(pop_i * t_i) / sum(pop_i)
```

Facilities are eligible only when their mapped service tags include `s`. The
nearest facility is not automatically suitable. Areas with no suitable mapped
facility are counted as uncovered with no invented travel time.

Population-weighted median and p90 are computed from the same area times.
Population values are area-level; they are not individual observations.

### Service suitability in the demo

| Facility type | Modelled services |
| --- | --- |
| District hospital | primary care, maternal health, diagnostics, emergency |
| Primary health centre | primary care, maternal health, diagnostics |
| Community health centre | primary care, maternal health |
| Diagnostic centre | diagnostics |
| Maternal health centre | maternal health |
| Proposed primary care clinic | primary care, maternal health |
| Proposed mobile clinic | primary care |
| Proposed diagnostic centre | diagnostics |
| Proposed medical camp | primary care, maternal health |

## 2. Travel-time model

- Synthetic 2.0 km grid over the Demo District; UTM zone 43N for lengths.
- Speed classes: arterial 48 km/h, collector 36, local 24, diagonal local 20.
- Facilities and population centroids snap to the nearest grid node.
- Local access leg at 18 km/h.
- Dijkstra shortest path by edge minutes. Per-facility node times are cached for
  the process lifetime.
- Fallback when roads cannot load: straight-line distance × 1.35 at 28 km/h,
  explicitly labelled as a fallback and not road travel time.

**Not included:** live traffic, closures, public transport, walking networks,
seasonal roads, emergency response times, queues, opening hours. No external
routing service is called. Results must not be described as live traffic.

## 3. Equity

For scenario comparison, worst-served areas are selected by sorting areas from
longest to shortest **baseline** travel time and accumulating population until at
least 20%. Unreachable areas sort first. Coverage and weighted mean time are
reported for that fixed group before and after the intervention.

This is a transparent working definition, not an official equity standard. The
demo vulnerability index is synthetic (seeded distance from invented urban
centres plus noise); it is used only in candidate weighting. Real deployments
need validated, governed vulnerability inputs and community review.

## 4. Intervention simulation

A scenario stores 1–5 proposed facilities of a single intervention type, the
service, threshold, and coordinates. Simulation:

1. Loads the current population areas and all existing facilities.
2. Runs the baseline accessibility analysis.
3. Adds the proposed facilities as suitable sources without removing or
   modifying existing services.
4. Re-runs the same analysis and compares per-area times and coverage.
5. Reports newly covered population, coverage gain, weighted mean/median change,
   improved/worsened wards, residual gaps, and worst-served equity.

Invariant: because the suitable facility set only grows, the minimum travel time
cannot increase. Automated tests assert non-worsening for every area and a zero
worsened-ward count in the demo scenario. A positive count is surfaced as a
warning and indicates a defect.

Intervention-specific assumptions (full-time clinic, scheduled mobile unit,
temporary recurring camp, diagnostic equipment) are returned with the simulation
and shown in the UI. Capacity, staffing, schedule, cost, and quality are not
modelled.

## 5. Candidate ranking

Candidates are the centroids of population areas (not parcels). Each candidate is
evaluated by re-running the full accessibility analysis with one facility added.

```text
coverage_component = newly_covered_population / max_candidate_newly_covered
equity_component   = vulnerability_weighted_gain / max_candidate_gain
travel_component   = person_minutes_saved / max_candidate_person_minutes

score = (1 - w_e) * coverage_component
      + w_e * (0.75 * equity_component + 0.25 * travel_component)

score *= 0.9   if the candidate's own area is already within the threshold
```

Default `w_e = 0.35` and configurable 0–1. Components are normalised by the
current best candidate, not absolute utility. A 10% concentration penalty softly
discourages adding resources in already-served locations.

The recommended set is greedy: choose the best marginal candidate, re-run the
analysis with it added, then repeat. Ties break by area ID. This is not a global
optimum. Two strategies are shown: maximum marginal coverage and equity-weighted
score. Strategy comparison uses the same candidate set and begins from the same
baseline.

## 6. Impact metrics

| Metric | Definition |
| --- | --- |
| Newly covered population | People in areas moving from outside to inside the threshold. |
| Coverage gain | Proposed coverage % minus baseline, in percentage points. |
| Weighted mean time change | Proposed minus baseline population-weighted mean. Negative is improvement. |
| Residual gap | Population/areas still over the threshold after intervention. |
| Worst-served improvement | Coverage/time change for the fixed baseline-defined group. |
| Wards worsened | Areas whose proposed time exceeds baseline by >0.05 min; expected zero. |

Coverage is an estimate of modelled access, not attendance, utilisation, clinical
quality, or health benefit.

## 7. Data rules {#data}

Imports are deliberately conservative:

- UTF-8 CSV (facilities) or GeoJSON (facilities/areas); maximum 2 MB; 5,000 rows.
- Facilities: required name, known facility type, numeric lon/lat in range,
  services (defaulted from facility type if omitted).
- Facility points must be inside the dataset’s area boundary.
- Areas: valid Polygon/MultiPolygon, name, positive population, optional
  vulnerability in [0,1]; area computed geodesically.
- Duplicate detection: same normalised name within 50 m (facilities) or 200 m
  (areas).
- Valid rows may be imported while invalid rows are reported, including row,
  field, and message; an import is recorded in `import_runs`.
- Existing data is never silently overwritten. Imported records get generated
  IDs and an `imported` status.

## 8. Validation and invariants

Automated tests cover coordinate validation, service suitability, threshold
monotonicity, weighted statistics, distribution totals, unreachable areas, the
non-worsening invariant, equity group construction, scenario API contracts,
ranking determinism, import validation, CORS, and E2E browser flows. See
[testing](testing.md).

## 9. Limitations {#limitations}

- Synthetic geography, population, vulnerability, facilities, and roads.
- Missing mapped facilities are not evidence that care is absent; inventory
  completeness is unknown.
- Capacity, staffing, hours, cost, equipment, and quality are absent.
- No health outcomes, utilisation, or causal claims.
- No live traffic, public transport, seasonal roads, or turn-by-turn routing.
- Area centroids are a coarse proxy for population and candidate siting.
- Vulnerability weights are synthetic and not suitable for real prioritisation.
- Greedy ranking is not globally optimal; relative normalisation shifts with the
  candidate set.
- Candidate sites ignore land, ownership, utilities, flood risk, and cost.
- No authentication, multi-user isolation, rate limiting, or audit trail.
- No automated ingestion of real public data; imports are local and manual.
- PostGIS native geometry is not yet used despite the optional database image.

## 10. Responsible use {#responsible}

Do not use this demo to allocate real resources, infer individual need, or make
clinical decisions. A real deployment requires local validation, community
engagement, authoritative and licensed data, privacy review, authentication,
audit logging, accessibility testing, operational integration, and review by
public-health professionals. It should account for settlements, transport modes,
seasonality, informal providers, and structural inequities not represented here.

## 11. Design record {#design}

The interface is an original implementation informed by the InstaLanding design
library: Halden Clinical Equipment (clinical restraint, mono instrumentation,
inspection board), Footnote (warm paper, Source Serif, semantic highlighter),
GEO/LAB (spatial instrumentation), and Mirador (rail + context filters). SmartCare
Clinical AI and Calibre were inspected but not adopted as visual directions. No
third-party code, fonts, or assets were copied. See
[design audit](design-audit.md) and [credits](credits.md).
