"use client";

import type { FeatureCollection, Geometry } from "geojson";
import {
  ArrowRight,
  ChartNoAxesCombined,
  Crosshair,
  Ruler,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AccessMap } from "@/components/map/AccessMap";
import { AreaInspector } from "@/components/app/AreaInspector";
import { DataNotice, ServiceThresholdControls } from "@/components/app/Controls";
import { DistributionBar } from "@/components/app/DistributionBar";
import { EmptyPanel, ErrorPanel } from "@/components/app/Feedback";
import { MetricTile } from "@/components/app/MetricTile";
import { PageHeader } from "@/components/app/PageHeader";
import { sortByAccessRisk } from "@/lib/access";
import { apiUrl } from "@/lib/api";
import { useDatasetMeta } from "@/lib/dataset-context";
import {
  formatNumber,
  formatPercent,
  formatMinutes,
} from "@/lib/format";
import type { OverviewResponse } from "@/lib/types";
import { useApiData } from "@/lib/use-api";

export function OverviewClient() {
  const { meta } = useDatasetMeta();
  const defaultsApplied = useRef(false);
  const [service, setService] = useState(
    meta?.default_service ?? "maternal_health",
  );
  const [threshold, setThreshold] = useState(
    meta?.default_threshold_minutes ?? 15,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastDataKey = useRef<string | null>(null);

  useEffect(() => {
    if (!meta || defaultsApplied.current) return;
    defaultsApplied.current = true;
    setService(meta.default_service);
    setThreshold(meta.default_threshold_minutes);
  }, [meta]);

  const { data, error, loading, reload } = useApiData<OverviewResponse>(
    apiUrl("/api/v1/overview", { service, threshold_minutes: threshold }),
  );

  const sortedAreas = useMemo(
    () => sortByAccessRisk((data?.areas.features ?? []).map((feature) => feature.properties)),
    [data],
  );
  const worstAreaId = sortedAreas[0]?.area_id ?? null;

  useEffect(() => {
    if (!data) return;
    const key = `${data.service}-${data.threshold_minutes}`;
    if (lastDataKey.current !== key) {
      lastDataKey.current = key;
      setSelectedId(worstAreaId);
    }
  }, [data, worstAreaId]);

  const selectedArea = useMemo(
    () =>
      sortedAreas.find((area) => area.area_id === selectedId) ??
      (selectedId ? sortedAreas[0] ?? null : null),
    [selectedId, sortedAreas],
  );

  function handleServiceChange(nextService: string) {
    setService(nextService);
    const definition = data?.services.find((item) => item.id === nextService);
    if (definition) setThreshold(definition.default_threshold_minutes);
    setSelectedId(null);
  }

  const mapAreas = data?.areas as unknown as FeatureCollection<
    Geometry,
    Record<string, unknown>
  >;
  const affected = data
    ? data.summary.total_population - data.summary.covered_population
    : 0;

  return (
    <div className="page-gutter">
      <div className="content-max pb-10 pt-6">
        <PageHeader
          index="01"
          eyebrow="Access baseline"
          title="Access, mapped to the ward."
          description="A population-weighted view of who can reach suitable care within a chosen travel-time threshold, built from the same analysis used by the simulator and recommendation engine."
          actions={
            <>
              <Link href="/app/methodology" className="btn btn-outline btn-sm">
                Method
              </Link>
              <Link href="/app/simulator" className="btn btn-primary btn-sm">
                <Crosshair className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                Simulate an intervention
              </Link>
            </>
          }
        />

        <div className="mt-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <ServiceThresholdControls
            services={data?.services ?? []}
            service={service}
            threshold={threshold}
            onServiceChange={handleServiceChange}
            onThresholdChange={(value) => {
              setThreshold(value);
              setSelectedId(null);
            }}
            thresholds={data?.thresholds ?? [15, 30, 45, 60, 90]}
            disabled={loading && Boolean(data)}
          />
          <div className="flex items-center gap-2 pb-1 text-[10px] text-[var(--ink-3)]">
            {loading && data ? (
              <>
                <span className="spinner h-3 w-3" aria-hidden="true" />
                Recalculating access…
              </>
            ) : (
              <>
                <span className="status-dot h-[5px] w-[5px]" aria-hidden="true" />
                Analysis current ·{" "}
                {data?.routing.live_traffic ? "live feed" : "no live traffic"}
              </>
            )}
          </div>
        </div>

        {data && (
          <DataNotice
            notice={data.data_notice}
            routing={data.routing}
            className="mt-4"
          />
        )}

        {error && !data ? (
          <div className="mt-8">
            <ErrorPanel message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <div className="mt-8 grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="skeleton h-[560px]" />
            <div className="skeleton h-[560px]" />
          </div>
        ) : (
          <>
            <section
              className="mt-6 grid gap-px border-y border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Accessibility summary"
            >
              <MetricTile
                label={`Coverage within ${threshold} minutes`}
                value={formatPercent(data.summary.coverage_percent)}
                note={`${formatNumber(data.summary.covered_population)} modelled people`}
                icon={
                  <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--signal)]">
                    Covered
                  </span>
                }
                className="bg-[var(--paper)] px-4 sm:pl-0 sm:pr-5"
              />
              <MetricTile
                label="Outside the threshold"
                value={formatNumber(affected)}
                unit="people"
                tone="gap"
                note={`${formatPercent(100 - data.summary.coverage_percent)} of the modelled population`}
                className="bg-[var(--paper)] px-4 sm:px-5"
              />
              <MetricTile
                label="Areas over threshold"
                value={String(data.summary.wards_over_threshold)}
                unit={`of ${data.summary.wards_total}`}
                note={`${data.summary.unreachable_wards} areas have no suitable mapped facility`}
                className="bg-[var(--paper)] px-4 sm:px-5"
              />
              <MetricTile
                label="Weighted median travel time"
                value={formatMinutes(data.summary.weighted_median_travel_time)}
                note={`p90 ${formatMinutes(data.summary.weighted_p90_travel_time)} · mean ${formatMinutes(data.summary.weighted_mean_travel_time)}`}
                className="bg-[var(--paper)] px-4 sm:px-5"
              />
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
              <div className="min-w-0">
                <div className="border border-[var(--rule-strong)] bg-[var(--sheet)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
                        Access surface
                      </span>
                      <span className="status-pill">
                        <span className="status-dot" aria-hidden="true" />
                        {threshold} min threshold
                      </span>
                    </div>
                    <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                      Nearest suitable facility · {data.summary.suitable_facility_count} mapped options
                    </p>
                  </div>
                  <AccessMap
                    areas={mapAreas}
                    threshold={threshold}
                    facilities={data.facilities.filter((facility) =>
                      facility.services.includes(service),
                    )}
                    catchment={data.catchment}
                    selectedAreaId={selectedId}
                    onSelectArea={setSelectedId}
                    fitKey={`overview-${data.dataset.id}`}
                    className="h-[430px] w-full sm:h-[520px] xl:h-[610px]"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] px-3 py-2.5">
                    <p className="text-[10px] leading-relaxed text-[var(--ink-3)]">
                      Click a ward to inspect it. Drawn from {data.dataset.counts.areas}{" "}
                      population areas and {data.dataset.counts.facilities} mapped facilities.
                    </p>
                    <Link href="/app/explore" className="arrow-link shrink-0 text-[var(--signal)]">
                      Open full gap explorer
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                <div className="mt-4 border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="mono text-[8px] uppercase tracking-[0.11em] text-[var(--ink-3)]">
                        Travel-time distribution
                      </p>
                      <p className="mt-1 text-[11.5px] text-[var(--ink-2)]">
                        Modelled population by nearest-facility time band
                      </p>
                    </div>
                    <Ruler className="h-4 w-4 text-[var(--ink-3)]" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <div className="mt-4">
                    <DistributionBar
                      distribution={data.summary.distribution}
                      threshold={threshold}
                    />
                  </div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  {selectedArea ? (
                    <AreaInspector
                      area={selectedArea}
                      threshold={threshold}
                      service={service}
                    />
                  ) : (
                    <EmptyPanel
                      title="Select a population area"
                      detail="Click a ward on the map or choose from the longest-travel-time list below. Every inspection uses the same computed values shown in the map."
                    />
                  )}
                </div>

                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="mono text-[8px] uppercase tracking-[0.11em] text-[var(--ink-3)]">
                      Longest modelled travel times
                    </p>
                    <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                      {data.summary.wards_over_threshold} outside
                    </span>
                  </div>
                  <div className="mt-2">
                    {sortedAreas.slice(0, 6).map((area) => (
                      <button
                        key={area.area_id}
                        type="button"
                        onClick={() => setSelectedId(area.area_id)}
                        aria-pressed={selectedId === area.area_id}
                        className="flex w-full items-center justify-between gap-2 border-b border-[var(--rule)] py-2 text-left last:border-0 hover:text-[var(--signal)]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[10.5px] font-medium">
                            {area.name}
                          </span>
                          <span className="mono block text-[8px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                            {area.population === null
                              ? "Population unavailable"
                              : `${formatNumber(area.population)} people`}{" "}
                            · {area.quadrant}
                          </span>
                        </span>
                        <span className="mono shrink-0 text-[10px] text-[var(--gap)]">
                          {formatMinutes(area.travel_time_minutes)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <Link
                    href="/app/explore"
                    className="arrow-link mt-3 text-[10.5px] text-[var(--ink-2)]"
                  >
                    View the full ranked list
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>

                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.11em] text-[var(--ink-3)]">
                    What the baseline does not prove
                  </p>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                    A mapped facility is not verified staffing, opening hours,
                    affordability, or quality. Missing map records are not proof
                    that care is absent.{" "}
                    {meta?.dataset.is_synthetic
                      ? "This dataset is synthetic and uses a synthetic road network."
                      : "This release uses Census 2011 population and OpenStreetMap facilities and roads; travel times are modelled, not live traffic."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href="/app/data-sources" className="link-dashed text-[10px]">
                      Provenance
                    </Link>
                    <Link href="/app/methodology" className="link-dashed text-[10px]">
                      Limitations
                    </Link>
                  </div>
                </div>
              </aside>
            </section>

            <section className="mt-8 border-t border-[var(--rule-strong)] pt-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <ChartNoAxesCombined
                    className="h-4 w-4 text-[var(--signal)]"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <p className="text-[12px] font-medium text-[var(--ink)]">
                    Next: test a proposed resource or compare candidate sites.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/app/simulator" className="arrow-link text-[var(--signal)]">
                    Open simulator
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  <Link href="/app/recommendations" className="arrow-link text-[var(--ink-2)]">
                    Rank candidate locations
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
