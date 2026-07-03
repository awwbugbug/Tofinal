import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { getTaskRepository } from "@/repositories/taskRepository";
import { createSeedTaskSnapshot, createSingletonStack, normalizeTaskSnapshot } from "@/storage/taskStorage";
import type { AppMode, Task, TaskFilter, TaskPriority, TaskStack, TaskStackView } from "@/types/task";

type TaskState = {
  tasks: Task[];
  stacks: TaskStack[];
  selectedTaskId: string | null;
  highlightedTaskId: string | null;
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
  retryPersistTasks: () => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  togglePinned: (id: string) => void;
  toggleStackCollapsed: (stackId: string) => void;
  selectTask: (id: string) => void;
  setMode: (mode: AppMode) => void;
  setActiveFilter: (filter: TaskFilter) => void;
  setSearchQuery: (query: string) => void;
  getFilteredTasks: (filter?: TaskFilter, query?: string) => Task[];
  getTodayCompletedTasks: (query?: string) => Task[];
  getStackViews: (filter?: TaskFilter, query?: string) => TaskStackView[];
  getTodayCompletedStackViews: (query?: string) => TaskStackView[];
};

export type TaskStore = TaskState & TaskActions;

const nowIso = () => new Date().toISOString();

export const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

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
  plannedDate: string | null,
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
  plannedDate,
  stackId: `stack-${id}`,
  stackOrder: 0,
  completedAt: null,
});

const initialState = (): TaskState => ({
  tasks: [],
  stacks: [],
  selectedTaskId: null,
  highlightedTaskId: null,
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

  return tasks.filter((task) => task.title.toLowerCase().includes(normalizedQuery) || task.note.toLowerCase().includes(normalizedQuery));
};

const taskMatchesFilter = (task: Task, filter: TaskFilter) => {
  if (filter === "today") {
    return !task.completed && task.plannedDate === getLocalDateKey();
  }

  if (filter === "all") {
    return true;
  }

  if (filter === "important") {
    return task.priority === "important" || task.priority === "urgent";
  }

  return task.pinned;
};

const filterTasks = (tasks: Task[], filter: TaskFilter, query = "") => applySearch(tasks.filter((task) => taskMatchesFilter(task, filter)), query);

const filterTodayCompletedTasks = (tasks: Task[], query = "") => {
  const today = getLocalDateKey();
  return applySearch(tasks.filter((task) => task.completed && task.completedAt?.slice(0, 10) === today), query);
};

export const buildStackViews = (tasks: Task[], stacks: TaskStack[]): TaskStackView[] => {
  const tasksByStackId = new Map<string, Task[]>();
  for (const task of tasks) {
    const stackTasks = tasksByStackId.get(task.stackId) ?? [];
    stackTasks.push(task);
    tasksByStackId.set(task.stackId, stackTasks);
  }

  return stacks
    .map((stack) => {
      const stackTasks = (tasksByStackId.get(stack.id) ?? []).sort((first, second) => first.stackOrder - second.stackOrder || first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
      const mainTask = stackTasks[0];
      if (!mainTask) {
        return null;
      }

      const today = getLocalDateKey();
      return {
        stack,
        tasks: stackTasks,
        mainTask,
        completedCount: stackTasks.filter((task) => task.completed).length,
        totalCount: stackTasks.length,
        todayRelevantCount: stackTasks.filter((task) => !task.completed && task.plannedDate === today).length,
      } satisfies TaskStackView;
    })
    .filter((view): view is TaskStackView => view !== null)
    .sort((first, second) => first.stack.sortOrder - second.stack.sortOrder || first.stack.createdAt.localeCompare(second.stack.createdAt) || first.stack.id.localeCompare(second.stack.id));
};

const stackViewMatchesQuery = (view: TaskStackView, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return view.tasks.some((task) => task.title.toLowerCase().includes(normalizedQuery) || task.note.toLowerCase().includes(normalizedQuery));
};

const filterStackViews = (tasks: Task[], stacks: TaskStack[], filter: TaskFilter, query = "") =>
  buildStackViews(tasks, stacks).filter((view) => view.tasks.some((task) => taskMatchesFilter(task, filter)) && stackViewMatchesQuery(view, query));

const filterTodayCompletedStackViews = (tasks: Task[], stacks: TaskStack[], query = "") => {
  const today = getLocalDateKey();
  return buildStackViews(tasks, stacks).filter((view) => {
    const hasActiveToday = view.tasks.some((task) => !task.completed && task.plannedDate === today);
    const hasCompletedToday = view.tasks.some((task) => task.completed && task.completedAt?.slice(0, 10) === today);
    return !hasActiveToday && hasCompletedToday && stackViewMatchesQuery(view, query);
  });
};

const mainTaskIdsForViews = (views: TaskStackView[]) => new Set(views.map((view) => view.mainTask.id));

const selectVisibleTask = (
  tasks: Task[],
  stacks: TaskStack[],
  selectedTaskId: string | null,
  activeFilter: TaskFilter,
  searchQuery: string,
) => {
  const visibleViews = filterStackViews(tasks, stacks, activeFilter, searchQuery);
  const visibleMainTaskIds = mainTaskIdsForViews(visibleViews);
  if (selectedTaskId && visibleMainTaskIds.has(selectedTaskId)) {
    return selectedTaskId;
  }

  return visibleViews[0]?.mainTask.id ?? null;
};

const isMainTask = (tasks: Task[], stacks: TaskStack[], taskId: string) => buildStackViews(tasks, stacks).some((view) => view.mainTask.id === taskId);

const errorMessage = (error: unknown) => {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  if (error !== undefined && error !== null) {
    const message = String(error);
    if (message && message !== "[object Object]") {
      return message;
    }
  }

  return "Task persistence failed.";
};

const snapshotFromState = (tasks: Task[], stacks: TaskStack[]) => normalizeTaskSnapshot({
  tasks: tasks.map((task) => ({ ...task, tags: [...task.tags] })),
  stacks: stacks.map((stack) => ({ ...stack })),
});

const normalizeStackTasksAfterDelete = (tasks: Task[], stackId: string) => {
  const stackTasks = tasks
    .filter((task) => task.stackId === stackId)
    .sort((first, second) => first.stackOrder - second.stackOrder || first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
  const orderByTaskId = new Map(stackTasks.map((task, index) => [task.id, index]));
  return tasks.map((task) => (task.stackId === stackId ? { ...task, stackOrder: orderByTaskId.get(task.id) ?? task.stackOrder } : task));
};

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
        const snapshot = snapshotFromState(get().tasks, get().stacks);
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
        const snapshot = normalizeTaskSnapshot(await getTaskRepository().loadSnapshot());
        const selectedTaskId = selectVisibleTask(snapshot.tasks, snapshot.stacks, get().selectedTaskId, get().activeFilter, get().searchQuery);

        set({
          tasks: snapshot.tasks,
          stacks: snapshot.stacks,
          selectedTaskId,
          highlightedTaskId: null,
          hydrated: true,
          loading: false,
          saving: false,
          error: null,
        });
      } catch (error) {
        const snapshot = createSeedTaskSnapshot();

        set({
          tasks: snapshot.tasks,
          stacks: snapshot.stacks,
          selectedTaskId: snapshot.tasks[0]?.id ?? null,
          highlightedTaskId: null,
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
      const plannedDate = get().activeFilter === "today" ? getLocalDateKey() : null;
      const task = createTask(`task-${crypto.randomUUID()}`, trimmedTitle, "", "normal", [], timestamp, plannedDate);
      const minSortOrder = Math.min(0, ...get().stacks.map((stack) => stack.sortOrder));
      const stack = createSingletonStack(task, minSortOrder - 1);
      const tasks = [task, ...get().tasks];
      const stacks = [stack, ...get().stacks];

      set({ tasks, stacks, selectedTaskId: task.id, highlightedTaskId: null });
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
      const tasks = get().tasks.map((task) => task.id === id
        ? {
            ...task,
            ...update,
            title: nextTitle,
            tags: update.tags ? normalizeTags(update.tags) : task.tags,
            updatedAt: timestamp,
          }
        : task,
      );
      const selectedTaskId = selectVisibleTask(tasks, get().stacks, get().selectedTaskId, get().activeFilter, get().searchQuery);

      set({ tasks, selectedTaskId });
      queuePersistTasks();
      return true;
    },
    retryPersistTasks: () => {
      if (!canMutateTasks()) {
        return;
      }

      queuePersistTasks();
    },
    deleteTask: (id) => {
      if (!canMutateTasks()) {
        return;
      }

      const deletedTask = get().tasks.find((task) => task.id === id);
      if (!deletedTask) {
        return;
      }

      let tasks = get().tasks.filter((task) => task.id !== id);
      const remainingStackTasks = tasks.filter((task) => task.stackId === deletedTask.stackId);
      let stacks = get().stacks;

      if (remainingStackTasks.length === 0) {
        stacks = stacks.filter((stack) => stack.id !== deletedTask.stackId);
      } else {
        tasks = normalizeStackTasksAfterDelete(tasks, deletedTask.stackId);
      }

      const selectedTaskId = selectVisibleTask(tasks, stacks, get().selectedTaskId === id ? null : get().selectedTaskId, get().activeFilter, get().searchQuery);
      const highlightedTaskId = get().highlightedTaskId === id ? null : get().highlightedTaskId;

      set({ tasks, stacks, selectedTaskId, highlightedTaskId });
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
      const selectedTaskId = selectVisibleTask(tasks, get().stacks, get().selectedTaskId, get().activeFilter, get().searchQuery);

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
    toggleStackCollapsed: (stackId) => {
      if (!canMutateTasks()) {
        return;
      }

      const timestamp = nowIso();
      const stacks = get().stacks.map((stack) => stack.id === stackId ? { ...stack, collapsed: !stack.collapsed, updatedAt: timestamp } : stack);
      set({ stacks });
      queuePersistTasks();
    },
    selectTask: (id) => {
      if (isMainTask(get().tasks, get().stacks, id)) {
        set({ selectedTaskId: id, highlightedTaskId: null });
        return;
      }

      set({ highlightedTaskId: id });
    },
    setMode: (mode) => {
      set({ mode });
    },
    setActiveFilter: (activeFilter) => {
      const selectedTaskId = selectVisibleTask(get().tasks, get().stacks, get().selectedTaskId, activeFilter, get().searchQuery);
      set({ activeFilter, selectedTaskId, highlightedTaskId: null });
    },
    setSearchQuery: (searchQuery) => {
      const selectedTaskId = selectVisibleTask(get().tasks, get().stacks, get().selectedTaskId, get().activeFilter, searchQuery);
      set({ searchQuery, selectedTaskId, highlightedTaskId: null });
    },
    getFilteredTasks: (filter, query) => {
      const state = get();
      return filterTasks(state.tasks, filter ?? state.activeFilter, query ?? state.searchQuery);
    },
    getTodayCompletedTasks: (query) => {
      const state = get();
      return filterTodayCompletedTasks(state.tasks, query ?? state.searchQuery);
    },
    getStackViews: (filter, query) => {
      const state = get();
      return filterStackViews(state.tasks, state.stacks, filter ?? state.activeFilter, query ?? state.searchQuery);
    },
    getTodayCompletedStackViews: (query) => {
      const state = get();
      return filterTodayCompletedStackViews(state.tasks, state.stacks, query ?? state.searchQuery);
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
