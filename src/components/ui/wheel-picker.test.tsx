import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WheelPicker } from "@/components/ui/wheel-picker";

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

describe("WheelPicker", () => {
  it("renders every value and marks the selection for assistive tech", () => {
    render(<WheelPicker ariaLabel="hour" onSelect={vi.fn()} selectedIndex={9} values={HOURS} />);

    const picker = screen.getByRole("spinbutton", { name: "hour" });
    expect(picker).toHaveAttribute("aria-valuenow", "9");
    expect(picker).toHaveAttribute("aria-valuetext", "09");
    expect(screen.getByText("23")).toBeInTheDocument();
  });

  it("steps one detent per accumulated wheel notch", () => {
    const onSelect = vi.fn();
    render(<WheelPicker ariaLabel="hour" onSelect={onSelect} selectedIndex={9} values={HOURS} />);

    const picker = screen.getByRole("spinbutton", { name: "hour" });
    fireEvent.wheel(picker, { deltaY: 100 });
    expect(onSelect).toHaveBeenLastCalledWith(10);

    fireEvent.wheel(picker, { deltaY: -100 });
    expect(onSelect).toHaveBeenLastCalledWith(9);

    // Small trackpad deltas accumulate instead of firing per event.
    fireEvent.wheel(picker, { deltaY: 20 });
    expect(onSelect).toHaveBeenCalledTimes(2);
    fireEvent.wheel(picker, { deltaY: 40 });
    expect(onSelect).toHaveBeenLastCalledWith(10);
  });

  it("wraps across the loop boundary and steps with arrow keys", () => {
    const onSelect = vi.fn();
    render(<WheelPicker ariaLabel="hour" loop onSelect={onSelect} selectedIndex={23} values={HOURS} />);

    fireEvent.wheel(screen.getByRole("spinbutton", { name: "hour" }), { deltaY: 100 });
    expect(onSelect).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "hour" }), { key: "ArrowUp" });
    expect(onSelect).toHaveBeenLastCalledWith(23);
  });

  it("clamps at the ends when not looping", () => {
    const onSelect = vi.fn();
    render(
      <WheelPicker ariaLabel="hour" loop={false} onSelect={onSelect} selectedIndex={23} values={HOURS} />,
    );

    fireEvent.wheel(screen.getByRole("spinbutton", { name: "hour" }), { deltaY: 100 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores interaction while disabled", () => {
    const onSelect = vi.fn();
    render(<WheelPicker ariaLabel="hour" disabled onSelect={onSelect} selectedIndex={9} values={HOURS} />);

    const picker = screen.getByRole("spinbutton", { name: "hour" });
    fireEvent.wheel(picker, { deltaY: 100 });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(picker).toHaveAttribute("tabindex", "-1");
  });
});
