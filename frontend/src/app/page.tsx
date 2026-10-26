import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Crosshair,
  Database,
  Map,
  ScanSearch,
  Target,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AccessScanner } from "@/components/landing/AccessScanner";
import { CandidateSpotlight } from "@/components/landing/CandidateSpotlight";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LiveProblemStats } from "@/components/landing/LiveProblemStats";
import { ModelLedger } from "@/components/landing/ModelLedger";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealObserver } from "@/components/ui/RevealObserver";

const WORKSPACE_STEPS = [
  {
    index: "01",
    title: "Read the baseline",
    href: "/app/explore",
    icon: ScanSearch,
    copy: "See every population area ranked by estimated travel time to the nearest suitable facility, and inspect the wards that fall outside a chosen threshold.",
  },
  {
    index: "02",
    title: "Place a proposed resource",
    href: "/app/simulator",
    icon: Crosshair,
    copy: "Choose primary care, a mobile unit, diagnostics, or a camp. Place it on the map. The server re-runs the same accessibility model with the facility added.",
  },
  {
    index: "03",
    title: "Compare and defend",
    href: "/app/analytics",
    icon: ChartNoAxesCombined,
    copy: "Review newly covered population, equity gains, residual gaps, and a deterministic shortlist of alternative locations with a written rationale.",
  },
];

const PRODUCT_IMAGES = [
  {
    src: "/screenshots/overview.png",
    alt: "CareGap Overview workspace showing the Delhi ward access map, coverage metrics, and selected ward details.",
    label: "Overview / live access surface",
    caption:
      "A map-first baseline: Census 2011 wards shaded by modelled travel time, OpenStreetMap facilities, and a live inspector.",
    href: "/app",
  },
  {
    src: "/screenshots/simulator.png",
    alt: "CareGap Intervention Simulator showing a proposed primary care clinic and before-and-after coverage results.",
    label: "Intervention simulator / before + after",
    caption:
      "Place a proposed facility and compare baseline and proposed coverage calculated by the same engine.",
    href: "/app/simulator",
  },
  {
    src: "/screenshots/recommendations.png",
    alt: "CareGap Recommended Locations workspace showing ranked candidate sites and strategy comparison.",
    label: "Recommended locations / explainable shortlist",
    caption:
      "Candidate sites ranked with visible components, beneficiary areas, and documented assumptions. Equity weighting is shown only when a validated vulnerability indicator exists.",
    href: "/app/recommendations",
  },
];

export default function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main id="main-content">
        <section className="relative overflow-hidden border-b border-[var(--rule)]">
          <div className="contour-lines pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
          <div className="rule-grid-bg absolute inset-y-0 right-0 hidden w-[46%] opacity-35 lg:block" aria-hidden="true" />
          <div className="page-gutter relative">
            <div className="content-max grid gap-10 pb-12 pt-10 lg:grid-cols-12 lg:gap-8 lg:pb-14 lg:pt-14 xl:gap-12">
              <div className="flex flex-col justify-between lg:col-span-5">
                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-2)] font-semibold bg-yellow-300 px-1 py-0.5">
                      Healthcare Access Intelligence
                    </span>
                    <span className="h-3 w-px bg-[var(--rule-strong)]" aria-hidden="true" />
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                      Delhi pilot · Census 2011 baseline
                    </span>
                  </div>

                  <h1 className="display mt-7 max-w-[700px] text-[clamp(3.5rem,2.55rem+4.2vw,6.2rem)] text-[var(--ink)]">
                    Put care
                    <br />
                    within{" "}
                    <span className="mark mark-teal">reach.</span>
                  </h1>
                  <p className="serif mt-4 text-[clamp(1.35rem,1.1rem+0.9vw,1.9rem)] italic leading-tight text-[var(--ink-2)]">
                    Not just on the map.
                  </p>
                  <br/>

                  <p className="measure-narrow mt-6 text-[14px] leading-[1.7] text-[var(--ink-2)]">
                    CareGap measures who can actually reach suitable care,
                    simulates new clinics and mobile units, and ranks the
                    locations that improve access for the communities still left
                    outside.
                  </p>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <Link href="/app" className="btn btn-primary">
                      Open the access workspace
                      <ArrowUpRight className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                    </Link>
                    <Link href="#method" className="btn btn-outline">
                      Read the method
                    </Link>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
                    {[
                      "Deterministic spatial analysis",
                      "Census 2011 population, dated",
                    ].map((item) => (
                      <span
                        key={item}
                        className="mono flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.07em] text-[var(--ink-3) font-semibold]"
                      >
                        <span className="h-1 w-1 rounded-full bg-[var(--signal)]" aria-hidden="true" />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-10 hidden border-t border-[var(--rule)] pt-4 lg:block">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                        Study geography
                      </p>
                      <p className="mono mt-1 text-[10px] text-[var(--ink-2)]">
                        28.64°N / 77.21°E · 1,482 km² NCT of Delhi
                      </p>
                    </div>
                    <p className="mono text-right text-[8px] uppercase leading-[1.6] tracking-[0.08em] text-[var(--ink-3)]">
                      No patient data
                      <br />
                      No live traffic
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7">
                <AccessScanner />
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--rule)]" aria-label="Product principles">
          <div className="page-gutter">
            <div className="content-max grid gap-px bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Baseline",
                  value: "Nearest suitable facility",
                  detail: "Service suitability is part of the calculation.",
                },
                {
                  label: "Intervention",
                  value: "Additive simulation",
                  detail: "Existing facilities remain; new ones are recalculated.",
                },
                {
                  label: "Ranking",
                  value: "Greedy + equity-weighted",
                  detail: "A documented heuristic, never sold as optimal.",
                },
                {
                  label: "Evidence",
                  value: "Deterministic, auditable",
                  detail: "Every displayed number traces to the analysis API.",
                },
              ].map((item) => (
                <div key={item.label} className="bg-[var(--paper)] py-4 sm:px-5 sm:pl-0 lg:px-5">
                  <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {item.label}
                  </p>
                  <p className="mt-1.5 text-[11.5px] font-medium text-[var(--ink)]">
                    {item.value}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="problem" className="border-b border-[var(--rule)]" data-reveal>
          <div className="page-gutter">
            <div className="content-max py-16 sm:py-20 lg:py-24">
              <div className="grid gap-10 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <SectionLabel index="01">Why access</SectionLabel>
                  <p className="mono mt-5 max-w-[190px] text-[9px] uppercase leading-[1.8] tracking-[0.07em] text-[var(--ink-3)]">
                    A mapped clinic is an input.
                    <br />
                    Reachable care is the outcome
                    <br />
                    the model can interrogate.
                  </p>
                </div>
                <div className="lg:col-span-8 lg:col-start-5">
                  <h2 className="display max-w-[900px] text-[clamp(2.5rem,1.8rem+3vw,4.7rem)]">
                    A facility on the map is not the same as care{" "}
                    <span className="mark mark-gap">within reach.</span>
                  </h2>
                  <p className="measure mt-6 text-[14px] leading-[1.75] text-[var(--ink-2)]">
                    The nearest option may not offer the right service. A road
                    may add forty minutes. A population area may be counted as
                    covered without anyone asking who lives there. CareGap makes
                    those distinctions explicit, then lets planners test what
                    changes if a new resource appears.
                  </p>
                  <LiveProblemStats />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workspace" className="border-b border-[var(--rule)]" data-reveal>
          <div className="page-gutter">
            <div className="content-max py-16 sm:py-20 lg:py-24">
              <div className="grid gap-12 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <div className="lg:sticky lg:top-24">
                    <SectionLabel index="02">The workspace</SectionLabel>
                    <h2 className="display mt-4 max-w-[520px] text-[clamp(2.4rem,1.9rem+2.2vw,3.8rem)]">
                      From baseline to a defensible <em>shortlist.</em>
                    </h2>
                    <p className="measure mt-5 text-[13.5px] leading-[1.75] text-[var(--ink-2)]">
                      CareGap is not a static dashboard. The map, scenario
                      results, and recommendation explanations all use the same
                      spatial analysis. Change a threshold or move a proposed
                      facility and the supported values change with it.
                    </p>
                    <div className="mt-7 space-y-0">
                      {WORKSPACE_STEPS.map((step) => {
                        const Icon = step.icon;
                        return (
                          <Link
                            key={step.index}
                            href={step.href}
                            className="group flex gap-3 border-t border-[var(--rule)] py-4 last:border-b"
                          >
                            <span className="mono w-6 shrink-0 pt-1 text-[9px] text-[var(--ink-3)]">
                              {step.index}
                            </span>
                            <Icon
                              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--signal)]"
                              strokeWidth={1.6}
                              aria-hidden="true"
                            />
                            <span>
                              <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink)]">
                                {step.title}
                                <ArrowRight
                                  className="h-3 w-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                                  aria-hidden="true"
                                />
                              </span>
                              <span className="mt-1 block text-[10.5px] leading-relaxed text-[var(--ink-3)]">
                                {step.copy}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-8">
                  <div className="space-y-4">
                    {PRODUCT_IMAGES.map((image, index) => (
                      <figure
                        key={image.src}
                        className={
                          index === 0
                            ? "paper-sheet overflow-hidden"
                            : "paper-sheet overflow-hidden sm:ml-8"
                        }
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] px-3 py-2">
                          <span className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                            {image.label}
                          </span>
                          <span className="mono flex items-center gap-1.5 text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                            <span className="status-dot h-[4px] w-[4px]" aria-hidden="true" />
                            Census 2011 · OSM
                          </span>
                        </div>
                        <Link href={image.href} className="block bg-[var(--paper-2)]">
                          <Image
                            src={image.src}
                            alt={image.alt}
                            width={1440}
                            height={1000}
                            className="h-auto w-full"
                            sizes="(min-width: 1024px) 55vw, 100vw"
                          />
                        </Link>
                        <figcaption className="border-t border-[var(--rule)] px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                          {image.caption}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <p className="mono mt-4 text-[8px] uppercase leading-relaxed tracking-[0.08em] text-[var(--ink-3)]">
                    Captured from the running workspace. Values are computed by the
                    analysis API; screenshots are not decorative mockups.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="engine" className="border-b border-[var(--rule)] bg-[var(--paper-2)]" data-reveal>
          <div className="page-gutter">
            <div className="content-max py-16 sm:py-20 lg:py-24">
              <div className="grid gap-10 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <SectionLabel index="03">Intervention engine</SectionLabel>
                  <h2 className="display mt-4 text-[clamp(2.5rem,1.95rem+2.5vw,4.2rem)]">
                    Move the pin.
                    <br />
                    Recompute the <span className="mark mark-teal">district.</span>
                  </h2>
                  <p className="measure mt-5 text-[13.5px] leading-[1.75] text-[var(--ink-2)]">
                    The simulator is the centre of the product. It adds a proposed
                    facility to the network, re-runs accessibility for every
                    population area, and compares coverage, travel times, and
                    equity against the baseline.
                  </p>
                  <div className="mt-7 grid grid-cols-3 gap-3 border-y border-[var(--rule)] py-4">
                    {[
                      ["Input", "Location, type, service"],
                      ["Method", "Nearest suitable facility"],
                      ["Output", "Newly covered people"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="mono text-[7.5px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                          {label}
                        </p>
                        <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--ink-2)]">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Link href="/app/simulator" className="arrow-link mt-6 text-[var(--signal)]">
                    Test an intervention
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <div className="lg:col-span-6 lg:col-start-7">
                  <CandidateSpotlight />
                  <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    The sample is computed live from the local analysis API.
                    Candidate sites are population-area centroids; the ranking is
                    a greedy heuristic and not a global optimum.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="method" className="border-b border-[var(--rule)]" data-reveal>
          <div className="page-gutter">
            <div className="content-max py-16 sm:py-20 lg:py-24">
              <ModelLedger />
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--rule)]" data-reveal>
          <div className="page-gutter">
            <div className="content-max grid gap-8 py-12 sm:py-16 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <p className="mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  Public-health responsibility
                </p>
                <p className="serif mt-3 text-[clamp(1.5rem,1.2rem+1vw,2.1rem)] leading-tight text-[var(--ink)]">
                  Coverage is not care.
                  <br />
                  A score is not a decision.
                </p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-medium text-[var(--ink)]">
                    <Map className="h-3.5 w-3.5 text-[var(--signal)]" strokeWidth={1.6} aria-hidden="true" />
                    What the engine supports
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                    Comparing modelled access, finding candidate sites,
                    understanding trade-offs, and asking better questions before
                    resources are committed.
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-medium text-[var(--ink)]">
                    <Target className="h-3.5 w-3.5 text-[var(--gap)]" strokeWidth={1.6} aria-hidden="true" />
                    What it cannot do
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                    Verify that a service is available, staffed, affordable, or
                    clinically appropriate. Those require operational and
                    community evidence beyond this model.
                  </p>
                </div>
                <div className="sm:col-span-2 sm:flex sm:items-center sm:justify-between sm:gap-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href="/app/data-sources" className="link-dashed text-[10.5px]">
                      <Database className="h-3 w-3" aria-hidden="true" />
                      Source register
                    </Link>
                    <Link href="/app/methodology" className="link-dashed text-[10.5px]">
                      Methodology &amp; validation
                    </Link>
                  </div>
                  <p className="mono mt-3 text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)] sm:mt-0 sm:text-right">
                    No PHI · No clinical claims
                    <br />
                    Census 2011 · OpenStreetMap · modelled travel
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="dark-plate relative overflow-hidden rounded-none border-x-0 border-t-0 bg-[var(--field)]" data-reveal>
          <div className="dot-grid-bg absolute inset-0 opacity-35" aria-hidden="true" />
          <div className="contour-lines absolute inset-0 opacity-[0.08]" aria-hidden="true" />
          <div className="page-gutter relative">
            <div className="content-max py-16 sm:py-20 lg:py-24">
              <div className="grid gap-10 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <p className="mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--paper)]/45">
                    Start with the Delhi pilot
                  </p>
                  <h2 className="display mt-4 max-w-[900px] text-[clamp(2.7rem,2rem+3.2vw,5.4rem)] text-[var(--paper)]">
                    The next clinic
                    <br />
                    already has an <span className="italic text-[var(--gap-soft)]">address.</span>
                  </h2>
                  <p className="measure mt-5 text-[13.5px] leading-[1.75] text-[var(--paper)]/60">
                    Open the workspace, inspect the gaps, place a proposed
                    resource, and see the study area recalculate. The population
                    and map sources are public and dated; the calculations are
                    reproducible.
                  </p>
                </div>
                <div className="flex flex-col justify-end gap-3 lg:col-span-4">
                  <Link
                    href="/app"
                    className="btn border-[var(--paper)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--signal-soft)]"
                  >
                    Open the workspace
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                  </Link>
                  <Link href="/app/simulator" className="btn btn-ghost-light">
                    Go straight to the simulator
                    <ArrowRight className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                  </Link>
                  <p className="mono mt-2 text-[8px] uppercase leading-[1.8] tracking-[0.08em] text-[var(--paper)]/35">
                    Local-first demo
                    <br />
                    No account or API key required
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
      <RevealObserver />
    </>
  );
}
