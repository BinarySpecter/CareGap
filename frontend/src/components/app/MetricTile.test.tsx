import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricTile } from "@/components/app/MetricTile";

describe("MetricTile", () => {
  it("renders the supplied analysis value, unit, and note", () => {
    render(
      <MetricTile
        label="Outside the threshold"
        value="6,63,907"
        unit="people"
        note="18.6% of the modelled population"
        tone="gap"
      />,
    );
    expect(screen.getByText("Outside the threshold")).toBeInTheDocument();
    expect(screen.getByText("6,63,907")).toBeInTheDocument();
    expect(screen.getByText("people")).toBeInTheDocument();
    expect(
      screen.getByText("18.6% of the modelled population"),
    ).toBeInTheDocument();
  });
});
