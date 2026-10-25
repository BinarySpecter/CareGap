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
    "How CareGap computes accessibility, simulates interventions, ranks candidate sites, validates imports, and states its limits.",
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
  ["District hospital", "Primary care · Maternal health · Diagnostics · Emergency"],
  ["Primary health centre", "Primary care · Maternal health · Diagnostics"],
  ["Community health centre", "Primary care · Maternal health"],
  ["Diagnostic centre", "Diagnostics"],
  ["Maternal health centre", "Maternal health"],
  ["Primary care clinic (proposal)", "Primary care · Maternal health"],
  ["Mobile clinic (proposal)", "Primary care"],
  ["Diagnostic centre (proposal)", "Diagnostics"],
  ["Medical camp (proposal)", "Primary care · Maternal health"],
];

export default function MethodologyPage() {
  return (
    <div className="page-gutter">
      <div className="content-max pb-12 pt-6">
        <PageHeader
          index="07"
          eyebrow="Methodology & governance"
          title="A conclusion you can trace."
          description="The accessibility model, scoring rules, data-validation gates, mathematical invariants, and explicit limitations behind every number in CareGap. This page is documentation for a decision-support tool, not clinical guidance."
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
                actually provide the selected service. CareGap does not assume
                that the nearest facility is suitable. Service suitability is an
                explicit mapping maintained in the backend catalogue and shown
                below.
              </p>
              <p className="measure mt-3 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                For service <span className="mono">s</span>, threshold{" "}
                <span className="mono">T</span>, population area{" "}
                <span className="mono">i</span>, and suitable facility set{" "}
                <span className="mono">F_s</span>:
              </p>
              <pre className="mono mt-4 overflow-x-auto border border-[var(--rule)] bg-[var(--sheet)] p-4 text-[11px] leading-relaxed text-[var(--ink)]">
{`t_i = min over f in F_s of travel_time(i, f)
covered_i = 1 if t_i <= T else 0
coverage = sum(population_i * covered_i) / sum(population_i)
weighted_mean_time = sum(population_i * t_i) / sum(population_i)`}
              </pre>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                Areas with no suitable mapped facility are treated as uncovered
                with no travel time. They are surfaced separately rather than
                assigned an invented distance.
              </p>

              <div className="mt-6 overflow-hidden border border-[var(--rule)] bg-[var(--sheet)]">
                <div className="border-b border-[var(--rule)] px-4 py-3">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Service suitability used by the demo
                  </p>
                </div>
                <table className="data-table">
                  <caption className="sr-only">
                    Facility types and the services they are modelled as providing
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Facility type</th>
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
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                A service tag means the facility is modelled as offering the
                service. It does not verify staff, equipment, stock, hours,
                affordability, or quality.
              </p>
            </section>

            <section id="travel" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="02">Travel-time model</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                A synthetic street grid, clearly labelled.
              </h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <div>
                  <p className="text-[13px] leading-[1.75] text-[var(--ink-2)]">
                    The bundled demo builds a deterministic 2.0 km road grid over
                    the synthetic district. Edges have plausible speed classes
                    (arterial 48 km/h, collector 36, local 24, diagonal local 20).
                    Shortest paths use Dijkstra over edge time. Population
                    centroids and facilities are snapped to the nearest grid node;
                    a local access leg is added at 18 km/h.
                  </p>
                  <p className="mt-3 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                    Travel time is computed in UTM zone 43N for distance accuracy,
                    then returned in minutes. Results are cached per facility
                    source within the running server process.
                  </p>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Explicitly not claimed
                  </p>
                  <ul className="mt-2 space-y-2">
                    {[
                      "Not live traffic, congestion, closures, or turn-by-turn routing.",
                      "Not a real road network; the demo grid is synthetic.",
                      "Not walking, public transport, or emergency-response time.",
                      "Not facility wait time, opening hours, or service availability.",
                    ].map((item) => (
                      <li key={item} className="flex gap-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--gap)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-[var(--rule)] pt-2.5 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    If the travel-time model cannot load, the API falls back to a
                    straight-line estimate (1.35 detour factor, 28 km/h) and labels
                    it as such. Straight-line distance is never presented as actual
                    road travel time.
                  </p>
                </div>
              </div>
              <div className="mt-5 border-l-2 border-[var(--gap)] pl-4">
                <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--gap)]">
                  Metric note
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                  Mean, median, and p90 travel times are population-weighted. A
                  median of 18 minutes means half of the modelled population is at
                  or below that value, not half of the polygons.
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
                at least <span className="mono">20%</span> of the modelled
                population is in the group. Unreachable areas sort first. The
                page then reports coverage and population-weighted mean time for
                that fixed group before and after the intervention.
              </p>
              <p className="measure mt-3 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                This is a transparent, reproducible working definition, not an
                official equity standard. It captures one dimension of
                distribution (baseline travel access); it does not measure income,
                caste, gender, disability, informal settlement status, or
                community-reported barriers.
              </p>
              <div className="mt-4 border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Vulnerability in the demo
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                  The demo vulnerability index is synthetic and correlated with
                  invented distance from invented urban centres plus seeded noise.
                  It is used only to weight candidate ranking. It must not be
                  interpreted as a real demographic or health-risk measure. For a
                  production deployment, vulnerability inputs require validated
                  provenance, community review, and an explicit governance process.
                </p>
              </div>
            </section>

            <section id="simulator" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="04">Intervention simulation</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Additive, recomputed, and unable to worsen modelled access.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                A scenario adds one or more proposed facilities at validated
                coordinates and re-runs the accessibility calculation for every
                population area. Existing facilities remain available and are not
                removed or downgraded. The intervention type determines which
                services it is modelled as providing.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--signal)]">
                    Mathematical invariant
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                    If the model only adds a facility to the suitable set and does
                    not remove or alter existing facilities, then the minimum
                    travel time can never increase:
                  </p>
                  <pre className="mono mt-2 overflow-x-auto bg-[var(--paper-2)] p-2.5 text-[10px] leading-relaxed">
{`t_i(proposed) = min(t_i(baseline), t_i(new))
=> t_i(proposed) <= t_i(baseline)`}
                  </pre>
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    This invariant is covered by automated tests. A positive
                    &ldquo;wards worsened&rdquo; count would indicate a model or data
                    defect and is shown as a warning.
                  </p>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Not modelled
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {[
                      "Facility capacity, staffing, and supply availability",
                      "Opening days/hours, queues, and scheduling",
                      "Cost, insurance, and affordability",
                      "Clinical quality, safety, and outcomes",
                      "Travel mode differences and seasonal road conditions",
                    ].map((item) => (
                      <li key={item} className="flex gap-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--ink-3)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-[var(--rule)] pt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    Mobile clinics and medical camps therefore share the same
                    travel-time mechanics, with their schedule/capacity assumptions
                    documented on the simulator panel and in the API response.
                  </p>
                </div>
              </div>
            </section>

            <section id="recommendations" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="05">Recommendations</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                A documented heuristic, not an optimum.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                Candidate sites are the centroids of population areas. Each
                candidate is evaluated by re-running the same accessibility
                engine with one facility added. The composite score uses three
                normalised components:
              </p>
              <pre className="mono mt-4 overflow-x-auto border border-[var(--rule)] bg-[var(--sheet)] p-4 text-[11px] leading-relaxed">
{`coverage = newly covered population / best candidate value
equity   = vulnerability-weighted newly covered / best value
travel   = person-minutes saved / best value

score = (1 - w_e) * coverage
      + w_e * (0.75 * equity + 0.25 * travel)
score = score * 0.9  if candidate area is already within threshold`}
              </pre>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">
                    Default <span className="mono">w_e = 0.35</span>. The weight is
                    user-configurable. Components are normalised by the maximum
                    candidate value in the current run, so scores are relative to
                    that candidate set, not absolute utility. The concentration
                    penalty softly discourages placing new resources in areas that
                    are already within the threshold.
                  </p>
                  <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
                    The recommended set is built greedily: select the best
                    marginal candidate, re-run the analysis with it added, then
                    select again. Later picks therefore see the effect of earlier
                    picks. Ties break deterministically by area ID. A greedy
                    solution is not guaranteed to be globally optimal.
                  </p>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--gap)]">
                    Limitations
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {[
                      "Population-area centroids are not parcels and may be unsuitable sites.",
                      "Land ownership, flood risk, road access, utilities, and construction cost are absent.",
                      "The synthetic vulnerability index is not a real demographic input.",
                      "Relative normalisation can change with candidate composition.",
                      "One facility per area centroid is a coarse spatial resolution.",
                    ].map((item) => (
                      <li key={item} className="flex gap-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--gap)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section id="impact" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="06">Impact metrics</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Before and after use the same denominator.
              </h2>
              <div className="mt-4 overflow-hidden border border-[var(--rule)] bg-[var(--sheet)]">
                <table className="data-table">
                  <caption className="sr-only">Impact metric definitions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col">Definition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Newly covered population", "Sum of population in areas where nearest suitable time moves from above the threshold to at or below it."],
                      ["Coverage gain", "Proposed coverage percent minus baseline coverage percent, in percentage points."],
                      ["Weighted mean time change", "Proposed population-weighted mean time minus baseline; negative values indicate improvement."],
                      ["Residual gap", "Population and areas still above the threshold after the intervention."],
                      ["Worst-served improvement", "Change in coverage and mean time for the fixed worst-served population group defined from baseline."],
                      ["Wards worsened", "Areas whose proposed time exceeds baseline by more than 0.05 minutes. Expected to be zero in this additive model."],
                    ].map(([metric, definition]) => (
                      <tr key={metric}>
                        <td className="whitespace-nowrap font-medium">{metric}</td>
                        <td className="text-[10.5px] leading-relaxed text-[var(--ink-2)]">{definition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                Population coverage is an estimated count of people whose nearest
                suitable mapped facility is within the threshold. It does not
                assert that anyone attended, received a service, or experienced a
                health benefit.
              </p>
            </section>

            <section id="data" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="07">Data validation</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Imports are checked before they change the analysis.
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <ul className="space-y-2">
                    {[
                      "UTF-8 text only; CSV or GeoJSON; 2 MB default maximum; 5,000-row cap.",
                      "Facilities require a name, known facility_type, valid longitude/latitude, and services (defaulted from type when absent).",
                      "Facility points must fall inside the dataset's area boundaries.",
                      "Areas require valid Polygon/MultiPolygon geometry, a name, and positive population.",
                      "Same-name facilities within 50 m and areas within 200 m are reported as possible duplicates.",
                      "Every row is validated; a report returns row, field, and message. Valid rows may still be imported with errors reported.",
                      "No silent replacement: imported records receive new IDs and imported status; existing records remain.",
                    ].map((item) => (
                      <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                        <CircleCheck className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Facility CSV minimum
                  </p>
                  <pre className="mono mt-2 overflow-x-auto bg-[var(--paper-2)] p-2.5 text-[9.5px] leading-relaxed">
{`name,facility_type,lon,lat,services
New PHC,primary_health_centre,
73.860,18.520,primary_care`}
                  </pre>
                  <p className="mt-2 text-[9.5px] leading-relaxed text-[var(--ink-3)]">
                    GeoJSON facility features must be Points; area features must be
                    Polygons or MultiPolygons. Import history is stored with status
                    and validation errors.
                  </p>
                  <Link href="/app/data-sources" className="link-dashed mt-3 text-[10px]">
                    Open the data workspace
                  </Link>
                </div>
              </div>
            </section>

            <section id="testing" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="08">Validation &amp; automated tests</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Claims are backed by executable checks.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                The backend test suite exercises coordinate validation,
                service-suitability filtering, threshold handling, population
                coverage, weighted statistics, scenario comparison, the
                no-worsening invariant, candidate-ranking determinism, import
                validation, API contracts, and database seeding. The frontend test
                suite covers formatting, access-band logic, stateful controls, and
                display of analysis-derived values.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`${API_BASE}/docs`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  OpenAPI documentation
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <a
                  href={`${API_BASE}/health`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  API health
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                CI runs backend lint and tests, migration validation, frontend
                lint, type checking, unit tests, and a production build. A build
                is not evidence that a deployed service is healthy; deployment
                verification is separate.
              </p>
            </section>

            <section id="limitations" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="09">Known limitations</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                What this release does not resolve.
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["Synthetic geography", "The demo boundary, population, vulnerability, facilities, and road grid are generated. They describe no real district."],
                  ["Incomplete facility inventories", "A missing mapped facility is not evidence that care is absent. Real inventories require authoritative, current sources."],
                  ["Access ≠ availability", "Travel-time coverage ignores capacity, staffing, opening hours, cost, equipment, and service readiness."],
                  ["No health outcomes", "The model does not estimate morbidity, mortality, utilisation, or the health impact of a new facility."],
                  ["Static routing", "No live traffic, public transport, seasonal roads, or turn-by-turn road network. Results are estimates under fixed assumptions."],
                  ["Coarse spatial units", "Area centroids stand in for populations; within-area inequality and travel by individuals are not represented."],
                  ["Vulnerability proxy", "The synthetic index is illustrative and not suitable for real prioritisation or protected-group analysis."],
                  ["Heuristic optimisation", "Greedy ranking is not globally optimal and uses relative normalisation, so scores can shift with candidate composition."],
                  ["No authentication", "The local build has no accounts, roles, rate limiting, or audit trail. It must not be publicly deployed without those controls."],
                  ["No public data ingestion", "Only validated local imports are supported. There is no automated scraping or live government-feed integration."],
                ].map(([title, detail]) => (
                  <div key={title} className="border border-[var(--rule)] bg-[var(--sheet)] p-3.5">
                    <p className="text-[11px] font-medium text-[var(--ink)]">{title}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-2)]">{detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="responsible" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="10">Responsible use</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Decision support, not diagnosis or allocation.
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[var(--positive)]" strokeWidth={1.6} aria-hidden="true" />
                    <p className="text-[11.5px] font-medium text-[var(--ink)]">
                      Privacy posture
                    </p>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {[
                      "No patient-identifiable data collected or required.",
                      "Population values are area-level and synthetic in the demo.",
                      "No clinical records, addresses, or individual histories.",
                      "Secrets are environment variables; no credentials are committed.",
                    ].map((item) => (
                      <li key={item} className="flex gap-2 text-[10px] leading-relaxed text-[var(--ink-2)]">
                        <CircleCheck className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[var(--signal)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4 text-[var(--gap)]" strokeWidth={1.6} aria-hidden="true" />
                    <p className="text-[11.5px] font-medium text-[var(--ink)]">
                      Use constraints
                    </p>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-2)]">
                    Do not use this demo to allocate real resources, infer
                    individual need, or make clinical decisions. Any real
                    deployment requires local validation, community engagement,
                    source governance, privacy review, authentication, audit
                    logging, and review by public-health professionals. South
                    Asian district planning also requires sensitivity to
                    settlements, transport modes, seasonal access, and
                    informal providers that are not modelled here.
                  </p>
                </div>
              </div>
            </section>

            <section id="design" className="mt-14 scroll-mt-24 border-t border-[var(--rule-strong)] pt-8">
              <SectionLabel index="11">Design record</SectionLabel>
              <h2 className="display mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.9rem)]">
                Why the product looks like this.
              </h2>
              <p className="measure mt-4 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                CareGap&apos;s interface is an original implementation informed by
                four references inspected in source from the InstaLanding library:
                <span className="font-medium text-[var(--ink)]"> Halden Clinical Equipment</span> for
                clinical restraint, one signal colour, mono instrumentation, and
                the inspection-board pattern;
                <span className="font-medium text-[var(--ink)]"> the Footnote design system</span> for
                warm paper, Source Serif editorial typography, mono labels, and
                semantic highlighter marks;
                <span className="font-medium text-[var(--ink)]"> GEO/LAB Planetary Geography</span> for
                treating spatial data as an instrument rather than wallpaper; and
                <span className="font-medium text-[var(--ink)]"> Mirador Observability</span> for
                the rail, context filters, and data-console composition.
              </p>
              <p className="measure mt-3 text-[13px] leading-[1.75] text-[var(--ink-2)]">
                SmartCare Clinical AI and Calibre Grading Bench were also inspected.
                Their iridescent clinical AI treatment and orange threat/gauge
                language were deliberately not adopted: they signal capability or
                alarm that this model cannot support. No reference code, assets,
                fonts, or copy were copied. InstaLanding&apos;s library is MIT;
                Halden credits the 8B Reflow template (MIT). The full audit and
                licence notes live in <span className="mono">docs/design-audit.md</span>.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Type system
                  </p>
                  <p className="serif mt-2 text-[30px] leading-none text-[var(--ink)]">
                    Source Serif 4
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                    Display, large values, editorial emphasis
                  </p>
                  <p className="mt-3 text-[13px] font-medium text-[var(--ink)]">
                    Geist · interface and reading copy
                  </p>
                  <p className="mono mt-2 text-[9px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
                    JetBrains Mono · data, units, coordinates, labels
                  </p>
                </div>
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Palette roles
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      ["#f7f4eb", "Paper"],
                      ["#0c1d1e", "Ink"],
                      ["#0e7169", "Signal"],
                      ["#b76f1b", "Gap"],
                      ["#a94338", "Critical"],
                      ["#377a5a", "Positive"],
                      ["#081a1c", "Field"],
                      ["#d8d2c3", "Rule"],
                    ].map(([color, label]) => (
                      <div key={color}>
                        <span
                          className="block h-8 w-full rounded-[2px] border border-black/10"
                          style={{ background: color }}
                        />
                        <span className="mono mt-1 block text-[7.5px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[9.5px] leading-relaxed text-[var(--ink-3)]">
                    Teal is the only interactive accent. Ochre and rose are
                    reserved for measured gaps and warnings. Colour is never the
                    sole carrier of meaning: every band has a label and value.
                  </p>
                </div>
              </div>
            </section>

            <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule-strong)] pt-4">
              <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Document status · v0.1 · reviewed against code at this commit
              </p>
              <Link href="/app/data-sources" className="arrow-link text-[10.5px] text-[var(--signal)]">
                Data sources &amp; imports
                <BookOpenText className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </article>

          <aside className="hidden xl:block">
            <div className="sticky top-24 space-y-4">
              <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Document control
                </p>
                <dl className="mt-2 space-y-2">
                  {[
                    ["Version", "0.1.0"],
                    ["Backend", "FastAPI + SQLAlchemy"],
                    ["Spatial", "Shapely + pyproj + NetworkX"],
                    ["Frontend", "Next.js + MapLibre"],
                    ["Dataset", "Synthetic demo"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2 border-b border-[var(--rule)] pb-1.5">
                      <dt className="mono text-[7.5px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                        {label}
                      </dt>
                      <dd className="text-right text-[9.5px] text-[var(--ink-2)]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="border-l-2 border-[var(--gap)] bg-[var(--paper-2)] p-3.5">
                <p className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--ink)]">
                  <Info className="h-3 w-3 text-[var(--gap)]" aria-hidden="true" />
                  Not a clinical tool
                </p>
                <p className="mt-1.5 text-[9.5px] leading-relaxed text-[var(--ink-2)]">
                  CareGap estimates geographic accessibility. It does not measure
                  clinical need, diagnose conditions, or recommend individual care.
                </p>
              </div>
              <div className="border border-[var(--rule)] bg-[var(--sheet)] p-3.5">
                <p className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--ink)]">
                  <FlaskConical className="h-3 w-3 text-[var(--signal)]" aria-hidden="true" />
                  Reproducible demo
                </p>
                <p className="mt-1.5 text-[9.5px] leading-relaxed text-[var(--ink-2)]">
                  The demo dataset is generated deterministically from a committed
                  script with a fixed seed. Regeneration and provenance are
                  documented in the repository.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
