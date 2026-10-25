"use client";

import type { FeatureCollection, Geometry } from "geojson";
import {
  ArrowRight,
  Check,
  Crosshair,
  Info,
  MapPin,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DataNotice } from "@/components/app/Controls";
import { ErrorPanel } from "@/components/app/Feedback";
import { PageHeader } from "@/components/app/PageHeader";
import { AccessMap } from "@/components/map/AccessMap";
import { accessBandFor, sortByAccessRisk } from "@/lib/access";
import {
  apiUrl,
  createScenario,
  simulateScenario,
} from "@/lib/api";
import {
  cn,
  formatDateTime,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatSignedMinutes,
  formatSignedPercent,
  titleCase,
} from "@/lib/format";
import { pointInAreas } from "@/lib/geo";
import { forgetScenario, rememberScenario } from "@/lib/scenario-storage";
import type {
  Facility,
  MetaResponse,
  OverviewResponse,
  SimulationResponse,
} from "@/lib/types";
import { useApiData } from "@/lib/use-api";

type MapView = "baseline" | "proposed" | "change";

interface DraftPlacement {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

export function SimulatorClient() {
  const searchParams = useSearchParams();
  const initialService = searchParams.get("service") || "primary_care";
  const initialThreshold = Number(searchParams.get("threshold")) || 30;

  const [service, setService] = useState(initialService);
  const [threshold, setThreshold] = useState(initialThreshold);
  const [interventionType, setInterventionType] = useState(
    "primary_care_clinic",
  );
  const [placements, setPlacements] = useState<DraftPlacement[]>([]);
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [mapView, setMapView] = useState<MapView>("baseline");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [lonInput, setLonInput] = useState("");
  const [latInput, setLatInput] = useState("");

  const overview = useApiData<OverviewResponse>(
    apiUrl("/api/v1/overview", { service, threshold_minutes: threshold }),
  );
  const meta = useApiData<MetaResponse>(apiUrl("/api/v1/meta"));

  const intervention = meta.data?.interventions.find(
    (item) => item.id === interventionType,
  );
  const compatibleServiceIds = intervention?.services ?? [service];
  const compatibleServices = (overview.data?.services ?? []).filter((item) =>
    compatibleServiceIds.includes(item.id),
  );
  const areaProperties = useMemo(
    () => (overview.data?.areas.features ?? []).map((feature) => feature.properties),
    [overview.data],
  );
  const worstArea = useMemo(
    () => sortByAccessRisk(areaProperties)[0] ?? null,
    [areaProperties],
  );
  const serviceDefinition = overview.data?.services.find(
    (item) => item.id === service,
  );

  const draftFacilities: Facility[] = placements.map((placement) => ({
    id: placement.id,
    name: placement.name,
    facility_type: interventionType,
    facility_type_label: intervention?.label ?? titleCase(interventionType),
    services: compatibleServiceIds,
    lon: placement.lon,
    lat: placement.lat,
    data_status: "proposed",
  }));

  const baselineAreas = overview.data?.areas as unknown as FeatureCollection<
    Geometry,
    Record<string, unknown>
  >;

  const proposedAreas: FeatureCollection<Geometry, Record<string, unknown>> | null =
    useMemo(() => {
      if (!simulation) return null;
      return {
        type: "FeatureCollection",
        features: simulation.areas.features.map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            travel_time_minutes: feature.properties.travel_time_proposed,
            covered: feature.properties.covered_proposed,
          },
        })),
      } as unknown as FeatureCollection<Geometry, Record<string, unknown>>;
    }, [simulation]);

  const simulationArea = useMemo(() => {
    if (!simulation || !selectedAreaId) return null;
    return (
      simulation.areas.features.find(
        (feature) => feature.properties.area_id === selectedAreaId,
      )?.properties ?? null
    );
  }, [selectedAreaId, simulation]);

  const baselineSelected = areaProperties.find(
    (area) => area.area_id === selectedAreaId,
  );

  function invalidateResults() {
    setSimulation(null);
    setMapView("baseline");
    setSelectedAreaId(null);
    forgetScenario();
  }

  function clearError() {
    setFormError(null);
  }

  function changeInterventionType(nextType: string) {
    const definition = meta.data?.interventions.find((item) => item.id === nextType);
    setInterventionType(nextType);
    invalidateResults();
    clearError();
    if (definition) {
      setService(definition.default_service);
      const nextService = overview.data?.services.find(
        (item) => item.id === definition.default_service,
      );
      if (nextService) setThreshold(nextService.default_threshold_minutes);
    }
    setPlacing(false);
  }

  function changeService(nextService: string) {
    setService(nextService);
    setThreshold(
      overview.data?.services.find((item) => item.id === nextService)
        ?.default_threshold_minutes ?? threshold,
    );
    invalidateResults();
    clearError();
  }

  function addPlacement(lon: number, lat: number) {
    if (!overview.data) {
      setFormError("The district boundary is still loading. Try again shortly.");
      return;
    }
    if (placements.length >= 5) {
      setFormError("A scenario supports at most five proposed facilities.");
      return;
    }
    const geometries = overview.data.areas.features.map((feature) => ({
      geometry: feature.geometry,
    }));
    if (!pointInAreas(lon, lat, geometries)) {
      setFormError(
        "The proposed facility must be inside the synthetic demo district boundary.",
      );
      return;
    }
    const label = intervention?.label ?? titleCase(interventionType);
    const next: DraftPlacement = {
      id: `draft-${Date.now()}-${placements.length + 1}`,
      name: `${label} ${placements.length + 1}`,
      lon: Number(lon.toFixed(6)),
      lat: Number(lat.toFixed(6)),
    };
    setPlacements((current) => [...current, next]);
    invalidateResults();
    setFormError(null);
  }

  function handleMapPlace(lon: number, lat: number) {
    addPlacement(lon, lat);
  }

  function addFromInputs() {
    const lon = Number(lonInput);
    const lat = Number(latInput);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      setFormError("Enter numeric longitude and latitude.");
      return;
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      setFormError("Longitude must be between -180 and 180 and latitude between -90 and 90.");
      return;
    }
    addPlacement(lon, lat);
    setLonInput("");
    setLatInput("");
  }

  function useSuggestedGap() {
    if (!worstArea?.centroid) {
      setFormError("No mapped gap is available to seed a placement.");
      return;
    }
    addPlacement(worstArea.centroid[0], worstArea.centroid[1]);
    setPlacing(false);
  }

  function removePlacement(id: string) {
    setPlacements((current) => current.filter((item) => item.id !== id));
    invalidateResults();
    clearError();
  }

  function resetScenario() {
    setPlacements([]);
    setPlacing(false);
    setFormError(null);
    setLonInput("");
    setLatInput("");
    setSimulation(null);
    setMinutedViewReset();
  }

  function setMinutedViewReset() {
    setMapView("baseline");
    setSelectedAreaId(null);
    forgetScenario();
  }

  async function runScenario() {
    if (!placements.length) {
      setFormError("Place at least one proposed facility before running the scenario.");
      return;
    }
    if (!overview.data) {
      setFormError("The baseline analysis is not ready yet.");
      return;
    }
    const label = intervention?.label ?? titleCase(interventionType);
    setPending(true);
    setFormError(null);
    try {
      const scenario = await createScenario({
        name: `${label} scenario · ${placements.length} ${placements.length === 1 ? "site" : "sites"}`,
        service,
        threshold_minutes: threshold,
        interventions: placements.map((placement) => ({
          intervention_type: interventionType,
          name: placement.name,
          lon: placement.lon,
          lat: placement.lat,
        })),
      });
      const result = await simulateScenario(scenario.id);
      setSimulation(result);
      setPlacing(false);
      setMapView("proposed");
      setSelectedAreaId(null);
      rememberScenario(scenario.id);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The scenario could not be simulated.",
      );
    } finally {
      setPending(false);
    }
  }

  if (overview.error && !overview.data) {
    return (
      <div className="page-gutter">
        <div className="content-max py-8">
          <PageHeader
            index="03"
            eyebrow="Intervention simulator"
            title="Place a resource. Read the district."
            description="Test a proposed healthcare intervention against the baseline."
          />
          <div className="mt-8">
            <ErrorPanel message={overview.error} onRetry={overview.reload} />
          </div>
        </div>
      </div>
    );
  }

  const activeView: MapView = simulation ? mapView : "baseline";
  const mapAreas =
    activeView === "baseline" ? baselineAreas : proposedAreas;
  const catchment =
    activeView === "baseline"
      ? overview.data?.catchment
      : simulation?.catchment_proposed;
  const selectedComparison = simulationArea;
  const selectedBaselineCoverage = baselineSelected?.covered;
  const selectedBand =
    activeView === "baseline" && baselineSelected
      ? accessBandFor(baselineSelected.travel_time_minutes, threshold)
      : null;

  return (
    <div className="page-gutter">
      <div className="content-max pb-10 pt-6">
        <PageHeader
          index="03"
          eyebrow="Intervention simulator"
          title="Place a resource. Read the district."
          description="Add a proposed facility to the network, re-run accessibility for every population area, and compare the result with the baseline. Existing facilities stay in place; the intervention is additive."
          actions={
            <>
              <Link href="/app/recommendations" className="btn btn-outline btn-sm">
                See ranked locations
              </Link>
              <Link href="/app/analytics" className="btn btn-outline btn-sm">
                Impact analytics
              </Link>
            </>
          }
        />

        {overview.data && (
          <DataNotice
            notice={overview.data.data_notice}
            routing={overview.data.routing}
            className="mt-4"
          />
        )}

        <div className="mt-5 grid items-start gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
          <aside className="border border-[var(--rule-strong)] bg-[var(--sheet)]">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
              <div>
                <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  Scenario setup
                </p>
                <p className="mt-0.5 text-[11.5px] font-medium text-[var(--ink)]">
                  {placements.length
                    ? `${placements.length} proposed ${placements.length === 1 ? "site" : "sites"}`
                    : "No sites placed"}
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={resetScenario}
                aria-label="Reset scenario"
                title="Reset scenario"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 p-4">
              <fieldset>
                <legend className="field-label">01 · Intervention type</legend>
                {meta.error && (
                  <p className="mb-2 text-[10px] leading-relaxed text-[var(--critical)]">
                    {meta.error}
                  </p>
                )}
                <div
                  className="grid grid-cols-2 gap-1.5"
                  role="radiogroup"
                  aria-label="Intervention type"
                >
                  {(meta.data?.interventions ?? []).map((item) => {
                    const selected = interventionType === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => changeInterventionType(item.id)}
                        className={cn(
                          "flex min-h-[64px] flex-col items-start justify-between border p-2.5 text-left transition-colors",
                          selected
                            ? "border-[var(--signal)] bg-[var(--signal-soft)]/45"
                            : "border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--ink-3)]",
                        )}
                      >
                        <span className="text-[10.5px] font-medium leading-tight text-[var(--ink)]">
                          {item.label}
                        </span>
                        <span className="mono mt-1 text-[7.5px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                          {item.operation.replaceAll("_", " ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {intervention && (
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    {intervention.description}
                  </p>
                )}
              </fieldset>

              <div>
                <p className="field-label">02 · Service &amp; threshold</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="sim-service" className="sr-only">
                      Service
                    </label>
                    <select
                      id="sim-service"
                      className="field h-9 text-[11.5px]"
                      value={compatibleServiceIds.includes(service) ? service : compatibleServiceIds[0] ?? service}
                      onChange={(event) => changeService(event.target.value)}
                    >
                      {(compatibleServices.length
                        ? compatibleServices
                        : [{ id: service, label: titleCase(service), default_threshold_minutes: threshold, description: "", thresholds: [] }]
                      ).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sim-threshold" className="sr-only">
                      Travel-time threshold
                    </label>
                    <select
                      id="sim-threshold"
                      className="field h-9 text-[11.5px]"
                      value={threshold}
                      onChange={(event) => {
                        setThreshold(Number(event.target.value));
                        invalidateResults();
                        clearError();
                      }}
                    >
                      {(overview.data?.thresholds ?? [15, 30, 45, 60, 90]).map((value) => (
                        <option key={value} value={value}>
                          {value} min threshold
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {serviceDefinition && (
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    {serviceDefinition.description}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="field-label">03 · Placement</p>
                  <span className="mono text-[8px] text-[var(--ink-3)]">
                    {placements.length}/5
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className={cn(
                      "btn btn-sm border-[var(--rule-strong)]",
                      placing
                        ? "bg-[var(--ink)] text-[var(--paper)]"
                        : "bg-[var(--sheet)] text-[var(--ink)]",
                    )}
                    aria-pressed={placing}
                    onClick={() => {
                      setPlacing((value) => !value);
                      setFormError(null);
                    }}
                    disabled={placements.length >= 5}
                  >
                    <Crosshair className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                    {placing ? "Stop placing" : "Place on map"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={useSuggestedGap}
                    disabled={!worstArea || placements.length >= 5}
                  >
                    Suggested gap
                  </button>
                </div>
                <p className="mt-2 text-[9.5px] leading-relaxed text-[var(--ink-3)]">
                  {placing
                    ? "Click inside the district on the map. The point is validated against the boundary before the scenario is run."
                    : "Place a point on the map or enter coordinates. Candidate sites are proposal points, not verified parcels."}
                </p>

                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
                  <div>
                    <label htmlFor="lon-input" className="field-label">
                      Longitude
                    </label>
                    <input
                      id="lon-input"
                      className="input h-9 text-[11px]"
                      value={lonInput}
                      onChange={(event) => setLonInput(event.target.value)}
                      inputMode="decimal"
                      placeholder="73.86"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="lat-input" className="field-label">
                      Latitude
                    </label>
                    <input
                      id="lat-input"
                      className="input h-9 text-[11px]"
                      value={latInput}
                      onChange={(event) => setLatInput(event.target.value)}
                      inputMode="decimal"
                      placeholder="18.52"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={addFromInputs}
                    aria-label="Add proposed facility at entered coordinates"
                    title="Add from coordinates"
                    disabled={placements.length >= 5}
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>

                {placements.length > 0 && (
                  <ul className="mt-3 border-t border-[var(--rule)]">
                    {placements.map((placement) => (
                      <li
                        key={placement.id}
                        className="flex items-center justify-between gap-2 border-b border-[var(--rule)] py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[10.5px] font-medium text-[var(--ink)]">
                            {placement.name}
                          </p>
                          <p className="mono text-[8px] text-[var(--ink-3)]">
                            {placement.lat.toFixed(5)}, {placement.lon.toFixed(5)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="icon-btn h-7 w-7 shrink-0"
                          onClick={() => removePlacement(placement.id)}
                          aria-label={`Remove ${placement.name}`}
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={1.7} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {formError && (
                <p className="error-note text-[11px]" role="alert">
                  {formError}
                </p>
              )}

              <div className="space-y-2 border-t border-[var(--rule)] pt-4">
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={runScenario}
                  disabled={pending || !placements.length || !overview.data}
                >
                  {pending ? (
                    <span className="spinner h-3.5 w-3.5 border-white/30 border-t-white" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  )}
                  {pending ? "Running simulation…" : "Run scenario"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline w-full btn-sm"
                  onClick={resetScenario}
                >
                  Reset scenario
                </button>
                <p className="flex items-start gap-1.5 pt-1 text-[9px] leading-relaxed text-[var(--ink-3)]">
                  <Info className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  All proposed sites share the selected intervention type. The
                  simulation does not model capacity, schedule, or staffing.
                </p>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="border border-[var(--rule-strong)] bg-[var(--sheet)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
                    Scenario map
                  </span>
                  <span className="status-pill">
                    {titleCase(service)} · {threshold} min
                  </span>
                </div>
                {simulation ? (
                  <div className="segmented" role="group" aria-label="Scenario map view">
                    {(["baseline", "proposed", "change"] as MapView[]).map((view) => (
                      <button
                        key={view}
                        type="button"
                        aria-pressed={mapView === view}
                        onClick={() => setMapView(view)}
                      >
                        {view === "baseline"
                          ? "Baseline"
                          : view === "proposed"
                            ? "Proposed"
                            : "Change"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Baseline view
                  </span>
                )}
              </div>
              <AccessMap
                areas={mapAreas}
                threshold={threshold}
                colorMode={activeView === "change" ? "improvement" : "access"}
                facilities={overview.data?.facilities ?? []}
                proposedFacilities={draftFacilities}
                catchment={catchment}
                selectedAreaId={selectedAreaId}
                onSelectArea={setSelectedAreaId}
                placementMode={placing && !pending}
                onPlace={handleMapPlace}
                onPlacementError={setFormError}
                fitKey={`simulator-${overview.data?.dataset.id ?? "demo"}`}
                className="h-[430px] w-full sm:h-[510px] xl:h-[580px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] px-3 py-2.5">
                <p className="max-w-[70ch] text-[10px] leading-relaxed text-[var(--ink-3)]">
                  {activeView === "baseline"
                    ? `Baseline: ${overview.data?.summary.wards_over_threshold ?? "—"} areas outside the threshold before the intervention.`
                    : activeView === "proposed"
                      ? "Proposed: recalculated after adding the draft facilities. Hover a ward for its proposed time."
                      : "Change: newly covered areas, improvements that remain outside the threshold, and unchanged areas."}
                </p>
                {simulation && (
                  <span className="mono flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    <span className="status-dot h-[4px] w-[4px]" aria-hidden="true" />
                    Recomputed {formatDateTime(simulation.scenario.created_at)}
                  </span>
                )}
              </div>
            </div>

            {selectedComparison ? (
              <div className="mt-3 border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      Ward comparison · {selectedComparison.area_id}
                    </p>
                    <h2 className="serif mt-1.5 text-[24px] leading-none text-[var(--ink)]">
                      {selectedComparison.name}
                    </h2>
                    <p className="mono mt-1 text-[8.5px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                      {formatNumber(selectedComparison.population)} people · vulnerability{" "}
                      {formatPercent(selectedComparison.vulnerability_index * 100, 0)}
                    </p>
                  </div>
                  <span className="status-pill">
                    {selectedComparison.covered_proposed
                      ? selectedComparison.covered_baseline
                        ? "Already covered"
                        : "Newly covered"
                      : "Still outside threshold"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["Baseline", formatMinutes(selectedComparison.travel_time_baseline)],
                    ["Proposed", formatMinutes(selectedComparison.travel_time_proposed)],
                    [
                      "Change",
                      formatSignedMinutes(selectedComparison.improvement_minutes),
                    ],
                    [
                      "Newly covered",
                      formatNumber(selectedComparison.newly_covered_population),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="border-t border-[var(--rule)] pt-2">
                      <p className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                        {label}
                      </p>
                      <p className="mono mt-1 text-[12px] text-[var(--ink)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeView === "baseline" && baselineSelected ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-[var(--rule)] bg-[var(--sheet)] px-4 py-3">
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Selected ward
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                    <span className="font-medium text-[var(--ink)]">{baselineSelected.name}</span>{" "}
                    · {formatMinutes(baselineSelected.travel_time_minutes)} to nearest suitable facility
                    {selectedBaselineCoverage ? " · within threshold" : " · outside threshold"}
                    {selectedBand && (
                      <span className="mono ml-2 text-[8px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                        {selectedBand.label}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="link-dashed text-[10px]"
                  onClick={() => setSelectedAreaId(null)}
                >
                  Clear selection
                </button>
              </div>
            ) : null}

            {simulation ? (
              <SimulationResults
                simulation={simulation}
                service={service}
                threshold={threshold}
              />
            ) : (
              <div className="mt-4 border border-dashed border-[var(--rule-strong)] bg-[var(--sheet)] p-5">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-[var(--gap)]" strokeWidth={1.6} aria-hidden="true" />
                  <div>
                    <p className="text-[12px] font-medium text-[var(--ink)]">
                      The result panel will populate after a simulation
                    </p>
                    <p className="mt-1 max-w-[78ch] text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                      Place at least one proposed facility, then run the scenario.
                      CareGap creates a saved scenario, recomputes access with the
                      added facility, and reports the change against this baseline.
                      Suggested gaps seed a point at the centroid of the area with
                      the longest modelled travel time.
                    </p>
                    {overview.data && (
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                        <span className="mono text-[9px] text-[var(--ink-3)]">
                          Baseline coverage{" "}
                          <span className="text-[var(--ink)]">
                            {formatPercent(overview.data.summary.coverage_percent)}
                          </span>
                        </span>
                        <span className="mono text-[9px] text-[var(--ink-3)]">
                          Areas outside{" "}
                          <span className="text-[var(--ink)]">
                            {overview.data.summary.wards_over_threshold}
                          </span>
                        </span>
                        <span className="mono text-[9px] text-[var(--ink-3)]">
                          Mapped facilities{" "}
                          <span className="text-[var(--ink)]">
                            {overview.data.facilities.length}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SimulationResults({
  simulation,
  service,
  threshold,
}: {
  simulation: SimulationResponse;
  service: string;
  threshold: number;
}) {
  const { baseline, proposed, delta, equity } = simulation;
  const coverageGainTone =
    delta.coverage_gain_percentage_points > 0 ? "text-[var(--positive)]" : "text-[var(--ink)]";

  return (
    <div className="mt-4 space-y-4">
      <div className="border border-[var(--rule-strong)] bg-[var(--sheet)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
          <div>
            <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Simulation result · {simulation.scenario.interventions.length}{" "}
              {simulation.scenario.interventions.length === 1 ? "site" : "sites"}
            </p>
            <p className="mt-1 text-[12px] font-medium text-[var(--ink)]">
              {titleCase(service)} · {threshold}-minute threshold
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Scenario {simulation.scenario.id.slice(0, 8)}
            </span>
            <Link href="/app/analytics" className="btn btn-outline btn-sm">
              Open impact analytics
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="grid gap-px bg-[var(--rule)] sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-[var(--sheet)] p-4">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Newly covered population
            </p>
            <p className="serif mt-2 text-[clamp(1.8rem,1.4rem+1.2vw,2.4rem)] leading-none text-[var(--positive)]">
              {formatNumber(delta.newly_covered_population)}
            </p>
            <p className="mt-1.5 text-[9.5px] text-[var(--ink-3)]">
              across {delta.wards_newly_covered} population areas
            </p>
          </div>
          <div className="bg-[var(--sheet)] p-4">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Coverage change
            </p>
            <p className={cn("serif mt-2 text-[clamp(1.8rem,1.4rem+1.2vw,2.4rem)] leading-none", coverageGainTone)}>
              {formatSignedPercent(delta.coverage_gain_percentage_points)}
            </p>
            <p className="mt-1.5 text-[9.5px] text-[var(--ink-3)]">
              {formatPercent(baseline.coverage_percent)} → {formatPercent(proposed.coverage_percent)}
            </p>
          </div>
          <div className="bg-[var(--sheet)] p-4">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Weighted mean time change
            </p>
            <p className="serif mt-2 text-[clamp(1.8rem,1.4rem+1.2vw,2.4rem)] leading-none text-[var(--positive)]">
              {formatSignedMinutes(delta.weighted_mean_travel_time_change)}
            </p>
            <p className="mt-1.5 text-[9.5px] text-[var(--ink-3)]">
              negative values mean faster modelled access
            </p>
          </div>
          <div className="bg-[var(--sheet)] p-4">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Remaining outside threshold
            </p>
            <p className="serif mt-2 text-[clamp(1.8rem,1.4rem+1.2vw,2.4rem)] leading-none text-[var(--gap)]">
              {formatNumber(delta.remaining_uncovered_population)}
            </p>
            <p className="mt-1.5 text-[9.5px] text-[var(--ink-3)]">
              {delta.remaining_wards_over_threshold} areas remain over threshold
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="border border-[var(--rule)] bg-[var(--sheet)]">
          <div className="border-b border-[var(--rule)] px-4 py-3">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Before / after
            </p>
          </div>
          <table className="data-table">
            <caption className="sr-only">
              Baseline and proposed accessibility metrics for this intervention
            </caption>
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
                {
                  label: "Coverage",
                  base: formatPercent(baseline.coverage_percent),
                  proposed: formatPercent(proposed.coverage_percent),
                  delta: formatSignedPercent(delta.coverage_gain_percentage_points),
                },
                {
                  label: "Covered population",
                  base: formatNumber(baseline.covered_population),
                  proposed: formatNumber(proposed.covered_population),
                  delta: `+${formatNumber(delta.newly_covered_population)}`,
                },
                {
                  label: "Outside threshold",
                  base: formatNumber(baseline.total_population - baseline.covered_population),
                  proposed: formatNumber(delta.remaining_uncovered_population),
                  delta: `−${formatNumber(baseline.total_population - baseline.covered_population - delta.remaining_uncovered_population)}`,
                },
                {
                  label: "Weighted mean time",
                  base: formatMinutes(baseline.weighted_mean_travel_time),
                  proposed: formatMinutes(proposed.weighted_mean_travel_time),
                  delta: formatSignedMinutes(delta.weighted_mean_travel_time_change),
                },
                {
                  label: "Weighted median time",
                  base: formatMinutes(baseline.weighted_median_travel_time),
                  proposed: formatMinutes(proposed.weighted_median_travel_time),
                  delta: formatSignedMinutes(delta.weighted_median_travel_time_change),
                },
                {
                  label: "Areas over threshold",
                  base: `${baseline.wards_over_threshold} / ${baseline.wards_total}`,
                  proposed: `${proposed.wards_over_threshold} / ${proposed.wards_total}`,
                  delta: `${delta.wards_newly_covered} newly covered`,
                },
              ].map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="num">{row.base}</td>
                  <td className="num">{row.proposed}</td>
                  <td className="num text-[var(--positive)]">{row.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-[var(--rule)] px-4 py-2.5 text-[9px] leading-relaxed text-[var(--ink-3)]">
            All figures are computed from the same simulation response. Adding a
            facility in this additive model cannot increase an area&apos;s
            nearest-facility time.
          </p>
        </div>

        <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Worst-served population
            </p>
            <span className="status-pill">
              {formatPercent(equity.worst_served_population_share * 100, 0)} share
            </span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
            Defined from baseline travel times across {equity.worst_served_area_count} areas
            and {formatNumber(equity.worst_served_population)} people. Not an
            official equity standard.
          </p>
          <div className="mt-4 space-y-3">
            <CoverageBar
              label="Baseline coverage"
              value={equity.baseline_coverage_percent}
              color="var(--ink-3)"
            />
            <CoverageBar
              label="Proposed coverage"
              value={equity.proposed_coverage_percent}
              color="var(--signal)"
            />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--rule)] pt-3">
            <div>
              <dt className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Coverage gain
              </dt>
              <dd className="mono mt-1 text-[11px] text-[var(--positive)]">
                {formatSignedPercent(equity.coverage_gain_percentage_points)}
              </dd>
            </div>
            <div>
              <dt className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Mean time improvement
              </dt>
              <dd className="mono mt-1 text-[11px] text-[var(--positive)]">
                {formatMinutes(equity.mean_travel_time_improvement)}
              </dd>
            </div>
          </dl>
          <Link href="/app/methodology#equity" className="link-dashed mt-4 text-[10px]">
            How the worst-served group is defined
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-[var(--rule)] bg-[var(--sheet)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Largest improvements
            </p>
            <span className="mono text-[8px] text-[var(--ink-3)]">
              {delta.wards_improved} areas improved
            </span>
          </div>
          {simulation.top_improvements.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Area</th>
                    <th scope="col" className="text-right">People</th>
                    <th scope="col" className="text-right">Before</th>
                    <th scope="col" className="text-right">After</th>
                    <th scope="col" className="text-right">Newly covered</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.top_improvements.slice(0, 7).map((item) => (
                    <tr key={item.area_id}>
                      <td>{item.name}</td>
                      <td className="num">{formatNumber(item.population)}</td>
                      <td className="num">{formatMinutes(item.travel_time_baseline)}</td>
                      <td className="num">{formatMinutes(item.travel_time_proposed)}</td>
                      <td className="num">{formatNumber(item.newly_covered_population)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-[10.5px] text-[var(--ink-3)]">
              No area-level improvements were recorded for this scenario.
            </p>
          )}
        </div>

        <div className="border border-[var(--rule)] bg-[var(--sheet)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Residual gaps
            </p>
            <span className="mono text-[8px] text-[var(--gap)]">
              {delta.remaining_wards_over_threshold} areas outside
            </span>
          </div>
          {simulation.residual_gaps.length ? (
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
                  {simulation.residual_gaps.slice(0, 7).map((area) => (
                    <tr key={area.area_id}>
                      <td>{area.name}</td>
                      <td className="num">{formatNumber(area.population)}</td>
                      <td className="num">{formatMinutes(area.travel_time_minutes)}</td>
                      <td className="num">{formatPercent(area.vulnerability_index * 100, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-[10.5px] text-[var(--ink-3)]">
              No population areas remain outside the selected threshold under
              this model.
            </p>
          )}
          <div className="border-t border-[var(--rule)] px-4 py-2.5">
            <Link
              href={`/app/explore?service=${service}&threshold=${threshold}`}
              className="arrow-link text-[10px] text-[var(--signal)]"
            >
              Inspect remaining gaps
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <details className="border border-[var(--rule)] bg-[var(--paper-2)]">
        <summary className="cursor-pointer px-4 py-3 text-[11px] font-medium text-[var(--ink)]">
          Assumptions, warnings, and model limits for this result
        </summary>
        <div className="grid gap-5 border-t border-[var(--rule)] px-4 py-4 sm:grid-cols-2">
          <div>
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Assumptions
            </p>
            <ul className="mt-2 space-y-2">
              {simulation.assumptions.map((item) => (
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
              {simulation.warnings.map((item) => (
                <li key={item} className="flex gap-2 text-[10px] leading-relaxed text-[var(--ink-2)]">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--gap)]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
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
