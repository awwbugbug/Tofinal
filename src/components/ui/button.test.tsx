import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("applies the shared frosted glass base across button variants", () => {
    render(
      <div>
        <Button>Default action</Button>
        <Button variant="secondary">Secondary action</Button>
        <Button variant="ghost">Ghost action</Button>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Default action" })).toHaveClass("glass-button");
    expect(screen.getByRole("button", { name: "Secondary action" })).toHaveClass("glass-button");
    expect(screen.getByRole("button", { name: "Ghost action" })).toHaveClass("glass-button");
    expect(screen.getByRole("button", { name: "Default action" })).toHaveClass("glass-highlight");
    expect(screen.getByRole("button", { name: "Secondary action" })).toHaveClass("glass-highlight");
    expect(screen.getByRole("button", { name: "Ghost action" })).toHaveClass("glass-highlight");
  });

  it("keeps semantic visual hierarchy for primary, secondary, and ghost buttons", () => {
    render(
      <div>
        <Button>Default action</Button>
        <Button variant="secondary">Secondary action</Button>
        <Button variant="ghost">Ghost action</Button>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Default action" })).toHaveClass("glass-button-primary");
    expect(screen.getByRole("button", { name: "Secondary action" })).toHaveClass("glass-button-secondary");
    expect(screen.getByRole("button", { name: "Ghost action" })).toHaveClass("glass-button-ghost");
  });

  it("allows danger glass overrides without dropping accessibility or disabled semantics", () => {
    render(
      <Button aria-label="Delete task" className="danger-glass-button" disabled variant="ghost">
        Delete
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Delete task" });
    expect(button).toHaveClass("glass-button");
    expect(button).toHaveClass("danger-glass-button");
    expect(button).toBeDisabled();
  });

  it("adds top-edge safe icon glass classes only for icon buttons", () => {
    render(
      <div>
        <Button aria-label="Close overlay" edgeSafe size="icon" variant="ghost">
          X
        </Button>
        <Button edgeSafe variant="secondary">
          Regular action
        </Button>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Close overlay" })).toHaveClass("glass-icon-button");
    expect(screen.getByRole("button", { name: "Close overlay" })).toHaveClass("glass-icon-button-safe");
    expect(screen.getByRole("button", { name: "Regular action" })).not.toHaveClass("glass-icon-button-safe");
  });
});
