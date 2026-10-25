import type { AreaCollection, AreaProperties } from "@/lib/types";
import { formatNumber } from "@/lib/format";

export type AccessBandId =
  | "within-half"
  | "within-threshold"
  | "near-gap"
  | "far-gap"
  | "critical-gap"
  | "unreachable";

export interface AccessBand {
  id: AccessBandId;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  textColor: string;
  covered: boolean;
}

export type MapColorMode = "access" | "improvement";

export const NO_POPULATION_COLOR = "#6f6a5f";
export const NO_POPULATION_LABEL = "No population data";

export function niceMinutes(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
}

export function getAccessBands(thresholdMinutes: number): AccessBand[] {
  const t = thresholdMinutes;
  const half = t / 2;
  const oneHalf = t * 1.5;
  const two = t * 2;
  return [
    {
      id: "within-half",
      label: `≤ ${niceMinutes(half)} min`,
      shortLabel: `<${niceMinutes(half)}`,
      description: "Comfortably within the selected threshold",
      color: "#0b5d56",
      textColor: "#fffdf7",
      covered: true,
    },
    {
      id: "within-threshold",
      label: `${niceMinutes(half)}–${niceMinutes(t)} min`,
      shortLabel: `${niceMinutes(half)}–${niceMinutes(t)}`,
      description: "Within the selected threshold",
      color: "#5b9f90",
      textColor: "#0c1d1e",
      covered: true,
    },
    {
      id: "near-gap",
      label: `${niceMinutes(t)}–${niceMinutes(oneHalf)} min`,
      shortLabel: `${niceMinutes(t)}–${niceMinutes(oneHalf)}`,
      description: "Just outside the selected threshold",
      color: "#d5a05a",
      textColor: "#0c1d1e",
      covered: false,
    },
    {
      id: "far-gap",
      label: `${niceMinutes(oneHalf)}–${niceMinutes(two)} min`,
      shortLabel: `${niceMinutes(oneHalf)}–${niceMinutes(two)}`,
      description: "Well outside the selected threshold",
      color: "#b76f1b",
      textColor: "#fffdf7",
      covered: false,
    },
    {
      id: "critical-gap",
      label: `> ${niceMinutes(two)} min`,
      shortLabel: `>${niceMinutes(two)}`,
      description: "Long travel time to the nearest suitable facility",
      color: "#8e3b32",
      textColor: "#fffdf7",
      covered: false,
    },
    {
      id: "unreachable",
      label: "No suitable facility",
      shortLabel: "None",
      description: "No mapped facility provides the selected service",
      color: "#3b4644",
      textColor: "#fffdf7",
      covered: false,
    },
  ];
}

export function accessBandFor(
  minutes: number | null,
  thresholdMinutes: number,
): AccessBand {
  const bands = getAccessBands(thresholdMinutes);
  if (minutes === null || Number.isNaN(minutes)) return bands[5];
  if (minutes <= thresholdMinutes / 2) return bands[0];
  if (minutes <= thresholdMinutes) return bands[1];
  if (minutes <= thresholdMinutes * 1.5) return bands[2];
  if (minutes <= thresholdMinutes * 2) return bands[3];
  return bands[4];
}

export function buildAccessColorExpression(
  thresholdMinutes: number,
): unknown[] {
  const bands = getAccessBands(thresholdMinutes);
  const value: unknown[] = ["coalesce", ["get", "travel_time_minutes"], 999999];
  return [
    "case",
    ["==", ["coalesce", ["get", "population_included"], true], false],
    NO_POPULATION_COLOR,
    ["==", ["get", "travel_time_minutes"], null],
    bands[5].color,
    ["<=", value, thresholdMinutes / 2],
    bands[0].color,
    ["<=", value, thresholdMinutes],
    bands[1].color,
    ["<=", value, thresholdMinutes * 1.5],
    bands[2].color,
    ["<=", value, thresholdMinutes * 2],
    bands[3].color,
    bands[4].color,
  ];
}

export const IMPROVEMENT_COLORS = {
  newlyCovered: "#0b5d56",
  improved: "#7fb3a5",
  unchanged: "#e3ddcd",
  worsened: "#8e3b32",
  noData: "#3b4644",
} as const;

export function buildImprovementColorExpression(): unknown[] {
  return [
    "case",
    [">", ["coalesce", ["get", "newly_covered_population"], 0], 0],
    IMPROVEMENT_COLORS.newlyCovered,
    [">", ["coalesce", ["get", "improvement_minutes"], 0], 0.05],
    IMPROVEMENT_COLORS.improved,
    ["<", ["coalesce", ["get", "improvement_minutes"], 0], -0.05],
    IMPROVEMENT_COLORS.worsened,
    IMPROVEMENT_COLORS.unchanged,
  ];
}

export function getImprovementLegend(): Array<{
  id: string;
  label: string;
  color: string;
  description: string;
}> {
  return [
    {
      id: "newly-covered",
      label: "Newly within threshold",
      color: IMPROVEMENT_COLORS.newlyCovered,
      description: "Population moved inside the selected travel-time threshold",
    },
    {
      id: "improved",
      label: "Faster, still outside",
      color: IMPROVEMENT_COLORS.improved,
      description: "Travel time improved but remains beyond the threshold",
    },
    {
      id: "unchanged",
      label: "No material change",
      color: IMPROVEMENT_COLORS.unchanged,
      description: "Travel time changed by less than three minutes",
    },
    {
      id: "worsened",
      label: "Worsened",
      color: IMPROVEMENT_COLORS.worsened,
      description: "Unexpected in this additive model; flag for investigation",
    },
  ];
}

export function normaliseBaselineAreas(areas: AreaCollection): AreaCollection {
  return {
    ...areas,
    features: areas.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        travel_time_minutes: feature.properties.travel_time_minutes,
        covered: feature.properties.covered,
      },
    })),
  };
}

export function accessStats(properties: AreaProperties[]) {
  const included = properties.filter((area) => area.population !== null);
  const total = included.reduce((sum, area) => sum + (area.population ?? 0), 0);
  const uncovered = included.filter((area) => !area.covered);
  const uncoveredPopulation = uncovered.reduce(
    (sum, area) => sum + (area.population ?? 0),
    0,
  );
  return {
    total,
    uncoveredPopulation,
    uncoveredPercent: total > 0 ? (uncoveredPopulation / total) * 100 : 0,
    uncoveredAreas: uncovered.length,
    uncoveredPopulationLabel: formatNumber(uncoveredPopulation),
    areasWithoutPopulation: properties.length - included.length,
  };
}

export function sortByAccessRisk(properties: AreaProperties[]): AreaProperties[] {
  return [...properties].sort((a, b) => {
    const aTime = a.travel_time_minutes ?? Number.POSITIVE_INFINITY;
    const bTime = b.travel_time_minutes ?? Number.POSITIVE_INFINITY;
    if (bTime !== aTime) return bTime - aTime;
    if ((b.population ?? -1) !== (a.population ?? -1)) {
      return (b.population ?? -1) - (a.population ?? -1);
    }
    return a.area_id.localeCompare(b.area_id);
  });
}

export function thresholdRangeLabel(thresholdMinutes: number): string {
  return `${niceMinutes(thresholdMinutes)}-minute threshold`;
}
