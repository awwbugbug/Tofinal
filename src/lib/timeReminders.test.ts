import { describe, expect, it } from "vitest";

import { collectReminderEvents, taskScheduleWindow } from "@/lib/timeReminders";
import type { Task } from "@/types/task";

const task = (overrides: Partial<Task> = {}): Task => {
  const id = overrides.id ?? "task-timed";
  return {
    id,
    title: "Timed task",
    note: "",
    completed: false,
    priority: "normal",
    pinned: false,
    tags: [],
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
    completedAt: null,
    plannedDate: "2026-07-10",
    startTime: "14:30",
    durationMinutes: 90,
    stackId: `stack-${id}`,
    stackOrder: 0,
    deletedAt: null,
    ...overrides,
  };
};

const localMs = (hours: number, minutes: number) => new Date(2026, 6, 10, hours, minutes, 0, 0).getTime();

describe("taskScheduleWindow", () => {
  it("computes a local-time window from planned date, start time, and duration", () => {
    const window = taskScheduleWindow(task());
    expect(window).toEqual({ startMs: localMs(14, 30), endMs: localMs(16, 0) });
  });

  it("has no end without a duration and no window without a schedule", () => {
    expect(taskScheduleWindow(task({ durationMinutes: null }))).toEqual({ startMs: localMs(14, 30), endMs: null });
    expect(taskScheduleWindow(task({ startTime: null }))).toBeNull();
    expect(taskScheduleWindow(task({ plannedDate: null }))).toBeNull();
    expect(taskScheduleWindow(task({ deletedAt: "2026-07-09T00:00:00.000Z" }))).toBeNull();
  });
});

describe("collectReminderEvents", () => {
  it("fires start and end events exactly when their instants are crossed", () => {
    const tasks = [task()];

    // Tick straddling the start instant.
    const startEvents = collectReminderEvents(tasks, localMs(14, 29), localMs(14, 30));
    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]).toMatchObject({ kind: "start", atMs: localMs(14, 30) });

    // Tick straddling the end instant (start already in the past).
    const endEvents = collectReminderEvents(tasks, localMs(15, 59), localMs(16, 0));
    expect(endEvents).toHaveLength(1);
    expect(endEvents[0]).toMatchObject({ kind: "end", atMs: localMs(16, 0) });

    // A quiet tick fires nothing.
    expect(collectReminderEvents(tasks, localMs(15, 0), localMs(15, 1))).toHaveLength(0);
  });

  it("sweeps both events, ordered, over a wide window", () => {
    const events = collectReminderEvents([task()], localMs(0, 0), localMs(23, 59));
    expect(events.map((event) => event.kind)).toEqual(["start", "end"]);
  });

  it("stays silent for completed tasks", () => {
    const events = collectReminderEvents([task({ completed: true })], localMs(14, 29), localMs(16, 1));
    expect(events).toHaveLength(0);
  });
});
