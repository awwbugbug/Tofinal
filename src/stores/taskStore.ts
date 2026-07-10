import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { getTaskRepository } from "@/repositories/taskRepository";
import { createSeedTaskSnapshot, createSingletonStack, normalizeTaskSnapshot, type TaskSnapshot } from "@/storage/taskStorage";
import type { AppMode, Task, TaskFilter, TaskPriority, TaskStack, TaskStackView } from "@/types/task";

type TaskState = {
  tasks: Task[];
  stacks: TaskStack[];
  selectedTaskId: string | null;
  mode: AppMode;
  activeFilter: TaskFilter;
  /** Local date key shown by the date view; defaults to today, session-only. */
  viewDateKey: string;
  searchQuery: string;
  hydrated: boolean;
  loading: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  error: string | null;
};

type TaskUpdate = Partial<Pick<Task, "title" | "note" | "priority" | "tags" | "pinned" | "plannedDate" | "startTime" | "durationMinutes">>;

type TaskActions = {
  hydrateTasks: () => Promise<void>;
  addTask: (title: string) => void;
  updateTask: (id: string, update: TaskUpdate) => boolean;
  retryPersistTasks: () => void;
  deleteTask: (id: string) => void;
  trashTask: (id: string) => boolean;
  restoreTask: (id: string) => boolean;
  getTrashedTasks: () => Task[];
  undoLastMerge: () => boolean;
  toggleTask: (id: string) => void;
  togglePinned: (id: string) => void;
  toggleStackCollapsed: (stackId: string) => void;
  reorderStacks: (sourceStackId: string, targetIndex: number, visibleStackIds?: string[]) => boolean;
  reorderTaskWithinStack: (stackId: string, taskId: string, targetIndex: number) => boolean;
  moveTaskToStack: (taskId: string, targetStackId: string, targetIndex?: number) => boolean;
  splitTaskToNewStack: (taskId: string, targetGlobalIndex: number, visibleStackIds?: string[]) => boolean;
  applySidebarDrop: (taskIds: string[], target: TaskFilter) => boolean;
  selectTask: (id: string) => void;
  setMode: (mode: AppMode) => void;
  setActiveFilter: (filter: TaskFilter) => void;
  setViewDate: (dateKey: string) => void;
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

/**
 * Local date key of an ISO timestamp. Never compare `iso.slice(0, 10)` with
 * local date keys: that slices the UTC date and misattributes completions
 * between local midnight and the UTC rollover.
 */
export const isoToLocalDateKey = (iso: string) => getLocalDateKey(new Date(iso));

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
  startTime: null,
  durationMinutes: null,
  stackId: `stack-${id}`,
  stackOrder: 0,
  completedAt: null,
  deletedAt: null,
});

const initialState = (): TaskState => ({
  tasks: [],
  stacks: [],
  selectedTaskId: null,
  mode: "normal",
  activeFilter: "today",
  viewDateKey: getLocalDateKey(),
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

const taskMatchesFilter = (task: Task, filter: TaskFilter, viewDate: string) => {
  if (filter === "today") {
    return !task.completed && task.plannedDate === viewDate;
  }

  if (filter === "all") {
    return true;
  }

  if (filter === "important") {
    return task.priority === "important" || task.priority === "urgent";
  }

  return task.pinned;
};

const filterTasks = (tasks: Task[], filter: TaskFilter, query = "", viewDate = getLocalDateKey()) =>
  applySearch(tasks.filter((task) => !task.deletedAt && taskMatchesFilter(task, filter, viewDate)), query);

const filterTodayCompletedTasks = (tasks: Task[], query = "", dateKey = getLocalDateKey()) =>
  applySearch(tasks.filter((task) => !task.deletedAt && task.completed && task.completedAt && isoToLocalDateKey(task.completedAt) === dateKey), query);

export const buildStackViews = (tasks: Task[], stacks: TaskStack[]): TaskStackView[] => {
  const tasksByStackId = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.deletedAt) {
      continue;
    }
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

const filterStackViews = (tasks: Task[], stacks: TaskStack[], filter: TaskFilter, query = "", viewDate = getLocalDateKey()) =>
  buildStackViews(tasks, stacks).filter((view) => view.tasks.some((task) => taskMatchesFilter(task, filter, viewDate)) && stackViewMatchesQuery(view, query));

const filterTodayCompletedStackViews = (tasks: Task[], stacks: TaskStack[], query = "", dateKey = getLocalDateKey()) =>
  buildStackViews(tasks, stacks).filter((view) => {
    const hasActiveOnDate = view.tasks.some((task) => !task.completed && task.plannedDate === dateKey);
    const hasCompletedOnDate = view.tasks.some((task) => task.completed && task.completedAt && isoToLocalDateKey(task.completedAt) === dateKey);
    return !hasActiveOnDate && hasCompletedOnDate && stackViewMatchesQuery(view, query);
  });

const visibleTaskIdsForViews = (views: TaskStackView[]) => new Set(views.flatMap((view) => view.tasks.map((task) => task.id)));

/** Incomplete tasks planned before today, oldest plan first (Today's overdue section). */
export const getOverdueTasks = (tasks: Task[], todayKey = getLocalDateKey()) =>
  tasks
    .filter((task) => !task.deletedAt && !task.completed && task.plannedDate !== null && task.plannedDate < todayKey)
    .sort(
      (first, second) =>
        (first.plannedDate ?? "").localeCompare(second.plannedDate ?? "") ||
        first.createdAt.localeCompare(second.createdAt) ||
        first.id.localeCompare(second.id),
    );

const selectVisibleTask = (
  tasks: Task[],
  stacks: TaskStack[],
  selectedTaskId: string | null,
  activeFilter: TaskFilter,
  searchQuery: string,
  viewDate = getLocalDateKey(),
) => {
  const visibleViews = filterStackViews(tasks, stacks, activeFilter, searchQuery, viewDate);
  const visibleTaskIds = visibleTaskIdsForViews(visibleViews);
  if (activeFilter === "today" && viewDate === getLocalDateKey()) {
    // The overdue section renders alongside Today, so its tasks stay selectable.
    getOverdueTasks(tasks).forEach((task) => visibleTaskIds.add(task.id));
  }
  if (selectedTaskId && visibleTaskIds.has(selectedTaskId)) {
    return selectedTaskId;
  }

  return visibleViews[0]?.mainTask.id ?? null;
};

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

const normalizeGlobalStackOrders = (stacks: TaskStack[], timestamp = nowIso()) =>
  [...stacks]
    .sort((first, second) => first.sortOrder - second.sortOrder || first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id))
    .map((stack, index) => ({
      ...stack,
      sortOrder: index,
      updatedAt: stack.sortOrder === index ? stack.updatedAt : timestamp,
    }));

const normalizeStackTasksAfterDelete = (tasks: Task[], stackId: string) => {
  const stackTasks = tasks
    .filter((task) => task.stackId === stackId)
    .sort((first, second) => first.stackOrder - second.stackOrder || first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
  const orderByTaskId = new Map(stackTasks.map((task, index) => [task.id, index]));
  return tasks.map((task) => (task.stackId === stackId ? { ...task, stackOrder: orderByTaskId.get(task.id) ?? task.stackOrder } : task));
};

const normalizeStackTasks = (tasks: Task[], stackId: string, timestamp = nowIso()) => {
  const stackTasks = tasks
    .filter((task) => task.stackId === stackId)
    .sort((first, second) => first.stackOrder - second.stackOrder || first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
  const orderByTaskId = new Map(stackTasks.map((task, index) => [task.id, index]));

  return tasks.map((task) => {
    if (task.stackId !== stackId) {
      return task;
    }

    const stackOrder = orderByTaskId.get(task.id) ?? task.stackOrder;
    return {
      ...task,
      stackOrder,
      updatedAt: task.stackOrder === stackOrder ? task.updatedAt : timestamp,
    };
  });
};

const reorderIds = (ids: string[], sourceId: string, targetIndex: number) => {
  const sourceIndex = ids.indexOf(sourceId);
  if (sourceIndex < 0) {
    return null;
  }

  const nextIds = [...ids];
  nextIds.splice(sourceIndex, 1);
  nextIds.splice(Math.max(0, Math.min(targetIndex, nextIds.length)), 0, sourceId);
  return nextIds;
};

const reorderStacksWithinVisibleSet = (
  stacks: TaskStack[],
  sourceStackId: string,
  targetIndex: number,
  visibleStackIds: string[] | undefined,
  timestamp = nowIso(),
) => {
  const orderedStacks = normalizeGlobalStackOrders(stacks, timestamp);
  const visibleIdSet = new Set(visibleStackIds?.length ? visibleStackIds : orderedStacks.map((stack) => stack.id));
  const visibleOrderedIds = orderedStacks.filter((stack) => visibleIdSet.has(stack.id)).map((stack) => stack.id);
  const nextVisibleIds = reorderIds(visibleOrderedIds, sourceStackId, targetIndex);

  if (!nextVisibleIds) {
    return null;
  }

  let visibleCursor = 0;
  const nextStacks = orderedStacks.map((stack) => {
    if (!visibleIdSet.has(stack.id)) {
      return stack;
    }

    const nextId = nextVisibleIds[visibleCursor];
    visibleCursor += 1;
    return orderedStacks.find((candidate) => candidate.id === nextId) ?? stack;
  });

  return nextStacks.map((stack, index) => ({
    ...stack,
    sortOrder: index,
    updatedAt: stack.sortOrder === index ? stack.updatedAt : timestamp,
  }));
};

const createStackIdForTask = (taskId: string, stacks: TaskStack[]) => {
  const preferred = `stack-${taskId}`;
  if (!stacks.some((stack) => stack.id === preferred)) {
    return preferred;
  }

  return `stack-${crypto.randomUUID()}`;
};

const createTaskStoreState: StateCreator<TaskStore> = (set, get) => {
  let saveChain = Promise.resolve();
  let latestSaveRequest = 0;
  let lastMergeSnapshot: TaskSnapshot | null = null;

  const canMutateTasks = () => get().hydrated && !get().loading;

  const queuePersistTasks = (options: { rollbackSnapshot?: TaskSnapshot } = {}) => {
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
          set({
            ...(options.rollbackSnapshot
              ? {
                  tasks: options.rollbackSnapshot.tasks,
                  stacks: options.rollbackSnapshot.stacks ?? [],
                  selectedTaskId: selectVisibleTask(options.rollbackSnapshot.tasks, options.rollbackSnapshot.stacks ?? [], get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey),
                }
              : {}),
            saving: false,
            error: errorMessage(error),
          });
        }
      });
  };

  const persistStackMutation = (previousSnapshot: TaskSnapshot) => {
    queuePersistTasks({ rollbackSnapshot: previousSnapshot });
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
        const selectedTaskId = selectVisibleTask(snapshot.tasks, snapshot.stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

        set({
          tasks: snapshot.tasks,
          stacks: snapshot.stacks,
          selectedTaskId,
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
      // Quick add in the date view plans the task for the selected date.
      const plannedDate = get().activeFilter === "today" ? get().viewDateKey : null;
      const task = createTask(`task-${crypto.randomUUID()}`, trimmedTitle, "", "normal", [], timestamp, plannedDate);
      const minSortOrder = Math.min(0, ...get().stacks.map((stack) => stack.sortOrder));
      const stack = createSingletonStack(task, minSortOrder - 1);
      const tasks = [task, ...get().tasks];
      const stacks = [stack, ...get().stacks];

      set({ tasks, stacks, selectedTaskId: task.id });
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

        const next = {
          ...task,
          ...update,
          title: nextTitle,
          tags: update.tags ? normalizeTags(update.tags) : task.tags,
          updatedAt: timestamp,
        };
        // Time-scheduling invariants: a start time needs a date to anchor to
        // (default today); clearing the date clears the start time; and a
        // duration is meaningless without a start time.
        if (update.startTime && !next.plannedDate) {
          next.plannedDate = getLocalDateKey();
        }
        if (update.plannedDate === null) {
          next.startTime = null;
        }
        if (next.startTime === null) {
          next.durationMinutes = null;
        }
        return next;
      });
      const selectedTaskId = selectVisibleTask(tasks, get().stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

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

      const selectedTaskId = selectVisibleTask(tasks, stacks, get().selectedTaskId === id ? null : get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

      set({ tasks, stacks, selectedTaskId });
      queuePersistTasks();
    },
    trashTask: (id) => {
      if (!canMutateTasks()) {
        return false;
      }

      const task = get().tasks.find((candidate) => candidate.id === id && !candidate.deletedAt);
      if (!task) {
        return false;
      }

      lastMergeSnapshot = null;
      const timestamp = nowIso();
      let tasks = get().tasks;
      let stacks = get().stacks;
      const stackMates = tasks.filter((candidate) => candidate.stackId === task.stackId && candidate.id !== id);

      if (stackMates.length === 0) {
        // Already a singleton: keep the stack row; hiding the task hides the view.
        tasks = tasks.map((candidate) =>
          candidate.id === id ? { ...candidate, deletedAt: timestamp, updatedAt: timestamp } : candidate,
        );
      } else {
        // Detach into a fresh singleton stack so restore always lands cleanly.
        const trashStackId = createStackIdForTask(id, stacks);
        const maxSortOrder = Math.max(0, ...stacks.map((stack) => stack.sortOrder));
        tasks = tasks.map((candidate) =>
          candidate.id === id
            ? { ...candidate, deletedAt: timestamp, updatedAt: timestamp, stackId: trashStackId, stackOrder: 0 }
            : candidate,
        );
        tasks = normalizeStackTasks(tasks, task.stackId, timestamp);
        stacks = [
          ...stacks,
          { id: trashStackId, sortOrder: maxSortOrder + 1, collapsed: true, createdAt: timestamp, updatedAt: timestamp },
        ];
      }

      const selectedTaskId = selectVisibleTask(tasks, stacks, get().selectedTaskId === id ? null : get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

      set({ tasks, stacks, selectedTaskId });
      queuePersistTasks();
      return true;
    },
    restoreTask: (id) => {
      if (!canMutateTasks()) {
        return false;
      }

      const task = get().tasks.find((candidate) => candidate.id === id && candidate.deletedAt);
      if (!task) {
        return false;
      }

      const timestamp = nowIso();
      const minSortOrder = Math.min(0, ...get().stacks.map((stack) => stack.sortOrder));
      const tasks = get().tasks.map((candidate) =>
        candidate.id === id ? { ...candidate, deletedAt: null, updatedAt: timestamp, stackOrder: 0 } : candidate,
      );
      const hasStackRow = get().stacks.some((stack) => stack.id === task.stackId);
      const stacks = hasStackRow
        ? get().stacks.map((stack) =>
            stack.id === task.stackId ? { ...stack, sortOrder: minSortOrder - 1, updatedAt: timestamp } : stack,
          )
        : [
            { id: task.stackId, sortOrder: minSortOrder - 1, collapsed: true, createdAt: timestamp, updatedAt: timestamp },
            ...get().stacks,
          ];

      set({ tasks, stacks, selectedTaskId: id });
      queuePersistTasks();
      return true;
    },
    getTrashedTasks: () =>
      get().tasks
        .filter((task) => task.deletedAt)
        .sort((first, second) => (second.deletedAt ?? "").localeCompare(first.deletedAt ?? "")),
    undoLastMerge: () => {
      if (!lastMergeSnapshot || !canMutateTasks()) {
        return false;
      }

      const snapshot = lastMergeSnapshot;
      lastMergeSnapshot = null;
      const stacks = snapshot.stacks ?? [];
      const selectedTaskId = selectVisibleTask(snapshot.tasks, stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

      set({ tasks: snapshot.tasks, stacks, selectedTaskId });
      queuePersistTasks();
      return true;
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
      const selectedTaskId = selectVisibleTask(tasks, get().stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

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
    reorderStacks: (sourceStackId, targetIndex, visibleStackIds) => {
      if (!canMutateTasks()) {
        return false;
      }

      const previousSnapshot = snapshotFromState(get().tasks, get().stacks);
      const timestamp = nowIso();
      const stacks = reorderStacksWithinVisibleSet(get().stacks, sourceStackId, targetIndex, visibleStackIds, timestamp);
      if (!stacks) {
        set({ error: "Invalid stack reorder target." });
        return false;
      }

      set({ stacks });
      persistStackMutation(previousSnapshot);
      return true;
    },
    reorderTaskWithinStack: (stackId, taskId, targetIndex) => {
      if (!canMutateTasks()) {
        return false;
      }

      const stackTasks = get().tasks
        .filter((task) => task.stackId === stackId)
        .sort((first, second) => first.stackOrder - second.stackOrder || first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
      const sourceIndex = stackTasks.findIndex((task) => task.id === taskId);
      if (sourceIndex < 0) {
        set({ error: "Task is missing from the source stack." });
        return false;
      }

      const previousSnapshot = snapshotFromState(get().tasks, get().stacks);
      const timestamp = nowIso();
      const nextStackTasks = [...stackTasks];
      const [movedTask] = nextStackTasks.splice(sourceIndex, 1);
      nextStackTasks.splice(Math.max(0, Math.min(targetIndex, nextStackTasks.length)), 0, movedTask);
      const orderByTaskId = new Map(nextStackTasks.map((task, index) => [task.id, index]));
      const tasks = get().tasks.map((task) => task.stackId === stackId
        ? {
            ...task,
            stackOrder: orderByTaskId.get(task.id) ?? task.stackOrder,
            updatedAt: task.id === taskId || task.stackOrder !== (orderByTaskId.get(task.id) ?? task.stackOrder) ? timestamp : task.updatedAt,
          }
        : task,
      );
      const selectedTaskId = selectVisibleTask(tasks, get().stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

      set({ tasks, selectedTaskId });
      persistStackMutation(previousSnapshot);
      return true;
    },
    moveTaskToStack: (taskId, targetStackId, targetIndex) => {
      if (!canMutateTasks()) {
        return false;
      }

      const movedTask = get().tasks.find((task) => task.id === taskId);
      const targetStack = get().stacks.find((stack) => stack.id === targetStackId);
      if (!movedTask || !targetStack) {
        set({ error: movedTask ? "Target stack is missing." : "Task is missing." });
        return false;
      }

      if (movedTask.stackId === targetStackId) {
        return get().reorderTaskWithinStack(targetStackId, taskId, targetIndex ?? Number.MAX_SAFE_INTEGER);
      }

      const previousSnapshot = snapshotFromState(get().tasks, get().stacks);
      const timestamp = nowIso();
      const sourceStackId = movedTask.stackId;
      const targetTasks = get().tasks
        .filter((task) => task.stackId === targetStackId)
        .sort((first, second) => first.stackOrder - second.stackOrder || first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
      const insertIndex = Math.max(0, Math.min(targetIndex ?? targetTasks.length, targetTasks.length));
      const nextTargetTaskIds = targetTasks.map((task) => task.id);
      nextTargetTaskIds.splice(insertIndex, 0, taskId);
      const targetOrderByTaskId = new Map(nextTargetTaskIds.map((id, index) => [id, index]));
      let tasks = get().tasks.map((task) => {
        if (task.id === taskId) {
          return {
            ...task,
            stackId: targetStackId,
            stackOrder: targetOrderByTaskId.get(taskId) ?? insertIndex,
            updatedAt: timestamp,
          };
        }

        if (task.stackId === targetStackId) {
          return {
            ...task,
            stackOrder: targetOrderByTaskId.get(task.id) ?? task.stackOrder,
            updatedAt: task.stackOrder === (targetOrderByTaskId.get(task.id) ?? task.stackOrder) ? task.updatedAt : timestamp,
          };
        }

        return task;
      });
      tasks = normalizeStackTasks(tasks, sourceStackId, timestamp);
      const sourceStillHasTasks = tasks.some((task) => task.stackId === sourceStackId);
      const stacks = get().stacks
        .filter((stack) => stack.id !== sourceStackId || sourceStillHasTasks)
        .map((stack) => stack.id === targetStackId ? { ...stack, updatedAt: timestamp } : stack);
      const selectedTaskId = selectVisibleTask(tasks, stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);

      lastMergeSnapshot = previousSnapshot;
      set({ tasks, stacks: normalizeGlobalStackOrders(stacks, timestamp), selectedTaskId });
      persistStackMutation(previousSnapshot);
      return true;
    },
    splitTaskToNewStack: (taskId, targetGlobalIndex, visibleStackIds) => {
      if (!canMutateTasks()) {
        return false;
      }

      const movedTask = get().tasks.find((task) => task.id === taskId);
      if (!movedTask) {
        set({ error: "Task is missing." });
        return false;
      }

      const sourceTasks = get().tasks.filter((task) => task.stackId === movedTask.stackId);
      if (sourceTasks.length <= 1) {
        set({ error: "Cannot split a singleton stack." });
        return false;
      }

      const previousSnapshot = snapshotFromState(get().tasks, get().stacks);
      const timestamp = nowIso();
      const newStackId = createStackIdForTask(taskId, get().stacks);
      const sourceStack = get().stacks.find((stack) => stack.id === movedTask.stackId);
      const newStack: TaskStack = {
        id: newStackId,
        sortOrder: 0,
        collapsed: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      let tasks = get().tasks.map((task) => task.id === taskId
        ? { ...task, stackId: newStackId, stackOrder: 0, updatedAt: timestamp }
        : task,
      );
      tasks = normalizeStackTasks(tasks, movedTask.stackId, timestamp);
      const baseStacks = [...get().stacks.map((stack) => stack.id === sourceStack?.id ? { ...stack, updatedAt: timestamp } : stack), newStack];
      const visibleIds = [...(visibleStackIds?.length ? visibleStackIds : normalizeGlobalStackOrders(get().stacks).map((stack) => stack.id)), newStackId];
      const stacks = reorderStacksWithinVisibleSet(baseStacks, newStackId, targetGlobalIndex, visibleIds, timestamp);
      if (!stacks) {
        set({ error: "Invalid split target." });
        return false;
      }

      const selectedTaskId = selectVisibleTask(tasks, stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);
      set({ tasks, stacks, selectedTaskId });
      persistStackMutation(previousSnapshot);
      return true;
    },
    applySidebarDrop: (taskIds, target) => {
      if (!canMutateTasks() || taskIds.length === 0) {
        return false;
      }

      const idSet = new Set(taskIds);
      const timestamp = nowIso();
      // The sidebar date target plans to the currently selected view date.
      const today = get().viewDateKey;
      let changed = false;
      const tasks = get().tasks.map((task) => {
        if (!idSet.has(task.id)) {
          return task;
        }

        const next = { ...task };
        if (target === "today" && task.plannedDate !== today) {
          next.plannedDate = today;
        } else if (target === "all" && task.plannedDate !== null) {
          next.plannedDate = null;
        } else if (target === "important" && task.priority !== "important") {
          next.priority = "important";
        } else if (target === "pinned" && !task.pinned) {
          next.pinned = true;
        } else {
          return task;
        }

        changed = true;
        next.updatedAt = timestamp;
        return next;
      });

      if (!changed) {
        return false;
      }

      const selectedTaskId = selectVisibleTask(tasks, get().stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, get().viewDateKey);
      set({ tasks, selectedTaskId });
      queuePersistTasks();
      return true;
    },
    selectTask: (id) => {
      set({ selectedTaskId: id });
    },
    setMode: (mode) => {
      set({ mode });
    },
    setActiveFilter: (activeFilter) => {
      const selectedTaskId = selectVisibleTask(get().tasks, get().stacks, get().selectedTaskId, activeFilter, get().searchQuery, get().viewDateKey);
      set({ activeFilter, selectedTaskId });
    },
    setSearchQuery: (searchQuery) => {
      const selectedTaskId = selectVisibleTask(get().tasks, get().stacks, get().selectedTaskId, get().activeFilter, searchQuery, get().viewDateKey);
      set({ searchQuery, selectedTaskId });
    },
    setViewDate: (viewDateKey) => {
      const selectedTaskId = selectVisibleTask(get().tasks, get().stacks, get().selectedTaskId, get().activeFilter, get().searchQuery, viewDateKey);
      set({ viewDateKey, selectedTaskId });
    },
    getFilteredTasks: (filter, query) => {
      const state = get();
      return filterTasks(state.tasks, filter ?? state.activeFilter, query ?? state.searchQuery, state.viewDateKey);
    },
    getTodayCompletedTasks: (query) => {
      const state = get();
      return filterTodayCompletedTasks(state.tasks, query ?? state.searchQuery, state.viewDateKey);
    },
    getStackViews: (filter, query) => {
      const state = get();
      return filterStackViews(state.tasks, state.stacks, filter ?? state.activeFilter, query ?? state.searchQuery, state.viewDateKey);
    },
    getTodayCompletedStackViews: (query) => {
      const state = get();
      return filterTodayCompletedStackViews(state.tasks, state.stacks, query ?? state.searchQuery, state.viewDateKey);
    },
  };
};

export const getTasksForFilter = (tasks: Task[], filter: TaskFilter, viewDate = getLocalDateKey()) =>
  filterTasks(tasks, filter, "", viewDate);

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
