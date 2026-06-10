import { beforeEach, describe, expect, it } from "vitest";

import { TASK_STORAGE_KEY } from "@/storage/taskStorage";
import { createTaskStore } from "@/stores/taskStore";

describe("task store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds a new normal-priority task from a title and persists it", () => {
    const store = createTaskStore();

    store.getState().addTask("Review inbox");

    const created = store.getState().tasks.find((task) => task.title === "Review inbox");
    expect(created).toMatchObject({
      title: "Review inbox",
      note: "",
      completed: false,
      priority: "normal",
      pinned: false,
      tags: [],
      completedAt: null,
    });
    expect(store.getState().selectedTaskId).toBe(created?.id);
    expect(localStorage.getItem(TASK_STORAGE_KEY)).toContain("Review inbox");
  });

  it("ignores an empty task title", () => {
    const store = createTaskStore();
    const initialTasks = store.getState().tasks;

    store.getState().addTask("   ");

    expect(store.getState().tasks).toHaveLength(initialTasks.length);
    expect(store.getState().selectedTaskId).toBe(initialTasks[0].id);
  });

  it("edits title and note while rejecting an empty title", () => {
    const store = createTaskStore();
    const task = store.getState().tasks[0];

    const saved = store.getState().updateTask(task.id, {
      title: "Updated title",
      note: "Updated note",
    });
    const rejected = store.getState().updateTask(task.id, { title: "   " });

    expect(saved).toBe(true);
    expect(rejected).toBe(false);
    expect(store.getState().tasks[0]).toMatchObject({
      title: "Updated title",
      note: "Updated note",
    });
    expect(store.getState().tasks[0].updatedAt).not.toBe(task.updatedAt);
  });

  it("deletes the selected task and selects the next visible task", () => {
    const store = createTaskStore();
    const [firstTask, secondTask] = store.getState().tasks;

    store.getState().deleteTask(firstTask.id);

    expect(store.getState().tasks.some((task) => task.id === firstTask.id)).toBe(false);
    expect(store.getState().selectedTaskId).toBe(secondTask.id);
    expect(localStorage.getItem(TASK_STORAGE_KEY)).not.toContain(firstTask.title);
  });

  it("toggles completion and records completedAt only while completed", () => {
    const store = createTaskStore();
    const taskId = store.getState().tasks[0].id;

    store.getState().toggleTask(taskId);

    const completed = store.getState().tasks[0];
    expect(completed.completed).toBe(true);
    expect(completed.completedAt).toEqual(expect.any(String));

    store.getState().toggleTask(taskId);

    const reopened = store.getState().tasks[0];
    expect(reopened.completed).toBe(false);
    expect(reopened.completedAt).toBeNull();
  });

  it("updates priority, tags, and pinned state", () => {
    const store = createTaskStore();
    const taskId = store.getState().tasks[1].id;

    const saved = store.getState().updateTask(taskId, {
      priority: "urgent",
      tags: ["foundation", "ui", "foundation"],
      pinned: true,
    });

    const task = store.getState().tasks[1];
    expect(saved).toBe(true);
    expect(task.priority).toBe("urgent");
    expect(task.tags).toEqual(["foundation", "ui"]);
    expect(task.pinned).toBe(true);
  });

  it("selects a task by id and switches mode without losing task state", () => {
    const store = createTaskStore();
    const secondTaskId = store.getState().tasks[1].id;

    store.getState().selectTask(secondTaskId);
    store.getState().toggleTask(secondTaskId);
    store.getState().setMode("pin");
    store.getState().setMode("normal");

    expect(store.getState().selectedTaskId).toBe(secondTaskId);
    expect(store.getState().tasks[1].completed).toBe(true);
  });

  it("filters Today, All Tasks, Important, and Pinned tasks", () => {
    const store = createTaskStore();
    const secondTaskId = store.getState().tasks[1].id;

    store.getState().updateTask(secondTaskId, { pinned: true });

    expect(store.getState().getFilteredTasks("today")).toHaveLength(4);
    expect(store.getState().getFilteredTasks("all")).toHaveLength(4);
    expect(store.getState().getFilteredTasks("important")).toHaveLength(2);
    expect(store.getState().getFilteredTasks("pinned")).toHaveLength(1);
  });

  it("searches title and note together with the active filter", () => {
    const store = createTaskStore();

    store.getState().setSearchQuery("workerw");
    expect(store.getState().getFilteredTasks().map((task) => task.title)).toEqual([
      "Sketch the desktop pin interaction",
    ]);

    store.getState().setActiveFilter("important");
    store.getState().setSearchQuery("state");
    expect(store.getState().getFilteredTasks().map((task) => task.title)).toEqual([
      "Review lightweight state boundaries",
    ]);
  });
});
