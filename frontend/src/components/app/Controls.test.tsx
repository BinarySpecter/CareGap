import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ServiceThresholdControls } from "@/components/app/Controls";

const services = [
  {
    id: "primary_care",
    label: "Primary care",
    description: "General outpatient care",
    default_threshold_minutes: 30,
    thresholds: [15, 30, 45],
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Laboratory services",
    default_threshold_minutes: 45,
    thresholds: [15, 30, 45],
  },
];

describe("ServiceThresholdControls", () => {
  it("renders labelled controls and reports changes", async () => {
    const user = userEvent.setup();
    const onServiceChange = vi.fn();
    const onThresholdChange = vi.fn();
    render(
      <ServiceThresholdControls
        services={services}
        service="primary_care"
        threshold={30}
        onServiceChange={onServiceChange}
        onThresholdChange={onThresholdChange}
        thresholds={[15, 30, 45]}
      />,
    );

    const serviceSelect = screen.getByLabelText("Service");
    const thresholdSelect = screen.getByLabelText("Travel-time threshold");
    expect(serviceSelect).toHaveValue("primary_care");
    expect(thresholdSelect).toHaveValue("30");

    await user.selectOptions(serviceSelect, "diagnostics");
    expect(onServiceChange).toHaveBeenCalledWith("diagnostics");

    await user.selectOptions(thresholdSelect, "45");
    expect(onThresholdChange).toHaveBeenCalledWith(45);
  });

  it("adds a non-standard current threshold without losing it", () => {
    render(
      <ServiceThresholdControls
        services={services}
        service="primary_care"
        threshold={25}
        onServiceChange={vi.fn()}
        onThresholdChange={vi.fn()}
        thresholds={[15, 30, 45]}
      />,
    );
    expect(screen.getByRole("option", { name: "25 minutes" })).toBeInTheDocument();
  });
});
