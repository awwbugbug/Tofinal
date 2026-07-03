import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskItem } from "@/components/task/TaskItem";
import { resetPreferencesStore, usePreferencesStore } from "@/stores/preferencesStore";
import type { Task } from "@/types/task";

const confettiMock = vi.hoisted(() => vi.fn());

vi.mock("canvas-confetti", () => ({
  default: confettiMock,
}));

const baseTask: Task = {
  id: "task-1",
  title: "Ship celebration polish",
  note: "Verify completion burst behavior.",
  priority: "important",
  completed: false,
  pinned: false,
  tags: [],
  createdAt: "2026-06-16T10:00:00.000Z",
  updatedAt: "2026-06-16T10:00:00.000Z",
  plannedDate: "2026-06-16",
  stackId: "stack-task-1",
  stackOrder: 0,
  completedAt: null,
};

describe("TaskItem completion celebrations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    confettiMock.mockClear();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ({})),
    });
    resetPreferencesStore();
    usePreferencesStore.setState((state) => ({
      ...state,
      initialized: true,
      language: "en-US",
      completionCelebrationsEnabled: true,
    }));
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it("fires the canvas confetti sequence when a task becomes completed", () => {
    const { rerender } = render(
      <TaskItem onSelect={() => {}} onToggle={() => {}} task={baseTask} />,
    );

    rerender(
      <TaskItem
        onSelect={() => {}}
        onToggle={() => {}}
        task={{ ...baseTask, completed: true, completedAt: "2026-06-16T10:05:00.000Z" }}
      />,
    );

    expect(confettiMock).toHaveBeenCalledTimes(5);
    expect(confettiMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      colors: ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#fcff42", "#ffa62d", "#ff36ff"],
      particleCount: 37,
      spread: 26,
      startVelocity: 55,
      zIndex: 100,
    }));
    expect(confettiMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
      decay: 0.91,
      particleCount: 52,
      scalar: 0.8,
      spread: 100,
    }));
  });

  it("does not fire confetti when the preference is disabled", () => {
    usePreferencesStore.setState((state) => ({
      ...state,
      completionCelebrationsEnabled: false,
    }));

    const { rerender } = render(
      <TaskItem onSelect={() => {}} onToggle={() => {}} task={baseTask} />,
    );

    rerender(
      <TaskItem
        onSelect={() => {}}
        onToggle={() => {}}
        task={{ ...baseTask, completed: true, completedAt: "2026-06-16T10:05:00.000Z" }}
      />,
    );

    expect(confettiMock).not.toHaveBeenCalled();
  });

  it("fires confetti before the task can be removed by completion filters", () => {
    const { unmount } = render(
      <TaskItem
        onSelect={() => {}}
        onToggle={() => {
          unmount();
        }}
        task={baseTask}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /mark ship celebration polish complete/i }));

    expect(confettiMock).toHaveBeenCalledTimes(5);
  });

  it("uses a stable grid layout so long titles cannot sit under the priority badge", () => {
    render(
      <TaskItem
        onSelect={() => {}}
        onToggle={() => {}}
        selected
        task={{
          ...baseTask,
          title: "Merge a very long task title into another parent task without overlapping the priority badge",
          priority: "urgent",
        }}
      />,
    );

    expect(screen.getByTestId("task-card")).toHaveClass("task-card-shell");
    expect(screen.getByTestId("task-card-grid")).toHaveClass("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(screen.getByText(/Merge a very long task title/)).toHaveClass("truncate");
    expect(screen.getByText("Urgent")).toHaveClass("shrink-0");
  });
});




