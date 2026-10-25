import { describe, expect, it } from "vitest";

import {
  clamp,
  formatCoordinate,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatSignedMinutes,
  formatSignedPercent,
  titleCase,
} from "@/lib/format";

describe("format helpers", () => {
  it("formats numbers with Indian digit grouping", () => {
    expect(formatNumber(3_571_121)).toBe("35,71,121");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(null)).toBe("—");
  });

  it("formats coverage percentages without inventing precision", () => {
    expect(formatPercent(81.41)).toBe("81.4%");
    expect(formatPercent(4.19)).toBe("4.2%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("formats signed changes with real minus signs", () => {
    expect(formatSignedPercent(3.8)).toBe("+3.8 pp");
    expect(formatSignedPercent(-0.2)).toBe("−0.2 pp");
    expect(formatSignedMinutes(-1.34)).toBe("−1.3 min");
    expect(formatSignedMinutes(null)).toBe("—");
  });

  it("formats minutes and coordinates", () => {
    expect(formatMinutes(18.33)).toBe("18.3 min");
    expect(formatMinutes(30, 0)).toBe("30 min");
    expect(formatCoordinate(73.86, 18.52)).toBe("18.5200°N 73.8600°E");
  });

  it("title-cases machine identifiers", () => {
    expect(titleCase("primary_care")).toBe("Primary Care");
    expect(titleCase("district_hospital")).toBe("District Hospital");
  });

  it("clamps values", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-1, 0, 10)).toBe(0);
  });
});
