"use client";

import type { FeatureCollection, Geometry } from "geojson";
import {
  ArrowRight,
  ChartNoAxesCombined,
  Crosshair,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DistributionChart, ImprovementsChart } from "@/components/app/AnalyticsCharts";
import { DataNotice } from "@/components/app/Controls";
import { EmptyPanel, ErrorPanel } from "@/components/app/Feedback";
import { PageHeader } from "@/components/app/PageHeader";
import { AccessMap } from "@/components/map/AccessMap";
import { sortByAccessRisk } from "@/lib/access";
import { apiUrl } from "@/lib/api";
import {
  formatDateTime,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatSignedMinutes,
  formatSignedPercent,
  titleCase,
} from "@/lib/format";
import type {
  OverviewResponse,
  ScenarioListResponse,
  SimulationResponse,
} from "@/lib/types";
import { useApiData } from "@/lib/use-api";

type MapView = "proposed" | "change";

export function AnalyticsClient() {
  const scenarios = useApiData<ScenarioListResponse>(
    apiUrl("/api/v1/scenarios", { limit: 10 }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapView, setMapView] = useState<MapView>("proposed");

  const effectiveScenarioId =
    selectedId ?? scenarios.data?.items[0]?.id ?? null;
  const simulation = useApiData<SimulationResponse>(
    effectiveScenarioId
      ? apiUrl(`/api/v1/scenarios/${effectiveScenarioId}/simulate`)
      : null,
  );
  const overview = useApiData<OverviewResponse>(
    apiUrl("/api/v1/overview", {
      service: simulation.data?.service ?? "primary_care",
      threshold_minutes: simulation.data?.threshold_minutes ?? 30,
    }),
  );

  const data = simulation.data;
  const proposedAreas = useMemo(() => {
    if (!data) return null;
    return {
      type: "FeatureCollection",
      features: data.areas.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          travel_time_minutes: feature.properties.travel_time_proposed,
          covered: feature.properties.covered_proposed,
        },
      })),
    } as unknown as FeatureCollection<Geometry, Record<string, unknown>>;
  }, [data]);

  const selectedScenario = data?.scenario;
  const scenarioItems = scenarios.data?.items ?? [];

  return (
    <div className="page-gutter">
      <div className="content-max pb-10 pt-6">
        <PageHeader
          index="05"
          eyebrow="Impact analytics"
          title="What changed, and for whom."
          description="Compare a saved intervention scenario with its baseline on coverage, travel time, residual gaps, and the worst-served population. Every figure is recomputed from the scenario by the analysis API."
          actions={
            <>
              <Link href="/app/simulator" className="btn btn-primary btn-sm">
                <Crosshair className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                New intervention
              </Link>
              <Link href="/app/methodology#impact" className="btn btn-outline btn-sm">
                Metric definitions
              </Link>
            </>
          }
        />

        <section className="mt-5 flex flex-col justify-between gap-3 border border-[var(--rule-strong)] bg-[var(--sheet)] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px]">
              <label htmlFor="scenario-select" className="field-label">
                Saved scenario
              </label>
              <select
                id="scenario-select"
                className="field h-9 min-w-[260px] text-[11.5px]"
                value={effectiveScenarioId ?? ""}
                onChange={(event) => {
                  setSelectedId(event.target.value || null);
                  setMapView("proposed");
                }}
                disabled={!scenarioItems.length || scenarios.loading}
              >
                {scenarioItems.length ? (
                  scenarioItems.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name} · {scenario.threshold_minutes} min
                    </option>
                  ))
                ) : (
                  <option value="">No saved scenarios</option>
                )}
              </select>
            </div>
            {selectedScenario && (
              <div className="pb-1">
                <p className="text-[10.5px] text-[var(--ink-2)]">
                  {titleCase(selectedScenario.service)} ·{" "}
                  {selectedScenario.interventions.length}{" "}
                  {selectedScenario.interventions.length === 1 ? "site" : "sites"} ·{" "}
                  {formatDateTime(selectedScenario.created_at)}
                </p>
                <p className="mono mt-0.5 text-[8px] uppercase tracking-[0.07em] text-[var(--ink-3)]">
                  Recalculated from scenario {selectedScenario.id.slice(0, 8)}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={simulation.reload}
              disabled={simulation.loading || !effectiveScenarioId}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${simulation.loading ? "animate-spin" : ""}`}
                strokeWidth={1.7}
                aria-hidden="true"
              />
              Recompute
            </button>
            <Link href="/app/recommendations" className="btn btn-outline btn-sm">
              Candidate locations
            </Link>
          </div>
        </section>

        {scenarios.error && !scenarios.data && (
          <div className="mt-4">
            <ErrorPanel
              message={`${scenarios.error} Impact analytics can still show the baseline below.`}
              onRetry={scenarios.reload}
              compact
            />
          </div>
        )}

        {scenarios.loading && !scenarios.data ? (
          <div className="mt-6">
            <div className="skeleton h-[300px] w-full" />
          </div>
        ) : simulation.loading && !data ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="skeleton h-[300px]" />
            <div className="skeleton h-[300px]" />
          </div>
        ) : simulation.error && effectiveScenarioId ? (
          <div className="mt-6">
            <ErrorPanel message={simulation.error} onRetry={simulation.reload} />
          </div>
        ) : !effectiveScenarioId ? (
          <BaselineAnalytics overview={overview} />
        ) : data ? (
          <>
            <DataNotice
              notice={data.data_notice}
              routing={data.routing}
              className="mt-4"
            />

            <div className="mt-6 grid gap-px border-y border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Newly covered population",
                  value: formatNumber(data.delta.newly_covered_population),
                  note: `${data.delta.wards_newly_covered} areas moved inside the threshold`,
                  tone: "text-[var(--positive)]",
                },
                {
                  label: "Coverage after intervention",
                  value: formatPercent(data.proposed.coverage_percent),
                  note: `${formatPercent(data.baseline.coverage_percent)} baseline · ${formatSignedPercent(data.delta.coverage_gain_percentage_points)}`,
                  tone: "text-[var(--ink)]",
                },
                {
                  label: "Worst-served coverage gain",
                  value: formatSignedPercent(data.equity.coverage_gain_percentage_points),
                  note: `${formatPercent(data.equity.worst_served_population_share * 100, 0)} of population · ${data.equity.worst_served_area_count} areas`,
                  tone: "text-[var(--positive)]",
                },
                {
                  label: "Remaining outside",
                  value: formatNumber(data.delta.remaining_uncovered_population),
                  note: `${data.delta.remaining_wards_over_threshold} areas after the intervention`,
                  tone: "text-[var(--gap)]",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-[var(--paper)] px-4 py-4 sm:px-5 sm:first:pl-0"
                >
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    {item.label}
                  </p>
                  <p className={`serif mt-2 text-[clamp(1.7rem,1.35rem+1.2vw,2.4rem)] leading-none ${item.tone}`}>
                    {item.value}
                  </p>
                  <p className="mt-1.5 text-[9.5px] text-[var(--ink-3)]">{item.note}</p>
                </div>
              ))}
            </div>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      Baseline travel-time distribution
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                      Population by nearest suitable facility time
                    </p>
                  </div>
                  <span className="mono text-[8px] uppercase tracking-[0.07em] text-[var(--ink-3)]">
                    n = {formatNumber(data.baseline.total_population)}
                  </span>
                </div>
                <div className="mt-3">
                  {overview.loading && !overview.data ? (
                    <div className="skeleton h-[230px] w-full" />
                  ) : overview.data ? (
                    <DistributionChart distribution={overview.data.summary.distribution} />
                  ) : (
                    <p className="py-10 text-center text-[10.5px] text-[var(--ink-3)]">
                      Baseline distribution unavailable.
                    </p>
                  )}
                </div>
              </div>

              <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      New coverage concentration
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                      Areas receiving the largest newly covered populations
                    </p>
                  </div>
                  <ChartNoAxesCombined
                    className="h-4 w-4 text-[var(--signal)]"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-3">
                  {data.top_improvements.length ? (
                    <ImprovementsChart improvements={data.top_improvements} />
                  ) : (
                    <p className="flex h-[230px] items-center justify-center text-center text-[10.5px] text-[var(--ink-3)]">
                      No area received newly covered population under this
                      scenario.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="border border-[var(--rule-strong)] bg-[var(--sheet)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
                      Scenario access surface
                    </span>
                    <div className="segmented" role="group" aria-label="Analytics map view">
                      <button
                        type="button"
                        aria-pressed={mapView === "proposed"}
                        onClick={() => setMapView("proposed")}
                      >
                        Proposed access
                      </button>
                      <button
                        type="button"
                        aria-pressed={mapView === "change"}
                        onClick={() => setMapView("change")}
                      >
                        Change
                      </button>
                    </div>
                  </div>
                  <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    {data.proposed.wards_over_threshold} areas outside after
                  </span>
                </div>
                <AccessMap
                  areas={proposedAreas}
                  threshold={data.threshold_minutes}
                  colorMode={mapView === "change" ? "improvement" : "access"}
                  facilities={data.facilities.filter((facility) =>
                    facility.services.includes(data.service),
                  )}
                  proposedFacilities={data.proposed_facilities}
                  catchment={data.catchment_proposed}
                  fitKey={`analytics-${data.scenario.dataset_id}`}
                  className="h-[430px] w-full sm:h-[520px] xl:h-[575px]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] px-3 py-2.5">
                  <p className="text-[10px] text-[var(--ink-3)]">
                    {mapView === "proposed"
                      ? "Proposed access after adding the scenario facilities."
                      : "Change shows newly covered, improved, unchanged, and worsened areas."}
                  </p>
                  <Link
                    href={`/app/explore?service=${data.service}&threshold=${data.threshold_minutes}`}
                    className="arrow-link text-[10px] text-[var(--signal)]"
                  >
                    Inspect areas
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="border border-[var(--rule)] bg-[var(--sheet)]">
                <div className="border-b border-[var(--rule)] px-4 py-3">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Residual gaps after intervention
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                    Still outside the {data.threshold_minutes}-minute threshold
                  </p>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Area</th>
                        <th scope="col" className="text-right">People</th>
                        <th scope="col" className="text-right">Time</th>
                        <th scope="col" className="text-right">Vulnerability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.residual_gaps.slice(0, 9).map((area) => (
                        <tr key={area.area_id}>
                          <td>{area.name}</td>
                          <td className="num">
                            {area.population === null
                              ? "Unavailable"
                              : formatNumber(area.population)}
                          </td>
                          <td className="num">{formatMinutes(area.travel_time_minutes)}</td>
                          <td className="num">
                            {area.vulnerability_index === null
                              ? "n/a"
                              : formatPercent(area.vulnerability_index * 100, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.residual_gaps.length && (
                  <p className="p-4 text-[10.5px] text-[var(--ink-3)]">
                    No residual gaps in the top-20 returned list.
                  </p>
                )}
                <div className="border-t border-[var(--rule)] px-4 py-3">
                  <p className="text-[9.5px] leading-relaxed text-[var(--ink-3)]">
                    {data.delta.remaining_wards_over_threshold} areas and{" "}
                    {formatNumber(data.delta.remaining_uncovered_population)} people
                    remain outside the threshold.
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Worst-served population
                  </p>
                  <span className="status-pill">
                    {formatPercent(data.equity.worst_served_population_share * 100, 0)} share
                  </span>
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                  Areas ordered by baseline travel time until{" "}
                  {formatPercent(data.equity.worst_served_population_share * 100, 0)} of
                  the population is included. A transparent definition, not an
                  official equity standard.
                </p>
                <div className="mt-4 space-y-3">
                  <CoverageBar
                    label="Baseline coverage in group"
                    value={data.equity.baseline_coverage_percent}
                    color="var(--ink-3)"
                  />
                  <CoverageBar
                    label="Proposed coverage in group"
                    value={data.equity.proposed_coverage_percent}
                    color="var(--signal)"
                  />
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--rule)] pt-3">
                  <li>
                    <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                      Mean time improvement
                    </p>
                    <p className="mono mt-1 text-[10.5px] text-[var(--positive)]">
                      {formatMinutes(data.equity.mean_travel_time_improvement)}
                    </p>
                  </li>
                  <li>
                    <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                      People in group
                    </p>
                    <p className="mono mt-1 text-[10.5px] text-[var(--ink)]">
                      {formatNumber(data.equity.worst_served_population)}
                    </p>
                  </li>
                </ul>
              </div>

              <div className="border border-[var(--rule)] bg-[var(--sheet)]">
                <div className="border-b border-[var(--rule)] px-4 py-3">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Before / after summary
                  </p>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col" className="text-right">Baseline</th>
                      <th scope="col" className="text-right">Proposed</th>
                      <th scope="col" className="text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        "Coverage",
                        formatPercent(data.baseline.coverage_percent),
                        formatPercent(data.proposed.coverage_percent),
                        formatSignedPercent(data.delta.coverage_gain_percentage_points),
                      ],
                      [
                        "Weighted mean time",
                        formatMinutes(data.baseline.weighted_mean_travel_time),
                        formatMinutes(data.proposed.weighted_mean_travel_time),
                        formatSignedMinutes(data.delta.weighted_mean_travel_time_change),
                      ],
                      [
                        "Weighted median time",
                        formatMinutes(data.baseline.weighted_median_travel_time),
                        formatMinutes(data.proposed.weighted_median_travel_time),
                        formatSignedMinutes(data.delta.weighted_median_travel_time_change),
                      ],
                      [
                        "Areas over threshold",
                        String(data.baseline.wards_over_threshold),
                        String(data.proposed.wards_over_threshold),
                        `${data.delta.wards_newly_covered} improved`,
                      ],
                      [
                        "Wards worsened",
                        "—",
                        "—",
                        String(data.delta.wards_worsened),
                      ],
                    ].map((row) => (
                      <tr key={row[0]}>
                        <td>{row[0]}</td>
                        <td className="num">{row[1]}</td>
                        <td className="num">{row[2]}</td>
                        <td className="num text-[var(--positive)]">{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.delta.wards_worsened > 0 && (
                  <div className="m-4">
                    <p className="error-note text-[10px]">
                      Unexpected: {data.delta.wards_worsened} areas have a longer
                      modelled travel time after adding a facility. Review the
                      warnings below.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <details className="mt-6 border border-[var(--rule)] bg-[var(--paper-2)]">
              <summary className="cursor-pointer px-4 py-3 text-[11px] font-medium text-[var(--ink)]">
                Scenario assumptions and warnings
              </summary>
              <div className="grid gap-5 border-t border-[var(--rule)] px-4 py-4 sm:grid-cols-2">
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Assumptions
                  </p>
                  <ul className="mt-2 space-y-2">
                    {data.assumptions.map((item) => (
                      <li key={item} className="flex gap-2 text-[10px] leading-relaxed text-[var(--ink-2)]">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--signal)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--critical)]">
                    Warnings
                  </p>
                  <ul className="mt-2 space-y-2">
                    {data.warnings.map((item) => (
                      <li key={item} className="flex gap-2 text-[10px] leading-relaxed text-[var(--ink-2)]">
                        <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[var(--gap)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] pt-4">
              <p className="text-[10.5px] text-[var(--ink-3)]">
                Impact is modelled coverage. It is not observed service use,
                quality, or health outcome improvement.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/app/simulator" className="arrow-link text-[var(--signal)]">
                  Test another intervention
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
                <Link href="/app/data-sources" className="arrow-link text-[var(--ink-2)]">
                  Data provenance
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </>
        ) : null}

      </div>
    </div>
  );
}

function CoverageBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--ink-2)]">{label}</span>
        <span className="mono text-[10px] text-[var(--ink)]">{formatPercent(value)}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full bg-[var(--paper-2)]">
        <div
          className="h-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
        />
      </div>
    </div>
  );
}

function BaselineAnalytics({ overview }: { overview: ReturnType<typeof useApiData<OverviewResponse>> }) {
  const areaProperties = overview.data
    ? overview.data.areas.features.map((feature) => feature.properties)
    : [];
  const topGaps = sortByAccessRisk(areaProperties).slice(0, 8);

  if (overview.error && !overview.data) {
    return (
      <div className="mt-6">
        <ErrorPanel message={overview.error} onRetry={overview.reload} />
      </div>
    );
  }

  if (!overview.data) {
    return (
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-[300px]" />
        <div className="skeleton h-[300px]" />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="border border-[var(--rule)] bg-[var(--sheet)] p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Baseline only · no scenario loaded
            </p>
            <h2 className="serif mt-2 text-[30px] leading-none text-[var(--ink)]">
              Establish the baseline first.
            </h2>
            <p className="measure mt-3 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
              Impact analytics compares a saved intervention with its baseline.
              Until a scenario exists, inspect the baseline distribution and the
              areas with the longest modelled travel times.
            </p>
          </div>
          <Link href="/app/simulator" className="btn btn-primary btn-sm shrink-0">
            <Crosshair className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
            Create a scenario
          </Link>
        </div>
        <div className="mt-4 grid gap-px border-y border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-4">
          {[
            ["Coverage", formatPercent(overview.data.summary.coverage_percent)],
            ["Outside threshold", formatNumber(overview.data.summary.total_population - overview.data.summary.covered_population)],
            ["Areas outside", String(overview.data.summary.wards_over_threshold)],
            ["Median time", formatMinutes(overview.data.summary.weighted_median_travel_time)],
          ].map(([label, value]) => (
            <div key={label} className="bg-[var(--sheet)] px-3 py-3">
              <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                {label}
              </p>
              <p className="serif mt-1.5 text-[22px] leading-none text-[var(--ink)]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
          <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Baseline travel-time distribution
          </p>
          <div className="mt-3">
            <DistributionChart distribution={overview.data.summary.distribution} />
          </div>
        </div>
        <div className="border border-[var(--rule)] bg-[var(--sheet)]">
          <div className="border-b border-[var(--rule)] px-4 py-3">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Longest modelled travel times
            </p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col" className="text-right">People</th>
                  <th scope="col" className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {topGaps.map((area) => (
                  <tr key={area.area_id}>
                    <td>{area.name}</td>
                    <td className="num">
                      {area.population === null
                        ? "Unavailable"
                        : formatNumber(area.population)}
                    </td>
                    <td className="num">{formatMinutes(area.travel_time_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--rule)] px-4 py-2.5">
            <Link href="/app/explore" className="arrow-link text-[10px] text-[var(--signal)]">
              Explore all gaps
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <EmptyPanel
          title="No scenario available"
          detail="The simulator creates a saved scenario from placed facilities. Impact analytics then recomputes that scenario against its baseline on every visit."
          action={
            <Link href="/app/simulator" className="btn btn-primary btn-sm">
              Open the simulator
            </Link>
          }
        />
      </div>
    </div>
  );
}
