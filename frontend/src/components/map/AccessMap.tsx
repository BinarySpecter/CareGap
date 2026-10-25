"use client";

import type { FeatureCollection, Geometry } from "geojson";
import { Crosshair, Layers, RotateCcw, X } from "lucide-react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  Marker as MapLibreMarker,
  Popup as MapLibrePopup,
  StyleSpecification,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildAccessColorExpression,
  buildImprovementColorExpression,
  getAccessBands,
  getImprovementLegend,
  NO_POPULATION_COLOR,
  NO_POPULATION_LABEL,
  type MapColorMode,
} from "@/lib/access";
import { cn, formatMinutes, formatNumber, titleCase } from "@/lib/format";
import type {
  AnyCollection,
  Facility,
  MapPoint,
} from "@/lib/types";

type MapAreas = FeatureCollection<Geometry, Record<string, unknown>>;

export interface AccessMapProps {
  areas: MapAreas | null;
  threshold: number;
  colorMode?: MapColorMode;
  facilities?: Facility[];
  proposedFacilities?: Facility[];
  candidates?: MapPoint[];
  selectedAreaId?: string | null;
  selectedCandidateId?: string | null;
  onSelectArea?: (areaId: string | null) => void;
  onSelectCandidate?: (candidateId: string) => void;
  catchment?: AnyCollection | null;
  placementMode?: boolean;
  onPlace?: (lon: number, lat: number) => void;
  onPlacementError?: (message: string) => void;
  fitKey?: string;
  className?: string;
}

const EMPTY_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#e9e4d7" },
      },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: {
          "raster-opacity": 0.78,
          "raster-saturation": -0.72,
          "raster-contrast": -0.12,
          "raster-brightness-min": 0.34,
          "raster-brightness-max": 0.98,
        },
      },
    ],
  };
}

function numericProperty(
  properties: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!properties) return null;
  const value = properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringProperty(
  properties: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!properties) return null;
  const value = properties[key];
  return typeof value === "string" ? value : null;
}

function facilityInitial(facility: Facility): string {
  if (facility.data_status === "proposed") return "+";
  const mapping: Record<string, string> = {
    district_hospital: "H",
    primary_health_centre: "P",
    community_health_centre: "C",
    diagnostic_centre: "D",
    maternal_health_centre: "M",
  };
  return mapping[facility.facility_type] ?? facility.name.charAt(0).toUpperCase();
}

function buildPopupContent(
  title: string,
  rows: Array<[string, string]>,
  note?: string,
): HTMLElement {
  const root = document.createElement("div");
  root.style.minWidth = "190px";

  const heading = document.createElement("p");
  heading.textContent = title;
  heading.style.cssText =
    "margin:0 0 6px;font-family:var(--font-geist),sans-serif;font-size:13px;font-weight:600;color:var(--ink);line-height:1.3;";
  root.appendChild(heading);

  rows.forEach(([label, value]) => {
    const row = document.createElement("p");
    row.style.cssText =
      "margin:0;padding:3px 0;border-top:1px solid var(--rule);font-size:10.5px;color:var(--ink-2);display:flex;justify-content:space-between;gap:16px;";
    const key = document.createElement("span");
    key.textContent = label;
    key.style.color = "var(--ink-3)";
    key.style.fontFamily = "var(--font-jetbrains),monospace";
    key.style.fontSize = "9px";
    key.style.textTransform = "uppercase";
    key.style.letterSpacing = "0.07em";
    const val = document.createElement("span");
    val.textContent = value;
    val.style.textAlign = "right";
    row.append(key, val);
    root.appendChild(row);
  });

  if (note) {
    const foot = document.createElement("p");
    foot.textContent = note;
    foot.style.cssText =
      "margin:7px 0 0;font-size:9.5px;line-height:1.45;color:var(--ink-3);";
    root.appendChild(foot);
  }
  return root;
}

export function AccessMap({
  areas,
  threshold,
  colorMode = "access",
  facilities = [],
  proposedFacilities = [],
  candidates = [],
  selectedAreaId = null,
  selectedCandidateId = null,
  onSelectArea,
  onSelectCandidate,
  catchment = null,
  placementMode = false,
  onPlace,
  onPlacementError,
  fitKey = "default",
  className,
}: AccessMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<Awaited<typeof import("maplibre-gl")> | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const loadedRef = useRef(false);
  const fittedKeyRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- responsive default after hydration
      setLegendOpen(false);
    }
  }, []);

  const callbackRef = useRef({
    onSelectArea,
    onSelectCandidate,
    onPlace,
    onPlacementError,
    placementMode,
  });

  useEffect(() => {
    callbackRef.current = {
      onSelectArea,
      onSelectCandidate,
      onPlace,
      onPlacementError,
      placementMode,
    };
  }, [onSelectArea, onSelectCandidate, onPlace, onPlacementError, placementMode]);

  const bands = useMemo(() => getAccessBands(threshold), [threshold]);
  const improvementLegend = useMemo(() => getImprovementLegend(), []);
  const facilityCollection = useMemo<FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: facilities.map((facility) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [facility.lon, facility.lat] },
        properties: {
          id: facility.id,
          name: facility.name,
          facility_type: facility.facility_type,
          facility_type_label: facility.facility_type_label,
          services: facility.services,
          data_status: facility.data_status,
          admin_area: facility.admin_area,
          address: facility.address,
          initial: facilityInitial(facility),
        },
      })),
    }),
    [facilities],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      try {
        const maplibregl = await import("maplibre-gl");
        maplibreRef.current = maplibregl;
        maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
        if (cancelled || !container) return;
        const map = new maplibregl.Map({
          container,
          style: baseStyle(),
          center: [77.21, 28.64],
          zoom: 9,
          minZoom: 6,
          maxZoom: 16,
          attributionControl: false,
          dragRotate: false,
        });
        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          "bottom-right",
        );

        map.on("load", () => {
          if (cancelled) return;
          map.addSource("areas", {
            type: "geojson",
            data: (areas ?? EMPTY_COLLECTION) as unknown as GeoJSON.GeoJSON,
          });
          map.addSource("catchment", {
            type: "geojson",
            data: (catchment ?? EMPTY_COLLECTION) as unknown as GeoJSON.GeoJSON,
          });
          map.addLayer({
            id: "areas-fill",
            type: "fill",
            source: "areas",
            paint: {
              "fill-color": buildAccessColorExpression(threshold) as never,
              "fill-opacity": 0.82,
              "fill-outline-color": "rgba(255, 253, 247, 0.4)",
            },
          });
          map.addLayer({
            id: "catchment-fill",
            type: "fill",
            source: "catchment",
            paint: { "fill-color": "#0b5d56", "fill-opacity": 0.035 },
          });
          map.addLayer({
            id: "catchment-outline",
            type: "line",
            source: "catchment",
            paint: {
              "line-color": "#0b5d56",
              "line-width": 1.7,
              "line-opacity": 0.8,
            },
          });
          map.addLayer({
            id: "areas-outline",
            type: "line",
            source: "areas",
            paint: {
              "line-color": "rgba(255, 253, 247, 0.6)",
              "line-width": 0.6,
            },
          });
          map.addLayer({
            id: "areas-gap",
            type: "line",
            source: "areas",
            filter: [
              "all",
              ["==", ["get", "covered"], false],
              ["!=", ["coalesce", ["get", "population_included"], true], false],
            ],
            paint: {
              "line-color": "#8e3b32",
              "line-width": 0.8,
              "line-opacity": 0.75,
              "line-dasharray": [2, 2],
            },
          });
          map.addLayer({
            id: "areas-selected",
            type: "line",
            source: "areas",
            filter: ["==", ["get", "area_id"], "__none__"],
            paint: {
              "line-color": "#0c1d1e",
              "line-width": 2.3,
              "line-opacity": 1,
            },
          });

          map.addSource("facilities", {
            type: "geojson",
            data: facilityCollection as unknown as GeoJSON.GeoJSON,
            cluster: true,
            clusterMaxZoom: 13,
            clusterRadius: 48,
          });
          map.addLayer({
            id: "facility-clusters",
            type: "circle",
            source: "facilities",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#0b5d56",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                13,
                10,
                17,
                50,
                21,
                200,
                25,
              ],
              "circle-opacity": 0.9,
              "circle-stroke-color": "#f7f4eb",
              "circle-stroke-width": 1.4,
            },
          });
          map.addLayer({
            id: "facility-cluster-count",
            type: "symbol",
            source: "facilities",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 10,
              "text-font": ["Open Sans Bold"],
            },
            paint: { "text-color": "#f7f4eb" },
          });
          map.addLayer({
            id: "facility-points",
            type: "circle",
            source: "facilities",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "match",
                ["get", "facility_type"],
                "hospital",
                "#0c1d1e",
                "diagnostic_laboratory",
                "#7a5b2e",
                "birthing_centre",
                "#8e3b32",
                "#0b5d56",
              ],
              "circle-radius": 4.2,
              "circle-stroke-color": "#f7f4eb",
              "circle-stroke-width": 1.1,
            },
          });

          loadedRef.current = true;
          setLoaded(true);

          map.on("mousemove", (event: MapMouseEvent) => {
            const tooltip = tooltipRef.current;
            if (!map.getLayer("areas-fill")) return;
            const features = map.queryRenderedFeatures(event.point, {
              layers: ["areas-fill"],
            });
            const feature = features[0];
            if (!feature || !tooltip) {
              if (tooltip) tooltip.hidden = true;
              map.getCanvas().style.cursor = callbackRef.current.placementMode
                ? "crosshair"
                : "";
              return;
            }
            const props = feature.properties;
            const name = stringProperty(props, "name") ?? "Population area";
            const minutes = numericProperty(props, "travel_time_minutes");
            const population = numericProperty(props, "population");
            const populationIncluded = props.population_included !== false;
            const isImprovement = colorMode === "improvement";
            const proposed = numericProperty(props, "travel_time_proposed");
            const newlyCovered = numericProperty(
              props,
              "newly_covered_population",
            );
            tooltip.replaceChildren();
            const title = document.createElement("p");
            title.textContent = name;
            title.style.cssText =
              "font-size:12px;font-weight:600;color:var(--ink);line-height:1.3;";
            const detail = document.createElement("p");
            detail.textContent = isImprovement
              ? `${populationIncluded ? `${formatNumber(population)} people` : "Population data unavailable"} · ${formatMinutes(proposed)} after intervention${(newlyCovered ?? 0) > 0 ? ` · ${formatNumber(newlyCovered)} newly covered` : ""}`
              : `${populationIncluded ? `${formatNumber(population)} people` : "Population data unavailable"} · ${minutes === null ? "no suitable facility" : formatMinutes(minutes)} to nearest suitable facility`;
            detail.style.cssText =
              "margin-top:4px;font-size:10px;line-height:1.5;color:var(--ink-2);";
            tooltip.append(title, detail);
            tooltip.hidden = false;
            tooltip.style.left = `${event.point.x}px`;
            tooltip.style.top = `${event.point.y}px`;
            map.getCanvas().style.cursor = callbackRef.current.placementMode
              ? "crosshair"
              : "pointer";
          });

          map.on("mouseout", () => {
            if (tooltipRef.current) tooltipRef.current.hidden = true;
            map.getCanvas().style.cursor = callbackRef.current.placementMode
              ? "crosshair"
              : "";
          });

          map.on("click", (event: MapMouseEvent) => {
            const callbacks = callbackRef.current;
            if (!callbacks.placementMode) {
              const facilityHits = map.queryRenderedFeatures(event.point, {
                layers: ["facility-clusters", "facility-points"],
              });
              if (facilityHits.length) return;
            }
            if (callbacks.placementMode) {
              const features = map.queryRenderedFeatures(event.point, {
                layers: ["areas-fill"],
              });
              if (!features.length) {
                callbacks.onPlacementError?.(
                  "Place the proposed facility inside the mapped district boundary.",
                );
                return;
              }
              callbacks.onPlace?.(event.lngLat.lng, event.lngLat.lat);
              return;
            }
            const features = map.queryRenderedFeatures(event.point, {
              layers: ["areas-fill"],
            });
            const areaId = features[0]
              ? stringProperty(features[0].properties, "area_id")
              : null;
            callbacks.onSelectArea?.(areaId);
          });
        });

        map.on("error", (event) => {
          if (!loadedRef.current) {
            setMapError(
              event.error?.message ??
                "The map library could not initialise in this browser.",
            );
          }
        });

        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        resizeObserver.observe(container);
      } catch (error) {
        if (cancelled) return;
        setMapError(
          error instanceof Error
            ? error.message
            : "The interactive map could not be initialised.",
        );
      }
    }

    void init();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // The map is created once. Prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getSource("areas")) return;
    const source = map.getSource("areas") as GeoJSONSource;
    source.setData((areas ?? EMPTY_COLLECTION) as unknown as GeoJSON.GeoJSON);
  }, [areas, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getSource("catchment")) return;
    const source = map.getSource("catchment") as GeoJSONSource;
    source.setData((catchment ?? EMPTY_COLLECTION) as unknown as GeoJSON.GeoJSON);
  }, [catchment, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getSource("facilities")) return;
    const source = map.getSource("facilities") as GeoJSONSource;
    source.setData(facilityCollection as unknown as GeoJSON.GeoJSON);
  }, [facilityCollection, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const handleClusterClick = (event: MapMouseEvent) => {
      if (callbackRef.current.placementMode) return;
      const features = map.queryRenderedFeatures(event.point, {
        layers: ["facility-clusters"],
      });
      const cluster = features[0];
      if (!cluster) return;
      const clusterId = cluster.properties?.cluster_id as number | undefined;
      const source = map.getSource("facilities") as GeoJSONSource;
      if (clusterId === undefined) return;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const [lon, lat] = (cluster.geometry as unknown as { coordinates: [number, number] })
          .coordinates;
        map.easeTo({ center: [lon, lat], zoom });
      });
    };
    const handleFacilityClick = (event: MapMouseEvent) => {
      if (callbackRef.current.placementMode) return;
      const features = map.queryRenderedFeatures(event.point, {
        layers: ["facility-points"],
      });
      const feature = features[0];
      if (!feature) return;
      const properties = feature.properties ?? {};
      const coordinates = (
        feature.geometry as unknown as { coordinates: [number, number] }
      ).coordinates;
      const maplibregl = maplibreRef.current;
      if (!maplibregl) return;
      popupRef.current?.remove();
      const services = String(properties.services ?? "")
        .split(",")
        .filter(Boolean);
      const popup = document.createElement("div");
      popup.appendChild(
        buildPopupContent(
          String(properties.name ?? "Mapped facility"),
          [
            ["Type", String(properties.facility_type_label ?? "Facility")],
            [
              "Services",
              services.length ? services.map(titleCase).join(", ") : "Not modelled",
            ],
            ["Status", String(properties.data_status ?? "mapped")],
            [
              "Ward",
              String(properties.admin_area || "Not assigned"),
            ],
            ...(properties.address
              ? [["Address", String(properties.address)] as [string, string]]
              : []),
          ],
          "Mapped facility. Presence does not verify staffing, hours, or service availability.",
        ),
      );
      popupRef.current = new maplibregl.Popup({
        offset: 14,
        closeButton: true,
        maxWidth: "270px",
      })
        .setLngLat(coordinates)
        .setDOMContent(popup)
        .addTo(map);
    };
    map.on("click", "facility-clusters", handleClusterClick);
    map.on("click", "facility-points", handleFacilityClick);
    map.on("mouseenter", "facility-clusters", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseenter", "facility-points", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "facility-clusters", () => {
      map.getCanvas().style.cursor = callbackRef.current.placementMode
        ? "crosshair"
        : "";
    });
    map.on("mouseleave", "facility-points", () => {
      map.getCanvas().style.cursor = callbackRef.current.placementMode
        ? "crosshair"
        : "";
    });
    return () => {
      map.off("click", "facility-clusters", handleClusterClick);
      map.off("click", "facility-points", handleFacilityClick);
    };
  }, [loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (map.getLayer("areas-fill")) {
      map.setPaintProperty(
        "areas-fill",
        "fill-color",
        (colorMode === "improvement"
          ? buildImprovementColorExpression()
          : buildAccessColorExpression(threshold)) as never,
      );
    }
    if (map.getLayer("areas-gap")) {
      map.setLayoutProperty(
        "areas-gap",
        "visibility",
        colorMode === "improvement" ? "none" : "visible",
      );
    }
  }, [colorMode, threshold, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getLayer("areas-selected")) return;
    map.setFilter("areas-selected", [
      "==",
      ["get", "area_id"],
      selectedAreaId ?? "__none__",
    ]);
  }, [selectedAreaId, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (fittedKeyRef.current === fitKey) return;
    const bounds = computeBounds(areas);
    if (bounds) {
      map.fitBounds(bounds, { padding: 30, duration: 0, maxZoom: 12 });
      fittedKeyRef.current = fitKey;
    }
  }, [areas, fitKey, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.getCanvas().style.cursor = placementMode ? "crosshair" : "";
  }, [placementMode, loaded]);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;

    async function addMarkers() {
      const maplibregl = await import("maplibre-gl");
      if (cancelled) return;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      const attachProposed = (facility: Facility) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "map-marker-facility";
        element.dataset.status = "proposed";
        const inner = document.createElement("span");
        inner.textContent = "+";
        element.appendChild(inner);
        element.setAttribute(
          "aria-label",
          `Proposed facility: ${facility.name}. Open details.`,
        );
        element.title = `${facility.name} · ${facility.facility_type_label}`;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({
            offset: 16,
            closeButton: true,
            maxWidth: "270px",
          })
            .setLngLat([facility.lon, facility.lat])
            .setDOMContent(
              buildPopupContent(
                facility.name,
                [
                  ["Type", facility.facility_type_label],
                  [
                    "Services",
                    facility.services.length
                      ? facility.services.map(titleCase).join(", ")
                      : "Not modelled",
                  ],
                  ["Status", "Proposed"],
                ],
                "Proposed facility. Not part of the baseline.",
              ),
            )
            .addTo(map);
        });
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([facility.lon, facility.lat])
          .addTo(map);
        markersRef.current.push(marker);
      };

      proposedFacilities.forEach(attachProposed);

      candidates.forEach((candidate) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "map-marker-candidate";
        if (candidate.id === selectedCandidateId) {
          element.dataset.selected = "true";
        }
        element.textContent = String(candidate.rank ?? "•");
        const detail =
          candidate.sublabel ??
          "Candidate location. Select to compare its simulated benefit.";
        element.setAttribute(
          "aria-label",
          `Rank ${candidate.rank ?? ""} candidate: ${candidate.label}. ${detail}`,
        );
        element.title = `${candidate.label}${candidate.sublabel ? ` · ${candidate.sublabel}` : ""}`;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectCandidate?.(candidate.id);
        });
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([candidate.lon, candidate.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    }

    void addMarkers();
    return () => {
      cancelled = true;
    };
  }, [
    candidates,
    loaded,
    onSelectCandidate,
    proposedFacilities,
    selectedCandidateId,
  ]);

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = computeBounds(areas);
    if (bounds) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map.fitBounds(bounds, {
        padding: 30,
        duration: reduced ? 0 : 550,
        maxZoom: 12,
      });
    }
  }

  return (
    <div
      className={cn("map-shell", className)}
      aria-label="Interactive healthcare accessibility map"
      data-map-loaded={loaded}
      data-map-error={mapError ? "true" : "false"}
    >
      <div ref={containerRef} className="map-canvas" />

      {!loaded && !mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--paper-2)]">
          <div className="flex items-center gap-2.5 text-[12px] text-[var(--ink-2)]">
            <span className="spinner" aria-hidden="true" />
            Initialising map
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--paper-2)] p-6 text-center">
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--critical)]">
              Map unavailable
            </p>
            <p className="mt-2 max-w-[40ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
              {mapError}. Area selection and all analysis remain available in the
              surrounding tables and controls.
            </p>
          </div>
        </div>
      )}

      <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-92px)]">
        <div className="overflow-hidden rounded-[3px] border border-[var(--rule-strong)] bg-[color-mix(in_srgb,var(--sheet)_94%,transparent)] shadow-sm backdrop-blur-[2px]">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left"
            onClick={() => setLegendOpen((open) => !open)}
            aria-expanded={legendOpen}
          >
            <span className="mono flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
              <Layers className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
              {colorMode === "improvement" ? "Change legend" : "Access legend"}
            </span>
            {legendOpen ? (
              <X className="h-3 w-3 text-[var(--ink-3)]" aria-hidden="true" />
            ) : (
              <span className="mono text-[8px] text-[var(--ink-3)]">Open</span>
            )}
          </button>
          {legendOpen && (
            <div className="border-t border-[var(--rule)] px-2.5 py-2">
              {colorMode === "improvement" ? (
                <ul className="space-y-1.5">
                  {improvementLegend.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 text-[9.5px] leading-tight text-[var(--ink-2)]"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[1px] border border-black/10"
                        style={{ background: item.color }}
                        aria-hidden="true"
                      />
                      {item.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {bands.map((band) => (
                      <li
                        key={band.id}
                        className="flex items-center gap-1.5 text-[9px] leading-tight text-[var(--ink-2)]"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[1px] border border-black/10"
                          style={{ background: band.color }}
                          aria-hidden="true"
                        />
                        {band.label}
                      </li>
                    ))}
                  </ul>
                  <p className="mono mt-2 border-t border-[var(--rule)] pt-1.5 text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Dashed outline = outside {threshold}-min threshold
                  </p>
                  <p className="mono mt-1 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[1px] border border-black/10"
                      style={{ background: NO_POPULATION_COLOR }}
                      aria-hidden="true"
                    />
                    {NO_POPULATION_LABEL}
                  </p>
                  <p className="mono mt-1 text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Facilities: {facilities.length.toLocaleString("en-IN")} mapped
                    · clustered
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {placementMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[3px] border border-[var(--gap)]/50 bg-[var(--ink)] px-3 py-2 text-[var(--paper)] shadow-lg">
          <Crosshair className="h-3.5 w-3.5 text-[var(--gap-soft)]" aria-hidden="true" />
          <span className="mono whitespace-nowrap text-[8.5px] uppercase tracking-[0.08em]">
            Click inside the study boundary to place
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={resetView}
        className="absolute bottom-8 right-3 z-10 inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--rule-strong)] bg-[var(--sheet)] px-2 py-1.5 text-[9.5px] font-medium text-[var(--ink-2)] shadow-sm hover:text-[var(--ink)]"
      >
        <RotateCcw className="h-3 w-3" strokeWidth={1.7} aria-hidden="true" />
        Reset view
      </button>

      <div ref={tooltipRef} className="area-tooltip" hidden />
    </div>
  );
}

function computeBounds(
  areas: MapAreas | null,
): [[number, number], [number, number]] | null {
  if (!areas || !areas.features.length) return null;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      west = Math.min(west, value[0]);
      east = Math.max(east, value[0]);
      south = Math.min(south, value[1]);
      north = Math.max(north, value[1]);
      return;
    }
    value.forEach(visit);
  };

  const visitGeometry = (geometry: Geometry) => {
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visitGeometry);
    } else {
      visit(geometry.coordinates);
    }
  };

  areas.features.forEach((feature) => {
    if (feature.geometry) visitGeometry(feature.geometry);
  });

  if (!Number.isFinite(west)) return null;
  return [
    [west, south],
    [east, north],
  ];
}
