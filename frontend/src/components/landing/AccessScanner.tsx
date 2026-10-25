"use client";

import type { Geometry, Position } from "geojson";
import { ArrowRight, Info, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/app/Feedback";
import {
  accessBandFor,
  getAccessBands,
  sortByAccessRisk,
} from "@/lib/access";
import { apiUrl } from "@/lib/api";
import { cn, formatMinutes, formatNumber, formatPercent } from "@/lib/format";
import type {
  AreaProperties,
  Facility,
  OverviewResponse,
} from "@/lib/types";
import { useApiData } from "@/lib/use-api";

const FALLBACK_SERVICES = [
  { id: "maternal_health", label: "Maternal health", default_threshold_minutes: 15 },
  { id: "primary_care", label: "Primary care", default_threshold_minutes: 30 },
  { id: "diagnostics", label: "Diagnostics", default_threshold_minutes: 45 },
  { id: "emergency", label: "Emergency care", default_threshold_minutes: 60 },
];

const FALLBACK_THRESHOLDS = [15, 30, 45, 60, 90];

interface ProjectedPath {
  id: string;
  d: string;
  properties: AreaProperties;
}

const VIEW = { width: 760, height: 560, padding: 30 };

function geometryRings(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function scanCoordinates(geometry: Geometry): Position[] {
  return geometryRings(geometry).flat();
}

function buildProjection(
  features: Array<{ geometry: Geometry }>,
): {
  project: (lon: number, lat: number) => [number, number];
  paths: Array<{ coordinates: Position[][]; projectRing: (ring: Position[]) => string }>;
} {
  const coordinates = features.flatMap((feature) =>
    scanCoordinates(feature.geometry),
  );
  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const innerWidth = VIEW.width - VIEW.padding * 2;
  const innerHeight = VIEW.height - VIEW.padding * 2;
  const scale = Math.min(
    innerWidth / Math.max(maxLon - minLon, 1e-6),
    innerHeight / Math.max(maxLat - minLat, 1e-6),
  );
  const width = (maxLon - minLon) * scale;
  const height = (maxLat - minLat) * scale;
  const offsetX = (VIEW.width - width) / 2;
  const offsetY = (VIEW.height - height) / 2;

  const project = (lon: number, lat: number): [number, number] => [
    offsetX + (lon - minLon) * scale,
    offsetY + (maxLat - lat) * scale,
  ];

  return {
    project,
    paths: features.map((feature) => ({
      coordinates: geometryRings(feature.geometry),
      projectRing: (ring: Position[]) =>
        ring
          .map((coordinate) => project(coordinate[0], coordinate[1]))
          .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
          .join(" ") + " Z",
    })),
  };
}

export function AccessScanner() {
  const [service, setService] = useState("maternal_health");
  const [threshold, setThreshold] = useState(15);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const url = useMemo(
    () =>
      apiUrl("/api/v1/overview", {
        service,
        threshold_minutes: threshold,
      }),
    [service, threshold],
  );
  const { data, error, loading, reload } = useApiData<OverviewResponse>(url);

  const services = data?.services.length ? data.services : FALLBACK_SERVICES;
  const thresholds = data?.thresholds.length ? data.thresholds : FALLBACK_THRESHOLDS;
  const areaProperties = useMemo<AreaProperties[]>(
    () => (data?.areas.features ?? []).map((feature) => feature.properties),
    [data],
  );
  const riskSorted = useMemo(
    () => sortByAccessRisk(areaProperties),
    [areaProperties],
  );
  const active = useMemo(() => {
    if (!riskSorted.length) return null;
    return (
      riskSorted.find((area) => area.area_id === selectedId) ?? riskSorted[0]
    );
  }, [riskSorted, selectedId]);

  const projected = useMemo(() => {
    if (!data) return null;
    const geometries = data.areas.features
      .filter((feature) => feature.geometry)
      .map((feature) => ({ geometry: feature.geometry }));
    if (!geometries.length) return null;
    const projection = buildProjection(geometries);
    const paths: ProjectedPath[] = [];
    data.areas.features.forEach((feature, index) => {
      const detail = projection.paths[index];
      if (!detail) return;
      paths.push({
        id: feature.properties.area_id,
        d: detail.coordinates.map(detail.projectRing).join(" "),
        properties: feature.properties,
      });
    });
    return { ...projection, paths };
  }, [data]);

  const activeFacility = useMemo<Facility | null>(() => {
    if (!data || !active?.nearest_facility_id) return null;
    return (
      data.facilities.find(
        (facility) => facility.id === active.nearest_facility_id,
      ) ?? null
    );
  }, [active, data]);

  const bands = getAccessBands(threshold);
  const activeBand = active
    ? accessBandFor(active.travel_time_minutes, threshold)
    : bands[5];
  const affected = data
    ? data.summary.total_population - data.summary.covered_population
    : 0;

  function selectService(nextService: string) {
    const next = services.find((item) => item.id === nextService);
    setSelectedId(null);
    setService(nextService);
    if (next?.default_threshold_minutes) {
      setThreshold(next.default_threshold_minutes);
    }
  }

  return (
    <div className="dark-plate flex h-full flex-col">
      <div className="relative z-[1] flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="status-dot h-[5px] w-[5px] bg-[var(--signal-bright)] pulse-dot" aria-hidden="true" />
            <span className="mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--paper)]/55">
              {data?.dataset.is_synthetic
                ? "Live analysis · synthetic data"
                : "Live analysis · Census 2011 + OpenStreetMap"}
            </span>
          </div>
          <h2 className="serif mt-1.5 text-[19px] leading-none text-[var(--paper)]">
            Access scanner
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[132px]">
            <label htmlFor="scanner-service" className="field-label field-label--dark">
              Service
            </label>
            <select
              id="scanner-service"
              className="field field--dark h-9 text-[12px]"
              value={service}
              onChange={(event) => selectService(event.target.value)}
              disabled={loading && Boolean(data)}
            >
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="field-label field-label--dark">Threshold</span>
            <div className="segmented segmented--dark" role="group" aria-label="Travel-time threshold">
              {thresholds.slice(0, 4).map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={threshold === minutes}
                  onClick={() => {
                    setThreshold(minutes);
                    setSelectedId(null);
                  }}
                >
                  {minutes}m
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && !data ? (
        <div className="relative z-[1] p-4">
          <div className="rounded-[3px] bg-[var(--paper)] p-1">
            <ErrorPanel
              message={`${error} The public preview needs the CareGap analysis API running locally.`}
              onRetry={reload}
              compact
            />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--paper)]/50">
            Start the backend with <span className="mono text-[var(--paper)]/75">cd backend &amp;&amp; uvicorn app.main:app</span>,
            then retry. All workspace pages use the same API.
          </p>
        </div>
      ) : !data ? (
        <div className="relative z-[1] flex-1 p-4">
          <LoadingPanel
            light
            label="Scanning the study area"
            detail="Computing nearest suitable facility travel times for every population area."
          />
        </div>
      ) : (
        <>
          <div className="relative z-[1] grid grid-cols-3 divide-x divide-white/10 border-b border-white/10">
            <div className="px-4 py-4 sm:px-5">
              <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/42">
                Within {threshold} min
              </p>
              <p className="serif mt-2 text-[clamp(1.7rem,1.1rem+1.5vw,2.5rem)] leading-none text-[var(--paper)]">
                {formatPercent(data.summary.coverage_percent)}
              </p>
              <p className="mt-1.5 text-[9.5px] text-[var(--paper)]/45">
                {formatNumber(data.summary.covered_population)} people
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/42">
                Outside threshold
              </p>
              <p className="serif mt-2 text-[clamp(1.7rem,1.1rem+1.5vw,2.5rem)] leading-none text-[var(--gap-soft)]">
                {formatNumber(affected)}
              </p>
              <p className="mt-1.5 text-[9.5px] text-[var(--paper)]/45">
                {formatPercent(100 - data.summary.coverage_percent)} of modelled people
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/42">
                Areas outside
              </p>
              <p className="serif mt-2 text-[clamp(1.7rem,1.1rem+1.5vw,2.5rem)] leading-none text-[var(--paper)]">
                {data.summary.wards_over_threshold}
                <span className="mono ml-1.5 align-middle text-[10px] text-[var(--paper)]/35">
                  / {data.summary.wards_total}
                </span>
              </p>
              <p className="mt-1.5 text-[9.5px] text-[var(--paper)]/45">
                population areas over threshold
              </p>
            </div>
          </div>

          <div className="relative z-[1] flex-1 p-3 sm:p-4">
            <div className="relative overflow-hidden rounded-[3px] border border-white/10 bg-[var(--field-2)]">
              {loading && (
                <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-[2px] bg-[var(--ink)]/75 px-2 py-1">
                  <RefreshCw className="h-2.5 w-2.5 animate-spin text-[var(--signal-bright)]" aria-hidden="true" />
                  <span className="mono text-[7.5px] uppercase tracking-[0.1em] text-[var(--paper)]/60">
                    Recalculating
                  </span>
                </div>
              )}
              <div className="scan-line" aria-hidden="true" />
              <div className="pointer-events-none absolute left-2 top-2 z-10">
                <p className="mono text-[7.5px] uppercase tracking-[0.12em] text-[var(--paper)]/40">
                  {data.dataset.short_name}
                </p>
              </div>
              <div className="pointer-events-none absolute bottom-2 right-2 z-10 text-right">
                <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--paper)]/35">
                  {data.dataset.geography.center
                    ? `${data.dataset.geography.center[1].toFixed(2)}°N / ${data.dataset.geography.center[0].toFixed(2)}°E`
                    : "NCT Delhi"}
                </p>
              </div>
              <svg
                viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
                role="img"
                aria-label={`Accessibility map of ${data.dataset.short_name} at a ${threshold}-minute ${service.replaceAll("_", " ")} threshold. ${formatPercent(data.summary.coverage_percent)} of the modelled population is within the threshold. Use the adjacent area list to inspect specific areas.`}
                className="block h-auto w-full"
              >
                <defs>
                  <pattern id="scanner-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="0.7" fill="rgba(247,244,235,.13)" />
                  </pattern>
                </defs>
                <rect width={VIEW.width} height={VIEW.height} fill="url(#scanner-dots)" />
                {[0.25, 0.5, 0.75].map((fraction) => (
                  <g key={fraction} aria-hidden="true">
                    <line
                      x1={VIEW.padding}
                      x2={VIEW.width - VIEW.padding}
                      y1={VIEW.padding + (VIEW.height - VIEW.padding * 2) * fraction}
                      y2={VIEW.padding + (VIEW.height - VIEW.padding * 2) * fraction}
                      stroke="rgba(247,244,235,.05)"
                      strokeDasharray="2 6"
                    />
                    <line
                      y1={VIEW.padding}
                      y2={VIEW.height - VIEW.padding}
                      x1={VIEW.padding + (VIEW.width - VIEW.padding * 2) * fraction}
                      x2={VIEW.padding + (VIEW.width - VIEW.padding * 2) * fraction}
                      stroke="rgba(247,244,235,.05)"
                      strokeDasharray="2 6"
                    />
                  </g>
                ))}
                {projected?.paths.map((path) => {
                  const band = accessBandFor(path.properties.travel_time_minutes, threshold);
                  const isSelected = active?.area_id === path.id;
                  return (
                    <path
                      key={path.id}
                      d={path.d}
                      fill={band.color}
                      fillOpacity={isSelected ? 1 : 0.82}
                      stroke={isSelected ? "#fffdf7" : "rgba(8,26,28,.5)"}
                      strokeWidth={isSelected ? 2 : 0.55}
                      className="cursor-pointer transition-[fill-opacity] duration-150 hover:opacity-90"
                      onMouseEnter={() => setSelectedId(path.id)}
                      onClick={() => setSelectedId(path.id)}
                    />
                  );
                })}
                {projected && active && activeFacility && (() => {
                  const centroid = active.centroid;
                  if (!centroid) return null;
                  const [x1, y1] = projected.project(centroid[0], centroid[1]);
                  const [x2, y2] = projected.project(activeFacility.lon, activeFacility.lat);
                  return (
                    <g aria-hidden="true">
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#fffdf7"
                        strokeOpacity=".55"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <circle cx={x2} cy={y2} r="7" fill="none" stroke="#fffdf7" strokeOpacity=".65" strokeWidth="1" />
                    </g>
                  );
                })()}
                {projected &&
                  data.facilities
                    .filter((facility) => facility.services.includes(service))
                    .map((facility) => {
                      const [x, y] = projected.project(facility.lon, facility.lat);
                      return (
                        <g key={facility.id}>
                          <title>{facility.name}</title>
                          <circle
                            cx={x}
                            cy={y}
                            r="2.2"
                            fill="#f7f4eb"
                            stroke="#081a1c"
                            strokeWidth="0.8"
                            opacity="0.85"
                          />
                        </g>
                      );
                    })}
              </svg>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {bands.map((band) => (
                <div
                  key={band.id}
                  className="flex items-center gap-1.5 text-[8.5px] leading-tight text-[var(--paper)]/50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[1px]"
                    style={{ background: band.color }}
                    aria-hidden="true"
                  />
                  {band.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-[1] border-t border-white/10">
            {active ? (
              <div className="grid gap-0 md:grid-cols-[1.25fr_1fr]">
                <div className="border-b border-white/10 p-4 sm:p-5 md:border-b-0 md:border-r">
                  <div className="flex items-center justify-between gap-3">
                    <span className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/40">
                      Area readout
                    </span>
                    <span
                      className="mono rounded-[2px] px-1.5 py-0.5 text-[7.5px] uppercase tracking-[0.08em]"
                      style={{
                        background: activeBand.color,
                        color: activeBand.textColor,
                      }}
                    >
                      {activeBand.label}
                    </span>
                  </div>
                  <p className="serif mt-2 text-[22px] leading-none text-[var(--paper)]">
                    {active.name}
                  </p>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                    <p className="text-[11.5px] text-[var(--paper)]/70">
                      {active.population === null
                        ? "Population unavailable"
                        : `${formatNumber(active.population)} people`}
                    </p>
                    <p className="text-[11.5px] text-[var(--paper)]/70">
                      {formatMinutes(active.travel_time_minutes)} to nearest suitable facility
                    </p>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--paper)]/42">
                    {active.nearest_facility_name
                      ? `Nearest mapped option: ${active.nearest_facility_name}. Modelled access only; capacity, hours, and quality are not verified.`
                      : "No mapped facility provides this service in the mapped inventory. Absence of a map record does not prove care is unavailable."}
                  </p>
                  <Link
                    href={`/app/explore?area=${active.area_id}&service=${service}&threshold=${threshold}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--signal-bright)] hover:text-[var(--paper)]"
                  >
                    Inspect this gap in the workspace
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/40">
                    Longest modelled travel times
                  </p>
                  <div className="mt-2.5 space-y-0">
                    {riskSorted.slice(0, 3).map((area) => {
                      const band = accessBandFor(area.travel_time_minutes, threshold);
                      return (
                        <button
                          key={area.area_id}
                          type="button"
                          onClick={() => setSelectedId(area.area_id)}
                          aria-pressed={active.area_id === area.area_id}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 border-t border-white/10 py-2 text-left first:border-t-0",
                            active.area_id === area.area_id
                              ? "text-[var(--paper)]"
                              : "text-[var(--paper)]/62 hover:text-[var(--paper)]",
                          )}
                        >
                          <span className="text-[10.5px]">{area.name}</span>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: band.color }}
                              aria-hidden="true"
                            />
                            <span className="mono text-[9.5px]">
                              {formatMinutes(area.travel_time_minutes)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--paper)]/35">
                    <Info className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    {data.routing.label}. Not live traffic.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <EmptyPanel
                  title="No areas in this dataset"
                  detail="Import population boundaries to activate the scanner."
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
