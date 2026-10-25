import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { LiveProblemStats } from "@/components/landing/LiveProblemStats";

afterEach(() => {
  vi.unstubAllGlobals();
});

const metaPayload = {
  default_service: "maternal_health",
  default_threshold_minutes: 15,
  services: [{ id: "maternal_health", label: "Maternal health" }],
  dataset: {
    id: "delhi-pilot",
    short_name: "Delhi pilot",
    is_synthetic: false,
    population: { reference_year: 2011 },
    counts: { areas: 290 },
  },
};

const payload = {
  summary: {
    total_population: 1_000,
    covered_population: 814,
    coverage_percent: 81.4,
    wards_over_threshold: 4,
    wards_total: 10,
    areas_with_population: 10,
    weighted_median_travel_time: 18.3,
  },
  dataset: {
    id: "delhi-pilot",
    short_name: "Delhi pilot",
    is_synthetic: false,
    population: { reference_year: 2011 },
    counts: { areas: 290 },
  },
  routing: { label: "OpenStreetMap road-network estimate" },
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LiveProblemStats", () => {
  it("renders values from the overview API rather than hard-coded KPIs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        return Promise.resolve(
          jsonResponse(url.includes("/meta") ? metaPayload : payload),
        );
      }),
    );
    render(<LiveProblemStats />);
    expect(await screen.findByText("186")).toBeInTheDocument();
    expect(screen.getByText(/18.6% of 1,000/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/18.3 min/)).toBeInTheDocument();
    expect(
      screen.getByText(/OpenStreetMap road-network estimate/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Delhi pilot/)).toBeInTheDocument();
  });

  it("shows an honest unavailable state when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<LiveProblemStats />);
    expect(
      await screen.findByText(/Live evidence unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /read the methodology/i }),
    ).toBeInTheDocument();
  });
});
