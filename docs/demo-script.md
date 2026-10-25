# Demo script

A tested walkthrough of the running Delhi pilot. It takes about 12 minutes.
Values below are from release `delhi-pilot-2026.10-r1`; if the data is refreshed,
read the live figures rather than repeating these exact numbers.

## Before you start

```bash
# Terminal 1
cd backend
../.venv/bin/uvicorn app.main:app --port 8000

# Terminal 2
cd frontend
npm run dev
```

Open <http://localhost:3000>. Confirm the API is up at
<http://localhost:8000/ready>. The default profile is `delhi-pilot`; the
workspace header should say **Census 2011 baseline** and the footer should show
the represented population and dataset name.

If the API is unavailable, the landing page shows an honest "Live evidence
unavailable" state and the workspace shows an error with a retry. Do not hide
this; it is part of the product.

## 1. Landing page (1 minute)

- Read the headline and the live access scanner.
- Point out the scanner label: **Live analysis · Census 2011 + OpenStreetMap**,
  not "synthetic".
- The three live stats are computed by the API: people outside the default
  maternal-health 15-minute threshold, population areas outside, and the
  population-weighted median.
- Open **Method & data** (the model ledger) and point out:
  - population is an **official count** but historical (Census 2011);
  - facilities are OSM and unverified;
  - travel time is an estimate;
  - capacity, staffing, hours, quality, and outcomes are **not modelled**;
  - no patient-identifiable data.

## 2. Overview (2 minutes)

Open **Open the access workspace**.

- The header shows the active dataset/release and the routing model.
- Default lens: **Maternal health**, **15 minutes**.
- Expected summary: about **86.6% covered**, **35 wards outside**, roughly
  **2.15 million people outside**, 19 suitable maternal facilities.
- Click a grey area (for example an NDMC or Cantonment charge). The inspector
  says **Population unavailable**, and the area is excluded from denominators.
  This is deliberate: missing values are null, not zero.
- Point out the legend: "No population data" is a separate grey band.
- Change the service to **Primary care** at 15 minutes. Coverage becomes 100% in
  the mapped inventory. Explain that this reflects a dense OSM clinic inventory
  and does not prove real service availability; switch to **Emergency care** at
  15 minutes to show a real modelled gap (~93.1%).

## 3. Explore gaps (2 minutes)

Open **Explore gaps**.

- The table is ranked by longest modelled travel time.
- Search a ward, for example **Ward 262**.
- Select it; the inspector shows the nearest suitable facility, population,
  vulnerability **Unavailable**, and the band.
- Toggle **Outside threshold** and sort by population.
- Click **Export area CSV** and open the file. Point out the provenance columns:
  `dataset_id`, `dataset_release`, `population_reference_year`, `routing_model`,
  and the data notice. The file is not just a table of numbers.

## 4. Intervention simulator (3 minutes)

Open **Intervention simulator**.

- Default: maternal health, 15 minutes, primary care clinic.
- Click **Suggested gap** (or place a point inside a gap ward). The map validates
  the point against the ward geometry.
- Click **Run scenario**. The API recomputes the baseline and proposed analyses.
- Read the result:
  - newly covered population and coverage gain;
  - before/after weighted mean and median;
  - worst-served group coverage before/after;
  - residual gaps;
  - **areas worsened: 0** (the additive invariant).
- Switch to the **Change** map view. Newly covered areas are teal; unchanged
  areas are neutral.
- Expand **Assumptions, warnings, and model limits**. Point out that the
  proposed facility is marked `proposed`, is never counted as existing, and that
  capacity, staffing, hours, and quality are not modelled.
- Note the equity caveat: this release has no validated vulnerability input, so
  the equity weight is disabled and the worst-served group is defined by baseline
  travel time only.

## 5. Impact analytics (1 minute)

Open **Impact analytics**.

- Select the saved scenario.
- Show the travel-time distribution, newly covered population, residual gaps,
  and worst-served summary.
- Emphasise that the page recomputes the scenario from the API; it does not read
  a cached screenshot or a hard-coded number.

## 6. Recommended locations (2 minutes)

Open **Recommended locations**.

- The table ranks populated ward representative points.
- Point out the score components: coverage, equity (zero/unavailable), and
  person-minutes saved.
- Read a candidate explanation and its beneficiary areas.
- Show the strategy comparison: maximum coverage vs equity-weighted. Because
  vulnerability is unavailable, the equity-weighted strategy reduces to the
  coverage/travel weighting; the UI says so rather than pretending.
- State clearly: this is a **greedy heuristic**, not a global optimum, and it
  ignores land, ownership, cost, and feasibility.

## 7. Data sources and methodology (2 minutes)

Open **Data sources**.

- Show the source register: OSM boundary/facilities/roads, DataMeet wards,
  Census 2011, and the Delhi statistics cross-check, with licences and retrieval
  dates.
- Show the dataset profile: release, status, population year, represented and
  unrepresented population, vulnerability unavailable, counts.
- Show the validation summary and the import path. Try a facility CSV with a
  Delhi coordinate. Population-area imports are disabled for Delhi; explain why.
- Export the provenance JSON.

Open **Methodology**.

- Walk through the coverage formula and denominator.
- Show the travel-time assumptions and the "explicitly not claimed" list.
- Show the data-validation section (272-ward join, 1,368 facilities, 0 outside
  boundary, 99.5% graph component).
- Show the limitations: historical population, partial denominator, unverified
  facilities, no vulnerability, no live traffic, heuristic ranking, no
  authentication.

## 8. Honest failure states (30 seconds)

- Stop the API. Reload the workspace. The UI shows a clear API-unavailable
  message and keeps the methodology/data pages readable.
- With the API stopped, restart it with `CAREGAP_READ_ONLY=true`. Try to create a
  scenario: the API returns 403 with a readable explanation.
- If a real-data release were missing, startup would fail with an actionable
  error rather than showing synthetic data under a Delhi label. This is covered
  by an automated test.

## Mobile check (30 seconds)

Resize to 390 px or open the site on a phone. The workspace navigation becomes a
dialog; the map, inspector, controls, and tables remain usable without horizontal
overflow. The Playwright suite checks this.

## What not to say

- Do not call coverage "care", "treatment", or "health outcome".
- Do not call the travel times "live traffic" or "actual road times".
- Do not say the facility inventory is complete or verified.
- Do not say the ranking is optimal or that a candidate site is feasible.
- Do not imply government affiliation, endorsement, or official status.
- Do not present the historical Census 2011 population as current.
