# Methodology and limitations

CareGap is a decision-support model. It estimates geographic access under
explicit assumptions and deliberately separates those estimates from observed
care, capacity, quality, and health outcomes.

The active release is `delhi-pilot-2026.10-r1`. The synthetic demo remains a
separate, clearly labelled profile for tests and workflow demonstration.

## 1. Accessibility definition

For service `s`, threshold `T`, population area `i`, and suitable facility set
`F_s`:

```text
t_i = min over f in F_s of travel_time(i, f)
covered_i = 1 if t_i <= T else 0
coverage = Σ(pop_i × covered_i) / Σ(pop_i)      for areas with a population
weighted_mean_time = Σ(pop_i × t_i) / Σ(pop_i)
```

Facilities are eligible only when their mapped services include `s`. The nearest
facility is not automatically suitable.

**Population denominator (Delhi).** 272 MCD wards with Census 2011 populations
totalling 16,000,745. The 18 NDMC/Cantonment/riverbed polygons carry
`population: null`. They are analysed for travel time and shown on the map but
excluded from every population denominator. They are reported explicitly, never
treated as zero. Coverage is therefore relative to the represented population,
not the whole NCT.

Areas with no suitable mapped facility are counted as uncovered with no invented
travel time. Population-weighted median and p90 are computed from the same area
times.

### Service suitability in the Delhi release

Services are attributed only from OpenStreetMap tags, never from facility names:

| Category | Rule | Modelled services |
| --- | --- | --- |
| Hospital | `amenity=hospital` or `healthcare=hospital` | Primary care |
| Health centre | `healthcare=centre` or `amenity=health_post` | Primary care |
| Dispensary | `health_facility:type=dispensary` or `healthcare=dispensary` | Primary care |
| Clinic / doctor | `amenity=clinic|doctors` or `healthcare=clinic|doctor` | Primary care |
| Birthing centre | `healthcare=birthing_centre` | Maternal health |
| Diagnostic laboratory | `healthcare=laboratory` | Diagnostics |
| Emergency | `emergency=yes` on any retained category | Emergency |
| Maternal | Speciality contains gynaecology, obstetrics, or maternity | Maternal health |
| Diagnostics | Speciality contains pathology, clinical pathology, radiology, or blood check | Diagnostics |

Pharmacies, dentists, veterinary facilities, blood banks, sample collection,
alternative medicine, physiotherapy, optometry, and similar out-of-scope tags are
excluded. A service tag means the facility is modelled as offering the service;
it does not verify staff, equipment, stock, hours, affordability, or quality.

## 2. Travel-time model

The Delhi release ships a graph built from OpenStreetMap drivable ways clipped to
the NCT boundary. Edge time is `length_km / speed_kph × 60`, where the class
speed is capped by a parsable `maxspeed` tag. Dijkstra runs on an undirected
graph.

| Class | Assumed speed (km/h) |
| --- | --- |
| motorway / trunk | 80 / 60 |
| primary / secondary / tertiary | 50 / 40 / 35 |
| unclassified / residential / living street | 30 / 25 / 15 |
| links | 50 / 45 / 40 / 35 / 30 |

Ward representative points and facilities snap to the nearest road node. A
straight-line local-access leg is added at 15 km/h with a 1.25 detour factor.
Distances are measured with haversine; the build uses UTM zone 43N for validation.

**Not included:** live traffic, one-way restrictions, turn restrictions,
closures, public transport, walking, cycling, seasonal roads, emergency response
times, queues, opening hours. No external routing service is called. Results
must not be described as live traffic or validated turn-by-turn routing.

A straight-line fallback exists only for the synthetic demo. The Delhi profile
refuses to start if the packaged road graph is missing or invalid.

## 3. Equity

For scenario comparison, worst-served areas are selected by sorting **populated**
areas from longest to shortest **baseline** travel time and accumulating
population until at least 20% is included. Unreachable areas sort first. Coverage
and weighted mean time are reported for that fixed group before and after the
intervention.

**Vulnerability weighting is unavailable in the Delhi release.** No defensible
ward-level vulnerability indicator was acquired. The API exposes
`vulnerability_index: null`, disables the equity-weight control, and forces the
equity weight to zero. Candidate ranking still uses newly covered population,
person-minutes saved, and the worst-served group. The synthetic demo has its own
clearly labelled synthetic index for workflow testing only; it must not be used
for real prioritisation.

## 4. Intervention simulation

A scenario stores 1–5 proposed facilities of a single intervention type, the
service, threshold, and coordinates. Simulation:

1. Loads the active dataset's areas and existing facilities.
2. Runs the baseline accessibility analysis.
3. Adds the proposed facilities as suitable sources without removing or
   modifying existing services.
4. Re-runs the same analysis and compares per-area times and coverage.
5. Reports newly covered population, coverage gain, weighted mean/median change,
   improved/worsened areas, residual gaps, and worst-served equity.

Invariant: because the suitable facility set only grows, the minimum travel time
cannot increase. Automated tests assert non-worsening for every area. A positive
worsened count is surfaced as a warning and indicates a defect.

Intervention-specific assumptions (full-time clinic, scheduled mobile unit,
temporary camp, diagnostic equipment, sub-centre staffing, AAM package) are
returned with the simulation and shown in the UI. Capacity, staffing, schedule,
cost, and quality are not modelled. Proposed facilities are marked `proposed` and
never counted as existing.

## 5. Candidate ranking

Candidates are the representative points of populated wards (not parcels). Each
candidate is evaluated by re-running the accessibility analysis with one facility
added.

```text
coverage_component = newly_covered_population / max_candidate_newly_covered
equity_component   = vulnerability_weighted_gain / max_candidate_gain
travel_component   = person_minutes_saved / max_candidate_person_minutes

score = (1 - w_e) × coverage_component
      + w_e × (0.75 × equity_component + 0.25 × travel_component)

score ×= 0.9 if the candidate's own area is already within the threshold
```

Default `w_e = 0.35` when a vulnerability indicator exists; the Delhi release
uses `w_e = 0` because it does not. Components are normalised by the current best
candidate, not absolute utility. A 10% concentration penalty softly discourages
adding resources in already-served locations.

The recommended set is greedy: choose the best marginal candidate, re-run the
analysis with it added, then repeat. Ties break by area ID. This is **not** a
global optimum. Two strategies are shown: maximum marginal coverage and
equity-weighted score.

## 6. Impact metrics

| Metric | Definition |
| --- | --- |
| Newly covered population | People in areas moving from outside to inside the threshold. |
| Coverage gain | Proposed coverage % minus baseline, in percentage points. |
| Weighted mean time change | Proposed minus baseline population-weighted mean. Negative is improvement. |
| Residual gap | Population/areas still over the threshold after intervention. |
| Worst-served improvement | Coverage/time change for the fixed baseline-defined group. |
| Areas worsened | Areas whose proposed time exceeds baseline by >0.05 min; expected zero. |

Coverage is an estimate of modelled access, not attendance, utilisation, clinical
quality, or health benefit.

## 7. Data rules {#data}

Delhi imports:

- Facility CSV (UTF-8) or GeoJSON points; maximum 2 MB; 5,000 rows.
- Required: name, known facility type, numeric lon/lat in range, at least one
  valid service (defaulted from facility type only when omitted).
- Facility points must be inside the study boundary.
- Duplicate detection: same normalised name within 50 m.
- Valid rows may be imported while invalid rows are reported; every run is
  recorded in `import_runs`.
- Existing data is never silently overwritten. Imported records get generated
  IDs and `data_status=imported`.
- **Population-area imports are disabled** for the Delhi pilot because the
  release must match the validated Census ward set. The synthetic demo still
  supports them.

## 8. Validation and invariants

The release build validates boundary identity and area, ward geometry validity,
the 272-ward Census join, the population total, facility coordinate ranges,
boundary containment, duplicate merging, service identifiers, and routing
connectivity. The API seeder re-validates the manifest, counts, geometries,
centroids, population values, and service identifiers before writing anything;
a failure leaves the database untouched.

Automated tests cover coordinate validation, service suitability, threshold
monotonicity, weighted statistics, nullable population handling, unreachable
areas, the non-worsening invariant, equity group construction, scenario API
contracts, ranking determinism, import validation, CORS, read-only mode, the
missing-release failure path, and E2E browser flows. See [testing](testing.md).

## 9. Limitations {#limitations}

- Historical Census 2011 population; not current.
- 4.7% of the 2011 NCT population is outside the denominators (NDMC,
  Cantonment, rural, boundary mismatch).
- Missing mapped facilities are not evidence that care is absent; inventory
  completeness is unknown.
- Services are tag-derived and unverified. Capacity, staffing, hours, cost,
  equipment, and quality are absent.
- No health outcomes, utilisation, or causal claims.
- No live traffic, one-way restrictions, turn restrictions, public transport,
  walking, or seasonal roads.
- Ward representative points are a coarse proxy for population and candidate
  siting; intra-ward differences are concealed.
- No validated vulnerability input; equity weighting is disabled.
- Greedy ranking is not globally optimal; relative normalisation shifts with the
  candidate set.
- Candidate sites ignore land, ownership, utilities, flood risk, and cost.
- No authentication, multi-user isolation, rate limiting, or audit trail by
  default. Public exposure requires read-only mode and a security review.
- PostGIS native geometry is not used; GeoJSON is stored in JSON columns.

## 10. Responsible use {#responsible}

Do not use this pilot to allocate real resources, infer individual need, or make
clinical decisions. A real deployment requires local validation, community
engagement, authoritative and licensed data, privacy review, authentication,
audit logging, accessibility testing, operational integration, and review by
public-health professionals. It should account for settlements, transport modes,
seasonality, informal providers, and structural inequities not represented here.

CareGap is not affiliated with, endorsed by, or an official product of the
Government of NCT of Delhi or any facility operator.

## 11. Design record {#design}

The interface is an original implementation informed by the InstaLanding design
library: Halden Clinical Equipment (clinical restraint, mono instrumentation,
inspection board), Footnote (warm paper, Source Serif, semantic highlighter),
GEO/LAB (spatial instrumentation), and Mirador (rail + context filters).
SmartCare Clinical AI and Calibre were inspected but not adopted as visual
directions. No third-party code, fonts, or assets were copied. See
[design audit](design-audit.md) and [credits](credits.md).
