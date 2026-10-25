import type { Metadata } from "next";
import {
  ArrowUpRight,
  BookOpenText,
  CircleCheck,
  FlaskConical,
  Info,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app/PageHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How CareGap computes Delhi accessibility, simulates interventions, ranks candidate sites, validates imports, and states its limits.",
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/+$/,
  "",
);

const TOC = [
  ["01", "Accessibility", "access"],
  ["02", "Travel time", "travel"],
  ["03", "Equity", "equity"],
  ["04", "Simulation", "simulator"],
  ["05", "Recommendations", "recommendations"],
  ["06", "Impact metrics", "impact"],
  ["07", "Data validation", "data"],
  ["08", "Testing", "testing"],
  ["09", "Limitations", "limitations"],
  ["10", "Responsible use", "responsible"],
  ["11", "Design record", "design"],
] as const;

const SERVICE_MATRIX = [
  ["Hospital (OSM amenity/healthcare)", "Primary care; emergency only with emergency=yes"],
  ["Health centre / Ayushman Arogya Mandir", "Primary care"],
  ["Dispensary", "Primary care"],
  ["Clinic / doctor", "Primary care"],
  ["Birthing centre", "Maternal health"],
  ["Diagnostic laboratory", "Diagnostics"],
  ["Maternal or obstetric tag", "Maternal health added from the mapped speciality"],
  ["Proposed clinic / sub-centre / AAM", "Primary care + maternal health (assumed)"],
  ["Proposed diagnostic centre", "Diagnostics (assumed)"],
];

const METRICS = [
  ["Coverage", "Population in areas whose modelled nearest suitable facility is within the threshold ÷ represented population"],
  ["Covered population", "Sum of Census 2011 ward population in covered areas"],
  ["Weighted mean time", "Σ(population × nearest-facility minutes) ÷ Σ(population), populated areas only"],
  ["Weighted median / p90", "Population-weighted percentile of area travel times"],
  ["Newly covered population", "People moving from outside to inside the threshold after an additive intervention"],
  ["Worst-served group", "Areas sorted by baseline travel time until at least 20% of represented population is included"],
  ["Residual gap", "Population still outside the threshold after the intervention"],
];

export default function MethodologyPage() {
  return (
    <div className="page-gutter">
      <div className="content-max pb-12 pt-6">
        <PageHeader
          index="07"
          eyebrow="Methodology & governance"
          title="A conclusion you can trace."
          description="The accessibility model, scoring rules, data-validation gates, mathematical invariants, and explicit limitations behind every number in the Delhi pilot. This is documentation for a decision-support tool, not clinical guidance."
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)_260px]">
          <aside className="hidden lg:block">
            <nav
              aria-label="Methodology contents"
              className="sticky top-24 border-t border-[var(--rule-strong)] pt-3"
            >
              <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                Contents
              </p>
              <ul className="mt-3 space-y-1.5">
                {TOC.map(([index, label, anchor]) => (
                  <li key={anchor}>
                    <a
                      href={`#${anchor}`}
                      className="group flex items-baseline gap-2 text-[10.5px] text-[var(--ink-2)] hover:text-[var(--ink)]"
                    >
                      <span className="mono text-[8px] text-[var(--ink-3)]">{index}</span>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="min-w-0">
            <section id="access" className="scroll-mt-24">
              <SectionLabel index="01">What is measured</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Accessibility is a travel-time relationship, not a facility count.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                Every population area is evaluated against the facilities that
                actually provide the selected service. CareGap does not assume the
                nearest facility is suitable. In the Delhi release, services are
                attributed only from OpenStreetMap tags; a facility name is never
                used to infer a service.
              </p>
              <pre className="mono mt-4 overflow-x-auto border border-[var(--rule)] bg-[var(--sheet)] p-4 text-[11px] leading-relaxed text-[var(--ink)]">
{`t_i = min over f in F_s of travel_time(i, f)
covered_i = 1 if t_i <= T else 0
coverage  = Σ(pop_i * covered_i) / Σ(pop_i)      for areas with population
weighted_mean_time = Σ(pop_i * t_i) / Σ(pop_i)`}
              </pre>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-3">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Delhi denominator
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                    272 MCD wards, 16,000,745 people (Census 2011). The 18
                    NDMC/Cantonment charge polygons and the unassigned riverbed
                    polygon carry <span className="mono">population: null</span>.
                    They are analysed for travel time but excluded from every
                    population denominator.
                  </p>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-3">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Not in the denominator
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                    787,196 people (4.7% of the 2011 NCT total) are not
                    represented: NDMC and Cantonment residents, rural village
                    population inside wards, and boundary mismatch. Coverage is
                    reported against the represented 16,000,745 only.
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                A service tag means the facility is modelled as offering the
                service. It does not verify staff, equipment, stock, hours,
                affordability, or quality. Areas with no suitable mapped facility
                are uncovered with no invented travel time.
              </p>

              <div className="mt-6 overflow-hidden border border-[var(--rule)] bg-[var(--sheet)]">
                <div className="border-b border-[var(--rule)] px-4 py-3">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Service attribution in the Delhi pilot
                  </p>
                </div>
                <table className="data-table">
                  <caption className="sr-only">
                    Facility categories and tag rules used for service attribution
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Facility category</th>
                      <th scope="col">Modelled services</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SERVICE_MATRIX.map(([type, services]) => (
                      <tr key={type}>
                        <td className="font-medium">{type}</td>
                        <td className="text-[10.5px] text-[var(--ink-2)]">{services}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="travel" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="02">Travel-time model</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Shortest paths over OpenStreetMap roads.
              </h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <div>
                  <p className="text-[13px] leading-[1.75] text-[var(--ink-2)]">
                    The Delhi release ships a routed graph built from
                    OpenStreetMap drivable ways (motorway through residential and
                    living-street classes) clipped to the NCT boundary. Edge time
                    is length ÷ class speed, capped by a parsable{" "}
                    <span className="mono">maxspeed</span> tag. Dijkstra is run on
                    an undirected graph; one-way restrictions are not modelled.
                  </p>
                  <p className="mt-3 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                    Ward centroids and facilities snap to the nearest road node.
                    A straight-line local-access leg is added at 15 km/h with a
                    1.25 detour factor. Population-weighted statistics use the
                    same area times shown on the map.
                  </p>
                  <p className="mt-3 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                    Speeds (km/h): motorway 80 · trunk 60 · primary 50 · secondary
                    40 · tertiary 35 · unclassified 30 · residential 25 · living
                    street 15; links are slightly slower. The snapshot date is
                    recorded in the data source register.
                  </p>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Explicitly not claimed
                  </p>
                  <ul className="mt-2 space-y-2">
                    {[
                      "Not live traffic, congestion, closures, or turn-by-turn routing.",
                      "Not walking, cycling, public transport, or emergency-response time.",
                      "Not facility wait time, opening hours, capacity, or service availability.",
                      "Not a measurement of actual patient travel or utilisation.",
                    ].map((item) => (
                      <li key={item} className="flex gap-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--gap)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-[var(--rule)] pt-2.5 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    A straight-line fallback exists only for the explicitly
                    synthetic demo. It is never used for the Delhi release: a
                    missing road artifact stops the API with an actionable error.
                  </p>
                </div>
              </div>
              <div className="mt-5 border-l-2 border-[var(--gap)] pl-4">
                <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--gap)]">
                  Metric note
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                  A median of 9.6 minutes means half of the represented
                  population lives in a ward whose centroid is at or below that
                  value. It is not a measurement for every resident, and it can
                  conceal large differences inside a ward.
                </p>
              </div>
            </section>

            <section id="equity" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="03">Equity</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Worst-served is defined before results are seen.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                For scenario comparisons, CareGap sorts population areas from
                longest to shortest baseline travel time and includes areas until
                at least <span className="mono">20%</span> of the represented
                population is in the group. Unreachable areas sort first. The
                group is fixed from the baseline and then compared before and
                after the intervention; it is not re-selected to flatter the
                result.
              </p>
              <div className="mt-4 border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <p className="mono flex items-center gap-1.5 text-[8px] uppercase tracking-[0.1em] text-[var(--gap)]">
                  <Info className="h-3 w-3" strokeWidth={1.7} aria-hidden="true" />
                  Vulnerability weighting is unavailable in this release
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                  No defensible ward-level vulnerability indicator was acquired
                  for the Delhi pilot. Rather than fabricate one, the release
                  reports{" "}
                  <span className="mono">vulnerability_index: null</span>, disables
                  the equity-weight slider, and forces the equity weight to zero.
                  Candidate ranking still uses newly covered population,
                  person-minutes saved, and the worst-served group. The synthetic
                  demo has its own clearly labelled synthetic index for workflow
                  testing only.
                </p>
              </div>
            </section>

            <section id="simulator" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="04">Intervention simulation</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Additive by design.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                A scenario stores 1–5 proposed facilities of a single
                intervention type, the service, threshold, and coordinates. The
                same accessibility function is run on the active dataset with the
                proposed facilities added. Existing facilities are never removed
                or degraded, so an area&apos;s nearest-facility time cannot
                worsen. Automated tests assert this invariant; a positive worsened
                count is surfaced as a defect warning.
              </p>
              <p className="measure mt-3 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                Proposed facilities are marked{" "}
                <span className="mono">proposed</span> in API responses and on the
                map and are never counted as existing facilities. A proposed site
                must fall inside the active ward geometry. Capacity, staffing,
                schedule, cost, and quality are not modelled; intervention
                assumptions are returned with every simulation and shown in the
                interface.
              </p>
            </section>

            <section id="recommendations" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="05">Candidate ranking</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                An explained heuristic, not an optimum.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                Candidates are the representative points of the 272 populated
                wards. Each candidate is evaluated by adding one facility and
                re-running the same analysis. Components are normalised by the
                best candidate in the current set, so scores are relative, not
                absolute utility.
              </p>
              <pre className="mono mt-4 overflow-x-auto border border-[var(--rule)] bg-[var(--sheet)] p-4 text-[11px] leading-relaxed text-[var(--ink)]">
{`coverage_component = newly_covered_population / best_candidate_value
equity_component   = vulnerability_weighted_gain / best_candidate_value
travel_component   = person_minutes_saved / best_candidate_value

score = (1 - w_equity) * coverage_component
      + w_equity * (0.75 * equity_component + 0.25 * travel_component)
score *= 0.9 if the candidate's own ward is already covered

Delhi pilot: w_equity = 0 because no validated vulnerability input exists.`}
              </pre>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                The recommended set is greedy: choose the best marginal candidate,
                add it, re-run, repeat. Ties break by area ID. This is not a
                global optimum and not a claim about land availability, cost, or
                political feasibility.
              </p>
            </section>

            <section id="impact" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="06">Impact metrics</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Every number has a definition.
              </h2>
              <div className="mt-4 overflow-hidden border border-[var(--rule)] bg-[var(--sheet)]">
                <table className="data-table">
                  <caption className="sr-only">Metric definitions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col">Definition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(([metric, definition]) => (
                      <tr key={metric}>
                        <td className="whitespace-nowrap font-medium">{metric}</td>
                        <td className="text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                          {definition}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                Coverage is modelled access, not attendance, utilisation, clinical
                quality, or health benefit.
              </p>
            </section>

            <section id="data" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="07">Data validation</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Real sources, with their defects visible.
              </h2>
              <div className="mt-4 space-y-3">
                {[
                  ["Boundary", "OpenStreetMap relation 1942586 (admin_level=4, ISO IN-DL), 1,482.04 km², validated against the official 1,483 km² figure."],
                  ["Wards", "DataMeet 272-ward municipal layer plus 18 NDMC/Cantonment charges. Ward polygons extending outside the NCT boundary were clipped at build time (44 wards, 10.5 km²); population counts are unchanged."],
                  ["Population", "Census of India 2011 ward-level Primary Census Abstract. All 272 MCD ward numbers joined exactly; the total 16,000,745 cross-checks against the official 16,787,941 NCT total minus NDMC, Cantonment, and rural population."],
                  ["Facilities", "1,856 OSM elements filtered to 1,368 care facilities; 472 excluded as pharmacies, dentists, laboratories outside the care model, or other out-of-scope tags; 16 duplicates merged only when the normalised name matched within 150 m; zero outside the boundary."],
                  ["Roads", "125,452 drivable ways assembled into a 532,088-node graph. The largest connected component covers 99.5% of nodes. Zero areas and zero facilities are unreachable in the baseline matrix."],
                  ["Imports", "CSV/GeoJSON facilities are validated for schema, coordinate range, category, services, duplicates, and boundary containment. Population-area imports are disabled for Delhi because the release must match the validated Census ward set."],
                  ["Provenance", "Every facility carries its OSM element ID, source URL, relevant tags, and operational_status=unknown. The dataset manifest records release ID, source dates, licences, counts, and validation results."],
                ].map(([label, detail]) => (
                  <div key={label} className="border border-[var(--rule)] bg-[var(--sheet)] p-3">
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      {label}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`${API_BASE}/api/v1/meta`}
                  className="link-dashed text-[10.5px]"
                  target="_blank"
                  rel="noreferrer"
                >
                  Live dataset manifest
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </a>
                <Link href="/app/data-sources" className="link-dashed text-[10.5px]">
                  Source register
                </Link>
              </div>
            </section>

            <section id="testing" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="08">Testing</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Known answers, not vibes.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                Backend tests include known-answer accessibility cases with
                nullable population, a dictionary/array parity test, the
                additive non-worsening invariant, release validation (population
                sum, geometry, boundary containment, facility provenance,
                duplicate checks), routing consistency, API contracts, import
                validation, read-only mode, and a failure test proving a missing
                real-data release does not fall back to synthetic data.
              </p>
              <pre className="mono mt-4 overflow-x-auto border border-[var(--rule)] bg-[var(--sheet)] p-4 text-[11px] leading-relaxed text-[var(--ink)]">
{`cd backend
../.venv/bin/ruff check app tests
../.venv/bin/pytest

cd ../frontend
npm run lint
npm run typecheck
npm test
npm run build

npx playwright test`}
              </pre>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                Actual pass/fail counts for each run are recorded in the release
                report and the repository README. A skipped or unavailable test is
                reported as such, never counted as a pass.
              </p>
            </section>

            <section id="limitations" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="09">Limitations</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                What this pilot cannot establish.
              </h2>
              <ul className="mt-4 space-y-2.5">
                {[
                  ["Historical population", "Census 2011 is a 2011 baseline, not current population. The 2022 municipal delimitation is not represented."],
                  ["Partial denominator", "NDMC and Cantonment charge populations, rural village population, and the unassigned riverbed are outside the denominators. Results describe 95.3% of the 2011 NCT population."],
                  ["Incomplete facility inventory", "OpenStreetMap completeness is unknown. A facility absent from the map is not evidence that care is absent."],
                  ["Unverified services", "Service attribution comes from tags. Operating status, staffing, hours, equipment, stock, affordability, and quality are not verified or modelled."],
                  ["Coarse geography", "Ward centroids represent where people live. Intra-ward differences and informal settlements are concealed."],
                  ["Routing assumptions", "No live traffic, one-way restrictions, turn restrictions, public transport, walking, or seasonal access."],
                  ["No vulnerability input", "Equity weighting is disabled rather than fabricated. Vulnerable sub-populations are not identified."],
                  ["Heuristic ranking", "Greedy candidate selection is not globally optimal and ignores land, ownership, utilities, flood risk, and cost."],
                  ["No outcome claims", "Coverage is modelled access, not utilisation, treatment, health improvement, or causal effect."],
                  ["Public-demo controls", "The API has no authentication by default. Mutating endpoints must be disabled (read-only mode) or protected before public exposure."],
                ].map(([title, detail]) => (
                  <li key={title} className="border-l-2 border-[var(--rule-strong)] pl-3">
                    <p className="text-[11.5px] font-medium text-[var(--ink)]">{title}</p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                      {detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section id="responsible" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="10">Responsible use</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Coverage is not care.
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-[var(--ink)]">
                    <CircleCheck className="h-3.5 w-3.5 text-[var(--signal)]" strokeWidth={1.7} aria-hidden="true" />
                    Appropriate uses
                  </p>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                    Comparing modelled access, finding candidate sites, testing
                    assumptions, and asking better questions before resources are
                    committed.
                  </p>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-[var(--ink)]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--gap)]" strokeWidth={1.7} aria-hidden="true" />
                    Not appropriate
                  </p>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                    Allocating real resources, inferring individual need, making
                    clinical decisions, or claiming that a mapped facility is
                    staffed and available.
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                No patient-identifiable data is collected, accepted, or required.
                CareGap is an aggregate geographic planning tool, not a clinical
                record system. It is not affiliated with, endorsed by, or an
                official product of the Government of NCT of Delhi or any
                facility operator.
              </p>
            </section>

            <section id="design" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="11">Design record</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                An inspection instrument, not a dashboard.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                The interface is an original implementation informed by the
                InstaLanding design library: Halden Clinical Equipment (clinical
                restraint, mono instrumentation, inspection board), Footnote
                (warm paper, Source Serif, semantic highlighter), GEO/LAB (spatial
                instrumentation), and Mirador (rail + context filters). No
                third-party code, fonts, or assets were copied. See the design
                audit and credits in the repository documentation.
              </p>
              <div className="mt-4 flex flex-wrap gap-4">
                <Link href="/app/data-sources" className="link-dashed text-[10.5px]">
                  <BookOpenText className="h-3 w-3" aria-hidden="true" />
                  Source register
                </Link>
                <Link href="/app" className="link-dashed text-[10.5px]">
                  <FlaskConical className="h-3 w-3" aria-hidden="true" />
                  Open the workspace
                </Link>
              </div>
            </section>
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <div className="border-t border-[var(--rule-strong)] pt-3">
                <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  At a glance
                </p>
                <dl className="mt-3 space-y-2">
                  {[
                    ["Geography", "NCT of Delhi"],
                    ["Boundary", "1,482 km²"],
                    ["Population", "Census 2011"],
                    ["Represented", "16,000,745"],
                    ["Areas", "290 (272 populated)"],
                    ["Facilities", "1,368 OSM"],
                    ["Routing", "OSM roads"],
                    ["Live traffic", "No"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-3 border-b border-[var(--rule)] pb-1.5"
                    >
                      <dt className="mono text-[8px] uppercase tracking-[0.07em] text-[var(--ink-3)]">
                        {label}
                      </dt>
                      <dd className="mono text-right text-[9.5px] text-[var(--ink-2)]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="border border-[var(--gap)]/30 bg-[var(--gap-soft)]/35 p-3">
                <p className="mono text-[8px] uppercase tracking-[0.1em] text-[#7d4b0e]">
                  Honest uncertainty
                </p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--ink-2)]">
                  Missing population values stay null. Missing vulnerability data
                  disables equity scoring. Missing roads stop the real-data
                  startup. The model does not fill gaps with invented numbers.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
