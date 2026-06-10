import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { localTaskRepository } from "@/repositories/taskRepository";
import { createSeedTasks } from "@/storage/taskStorage";
import type { AppMode, Task, TaskFilter, TaskPriority } from "@/types/task";

type TaskState = {
  tasks: Task[];
  selectedTaskId: string | null;
  mode: AppMode;
  activeFilter: TaskFilter;
  searchQuery: string;
};

type TaskUpdate = Partial<Pick<Task, "title" | "note" | "priority" | "tags" | "pinned">>;

type TaskActions = {
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

const initialState = (): TaskState => {
  const tasks = localTaskRepository.loadSnapshot().tasks;

  return {
    tasks,
    selectedTaskId: tasks[0]?.id ?? null,
    mode: "normal",
    activeFilter: "today",
    searchQuery: "",
  };
};

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

const persistTasks = (tasks: Task[]) => {
  localTaskRepository.saveSnapshot({ tasks });
};

const createTaskStoreState: StateCreator<TaskStore> = (set, get) => ({
  ...initialState(),
  addTask: (title) => {
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
    persistTasks(tasks);
  },
  updateTask: (id, update) => {
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
    persistTasks(tasks);
    return true;
  },
  deleteTask: (id) => {
    const tasks = get().tasks.filter((task) => task.id !== id);
    const selectedTaskId = selectVisibleTask(tasks, get().selectedTaskId === id ? null : get().selectedTaskId, get().activeFilter, get().searchQuery);

    set({ tasks, selectedTaskId });
    persistTasks(tasks);
  },
  toggleTask: (id) => {
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
    persistTasks(tasks);
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
});

export const getTasksForFilter = (tasks: Task[], filter: TaskFilter) => filterTasks(tasks, filter);

export const createTaskStore = () => createStore<TaskStore>()(createTaskStoreState);

export const useTaskStore: UseBoundStore<StoreApi<TaskStore>> = create<TaskStore>()(createTaskStoreState);

export const resetTaskStore = () => {
  const tasks = createSeedTasks();

  useTaskStore.setState({
    tasks,
    selectedTaskId: tasks[0]?.id ?? null,
    mode: "normal",
    activeFilter: "today",
    searchQuery: "",
  });
};
