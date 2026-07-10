import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskTimeBadge } from "@/components/task/TaskTimeBadge";
import type { Task } from "@/types/task";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-timed",
  title: "Timed task",
  note: "",
  completed: false,
  priority: "normal",
  pinned: false,
  tags: [],
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  completedAt: null,
  plannedDate: "2026-07-10",
  startTime: "14:00",
  durationMinutes: 120,
  stackId: "stack-task-timed",
  stackOrder: 0,
  deletedAt: null,
  ...overrides,
});

describe("TaskTimeBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the start time before the schedule begins", () => {
    vi.setSystemTime(new Date(2026, 6, 10, 10, 0));
    render(<TaskTimeBadge task={task()} />);

    const badge = screen.getByTestId("task-time-badge");
    expect(badge).toHaveAttribute("data-state", "upcoming");
    expect(badge).toHaveTextContent("14:00");
  });

  it("counts down the remaining allocation while the window is active", () => {
    vi.setSystemTime(new Date(2026, 6, 10, 15, 15));
    render(<TaskTimeBadge task={task()} />);

    const badge = screen.getByTestId("task-time-badge");
    expect(badge).toHaveAttribute("data-state", "active");
    expect(badge).toHaveTextContent("45m");
  });

  it("turns urgent once the duration has run out", () => {
    vi.setSystemTime(new Date(2026, 6, 10, 16, 30));
    render(<TaskTimeBadge task={task()} />);

    expect(screen.getByTestId("task-time-badge")).toHaveAttribute("data-state", "over");
  });

  it("renders nothing for completed or unscheduled tasks", () => {
    vi.setSystemTime(new Date(2026, 6, 10, 15, 0));
    const { rerender } = render(<TaskTimeBadge task={task({ completed: true })} />);
    expect(screen.queryByTestId("task-time-badge")).not.toBeInTheDocument();

    rerender(<TaskTimeBadge task={task({ startTime: null })} />);
    expect(screen.queryByTestId("task-time-badge")).not.toBeInTheDocument();
  });
});
