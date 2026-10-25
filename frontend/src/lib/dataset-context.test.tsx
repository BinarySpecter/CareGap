import { describe, expect, it } from "vitest";

import { datasetBadge, datasetLabel } from "@/lib/dataset-context";
import type { MetaResponse } from "@/lib/types";

function meta(overrides: Partial<MetaResponse["dataset"]> = {}): MetaResponse {
  return {
    api_version: "v1",
    dataset: {
      id: "delhi-pilot",
      name: "CareGap Delhi Pilot",
      short_name: "Delhi pilot",
      description: "",
      is_synthetic: false,
      data_status: "official_census_2011_osm",
      release: "delhi-pilot-2026.10-r1",
      seed: null,
      generated_at: null,
      geography: {},
      counts: {},
      sources: [],
      limitations: [],
      road_model: {},
      population: { reference_year: 2011 },
      vulnerability: { available: false },
      capabilities: {},
      validation_summary: {},
      ...overrides,
    },
    datasets: [],
    services: [],
    interventions: [],
    facility_types: [],
    allowed_thresholds: [15, 30, 45, 60, 90],
    default_service: "maternal_health",
    default_threshold_minutes: 15,
    default_lens_note: "",
    routing: {
      id: "osm_network",
      label: "OSM",
      description: "",
      is_estimate: true,
      live_traffic: false,
      warnings: [],
    },
    data_notice: "",
    read_only: false,
  };
}

describe("dataset identity labels", () => {
  it("labels the real release with its population reference year", () => {
    expect(datasetBadge(meta())).toBe("Census 2011 baseline");
    expect(datasetLabel(meta())).toBe("Delhi pilot");
  });

  it("never labels synthetic data as a real release", () => {
    const synthetic = meta({
      id: "caregap-demo",
      name: "CareGap Synthetic Demo District",
      short_name: "Demo District",
      is_synthetic: true,
      data_status: "synthetic",
      release: "caregap-demo-2026.10-r1",
      population: {},
    });
    expect(datasetBadge(synthetic)).toBe("Synthetic demo");
    expect(datasetLabel(synthetic)).toBe("Demo District");
  });

  it("shows a connecting state before metadata loads", () => {
    expect(datasetBadge(null)).toBe("Connecting");
    expect(datasetLabel(null)).toBe("Loading dataset");
  });
});
