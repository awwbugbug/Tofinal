import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskAppRepository } from "@/repositories/sqliteTaskAppRepository";
import type { AppLauncher } from "@/lib/appLauncher";
import type { TaskAppSelection } from "@/storage/taskAppSelection";
import {
  createTaskAppStore,
  resetTaskAppDependenciesForTest,
  setTaskAppDependenciesForTest,
} from "@/stores/taskAppStore";
import type { TaskApp } from "@/types/taskApp";

const taskApp = (overrides: Partial<TaskApp> = {}): TaskApp => ({
  id: "task-app-1",
  taskId: "task-1",
  appName: "Notepad",
  appPath: "C:\\Windows\\notepad.exe",
  appKind: "exe",
  launchArgs: null,
  createdAt: "2026-06-11T08:10:00.000Z",
  updatedAt: "2026-06-11T08:10:00.000Z",
  sortOrder: 0,
  ...overrides,
});

const createRepository = (initialApps: TaskApp[] = []) => {
  const rows = [...initialApps];
  const repository: TaskAppRepository = {
    async listByTaskId(taskId) {
      return rows.filter((row) => row.taskId === taskId).sort((first, second) => first.sortOrder - second.sortOrder);
    },
    async getTaskApp(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async insertTaskApp(taskApp) {
      rows.push(taskApp);
    },
    async updateTaskApp(id, update) {
      rows.forEach((row) => {
        if (row.id === id) {
          row.appName = update.appName;
          row.updatedAt = update.updatedAt;
        }
      });
    },
    async deleteTaskApp(id) {
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) {
        rows.splice(index, 1);
      }
    },
    async deleteByTaskId(taskId) {
      let index = rows.length - 1;
      while (index >= 0) {
        if (rows[index].taskId === taskId) {
          rows.splice(index, 1);
        }
        index -= 1;
      }
    },
  };

  return { repository, rows };
};

const createSelection = (overrides: Partial<TaskAppSelection> = {}): TaskAppSelection => ({
  async pickAppPath() {
    return "C:\\Windows\\notepad.exe";
  },
  ...overrides,
});

const createLauncher = (overrides: Partial<AppLauncher> = {}): AppLauncher => ({
  async launch() {},
  ...overrides,
});

describe("task app store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetTaskAppDependenciesForTest();
  });

  it("loads task apps by task id", async () => {
    const { repository } = createRepository([taskApp()]);
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({ launcher: createLauncher(), repository, selection: createSelection() });

    await store.getState().loadByTaskId("task-1");

    expect(store.getState().appsByTaskId["task-1"]).toMatchObject([{ id: "task-app-1", missing: false }]);
  });

  it("does not write metadata when the user cancels selection", async () => {
    const { repository, rows } = createRepository();
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({
      launcher: createLauncher(),
      repository,
      selection: createSelection({ async pickAppPath() { return null; } }),
    });

    await store.getState().addApp("task-1");

    expect(rows).toHaveLength(0);
    expect(store.getState().error).toBeNull();
  });

  it("adds exe and shortcut metadata from selected paths", async () => {
    const { repository, rows } = createRepository();
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({
      launcher: createLauncher(),
      repository,
      selection: createSelection({ async pickAppPath() { return "C:\\Tools\\Editor.lnk"; } }),
    });

    await store.getState().addApp("task-1");

    expect(rows[0]).toMatchObject({
      appName: "Editor",
      appKind: "shortcut",
      appPath: "C:\\Tools\\Editor.lnk",
      launchArgs: null,
    });

    setTaskAppDependenciesForTest({
      selection: createSelection({ async pickAppPath() { return "C:\\Windows\\notepad.exe"; } }),
    });
    await store.getState().addApp("task-1");

    expect(rows[1]).toMatchObject({
      appName: "notepad",
      appKind: "exe",
    });
  });

  it("rejects unsupported selected extensions", async () => {
    const { repository, rows } = createRepository();
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({
      launcher: createLauncher(),
      repository,
      selection: createSelection({ async pickAppPath() { return "C:\\Docs\\brief.pdf"; } }),
    });

    await store.getState().addApp("task-1");

    expect(rows).toHaveLength(0);
    expect(store.getState().error).toMatch(/unsupported app type/i);
  });

  it("updates app display name and deletes bindings", async () => {
    const { repository, rows } = createRepository([taskApp()]);
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({ launcher: createLauncher(), repository, selection: createSelection() });
    await store.getState().loadByTaskId("task-1");

    await store.getState().updateAppName("task-app-1", "Notes");
    expect(rows[0].appName).toBe("Notes");

    await store.getState().deleteApp("task-app-1");
    expect(rows).toHaveLength(0);
    expect(store.getState().appsByTaskId["task-1"]).toEqual([]);
  });

  it("launches task apps and records success", async () => {
    const launch = vi.fn();
    const { repository } = createRepository([taskApp()]);
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({ launcher: createLauncher({ launch }), repository, selection: createSelection() });

    await store.getState().loadByTaskId("task-1");
    await store.getState().startTask("task-1");

    expect(launch).toHaveBeenCalledWith(taskApp());
    expect(store.getState().lastStartedAt).toEqual(expect.any(String));
    expect(store.getState().error).toBeNull();
  });

  it("records launch failures and missing app state", async () => {
    const { repository } = createRepository([taskApp()]);
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({
      launcher: createLauncher({
        async launch() {
          throw new Error("App path does not exist.");
        },
      }),
      repository,
      selection: createSelection(),
    });

    await store.getState().loadByTaskId("task-1");
    await store.getState().startTask("task-1");

    expect(store.getState().error).toMatch(/app path does not exist/i);
    expect(store.getState().appsByTaskId["task-1"][0]).toMatchObject({
      missing: true,
      lastLaunchError: "App path does not exist.",
    });
  });

  it("keeps launching remaining apps when one launch fails", async () => {
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce(undefined);
    const { repository } = createRepository([
      taskApp({ id: "task-app-1", sortOrder: 0 }),
      taskApp({ id: "task-app-2", appPath: "C:\\Tools\\Editor.exe", sortOrder: 1 }),
    ]);
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({ launcher: createLauncher({ launch }), repository, selection: createSelection() });

    await store.getState().loadByTaskId("task-1");
    await store.getState().startTask("task-1");

    expect(launch).toHaveBeenCalledTimes(2);
    expect(store.getState().error).toMatch(/1 app failed/i);
  });

  it("ignores stale task app loads for the same selected task", async () => {
    let resolveFirst!: (value: TaskApp[]) => void;
    const firstLoad = new Promise<TaskApp[]>((resolve) => {
      resolveFirst = resolve;
    });
    const repository: TaskAppRepository = {
      listByTaskId: vi
        .fn()
        .mockReturnValueOnce(firstLoad)
        .mockResolvedValueOnce([taskApp({ id: "newer" })]),
      async getTaskApp() {
        return null;
      },
      async insertTaskApp() {},
      async updateTaskApp() {},
      async deleteTaskApp() {},
      async deleteByTaskId() {},
    };
    const store = createTaskAppStore();
    setTaskAppDependenciesForTest({ launcher: createLauncher(), repository, selection: createSelection() });

    const stale = store.getState().loadByTaskId("task-1");
    await store.getState().loadByTaskId("task-1");
    resolveFirst([taskApp({ id: "stale" })]);
    await stale;

    expect(store.getState().appsByTaskId["task-1"].map((item) => item.id)).toEqual(["newer"]);
  });
});
