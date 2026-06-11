import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { getTaskRepository } from "@/repositories/taskRepository";
import { createSeedTasks } from "@/storage/taskStorage";
import type { AppMode, Task, TaskFilter, TaskPriority } from "@/types/task";

type TaskState = {
  tasks: Task[];
  selectedTaskId: string | null;
  mode: AppMode;
  activeFilter: TaskFilter;
  searchQuery: string;
  hydrated: boolean;
  loading: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  error: string | null;
};

type TaskUpdate = Partial<Pick<Task, "title" | "note" | "priority" | "tags" | "pinned">>;

type TaskActions = {
  hydrateTasks: () => Promise<void>;
  addTask: (title: string) => void;
  updateTask: (id: string, update: TaskUpdate) => boolean;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  togglePinned: (id: string) => void;
  selectTask: (id: string) => void;
  setMode: (mode: AppMode) => void;
  setActiveFilter: (filter: TaskFilter) => void;
  setSearchQuery: (query: string) => void;
  getFilteredTasks: (filter?: TaskFilter, query?: string) => Task[];
};

export type TaskStore = TaskState & TaskActions;

const nowIso = () => new Date().toISOString();

const normalizeTags = (tags: string[]) => {
  const seen = new Set<string>();

  return tags.reduce<string[]>((result, tag) => {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) {
      return result;
    }

    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
};

const createTask = (
  id: string,
  title: string,
  note: string,
  priority: TaskPriority,
  tags: string[],
  createdAt: string,
): Task => ({
  id,
  title,
  note,
  completed: false,
  priority,
  pinned: false,
  tags,
  createdAt,
  updatedAt: createdAt,
  completedAt: null,
});

const initialState = (): TaskState => ({
  tasks: [],
  selectedTaskId: null,
  mode: "normal",
  activeFilter: "today",
  searchQuery: "",
  hydrated: false,
  loading: false,
  saving: false,
  lastSavedAt: null,
  error: null,
});

const applySearch = (tasks: Task[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return tasks;
  }

  return tasks.filter((task) => {
    return (
      task.title.toLowerCase().includes(normalizedQuery) ||
      task.note.toLowerCase().includes(normalizedQuery)
    );
  });
};

const filterTasks = (tasks: Task[], filter: TaskFilter, query = "") => {
  let filteredTasks = tasks;

  if (filter === "important") {
    filteredTasks = tasks.filter((task) => task.priority === "important" || task.priority === "urgent");
  }

  if (filter === "pinned") {
    filteredTasks = tasks.filter((task) => task.pinned);
  }

  return applySearch(filteredTasks, query);
};

const selectVisibleTask = (
  tasks: Task[],
  selectedTaskId: string | null,
  activeFilter: TaskFilter,
  searchQuery: string,
) => {
  const visibleTasks = filterTasks(tasks, activeFilter, searchQuery);
  if (selectedTaskId && visibleTasks.some((task) => task.id === selectedTaskId)) {
    return selectedTaskId;
  }

  return visibleTasks[0]?.id ?? null;
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Task persistence failed.";
};

const snapshotFromTasks = (tasks: Task[]) => ({
  tasks: tasks.map((task) => ({ ...task, tags: [...task.tags] })),
});

const createTaskStoreState: StateCreator<TaskStore> = (set, get) => {
  let saveChain = Promise.resolve();
  let latestSaveRequest = 0;

  const canMutateTasks = () => get().hydrated && !get().loading;

  const queuePersistTasks = () => {
    const requestId = latestSaveRequest + 1;
    latestSaveRequest = requestId;
    set({ saving: true, error: null });

    saveChain = saveChain
      .catch(() => undefined)
      .then(async () => {
        const snapshot = snapshotFromTasks(get().tasks);
        await getTaskRepository().saveSnapshot(snapshot);

        if (requestId === latestSaveRequest) {
          set({ saving: false, lastSavedAt: nowIso(), error: null });
        }
      })
      .catch((error) => {
        if (requestId === latestSaveRequest) {
          set({ saving: false, error: errorMessage(error) });
        }
      });
  };

  return {
    ...initialState(),
  hydrateTasks: async () => {
    if (get().loading || get().hydrated) {
      return;
    }

    set({ loading: true, error: null });

    try {
      const snapshot = await getTaskRepository().loadSnapshot();
      const selectedTaskId = selectVisibleTask(
        snapshot.tasks,
        get().selectedTaskId,
        get().activeFilter,
        get().searchQuery,
      );

      set({
        tasks: snapshot.tasks,
        selectedTaskId,
        hydrated: true,
        loading: false,
        saving: false,
        error: null,
      });
    } catch (error) {
      const tasks = createSeedTasks();

      set({
        tasks,
        selectedTaskId: tasks[0]?.id ?? null,
        hydrated: true,
        loading: false,
        saving: false,
        error: errorMessage(error),
      });
    }
  },
  addTask: (title) => {
    if (!canMutateTasks()) {
      return;
    }

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    const timestamp = nowIso();
    const task = createTask(
      `task-${crypto.randomUUID()}`,
      trimmedTitle,
      "",
      "normal",
      [],
      timestamp,
    );
    const tasks = [task, ...get().tasks];

    set({ tasks, selectedTaskId: task.id });
    queuePersistTasks();
  },
  updateTask: (id, update) => {
    if (!canMutateTasks()) {
      return false;
    }

    const currentTask = get().tasks.find((task) => task.id === id);
    const nextTitle = update.title === undefined ? currentTask?.title : update.title.trim();

    if (!currentTask || !nextTitle) {
      return false;
    }

    const timestamp = nowIso();
    const tasks = get().tasks.map((task) => {
      if (task.id !== id) {
        return task;
      }

      return {
        ...task,
        ...update,
        title: nextTitle,
        tags: update.tags ? normalizeTags(update.tags) : task.tags,
        updatedAt: timestamp,
      };
    });
    const selectedTaskId = selectVisibleTask(tasks, get().selectedTaskId, get().activeFilter, get().searchQuery);

    set({ tasks, selectedTaskId });
    queuePersistTasks();
    return true;
  },
  deleteTask: (id) => {
    if (!canMutateTasks()) {
      return;
    }

    const tasks = get().tasks.filter((task) => task.id !== id);
    const selectedTaskId = selectVisibleTask(tasks, get().selectedTaskId === id ? null : get().selectedTaskId, get().activeFilter, get().searchQuery);

    set({ tasks, selectedTaskId });
    queuePersistTasks();
  },
  toggleTask: (id) => {
    if (!canMutateTasks()) {
      return;
    }

    const timestamp = nowIso();
    const tasks = get().tasks.map((task) => {
      if (task.id !== id) {
        return task;
      }

      const completed = !task.completed;

      return {
        ...task,
        completed,
        updatedAt: timestamp,
        completedAt: completed ? timestamp : null,
      };
    });
    const selectedTaskId = selectVisibleTask(tasks, get().selectedTaskId, get().activeFilter, get().searchQuery);

    set({ tasks, selectedTaskId });
    queuePersistTasks();
  },
  togglePinned: (id) => {
    const currentTask = get().tasks.find((task) => task.id === id);
    if (!currentTask) {
      return;
    }

    get().updateTask(id, { pinned: !currentTask.pinned });
  },
  selectTask: (id) => {
    set({ selectedTaskId: id });
  },
  setMode: (mode) => {
    set({ mode });
  },
  setActiveFilter: (activeFilter) => {
    const selectedTaskId = selectVisibleTask(get().tasks, get().selectedTaskId, activeFilter, get().searchQuery);

    set({ activeFilter, selectedTaskId });
  },
  setSearchQuery: (searchQuery) => {
    const selectedTaskId = selectVisibleTask(get().tasks, get().selectedTaskId, get().activeFilter, searchQuery);

    set({ searchQuery, selectedTaskId });
  },
  getFilteredTasks: (filter, query) => {
    const state = get();

    return filterTasks(state.tasks, filter ?? state.activeFilter, query ?? state.searchQuery);
  },
  };
};

export const getTasksForFilter = (tasks: Task[], filter: TaskFilter) => filterTasks(tasks, filter);

export const createTaskStore = () => createStore<TaskStore>()(createTaskStoreState);

export const useTaskStore: UseBoundStore<StoreApi<TaskStore>> = create<TaskStore>()(createTaskStoreState);

export const resetTaskStore = () => {
  useTaskStore.setState({
    ...initialState(),
    mode: "normal",
    activeFilter: "today",
    searchQuery: "",
  });
};
