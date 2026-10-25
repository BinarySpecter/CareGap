import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DistributionBar } from "@/components/app/DistributionBar";

const distribution = [
  { bucket: "0-15 min", areas: 14, population: 1_269_174 },
  { bucket: "15-30 min", areas: 37, population: 1_638_040 },
  { bucket: "30-45 min", areas: 31, population: 527_074 },
  { bucket: "45-60 min", areas: 14, population: 136_833 },
  { bucket: "60-90 min", areas: 0, population: 0 },
  { bucket: "90+ min", areas: 0, population: 0 },
  { bucket: "No suitable facility", areas: 0, population: 0 },
];

describe("DistributionBar", () => {
  it("describes the real population distribution for assistive technology", () => {
    render(<DistributionBar distribution={distribution} threshold={30} />);
    const chart = screen.getByRole("img");
    expect(chart).toHaveAttribute(
      "aria-label",
      expect.stringContaining("0-15 min: 12,69,174 people"),
    );
    expect(screen.getByText("0-15 min")).toBeInTheDocument();
    expect(screen.getByText(/selected 30-minute threshold/i)).toBeInTheDocument();
  });

  it("handles an empty distribution without dividing by zero", () => {
    render(
      <DistributionBar
        distribution={[{ bucket: "No suitable facility", areas: 0, population: 0 }]}
        threshold={30}
      />,
    );
    expect(
      screen.getByText(/No population data is available/i),
    ).toBeInTheDocument();
  });
});
