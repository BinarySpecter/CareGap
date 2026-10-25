import { describe, expect, it } from "vitest";

import { pointInAreas, pointInGeometry } from "@/lib/geo";

const polygon = {
  type: "Polygon" as const,
  coordinates: [
    [
      [73.8, 18.5],
      [73.9, 18.5],
      [73.9, 18.6],
      [73.8, 18.6],
      [73.8, 18.5],
    ],
  ],
};

describe("point-in-area validation", () => {
  it("accepts interior points and rejects exterior points", () => {
    expect(pointInGeometry(73.85, 18.55, polygon)).toBe(true);
    expect(pointInGeometry(74.0, 18.55, polygon)).toBe(false);
  });

  it("supports multipolygons and arrays of areas", () => {
    const multi = {
      type: "MultiPolygon" as const,
      coordinates: [
        polygon.coordinates,
        [
          [
            [74.1, 18.5],
            [74.2, 18.5],
            [74.2, 18.6],
            [74.1, 18.5],
          ],
        ],
      ],
    };
    expect(pointInGeometry(74.15, 18.55, multi)).toBe(true);
    expect(pointInAreas(73.85, 18.55, [{ geometry: polygon }])).toBe(true);
    expect(pointInAreas(74.0, 18.55, [{ geometry: polygon }])).toBe(false);
  });
});
