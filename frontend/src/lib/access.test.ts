import { describe, expect, it } from "vitest";

import {
  accessBandFor,
  accessStats,
  buildAccessColorExpression,
  buildImprovementColorExpression,
  getAccessBands,
  getImprovementLegend,
  sortByAccessRisk,
} from "@/lib/access";
import type { AreaProperties } from "@/lib/types";

function area(overrides: Partial<AreaProperties>): AreaProperties {
  return {
    area_id: "A001",
    name: "Ward 01",
    population: 10_000,
    vulnerability_index: 0.4,
    quadrant: "NorthEast",
    travel_time_minutes: 20,
    covered: true,
    ...overrides,
  };
}

describe("access bands", () => {
  it("derives five minute bands and an unreachable state from the threshold", () => {
    const bands = getAccessBands(30);
    expect(bands).toHaveLength(6);
    expect(bands.map((band) => band.label)).toEqual([
      "≤ 15 min",
      "15–30 min",
      "30–45 min",
      "45–60 min",
      "> 60 min",
      "No suitable facility",
    ]);
    expect(bands.filter((band) => band.covered)).toHaveLength(2);
  });

  it("assigns band boundaries deterministically", () => {
    expect(accessBandFor(15, 30).id).toBe("within-half");
    expect(accessBandFor(15.1, 30).id).toBe("within-threshold");
    expect(accessBandFor(30, 30).id).toBe("within-threshold");
    expect(accessBandFor(30.1, 30).id).toBe("near-gap");
    expect(accessBandFor(60.1, 30).id).toBe("critical-gap");
    expect(accessBandFor(null, 30).id).toBe("unreachable");
  });

  it("builds map expressions with the threshold colors", () => {
    const expression = buildAccessColorExpression(30) as unknown[];
    expect(expression[0]).toBe("case");
    expect(JSON.stringify(expression)).toContain("#0b5d56");
    expect(JSON.stringify(expression)).toContain("#8e3b32");
    expect(JSON.stringify(expression)).toContain("30");
    expect(JSON.stringify(expression)).toContain("45");
  });

  it("builds an improvement legend from semantic categories", () => {
    const expression = buildImprovementColorExpression();
    expect(expression[0]).toBe("case");
    const legend = getImprovementLegend();
    expect(legend.map((item) => item.id)).toEqual([
      "newly-covered",
      "improved",
      "unchanged",
      "worsened",
    ]);
  });
});

describe("area ranking helpers", () => {
  it("sorts unreachable areas first and breaks ties by population then ID", () => {
    const sorted = sortByAccessRisk([
      area({ area_id: "A", travel_time_minutes: 10, population: 50_000 }),
      area({ area_id: "B", travel_time_minutes: null, population: 8_000 }),
      area({ area_id: "D", travel_time_minutes: 35, population: 12_000 }),
      area({ area_id: "C", travel_time_minutes: 35, population: 20_000 }),
    ]);
    expect(sorted.map((item) => item.area_id)).toEqual(["B", "C", "D", "A"]);
  });

  it("computes coverage and uncovered population from area properties", () => {
    const stats = accessStats([
      area({ area_id: "A", covered: true, population: 100 }),
      area({ area_id: "B", covered: false, population: 300 }),
      area({ area_id: "C", covered: false, population: 100 }),
    ]);
    expect(stats.total).toBe(500);
    expect(stats.uncoveredPopulation).toBe(400);
    expect(stats.uncoveredPercent).toBe(80);
    expect(stats.uncoveredAreas).toBe(2);
  });
});
