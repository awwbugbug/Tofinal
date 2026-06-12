import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { tauriAppLauncher, type AppLauncher } from "@/lib/appLauncher";
import {
  sqliteTaskAppRepository,
  type TaskAppRepository,
} from "@/repositories/sqliteTaskAppRepository";
import { tauriTaskAppSelection, type TaskAppSelection } from "@/storage/taskAppSelection";
import type { TaskApp, TaskAppKind } from "@/types/taskApp";

export type TaskAppView = TaskApp & {
  missing: boolean;
  launching: boolean;
  lastLaunchError: string | null;
};

type TaskAppState = {
  appsByTaskId: Record<string, TaskAppView[]>;
  loadingTaskIds: Record<string, boolean>;
  launching: boolean;
  adding: boolean;
  error: string | null;
  lastStartedAt: string | null;
};

type TaskAppActions = {
  loadByTaskId: (taskId: string) => Promise<void>;
  addApp: (taskId: string) => Promise<void>;
  updateAppName: (id: string, appName: string) => Promise<void>;
  deleteApp: (id: string) => Promise<void>;
  startTask: (taskId: string) => Promise<void>;
};

export type TaskAppStore = TaskAppState & TaskAppActions;

type TaskAppDependencies = {
  repository: TaskAppRepository;
  selection: TaskAppSelection;
  launcher: AppLauncher;
};

let dependencies: TaskAppDependencies = {
  repository: sqliteTaskAppRepository,
  selection: tauriTaskAppSelection,
  launcher: tauriAppLauncher,
};

const initialState = (): TaskAppState => ({
  appsByTaskId: {},
  loadingTaskIds: {},
  launching: false,
  adding: false,
  error: null,
  lastStartedAt: null,
});

const nowIso = () => new Date().toISOString();

const errorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Task app operation failed.";
};

const pathBasename = (path: string) => {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
};

const pathExtension = (path: string) => {
  const name = pathBasename(path);
  const segments = name.split(".");
  return segments.length > 1 ? segments[segments.length - 1].toLowerCase() : "";
};

const nameFromPath = (path: string) => {
  const name = pathBasename(path);
  const extension = pathExtension(name);
  if (!extension) {
    return name;
  }

  return name.slice(0, -(extension.length + 1)) || name;
};

const kindFromPath = (path: string): TaskAppKind | null => {
  const extension = pathExtension(path);
  if (extension === "exe") {
    return "exe";
  }

  if (extension === "lnk") {
    return "shortcut";
  }

  return null;
};

const toView = (taskApp: TaskApp): TaskAppView => ({
  ...taskApp,
  missing: false,
  launching: false,
  lastLaunchError: null,
});

const toTaskApp = (view: TaskAppView): TaskApp => ({
  id: view.id,
  taskId: view.taskId,
  appName: view.appName,
  appPath: view.appPath,
  appKind: view.appKind,
  launchArgs: view.launchArgs,
  createdAt: view.createdAt,
  updatedAt: view.updatedAt,
  sortOrder: view.sortOrder,
});

const createTaskAppStoreState: StateCreator<TaskAppStore> = (set, get) => {
  const latestLoadRequestByTaskId = new Map<string, number>();
  let latestLoadRequest = 0;

  const loadAndSetByTaskId = async (taskId: string) => {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;
    latestLoadRequestByTaskId.set(taskId, requestId);
    set((state) => ({
      loadingTaskIds: { ...state.loadingTaskIds, [taskId]: true },
      error: null,
    }));

    try {
      const apps = await dependencies.repository.listByTaskId(taskId);
      if (latestLoadRequestByTaskId.get(taskId) !== requestId) {
        return;
      }

      set((state) => ({
        appsByTaskId: { ...state.appsByTaskId, [taskId]: apps.map(toView) },
        loadingTaskIds: { ...state.loadingTaskIds, [taskId]: false },
        error: null,
      }));
    } catch (error) {
      if (latestLoadRequestByTaskId.get(taskId) !== requestId) {
        return;
      }

      set((state) => ({
        loadingTaskIds: { ...state.loadingTaskIds, [taskId]: false },
        error: errorMessage(error),
      }));
    }
  };

  const updateAppView = (taskId: string, appId: string, update: Partial<TaskAppView>) => {
    set((state) => ({
      appsByTaskId: {
        ...state.appsByTaskId,
        [taskId]: (state.appsByTaskId[taskId] ?? []).map((app) =>
          app.id === appId ? { ...app, ...update } : app,
        ),
      },
    }));
  };

  return {
    ...initialState(),
    loadByTaskId: loadAndSetByTaskId,
    addApp: async (taskId) => {
      set({ adding: true, error: null });

      try {
        const selectedPath = await dependencies.selection.pickAppPath();
        if (!selectedPath) {
          set({ adding: false });
          return;
        }

        const appKind = kindFromPath(selectedPath);
        if (!appKind) {
          set({ adding: false, error: "Unsupported app type. Select an .exe or .lnk file." });
          return;
        }

        const existingApps = await dependencies.repository.listByTaskId(taskId);
        const sortOrder =
          existingApps.reduce((maxSortOrder, app) => Math.max(maxSortOrder, app.sortOrder), -1) + 1;
        const timestamp = nowIso();
        const taskApp: TaskApp = {
          id: `task-app-${crypto.randomUUID()}`,
          taskId,
          appName: nameFromPath(selectedPath),
          appPath: selectedPath,
          appKind,
          launchArgs: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          sortOrder,
        };

        await dependencies.repository.insertTaskApp(taskApp);
        await loadAndSetByTaskId(taskId);
        set({ adding: false, error: null });
      } catch (error) {
        set({ adding: false, error: errorMessage(error) });
      }
    },
    updateAppName: async (id, appName) => {
      const trimmedName = appName.trim();
      if (!trimmedName) {
        set({ error: "App name is required." });
        return;
      }

      const currentApp = Object.values(get().appsByTaskId)
        .flat()
        .find((app) => app.id === id);
      const persistedApp = currentApp ?? (await dependencies.repository.getTaskApp(id));
      if (!persistedApp) {
        return;
      }

      const updatedAt = nowIso();
      try {
        await dependencies.repository.updateTaskApp(id, { appName: trimmedName, updatedAt });
        updateAppView(persistedApp.taskId, id, { appName: trimmedName, updatedAt });
        set({ error: null });
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },
    deleteApp: async (id) => {
      const currentApp = Object.values(get().appsByTaskId)
        .flat()
        .find((app) => app.id === id);
      const persistedApp = currentApp ?? (await dependencies.repository.getTaskApp(id));
      if (!persistedApp) {
        return;
      }

      try {
        await dependencies.repository.deleteTaskApp(id);
        set((state) => ({
          appsByTaskId: {
            ...state.appsByTaskId,
            [persistedApp.taskId]: (state.appsByTaskId[persistedApp.taskId] ?? []).filter(
              (app) => app.id !== id,
            ),
          },
          error: null,
        }));
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },
    startTask: async (taskId) => {
      const currentApps = get().appsByTaskId[taskId] ?? [];
      const apps = currentApps.length > 0 ? currentApps : (await dependencies.repository.listByTaskId(taskId)).map(toView);
      if (apps.length === 0) {
        set({ error: "No apps are bound to this task." });
        return;
      }

      set({ launching: true, error: null });
      let failures = 0;
      let firstFailureMessage = "";

      for (const app of apps) {
        updateAppView(taskId, app.id, { launching: true, lastLaunchError: null });
        try {
          await dependencies.launcher.launch(toTaskApp(app));
          updateAppView(taskId, app.id, { launching: false, lastLaunchError: null });
        } catch (error) {
          const message = errorMessage(error);
          failures += 1;
          firstFailureMessage ||= message;
          updateAppView(taskId, app.id, {
            launching: false,
            lastLaunchError: message,
            missing: /does not exist|missing|not found/i.test(message),
          });
        }
      }

      if (failures > 0) {
        set({
          launching: false,
          error:
            failures === 1 && apps.length === 1
              ? firstFailureMessage
              : `${failures} ${failures === 1 ? "app" : "apps"} failed to start.`,
        });
        return;
      }

      set({ launching: false, error: null, lastStartedAt: nowIso() });
    },
  };
};

export const createTaskAppStore = () => createStore<TaskAppStore>()(createTaskAppStoreState);

export const useTaskAppStore: UseBoundStore<StoreApi<TaskAppStore>> =
  create<TaskAppStore>()(createTaskAppStoreState);

export const setTaskAppDependenciesForTest = (nextDependencies: Partial<TaskAppDependencies>) => {
  dependencies = { ...dependencies, ...nextDependencies };
};

export const resetTaskAppDependenciesForTest = () => {
  dependencies = {
    repository: sqliteTaskAppRepository,
    selection: tauriTaskAppSelection,
    launcher: tauriAppLauncher,
  };
  useTaskAppStore.setState(initialState());
};
