import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

import { AreaInspector } from "@/components/app/AreaInspector";

const baseArea = {
  area_id: "A093",
  name: "Ward 93",
  population: 5_333,
  vulnerability_index: 0.39,
  quadrant: "SouthWest",
  centroid: [73.727, 18.378] as [number, number],
  travel_time_minutes: 56,
  nearest_facility_id: "F005",
  nearest_facility_name: "Central Community Health Centre",
  suitable_facilities_within_threshold: 0,
  covered: false,
};

describe("AreaInspector", () => {
  it("shows a modelled gap with the real analysis values", () => {
    render(<AreaInspector area={baseArea} threshold={30} service="primary_care" />);
    expect(screen.getByText("Ward 93")).toBeInTheDocument();
    expect(screen.getByText("56 min")).toBeInTheDocument();
    expect(
      screen.getByText("Central Community Health Centre"),
    ).toBeInTheDocument();
    expect(screen.getByText("45–60 min")).toBeInTheDocument();
    expect(screen.getByText("39%")).toBeInTheDocument();
    expect(screen.getByText(/model input/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /explore this area/i })).toHaveAttribute(
      "href",
      "/app/explore?area=A093&service=primary_care&threshold=30",
    );
  });

  it("marks missing population and vulnerability honestly", () => {
    render(
      <AreaInspector
        area={{
          ...baseArea,
          population: null,
          vulnerability_index: null,
        }}
        threshold={30}
        service="primary_care"
      />,
    );
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/no validated ward-level vulnerability indicator/i)).toBeInTheDocument();
  });

  it("does not invent a travel time when no suitable facility is mapped", () => {
    render(
      <AreaInspector
        area={{
          ...baseArea,
          travel_time_minutes: null,
          nearest_facility_name: null,
          nearest_facility_id: null,
        }}
        threshold={30}
        service="primary_care"
      />,
    );
    expect(screen.getByText("No match")).toBeInTheDocument();
    expect(
      screen.getByText(/No mapped facility offers this service/i),
    ).toBeInTheDocument();
    expect(screen.getByText("No suitable facility")).toBeInTheDocument();
  });
});
