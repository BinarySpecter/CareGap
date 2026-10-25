"use client";

import type { FeatureCollection, Geometry } from "geojson";
import {
  ArrowRight,
  Crosshair,
  Info,
  Layers,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { DataNotice } from "@/components/app/Controls";
import { ErrorPanel } from "@/components/app/Feedback";
import { PageHeader } from "@/components/app/PageHeader";
import { AccessMap } from "@/components/map/AccessMap";
import { apiUrl } from "@/lib/api";
import {
  cn,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatSignedMinutes,
  formatSignedPercent,
  titleCase,
} from "@/lib/format";
import type {
  MetaResponse,
  OverviewResponse,
  RecommendationCandidate,
  RecommendationsResponse,
} from "@/lib/types";
import { useApiData } from "@/lib/use-api";

interface Config {
  service: string;
  threshold: number;
  interventionType: string;
  equityWeight: number;
  setSize: number;
  strategy: "equity_weighted" | "max_coverage";
}

const INITIAL_CONFIG: Config = {
  service: "maternal_health",
  threshold: 15,
  interventionType: "primary_care_clinic",
  equityWeight: 0,
  setSize: 3,
  strategy: "max_coverage",
};

const FALLBACK_INTERVENTIONS = [
  "primary_care_clinic",
  "mobile_clinic",
  "diagnostic_centre",
  "medical_camp",
];

export function RecommendationsClient() {
  const defaultsApplied = useRef(false);
  const [draft, setDraft] = useState<Config>(INITIAL_CONFIG);
  const [applied, setApplied] = useState<Config>(INITIAL_CONFIG);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );

  const meta = useApiData<MetaResponse>(apiUrl("/api/v1/meta"));
  const overview = useApiData<OverviewResponse>(
    apiUrl("/api/v1/overview", {
      service: applied.service,
      threshold_minutes: applied.threshold,
    }),
  );
  const recommendations = useApiData<RecommendationsResponse>(
    apiUrl("/api/v1/recommendations", {
      service: applied.service,
      threshold_minutes: applied.threshold,
      intervention_type: applied.interventionType,
      equity_weight: applied.equityWeight,
      limit: 10,
      set_size: applied.setSize,
      strategy: applied.strategy,
    }),
  );

  useEffect(() => {
    if (!meta.data || defaultsApplied.current) return;
    defaultsApplied.current = true;
    const available = meta.data.dataset.vulnerability.available === true;
    const next: Config = {
      ...INITIAL_CONFIG,
      service: meta.data.default_service,
      threshold: meta.data.default_threshold_minutes,
      interventionType: meta.data.interventions[0]?.id ?? INITIAL_CONFIG.interventionType,
      equityWeight: available ? 0.35 : 0,
      strategy: available ? "equity_weighted" : "max_coverage",
    };
    setDraft(next);
    setApplied(next);
  }, [meta.data]);

  const vulnerabilityAvailable =
    recommendations.data?.vulnerability_available ??
    overview.data?.dataset.vulnerability.available ??
    false;

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const metaInterventions = meta.data?.interventions ?? [];
  const availableInterventions = metaInterventions.length
    ? metaInterventions
    : FALLBACK_INTERVENTIONS.map((id) => ({
        id,
        label: titleCase(id),
        services: ["primary_care"],
        default_service: "primary_care",
        description: "",
        operation: "full_time" as const,
        assumptions: [],
      }));
  const currentIntervention = availableInterventions.find(
    (item) => item.id === draft.interventionType,
  );
  const compatibleServices = (overview.data?.services ?? []).filter(
    (service) => currentIntervention?.services.includes(service.id),
  );
  const effectiveService = compatibleServices.some(
    (item) => item.id === draft.service,
  )
    ? draft.service
    : currentIntervention?.default_service ?? draft.service;

  const selectedCandidate = useMemo(() => {
    if (!recommendations.data) return null;
    return (
      recommendations.data.candidates.find(
        (candidate) => candidate.area_id === selectedCandidateId,
      ) ??
      recommendations.data.candidates[0] ??
      null
    );
  }, [recommendations.data, selectedCandidateId]);

  const mapAreas = overview.data?.areas as unknown as FeatureCollection<
    Geometry,
    Record<string, unknown>
  >;

  const candidateMarkers = useMemo(
    () =>
      (recommendations.data?.candidates ?? []).map((candidate) => ({
        id: candidate.area_id,
        lon: candidate.lon,
        lat: candidate.lat,
        label: candidate.area_name,
        sublabel: `${formatNumber(candidate.metrics.newly_covered_population)} newly covered`,
        rank: candidate.rank,
      })),
    [recommendations.data],
  );

  function updateDraft(patch: Partial<Config>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handleServiceChange(service: string) {
    const definition = overview.data?.services.find((item) => item.id === service);
    const current = availableInterventions.find(
      (item) => item.id === draft.interventionType,
    );
    const nextIntervention =
      current?.services.includes(service)
        ? draft.interventionType
        : availableInterventions.find((item) => item.services.includes(service))?.id ??
          draft.interventionType;
    updateDraft({
      service,
      threshold: definition?.default_threshold_minutes ?? draft.threshold,
      interventionType: nextIntervention,
    });
  }

  function handleInterventionChange(interventionType: string) {
    const definition = availableInterventions.find(
      (item) => item.id === interventionType,
    );
    const service = definition?.default_service ?? draft.service;
    const serviceDefinition = overview.data?.services.find(
      (item) => item.id === service,
    );
    updateDraft({
      interventionType,
      service,
      threshold: serviceDefinition?.default_threshold_minutes ?? draft.threshold,
    });
  }

  function runAnalysis() {
    const normalized: Config = { ...draft, service: effectiveService };
    if (JSON.stringify(normalized) === JSON.stringify(applied)) {
      recommendations.reload();
      return;
    }
    setApplied(normalized);
    setDraft(normalized);
    setSelectedCandidateId(null);
  }

  const payload = recommendations.data;
  const selected: RecommendationCandidate | null = selectedCandidate;
  const recommendedSet = payload?.recommended_set;
  const recommendedFacilities = recommendedSet?.facilities ?? [];

  return (
    <div className="page-gutter">
      <div className="content-max pb-10 pt-6">
        <PageHeader
          index="04"
          eyebrow="Candidate optimisation"
          title="A shortlist you can interrogate."
          description="Rank population-area centroids by expected coverage and equity benefit, compare a maximum-coverage and an equity-weighted strategy, and read the assumptions behind every score. This is a transparent greedy heuristic, not a proven global optimum."
          actions={
            <>
              <Link href="/app/simulator" className="btn btn-outline btn-sm">
                Open simulator
              </Link>
              <Link href="/app/methodology#recommendations" className="btn btn-outline btn-sm">
                Ranking method
              </Link>
            </>
          }
        />

        <section className="mt-5 border border-[var(--rule-strong)] bg-[var(--sheet)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
                Ranking controls
              </span>
              {dirty && (
                <span className="status-pill border-[var(--gap)]/30 bg-[var(--gap-soft)]/45 text-[#7d4b0e]">
                  Settings changed
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {recommendations.loading && (
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                  <span className="spinner h-3 w-3" aria-hidden="true" />
                  Computing candidates
                </span>
              )}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={runAnalysis}
                disabled={recommendations.loading || meta.loading}
              >
                <Crosshair className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                {recommendations.loading ? "Running…" : "Run analysis"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <label htmlFor="rec-service" className="field-label">
                Service
              </label>
              <select
                id="rec-service"
                className="field"
                value={effectiveService}
                onChange={(event) => handleServiceChange(event.target.value)}
              >
                {(compatibleServices.length
                  ? compatibleServices
                  : [{ id: effectiveService, label: titleCase(effectiveService) }]
                ).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="rec-threshold" className="field-label">
                Threshold
              </label>
              <select
                id="rec-threshold"
                className="field"
                value={draft.threshold}
                onChange={(event) =>
                  updateDraft({ threshold: Number(event.target.value) })
                }
              >
                {(overview.data?.thresholds ?? [15, 30, 45, 60, 90]).map((value) => (
                  <option key={value} value={value}>
                    {value} min
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3">
              <label htmlFor="rec-intervention" className="field-label">
                Intervention
              </label>
              <select
                id="rec-intervention"
                className="field"
                value={draft.interventionType}
                onChange={(event) => handleInterventionChange(event.target.value)}
              >
                {availableInterventions
                  .filter((item) =>
                    draft.service ? item.services.includes(draft.service) || item.id === draft.interventionType : true,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="rec-equity" className="field-label">
                {vulnerabilityAvailable
                  ? `Equity weight · ${draft.equityWeight.toFixed(2)}`
                  : "Equity weight · unavailable"}
              </label>
              <input
                id="rec-equity"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vulnerabilityAvailable ? draft.equityWeight : 0}
                onChange={(event) =>
                  updateDraft({ equityWeight: Number(event.target.value) })
                }
                disabled={!vulnerabilityAvailable}
                aria-describedby="rec-equity-note"
                className="mt-3 w-full accent-[var(--signal)] disabled:opacity-40"
              />
              {!vulnerabilityAvailable && (
                <p
                  id="rec-equity-note"
                  className="mt-1 text-[9px] leading-relaxed text-[var(--ink-3)]"
                >
                  This release has no validated ward-level vulnerability
                  indicator; equity weighting is disabled.
                </p>
              )}
            </div>
            <div className="lg:col-span-2">
              <span className="field-label">Set size</span>
              <div className="segmented" role="group" aria-label="Number of facilities in the recommended set">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.setSize === value}
                    onClick={() => updateDraft({ setSize: value })}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="lg:col-span-12">
              <div className="flex flex-col justify-between gap-2 border-t border-[var(--rule)] pt-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="field-label !mb-0">Strategy</span>
                  <div className="segmented" role="group" aria-label="Ranking strategy">
                    <button
                      type="button"
                      aria-pressed={draft.strategy === "equity_weighted"}
                      onClick={() => updateDraft({ strategy: "equity_weighted" })}
                    >
                      Equity-weighted
                    </button>
                    <button
                      type="button"
                      aria-pressed={draft.strategy === "max_coverage"}
                      onClick={() => updateDraft({ strategy: "max_coverage" })}
                    >
                      Maximum coverage
                    </button>
                  </div>
                </div>
                <p className="max-w-[76ch] text-[9.5px] leading-relaxed text-[var(--ink-3)]">
                  Candidates are population-area centroids. Scores combine
                  normalised coverage, equity-weighted coverage when a
                  vulnerability indicator exists, and person-minutes saved.
                  Changing the weights changes the ranking; the underlying
                  accessibility calculation does not.
                </p>
              </div>
            </div>
          </div>
        </section>

        {payload && (
          <DataNotice
            notice={payload.data_notice}
            routing={payload.routing}
            className="mt-4"
          />
        )}

        {recommendations.error && !payload ? (
          <div className="mt-6">
            <ErrorPanel
              message={recommendations.error}
              onRetry={recommendations.reload}
            />
          </div>
        ) : !payload ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_410px]">
            <div className="skeleton h-[560px]" />
            <div className="skeleton h-[560px]" />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-px border-y border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Baseline coverage",
                  value: formatPercent(payload.baseline.coverage_percent),
                  note: `${formatNumber(payload.baseline.covered_population)} people within threshold`,
                  tone: "text-[var(--ink)]",
                },
                {
                  label: "Top candidate new coverage",
                  value: formatNumber(
                    payload.candidates[0]?.metrics.newly_covered_population ?? 0,
                  ),
                  note: `${payload.candidates[0]?.area_name ?? "—"} · single facility`,
                  tone: "text-[var(--positive)]",
                },
                {
                  label: "Recommended set",
                  value: formatPercent(recommendedSet?.final_coverage_percent ?? 0),
                  note: `${recommendedFacilities.length} sites · ${formatNumber(recommendedSet?.total_newly_covered_population ?? 0)} newly covered`,
                  tone: "text-[var(--signal)]",
                },
                {
                  label: "Remaining outside",
                  value: formatNumber(recommendedSet?.remaining_uncovered_population ?? 0),
                  note: `${recommendedSet?.remaining_wards_over_threshold ?? 0} areas after the set`,
                  tone: "text-[var(--gap)]",
                },
              ].map((item) => (
                <div key={item.label} className="bg-[var(--paper)] px-4 py-4 sm:px-5 sm:first:pl-0">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    {item.label}
                  </p>
                  <p className={cn("serif mt-2 text-[clamp(1.7rem,1.35rem+1.2vw,2.4rem)] leading-none", item.tone)}>
                    {item.value}
                  </p>
                  <p className="mt-1.5 text-[9.5px] text-[var(--ink-3)]">{item.note}</p>
                </div>
              ))}
            </div>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="border border-[var(--rule-strong)] bg-[var(--sheet)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-3.5 w-3.5 text-[var(--signal)]" strokeWidth={1.6} aria-hidden="true" />
                    <span className="mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
                      Candidate map · top {payload.candidates.length}
                    </span>
                  </div>
                  <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Baseline access beneath
                  </span>
                </div>
                <AccessMap
                  areas={mapAreas}
                  threshold={applied.threshold}
                  facilities={(overview.data?.facilities ?? []).filter(
                    (facility) => facility.services.includes(effectiveService),
                  )}
                  catchment={overview.data?.catchment}
                  candidates={candidateMarkers}
                  selectedCandidateId={selected?.area_id ?? null}
                  onSelectCandidate={setSelectedCandidateId}
                  fitKey={`recommendations-${overview.data?.dataset.id ?? "demo"}`}
                  className="h-[440px] w-full sm:h-[540px] xl:h-[630px]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] px-3 py-2.5">
                  <p className="max-w-[70ch] text-[10px] leading-relaxed text-[var(--ink-3)]">
                    Numbered markers are the top candidates. Select one to inspect
                    its modelled benefit. The map shows the baseline access surface,
                    not a final site plan.
                  </p>
                  <Link
                    href={`/app/simulator?service=${applied.service}&threshold=${applied.threshold}`}
                    className="arrow-link text-[10px] text-[var(--signal)]"
                  >
                    Test a different site
                  </Link>
                </div>
              </div>

              <div className="border border-[var(--rule)] bg-[var(--sheet)]">
                {selected ? (
                  <CandidateDetail candidate={selected} payload={payload} />
                ) : (
                  <p className="p-5 text-[11px] text-[var(--ink-3)]">
                    Select a candidate to see its explanation.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-6 border border-[var(--rule)] bg-[var(--sheet)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Ranked candidates
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                    Ordered by the selected strategy. Coverage rank shows the
                    pure newly-covered-population ordering.
                  </p>
                </div>
                <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {payload.candidate_source}
                </span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <caption className="sr-only">
                    Candidate locations ranked by modelled benefit
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Candidate area</th>
                      <th scope="col" className="text-right">Newly covered</th>
                      <th scope="col" className="text-right">Areas</th>
                      <th scope="col" className="text-right">Person-min saved</th>
                      <th scope="col" className="text-right">Score</th>
                      <th scope="col" className="text-right">Coverage rank</th>
                      <th scope="col" className="text-right">Coverage after</th>
                      <th scope="col"><span className="sr-only">Inspect</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.candidates.map((candidate) => (
                      <tr
                        key={candidate.area_id}
                        data-selected={selected?.area_id === candidate.area_id}
                      >
                        <td className="num">
                          {String(candidate.rank).padStart(2, "0")}
                        </td>
                        <td>
                          <span className="font-medium">{candidate.area_name}</span>
                          <span className="mono ml-1.5 text-[8px] text-[var(--ink-3)]">
                            {candidate.quadrant}
                          </span>
                        </td>
                        <td className="num">
                          {formatNumber(candidate.metrics.newly_covered_population)}
                        </td>
                        <td className="num">{candidate.metrics.newly_covered_areas}</td>
                        <td className="num">
                          {formatNumber(candidate.metrics.person_minutes_saved)}
                        </td>
                        <td className="num">{candidate.score.toFixed(3)}</td>
                        <td className="num">#{candidate.coverage_rank}</td>
                        <td className="num">
                          {formatPercent(candidate.metrics.coverage_after_percent)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="text-[10px] font-medium text-[var(--signal)] hover:underline"
                            onClick={() => setSelectedCandidateId(candidate.area_id)}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="border border-[var(--rule)] bg-[var(--sheet)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
                  <div>
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      Recommended set · {recommendedSet?.strategy.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                      Sequential picks with the marginal effect of earlier sites
                    </p>
                  </div>
                  <span className="status-pill">
                    {formatPercent(recommendedSet?.final_coverage_percent ?? 0)}
                  </span>
                </div>
                {recommendedFacilities.length ? (
                  <ol className="divide-y divide-[var(--rule)]">
                    {recommendedFacilities.map((step) => (
                      <li key={step.area_id} className="flex items-start gap-3 px-4 py-3">
                        <span className="mono mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--gap)]/40 text-[9px] text-[var(--gap)]">
                          {String(step.step).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-[var(--ink)]">
                            {step.area_name}
                            <span className="mono ml-2 text-[8px] font-normal text-[var(--ink-3)]">
                              cum. {formatPercent(step.cumulative_coverage_percent)}
                            </span>
                          </p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--ink-3)]">
                            +{formatNumber(step.marginal_newly_covered_population)} newly
                            covered across {step.marginal_newly_covered_areas} areas ·{" "}
                            {step.quadrant}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="p-4 text-[10.5px] text-[var(--ink-3)]">
                    No positive-gain sites were selected for this configuration.
                  </p>
                )}
                <div className="border-t border-[var(--rule)] px-4 py-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                        Newly covered
                      </p>
                      <p className="mono mt-1 text-[10.5px] text-[var(--positive)]">
                        {formatNumber(recommendedSet?.total_newly_covered_population ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                        Coverage gain
                      </p>
                      <p className="mono mt-1 text-[10.5px] text-[var(--positive)]">
                        {formatSignedPercent(recommendedSet?.coverage_gain_percentage_points ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                        Mean time change
                      </p>
                      <p className="mono mt-1 text-[10.5px] text-[var(--positive)]">
                        {formatSignedMinutes(recommendedSet?.weighted_mean_travel_time_change ?? null)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Strategy comparison
                </p>
                <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                  Two greedy orderings under the same intervention and threshold.
                  Compare coverage against equity-weighted selection; neither is
                  globally optimal.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {Object.entries(payload.comparison).map(([key, set]) => (
                    <div
                      key={key}
                      className={cn(
                        "border p-3",
                        applied.strategy === key
                          ? "border-[var(--signal)]/45 bg-[var(--signal-soft)]/25"
                          : "border-[var(--rule)] bg-[var(--paper)]",
                      )}
                    >
                      <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-2)]">
                        {key === "equity_weighted" ? "Equity-weighted" : "Max coverage"}
                      </p>
                      <p className="serif mt-2 text-[24px] leading-none text-[var(--ink)]">
                        {formatPercent(set.final_coverage_percent)}
                      </p>
                      <p className="mt-1 text-[9.5px] text-[var(--ink-3)]">
                        {formatNumber(set.total_newly_covered_population)} newly covered ·{" "}
                        {set.facilities.length} sites
                      </p>
                      <div className="mt-2 border-t border-[var(--rule)] pt-2">
                        <p className="mono text-[8px] text-[var(--ink-3)]">
                          Remaining outside {formatNumber(set.remaining_uncovered_population)}
                        </p>
                        <p className="mono mt-1 text-[8px] text-[var(--ink-3)]">
                          {set.facilities.map((step) => step.area_name).join(" → ") || "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-[var(--rule)] pt-3">
                  <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Score weights
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <p className="mono text-[9px] text-[var(--ink-2)]">
                      Coverage {payload.weights.coverage.toFixed(2)}
                    </p>
                    <p className="mono text-[9px] text-[var(--ink-2)]">
                      Equity {payload.weights.equity.toFixed(2)}
                    </p>
                    <p className="mono text-[9px] text-[var(--ink-2)]">
                      Penalty {payload.weights.concentration_penalty.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <details className="mt-6 border border-[var(--rule)] bg-[var(--paper-2)]">
              <summary className="cursor-pointer px-4 py-3 text-[11px] font-medium text-[var(--ink)]">
                Methodology, assumptions, and limitations
              </summary>
              <div className="grid gap-6 border-t border-[var(--rule)] px-4 py-4 lg:grid-cols-3">
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Objective
                  </p>
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-2)]">
                    {payload.methodology.objective}
                  </p>
                </div>
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Score &amp; greedy selection
                  </p>
                  <p className="mono mt-2 text-[9px] leading-relaxed text-[var(--ink-2)]">
                    {payload.methodology.score_formula}
                  </p>
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-2)]">
                    {payload.methodology.greedy}
                  </p>
                </div>
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--critical)]">
                    Limitations
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {payload.limitations.map((item) => (
                      <li key={item} className="flex gap-1.5 text-[10px] leading-relaxed text-[var(--ink-2)]">
                        <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[var(--gap)]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function CandidateDetail({
  candidate,
  payload,
}: {
  candidate: RecommendationCandidate;
  payload: RecommendationsResponse;
}) {
  const components = [
    ["Coverage", candidate.score_breakdown.coverage_component],
    ["Equity", candidate.score_breakdown.equity_component],
    ["Travel saved", candidate.score_breakdown.travel_component],
  ] as const;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Candidate {String(candidate.rank).padStart(2, "0")} · composite score{" "}
            {candidate.score.toFixed(3)}
          </p>
          <h2 className="serif mt-1.5 text-[27px] leading-none text-[var(--ink)]">
            {candidate.area_name}
          </h2>
          <p className="mt-1 text-[10px] text-[var(--ink-3)]">
            {candidate.quadrant} quadrant · {payload.intervention_type.replaceAll("_", " ")}
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--gap)]/45 font-mono text-[10px] text-[var(--gap)]">
          {String(candidate.rank).padStart(2, "0")}
        </span>
      </div>

      <div className="mt-4 border-t border-[var(--rule)] pt-3">
        <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Newly covered within {payload.threshold_minutes} min
        </p>
        <p className="serif mt-1.5 text-[34px] leading-none text-[var(--positive)]">
          {formatNumber(candidate.metrics.newly_covered_population)}
          <span className="mono ml-2 align-middle text-[9px] text-[var(--ink-3)]">
            people · {candidate.metrics.newly_covered_areas} areas
          </span>
        </p>
        <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
          {candidate.explanation}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Coverage after", formatPercent(candidate.metrics.coverage_after_percent)],
          [
            "Mean time change",
            formatSignedMinutes(candidate.metrics.mean_travel_time_change_minutes),
          ],
          ["Person-min saved", formatNumber(candidate.metrics.person_minutes_saved)],
        ].map(([label, value]) => (
          <div key={label} className="border-t border-[var(--rule)] pt-2">
            <dt className="mono text-[7.5px] uppercase leading-tight tracking-[0.06em] text-[var(--ink-3)]">
              {label}
            </dt>
            <dd className="mono mt-1 text-[10px] text-[var(--ink)]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Score components
        </p>
        <div className="mt-2 space-y-2">
          {components.map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-[68px] shrink-0 text-[9.5px] text-[var(--ink-2)]">{label}</span>
              <span className="h-[3px] flex-1 bg-[var(--paper-2)]">
                <span
                  className="block h-full bg-[var(--signal)]"
                  style={{ width: `${Math.round(value * 100)}%` }}
                />
              </span>
              <span className="mono w-8 text-right text-[8.5px] text-[var(--ink-3)]">
                {value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        {candidate.already_covered_area && (
          <p className="mt-2 flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--gap)]">
            <Info className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            Candidate sits in an already-covered area; a 10% concentration penalty
            applies to its composite score.
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-[var(--rule)] pt-3">
        <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Largest beneficiary areas
        </p>
        <ul className="mt-2 space-y-1.5">
          {candidate.beneficiary_areas.length ? (
            candidate.beneficiary_areas.map((area) => (
              <li key={area.area_id} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--ink-2)]">{area.name}</span>
                <span className="mono text-[9px] text-[var(--ink-3)]">
                  {formatNumber(area.population)} people · vuln{" "}
                  {area.vulnerability_index === null
                    ? "unavailable"
                    : formatPercent(area.vulnerability_index * 100, 0)}
                </span>
              </li>
            ))
          ) : (
            <li className="text-[10px] text-[var(--ink-3)]">No newly covered areas.</li>
          )}
        </ul>
      </div>

      <div className="mt-4 border-t border-[var(--rule)] pt-3">
        <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Areas still outside after this single site
        </p>
        <ul className="mt-2 space-y-1">
          {candidate.residual_gap_areas.map((area) => (
            <li key={area.area_id} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--ink-2)]">{area.name}</span>
              <span className="mono text-[9px] text-[var(--gap)]">
                {formatMinutes(area.travel_time_minutes)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--rule)] pt-3">
        <Link
          href={`/app/simulator?service=${payload.service}&threshold=${payload.threshold_minutes}&lon=${candidate.lon}&lat=${candidate.lat}`}
          className="arrow-link text-[10.5px] text-[var(--signal)]"
        >
          Open this location in the simulator
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
        <span className="mono text-[8px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
          {candidate.lon.toFixed(4)}, {candidate.lat.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
