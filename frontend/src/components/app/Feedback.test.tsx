import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyPanel, ErrorPanel } from "@/components/app/Feedback";

describe("Feedback states", () => {
  it("announces a load error and calls retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorPanel message="Analysis API unavailable" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Analysis API unavailable");
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders an empty state with a real action", () => {
    render(
      <EmptyPanel
        title="No rows"
        detail="Nothing matches this filter."
        action={<button type="button">Reset</button>}
      />,
    );
    expect(screen.getByText("No rows")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});
