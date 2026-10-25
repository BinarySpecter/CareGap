"use client";

import type { FeatureCollection, Geometry } from "geojson";
import {
  Download,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AreaInspector } from "@/components/app/AreaInspector";
import { DataNotice, ServiceThresholdControls } from "@/components/app/Controls";
import { EmptyPanel, ErrorPanel } from "@/components/app/Feedback";
import { PageHeader } from "@/components/app/PageHeader";
import { AccessMap } from "@/components/map/AccessMap";
import { accessBandFor, sortByAccessRisk } from "@/lib/access";
import { apiUrl } from "@/lib/api";
import {
  formatMinutes,
  formatNumber,
  formatPercent,
  titleCase,
} from "@/lib/format";
import type { OverviewResponse } from "@/lib/types";
import { useApiData } from "@/lib/use-api";

type AccessFilter = "all" | "outside" | "inside";
type SortMode = "time" | "population" | "vulnerability";

export function ExploreClient() {
  const searchParams = useSearchParams();
  const initialService = searchParams.get("service") || "primary_care";
  const initialThreshold = Number(searchParams.get("threshold")) || 30;
  const initialArea = searchParams.get("area");

  const [service, setService] = useState(initialService);
  const [threshold, setThreshold] = useState(initialThreshold);
  const [selectedId, setSelectedId] = useState<string | null>(initialArea);
  const [query, setQuery] = useState("");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const lastDataKey = useRef<string | null>(null);

  const { data, error, loading, reload } = useApiData<OverviewResponse>(
    apiUrl("/api/v1/overview", { service, threshold_minutes: threshold }),
  );

  const allAreas = useMemo(
    () => (data?.areas.features ?? []).map((feature) => feature.properties),
    [data],
  );
  const riskSorted = useMemo(() => sortByAccessRisk(allAreas), [allAreas]);
  const worstAreaId = riskSorted[0]?.area_id ?? null;

  useEffect(() => {
    if (!data) return;
    const key = `${data.service}-${data.threshold_minutes}`;
    if (lastDataKey.current !== key) {
      lastDataKey.current = key;
      const exists = (id: string | null) =>
        Boolean(
          id &&
            data.areas.features.some(
              (feature) => feature.properties.area_id === id,
            ),
        );
      const fromQuery = exists(initialArea) ? initialArea : null;
      setSelectedId((previous) =>
        exists(previous) ? previous : (fromQuery ?? worstAreaId),
      );
    }
  }, [data, initialArea, worstAreaId]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    let items = allAreas.filter((area) => {
      if (text) {
        const haystack = `${area.name} ${area.quadrant} ${area.area_id}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      if (accessFilter === "outside") return !area.covered;
      if (accessFilter === "inside") return area.covered;
      return true;
    });
    items = [...items].sort((a, b) => {
      if (sortMode === "population") return b.population - a.population;
      if (sortMode === "vulnerability") {
        return b.vulnerability_index - a.vulnerability_index;
      }
      return (
        (b.travel_time_minutes ?? Number.POSITIVE_INFINITY) -
        (a.travel_time_minutes ?? Number.POSITIVE_INFINITY)
      );
    });
    return items;
  }, [accessFilter, allAreas, query, sortMode]);

  const selectedArea = useMemo(
    () =>
      allAreas.find((area) => area.area_id === selectedId) ??
      (selectedId ? allAreas[0] ?? null : null),
    [allAreas, selectedId],
  );
  const mapAreas = data?.areas as unknown as FeatureCollection<
    Geometry,
    Record<string, unknown>
  >;

  function handleServiceChange(nextService: string) {
    setService(nextService);
    const definition = data?.services.find((item) => item.id === nextService);
    if (definition) setThreshold(definition.default_threshold_minutes);
    setSelectedId(null);
  }

  function downloadCsv() {
    if (!data) return;
    const header = [
      "area_id",
      "name",
      "quadrant",
      "population",
      "vulnerability_index",
      "travel_time_minutes",
      "covered",
      "nearest_facility",
      "suitable_facilities_within_threshold",
    ];
    const rows = riskSorted.map((area) => [
      area.area_id,
      area.name,
      area.quadrant,
      area.population,
      area.vulnerability_index,
      area.travel_time_minutes ?? "",
      area.covered ? "yes" : "no",
      area.nearest_facility_name ?? "",
      area.suitable_facilities_within_threshold ?? 0,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `caregap-access-${service}-${threshold}min.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    setQuery("");
    setAccessFilter("all");
    setSortMode("time");
  }

  return (
    <div className="page-gutter">
      <div className="content-max pb-10 pt-6">
        <PageHeader
          index="02"
          eyebrow="Gap detection"
          title="Every area, ranked by reach."
          description="Inspect the distribution of modelled access, isolate areas outside the threshold, and read the population and vulnerability context behind each ward. Rankings use the same nearest-suitable-facility model as every other workspace."
          actions={
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={downloadCsv}
                disabled={!data}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                Export area CSV
              </button>
              <Link href="/app/simulator" className="btn btn-primary btn-sm">
                Test an intervention
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
                Recalculating…
              </>
            ) : (
              <>
                <span className="status-dot h-[5px] w-[5px]" aria-hidden="true" />
                {data?.summary.wards_over_threshold ?? "—"} areas outside the threshold
              </>
            )}
          </div>
        </div>

        {data && (
          <DataNotice notice={data.data_notice} routing={data.routing} className="mt-4" />
        )}

        {error && !data ? (
          <div className="mt-8">
            <ErrorPanel message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <div className="mt-8 grid gap-4 xl:grid-cols-[1fr_370px]">
            <div className="skeleton h-[520px]" />
            <div className="skeleton h-[520px]" />
          </div>
        ) : (
          <>
            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
              <div className="border border-[var(--rule-strong)] bg-[var(--sheet)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
                      Gap surface
                    </span>
                    <span className="status-pill">
                      {titleCase(service)} · {threshold} min
                    </span>
                  </div>
                  <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Click a ward to inspect
                  </p>
                </div>
                <AccessMap
                  areas={mapAreas}
                  threshold={threshold}
                  facilities={data.facilities}
                  catchment={data.catchment}
                  selectedAreaId={selectedId}
                  onSelectArea={setSelectedId}
                  fitKey={`explore-${data.dataset.id}`}
                  className="h-[430px] w-full sm:h-[510px] xl:h-[565px]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] px-3 py-2.5">
                  <p className="text-[10px] text-[var(--ink-3)]">
                    {data.summary.wards_over_threshold} of {data.summary.wards_total} areas
                    exceed the {threshold}-minute threshold. Dashed outlines mark
                    areas outside the threshold.
                  </p>
                  <Link
                    href={`/app/simulator?service=${service}&threshold=${threshold}`}
                    className="arrow-link text-[10px] text-[var(--signal)]"
                  >
                    Simulate a fix
                  </Link>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                  {selectedArea ? (
                    <AreaInspector
                      area={selectedArea}
                      threshold={threshold}
                      service={service}
                      showLink={false}
                    />
                  ) : (
                    <EmptyPanel
                      title="Choose an area"
                      detail="Select a ward on the map or from the ranked table to inspect its access values."
                    />
                  )}
                </div>
                <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Threshold context
                  </p>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                    {data.services.find((item) => item.id === service)?.description ??
                      "Coverage is defined by the selected travel-time threshold."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href="/app/methodology" className="link-dashed text-[10px]">
                      Method
                    </Link>
                    <Link href="/app/data-sources" className="link-dashed text-[10px]">
                      Data status
                    </Link>
                  </div>
                </div>
              </aside>
            </section>

            <section className="mt-6 border border-[var(--rule)] bg-[var(--sheet)]">
              <div className="flex flex-col justify-between gap-3 border-b border-[var(--rule)] p-3 lg:flex-row lg:items-center">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-[var(--signal)]" strokeWidth={1.6} aria-hidden="true" />
                  <h2 className="text-[12px] font-medium text-[var(--ink)]">
                    Ranked population areas
                  </h2>
                  <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    {filtered.length} shown
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="relative">
                    <label htmlFor="area-search" className="sr-only">
                      Search population areas
                    </label>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden="true" />
                    <input
                      id="area-search"
                      className="input h-8 w-[190px] pl-8 text-[11px]"
                      placeholder="Search ward or quadrant"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="access-filter" className="sr-only">
                      Filter by access status
                    </label>
                    <select
                      id="access-filter"
                      className="field h-8 w-[128px] text-[11px]"
                      value={accessFilter}
                      onChange={(event) =>
                        setAccessFilter(event.target.value as AccessFilter)
                      }
                    >
                      <option value="all">All areas</option>
                      <option value="outside">Outside threshold</option>
                      <option value="inside">Within threshold</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sort-mode" className="sr-only">
                      Sort areas
                    </label>
                    <select
                      id="sort-mode"
                      className="field h-8 w-[150px] text-[11px]"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                    >
                      <option value="time">Longest travel time</option>
                      <option value="population">Largest population</option>
                      <option value="vulnerability">Highest vulnerability</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8"
                    onClick={resetFilters}
                    aria-label="Reset table filters"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {filtered.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      Population areas ranked by modelled access to the selected service
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Area</th>
                        <th scope="col">Quadrant</th>
                        <th scope="col" className="text-right">Population</th>
                        <th scope="col" className="text-right">Vulnerability</th>
                        <th scope="col" className="text-right">Travel time</th>
                        <th scope="col">Nearest suitable facility</th>
                        <th scope="col">Status</th>
                        <th scope="col"><span className="sr-only">Inspect</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((area) => {
                        const band = accessBandFor(area.travel_time_minutes, threshold);
                        return (
                          <tr key={area.area_id} data-selected={selectedId === area.area_id}>
                            <td>
                              <span className="whitespace-nowrap font-medium">{area.name}</span>
                              <span className="mono ml-1.5 text-[8px] text-[var(--ink-3)]">
                                {area.area_id}
                              </span>
                            </td>
                            <td className="whitespace-nowrap text-[var(--ink-2)]">
                              {area.quadrant}
                            </td>
                            <td className="num">{formatNumber(area.population)}</td>
                            <td className="num">{formatPercent(area.vulnerability_index * 100, 0)}</td>
                            <td className="num">{formatMinutes(area.travel_time_minutes)}</td>
                            <td className="max-w-[220px] text-[11px] text-[var(--ink-2)]">
                              {area.nearest_facility_name ?? "No suitable mapped facility"}
                            </td>
                            <td>
                              <span
                                className="mono inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[7.5px] uppercase tracking-[0.06em]"
                                style={{ background: band.color, color: band.textColor }}
                              >
                                {band.label}
                              </span>
                            </td>
                            <td className="text-right">
                              <button
                                type="button"
                                className="text-[10px] font-medium text-[var(--signal)] hover:underline"
                                onClick={() => setSelectedId(area.area_id)}
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6">
                  <EmptyPanel
                    title="No areas match these filters"
                    detail="Clear the search or switch the access filter to see all population areas."
                    action={
                      <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
                        Reset filters
                      </button>
                    }
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[9.5px] text-[var(--ink-3)]">
                  <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                  Table and map read from the same overview response.
                </p>
                <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {data.routing.label}
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
