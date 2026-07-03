import { beforeEach, describe, expect, it } from "vitest";

import {
  loadStoredTaskSnapshot,
  loadTaskSnapshot,
  saveTaskSnapshot,
  TASK_STORAGE_KEY,
} from "@/storage/taskStorage";
import type { Task } from "@/types/task";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-test",
  title: "Stored task",
  note: "Stored note",
  completed: false,
  priority: "normal",
  pinned: false,
  tags: [],
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
  plannedDate: null,
  stackId: "stack-task-test",
  stackOrder: 0,
  completedAt: null,
  ...overrides,
}) as Task;

describe("task storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns seed tasks when localStorage is empty", () => {
    const snapshot = loadTaskSnapshot();

    expect(snapshot.tasks).toHaveLength(4);
    expect(snapshot.tasks.every((item) => item.pinned === false)).toBe(true);
  });

  it("saves and loads a task snapshot", () => {
    saveTaskSnapshot({ tasks: [task({ title: "Persist me", pinned: true })] });

    const snapshot = loadTaskSnapshot();

    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0]).toMatchObject({ title: "Persist me", pinned: true });
    expect(localStorage.getItem(TASK_STORAGE_KEY)).toContain("Persist me");
  });

  it("falls back to seed tasks when stored JSON is invalid", () => {
    localStorage.setItem(TASK_STORAGE_KEY, "{not valid json");

    const snapshot = loadTaskSnapshot();

    expect(snapshot.tasks).toHaveLength(4);
    expect(snapshot.tasks[0].title).toBe("Finalize the first-stage desktop shell");
  });

  it("reports invalid stored JSON separately for SQLite migration", () => {
    localStorage.setItem(TASK_STORAGE_KEY, "{not valid json");

    const result = loadStoredTaskSnapshot();

    expect(result.status).toBe("invalid");
  });

  it("migrates legacy tasks without pinned to pinned false", () => {
    const legacyTask = task();
    const { pinned: _pinned, ...withoutPinned } = legacyTask;
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ version: 1, tasks: [withoutPinned] }));

    const snapshot = loadTaskSnapshot();

    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].pinned).toBe(false);
  });

  it("migrates legacy tasks without plannedDate to backlog", () => {
    const legacyTask = task();
    const { plannedDate: _plannedDate, ...withoutPlannedDate } = legacyTask;
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ version: 1, tasks: [withoutPlannedDate] }));

    const snapshot = loadTaskSnapshot();

    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].plannedDate).toBeNull();
  });

  it("returns a valid stored snapshot for SQLite migration without deleting localStorage", () => {
    saveTaskSnapshot({ tasks: [task({ title: "Migration source" })] });

    const result = loadStoredTaskSnapshot();

    expect(result.status).toBe("valid");
    expect(result.status === "valid" ? result.snapshot.tasks[0].title : "").toBe("Migration source");
    expect(localStorage.getItem(TASK_STORAGE_KEY)).toContain("Migration source");
  });
});




