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

const payload = {
  summary: {
    total_population: 1_000,
    covered_population: 814,
    coverage_percent: 81.4,
    wards_over_threshold: 4,
    wards_total: 10,
    weighted_median_travel_time: 18.3,
  },
  dataset: { counts: { areas: 10 } },
  routing: { label: "Synthetic street-grid estimate" },
};

describe("LiveProblemStats", () => {
  it("renders values from the overview API rather than hard-coded KPIs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<LiveProblemStats />);
    expect(await screen.findByText("186")).toBeInTheDocument();
    expect(screen.getByText(/18.6% of 1,000/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/18.3 min/)).toBeInTheDocument();
    expect(
      screen.getByText(/Synthetic street-grid estimate/),
    ).toBeInTheDocument();
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
