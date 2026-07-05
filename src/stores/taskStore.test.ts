import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTaskRepositoryForTest, setTaskRepositoryForTest } from "@/repositories/taskRepository";
import { createSeedTasks } from "@/storage/taskStorage";
import { createTaskStore, getLocalDateKey } from "@/stores/taskStore";
import { createMemoryTaskRepository, flushPromises } from "@/test/taskRepositoryTestUtils";
import type { TaskSnapshot } from "@/storage/taskStorage";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

describe("task store", () => {
  const createHydratedStore = async () => {
    const repository = createMemoryTaskRepository({ tasks: createSeedTasks() });
    setTaskRepositoryForTest(repository);
    const store = createTaskStore();

    await store.getState().hydrateTasks();
    return { store, repository };
  };

  beforeEach(() => {
    localStorage.clear();
    resetTaskRepositoryForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates task state from the active repository", async () => {
    const repository = createMemoryTaskRepository({ tasks: createSeedTasks() });
    setTaskRepositoryForTest(repository);
    const store = createTaskStore();

    const hydration = store.getState().hydrateTasks();

    expect(store.getState().loading).toBe(true);
    expect(store.getState().hydrated).toBe(false);

    await hydration;

    expect(store.getState().loading).toBe(false);
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().tasks).toHaveLength(4);
  });

  it("falls back to seed tasks and records an error when hydration fails", async () => {
    setTaskRepositoryForTest({
      async loadSnapshot() {
        throw new Error("SQLite open failed");
      },
      async saveSnapshot() {},
    });
    const store = createTaskStore();

    await store.getState().hydrateTasks();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().tasks).toHaveLength(4);
    expect(store.getState().error).toBe("SQLite open failed");
  });

  it("adds a new normal-priority task from a title and persists it", async () => {
    const { store, repository } = await createHydratedStore();

    store.getState().addTask("Review inbox");
    await flushPromises();

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
    const lastSnapshot = repository.savedSnapshots[repository.savedSnapshots.length - 1];
    expect(lastSnapshot.tasks[0].title).toBe("Review inbox");
  });

  it("sets plannedDate for new Today tasks and keeps All Tasks additions in backlog", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 20, 10, 30));
    const { store } = await createHydratedStore();

    store.getState().setActiveFilter("today");
    store.getState().addTask("Execute today");

    expect(store.getState().tasks[0]).toMatchObject({
      title: "Execute today",
      plannedDate: "2026-06-20",
    });

    store.getState().setActiveFilter("all");
    store.getState().addTask("Backlog item");

    expect(store.getState().tasks[0]).toMatchObject({
      title: "Backlog item",
      plannedDate: null,
    });
  });

  it("ignores an empty task title", async () => {
    const { store } = await createHydratedStore();
    const initialTasks = store.getState().tasks;

    store.getState().addTask("   ");

    expect(store.getState().tasks).toHaveLength(initialTasks.length);
    expect(store.getState().selectedTaskId).toBe(initialTasks[0].id);
  });

  it("edits title and note while rejecting an empty title", async () => {
    const { store } = await createHydratedStore();
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

  it("deletes the selected task and selects the next visible task", async () => {
    const { store, repository } = await createHydratedStore();
    const [firstTask, secondTask] = store.getState().tasks;

    store.getState().deleteTask(firstTask.id);
    await flushPromises();

    expect(store.getState().tasks.some((task) => task.id === firstTask.id)).toBe(false);
    expect(store.getState().selectedTaskId).toBe(secondTask.id);
    const lastSnapshot = repository.savedSnapshots[repository.savedSnapshots.length - 1];
    expect(lastSnapshot.tasks.some((task) => task.id === firstTask.id)).toBe(false);
  });

  it("toggles completion and records completedAt only while completed", async () => {
    const { store } = await createHydratedStore();
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

  it("updates priority, tags, and pinned state", async () => {
    const { store } = await createHydratedStore();
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

  it("selects a task by id and switches mode without losing task state", async () => {
    const { store } = await createHydratedStore();
    const secondTaskId = store.getState().tasks[1].id;

    store.getState().selectTask(secondTaskId);
    store.getState().toggleTask(secondTaskId);
    store.getState().setMode("pin");
    store.getState().setMode("normal");

    expect(store.getState().selectedTaskId).toBe(store.getState().tasks[0].id);
    expect(store.getState().tasks[1].completed).toBe(true);
  });

  it("filters Today as an execution view and All/Important/Pinned as complete attribute views", async () => {
    const { store } = await createHydratedStore();
    const today = getLocalDateKey();
    const [todayTask, backlogTask, futureTask, doneTask] = store.getState().tasks;

    store.setState({
      tasks: [
        { ...todayTask, priority: "normal", pinned: false, plannedDate: today, completed: false, completedAt: null },
        { ...backlogTask, priority: "normal", pinned: false, plannedDate: null, completed: false, completedAt: null },
        { ...futureTask, priority: "important", pinned: false, plannedDate: "2099-01-01", completed: false, completedAt: null },
        { ...doneTask, priority: "urgent", pinned: true, plannedDate: today, completed: true, completedAt: `${today}T09:00:00.000Z` },
      ],
    });

    expect(store.getState().getFilteredTasks("today").map((task) => task.id)).toEqual([todayTask.id]);
    expect(store.getState().getTodayCompletedTasks().map((task) => task.id)).toEqual([doneTask.id]);
    expect(store.getState().getFilteredTasks("all").map((task) => task.id)).toEqual([
      todayTask.id,
      backlogTask.id,
      futureTask.id,
      doneTask.id,
    ]);
    expect(store.getState().getFilteredTasks("important").map((task) => task.id)).toEqual([futureTask.id, doneTask.id]);
    expect(store.getState().getFilteredTasks("pinned").map((task) => task.id)).toEqual([doneTask.id]);
  });
  it("formats local date keys without UTC truncation", () => {
    expect(getLocalDateKey(new Date(2026, 0, 2, 1, 5))).toBe("2026-01-02");
  });

  it("searches title and note together with the active filter", async () => {
    const { store } = await createHydratedStore();

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

  it("records repository write failures without reverting in-memory state", async () => {
    const { store } = await createHydratedStore();
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return { tasks: createSeedTasks() };
      },
      async saveSnapshot() {
        throw new Error("SQLite write failed");
      },
    });

    store.getState().addTask("Keeps working in memory");
    await flushPromises();

    expect(store.getState().tasks[0].title).toBe("Keeps working in memory");
    expect(store.getState().error).toBe("SQLite write failed");
  });

  it("preserves non-Error repository failure messages", async () => {
    const { store } = await createHydratedStore();
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return { tasks: createSeedTasks() };
      },
      async saveSnapshot() {
        throw "database is locked";
      },
    });

    store.getState().addTask("Keeps the raw SQLite message");
    await flushPromises();

    expect(store.getState().error).toBe("database is locked");
  });

  it("retries the latest in-memory task snapshot after a failed save", async () => {
    const savedSnapshots: TaskSnapshot[] = [];
    let failNextSave = true;
    const { store } = await createHydratedStore();
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return { tasks: createSeedTasks() };
      },
      async saveSnapshot(snapshot) {
        if (failNextSave) {
          failNextSave = false;
          throw "database is locked";
        }
        savedSnapshots.push(snapshot);
      },
    });

    const taskId = store.getState().tasks[0].id;
    store.getState().updateTask(taskId, { title: "Latest retry title" });
    await flushPromises();
    expect(store.getState().error).toBe("database is locked");

    store.getState().retryPersistTasks();
    await flushPromises();

    expect(store.getState().error).toBeNull();
    expect(savedSnapshots[savedSnapshots.length - 1].tasks[0].title).toBe("Latest retry title");
  });

  it("serializes rapid saves so the final persisted snapshot is the latest state", async () => {
    let loadedSnapshot: TaskSnapshot = { tasks: createSeedTasks() };
    const committedSnapshots: TaskSnapshot[] = [];
    const requests: Array<Deferred<void> & { snapshot: TaskSnapshot }> = [];
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return loadedSnapshot;
      },
      saveSnapshot(snapshot) {
        const request = createDeferred<void>();
        requests.push({ ...request, snapshot });
        return request.promise.then(() => {
          committedSnapshots.push(snapshot);
          loadedSnapshot = snapshot;
        });
      },
    });
    const store = createTaskStore();
    await store.getState().hydrateTasks();
    const taskId = store.getState().tasks[0].id;

    store.getState().updateTask(taskId, { title: "Title A" });
    store.getState().updateTask(taskId, { title: "Title B" });
    store.getState().updateTask(taskId, { title: "Title C" });
    await flushPromises();

    if (requests.length === 3) {
      requests[2].resolve();
      await flushPromises();
      requests[0].resolve();
      await flushPromises();
      requests[1].resolve();
      await flushPromises();
    } else {
      let index = 0;
      while (index < requests.length) {
        requests[index].resolve();
        index += 1;
        await flushPromises();
      }
    }

    expect(store.getState().tasks[0].title).toBe("Title C");
    expect(committedSnapshots[committedSnapshots.length - 1].tasks[0].title).toBe("Title C");
  });

  it("tracks saving state and lastSavedAt around an async save", async () => {
    const saveRequest = createDeferred<void>();
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return { tasks: createSeedTasks() };
      },
      async saveSnapshot() {
        return saveRequest.promise;
      },
    });
    const store = createTaskStore();
    await store.getState().hydrateTasks();

    store.getState().updateTask(store.getState().tasks[0].id, { note: "Saving state note" });
    await flushPromises();

    expect(store.getState().saving).toBe(true);
    expect(store.getState().lastSavedAt).toBeNull();

    saveRequest.resolve();
    await flushPromises();

    expect(store.getState().saving).toBe(false);
    expect(store.getState().lastSavedAt).toEqual(expect.any(String));
  });

  it("does not mutate or persist tasks before hydration completes", async () => {
    const hydration = createDeferred<TaskSnapshot>();
    const savedSnapshots: TaskSnapshot[] = [];
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return hydration.promise;
      },
      async saveSnapshot(snapshot) {
        savedSnapshots.push(snapshot);
      },
    });
    const store = createTaskStore();
    const hydrationPromise = store.getState().hydrateTasks();

    store.getState().addTask("Too early");
    store.getState().toggleTask("task-1");
    const updated = store.getState().updateTask("task-1", { title: "Too early update" });
    store.getState().deleteTask("task-1");

    expect(updated).toBe(false);
    expect(store.getState().tasks).toHaveLength(0);
    expect(savedSnapshots).toHaveLength(0);

    hydration.resolve({ tasks: createSeedTasks() });
    await hydrationPromise;

    expect(store.getState().tasks[0].title).toBe("Finalize the first-stage desktop shell");
    expect(savedSnapshots).toHaveLength(0);
  });

  it("creates a singleton stack for each added task and persists stacks with tasks", async () => {
    const { store, repository } = await createHydratedStore();

    store.getState().addTask("Stacked singleton");
    await flushPromises();

    const createdTask = store.getState().tasks[0];
    const createdStack = store.getState().stacks.find((stack) => stack.id === createdTask.stackId);
    expect(createdTask.stackOrder).toBe(0);
    expect(createdStack).toMatchObject({
      id: createdTask.stackId,
      collapsed: true,
    });

    const lastSnapshot = repository.savedSnapshots[repository.savedSnapshots.length - 1];
    expect(lastSnapshot.stacks?.some((stack) => stack.id === createdTask.stackId)).toBe(true);
  });

  it("toggles stack collapsed state and persists it", async () => {
    const { store, repository } = await createHydratedStore();
    const stackId = store.getState().stacks[0].id;

    store.getState().toggleStackCollapsed(stackId);
    await flushPromises();

    expect(store.getState().stacks[0]).toMatchObject({ id: stackId, collapsed: false });
    const lastSnapshot = repository.savedSnapshots[repository.savedSnapshots.length - 1];
    expect(lastSnapshot.stacks?.find((stack) => stack.id === stackId)?.collapsed).toBe(false);
  });

  it("uses the lowest stackOrder task as main and selects child tasks directly", async () => {
    const { store } = await createHydratedStore();
    const [firstTask, secondTask, ...remainingTasks] = store.getState().tasks;
    const stack = {
      id: "stack-combined",
      sortOrder: -10,
      collapsed: false,
      createdAt: firstTask.createdAt,
      updatedAt: firstTask.updatedAt,
    };
    const mainTask = { ...firstTask, id: "task-main", stackId: stack.id, stackOrder: 0, title: "Main stack task" };
    const childTask = { ...secondTask, id: "task-child", stackId: stack.id, stackOrder: 1, title: "Child stack task" };

    store.setState({
      tasks: [mainTask, childTask, ...remainingTasks],
      stacks: [stack, ...store.getState().stacks.slice(2)],
      selectedTaskId: mainTask.id,
    });

    const view = store.getState().getStackViews("all")[0];
    expect(view.mainTask.id).toBe(mainTask.id);
    expect(view.tasks.map((task) => task.id)).toEqual([mainTask.id, childTask.id]);

    store.getState().selectTask(childTask.id);
    expect(store.getState().selectedTaskId).toBe(childTask.id);

    store.getState().deleteTask(mainTask.id);
    await flushPromises();

    expect(store.getState().getStackViews("all")[0].mainTask.id).toBe(childTask.id);
    expect(store.getState().tasks.find((task) => task.id === childTask.id)?.stackOrder).toBe(0);
  });

  it("reorders visible stacks and persists normalized global stack order", async () => {
    const { store, repository } = await createHydratedStore();
    const initialStackIds = store.getState().getStackViews("all").map((view) => view.stack.id);

    const moved = store.getState().reorderStacks(initialStackIds[0], initialStackIds.length, initialStackIds);
    await flushPromises();

    expect(moved).toBe(true);
    expect(store.getState().getStackViews("all").map((view) => view.stack.id)).toEqual([
      ...initialStackIds.slice(1),
      initialStackIds[0],
    ]);
    expect(store.getState().stacks.map((stack) => stack.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(repository.savedSnapshots[repository.savedSnapshots.length - 1].stacks?.map((stack) => stack.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("reorders tasks inside a stack and promotes the first task to main", async () => {
    const { store, repository } = await createHydratedStore();
    const [firstTask, secondTask, ...remainingTasks] = store.getState().tasks;
    const [firstStack, ...remainingStacks] = store.getState().stacks;
    const combinedStack = { ...firstStack, id: "stack-combined", collapsed: false };
    const mainTask = { ...firstTask, id: "task-main", stackId: combinedStack.id, stackOrder: 0, title: "Main task" };
    const childTask = { ...secondTask, id: "task-child", stackId: combinedStack.id, stackOrder: 1, title: "Child task" };

    store.setState({
      tasks: [mainTask, childTask, ...remainingTasks],
      stacks: [combinedStack, ...remainingStacks.slice(1)],
      selectedTaskId: mainTask.id,
    });

    const moved = store.getState().reorderTaskWithinStack(combinedStack.id, childTask.id, 0);
    await flushPromises();

    expect(moved).toBe(true);
    expect(store.getState().getStackViews("all")[0].tasks.map((task) => task.id)).toEqual([childTask.id, mainTask.id]);
    expect(store.getState().getStackViews("all")[0].mainTask.id).toBe(childTask.id);
    expect(store.getState().selectedTaskId).toBe(mainTask.id);
    expect(repository.savedSnapshots[repository.savedSnapshots.length - 1].tasks.find((task) => task.id === childTask.id)?.stackOrder).toBe(0);
  });

  it("merges a singleton task into a target stack and removes the source stack", async () => {
    const { store, repository } = await createHydratedStore();
    const [sourceView, targetView] = store.getState().getStackViews("all");
    const sourceTaskId = sourceView.mainTask.id;

    const moved = store.getState().moveTaskToStack(sourceTaskId, targetView.stack.id);
    await flushPromises();

    const targetTasks = store.getState().tasks
      .filter((task) => task.stackId === targetView.stack.id)
      .sort((first, second) => first.stackOrder - second.stackOrder);
    expect(moved).toBe(true);
    expect(store.getState().stacks.some((stack) => stack.id === sourceView.stack.id)).toBe(false);
    expect(targetTasks.map((task) => task.id)).toEqual([targetView.mainTask.id, sourceTaskId]);
    expect(repository.savedSnapshots[repository.savedSnapshots.length - 1].stacks?.some((stack) => stack.id === sourceView.stack.id)).toBe(false);
  });

  it("splits a child task into a new singleton stack without leaving an empty source stack", async () => {
    const { store, repository } = await createHydratedStore();
    const [firstTask, secondTask, ...remainingTasks] = store.getState().tasks;
    const [firstStack, ...remainingStacks] = store.getState().stacks;
    const combinedStack = { ...firstStack, id: "stack-combined", collapsed: false };
    const mainTask = { ...firstTask, id: "task-main", stackId: combinedStack.id, stackOrder: 0, title: "Main task" };
    const childTask = { ...secondTask, id: "task-child", stackId: combinedStack.id, stackOrder: 1, title: "Child task" };

    store.setState({
      tasks: [mainTask, childTask, ...remainingTasks],
      stacks: [combinedStack, ...remainingStacks.slice(1)],
      selectedTaskId: mainTask.id,
    });
    const visibleStackIds = store.getState().getStackViews("all").map((view) => view.stack.id);

    const split = store.getState().splitTaskToNewStack(childTask.id, 1, visibleStackIds);
    await flushPromises();

    const child = store.getState().tasks.find((task) => task.id === childTask.id);
    expect(split).toBe(true);
    expect(child).toMatchObject({ stackOrder: 0 });
    expect(child?.stackId).not.toBe(combinedStack.id);
    expect(store.getState().tasks.filter((task) => task.stackId === combinedStack.id)).toHaveLength(1);
    expect(store.getState().stacks.some((stack) => stack.id === combinedStack.id)).toBe(true);
    expect(store.getState().stacks.some((stack) => stack.id === child?.stackId)).toBe(true);
    expect(repository.savedSnapshots[repository.savedSnapshots.length - 1].tasks.find((task) => task.id === childTask.id)?.stackOrder).toBe(0);
  });

  it("rejects invalid stack mutations without corrupting task state", async () => {
    const { store, repository } = await createHydratedStore();
    const before = store.getState().tasks.map((task) => ({ id: task.id, stackId: task.stackId, stackOrder: task.stackOrder }));

    expect(store.getState().moveTaskToStack("missing-task", store.getState().stacks[0].id)).toBe(false);
    expect(store.getState().splitTaskToNewStack(store.getState().tasks[0].id, 0)).toBe(false);

    expect(store.getState().tasks.map((task) => ({ id: task.id, stackId: task.stackId, stackOrder: task.stackOrder }))).toEqual(before);
    expect(repository.savedSnapshots).toHaveLength(0);
  });
});




