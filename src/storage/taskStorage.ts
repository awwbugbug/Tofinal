import type { Task, TaskStack } from "@/types/task";

export const TASK_STORAGE_KEY = "tofinal.tasks.v1";

const STORAGE_VERSION = 1;

export type TaskSnapshot = {
  tasks: Task[];
  stacks?: TaskStack[];
};

export type NormalizedTaskSnapshot = {
  tasks: Task[];
  stacks: TaskStack[];
};

export type StoredTaskSnapshotResult =
  | { status: "valid"; snapshot: NormalizedTaskSnapshot }
  | { status: "missing" }
  | { status: "invalid"; error: string };

const nowIso = () => new Date().toISOString();

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const singletonStackIdForTask = (taskId: string) => `stack-${taskId}`;

export const createSingletonStack = (task: Pick<Task, "id" | "createdAt" | "updatedAt">, sortOrder: number): TaskStack => ({
  id: singletonStackIdForTask(task.id),
  sortOrder,
  collapsed: true,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

export const normalizeTaskSnapshot = (snapshot: TaskSnapshot): NormalizedTaskSnapshot => {
  const stacksById = new Map((snapshot.stacks ?? []).map((stack) => [stack.id, stack]));
  const tasks = snapshot.tasks.map((task) => {
    const stackId = task.stackId || singletonStackIdForTask(task.id);
    return {
      ...task,
      stackId,
      stackOrder: Number.isFinite(task.stackOrder) ? task.stackOrder : 0,
    };
  });

  const stacks: TaskStack[] = [];
  const seenStackIds = new Set<string>();
  tasks.forEach((task, index) => {
    if (seenStackIds.has(task.stackId)) {
      return;
    }

    seenStackIds.add(task.stackId);
    const existingStack = stacksById.get(task.stackId);
    stacks.push(existingStack ?? {
      id: task.stackId,
      sortOrder: index,
      collapsed: true,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  });

  return {
    tasks,
    stacks: stacks.sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.createdAt.localeCompare(second.createdAt) ||
        first.id.localeCompare(second.id),
    ),
  };
};

const createSeedTask = (
  id: string,
  title: string,
  note: string,
  priority: Task["priority"],
  tags: string[],
  createdAt: string,
  plannedDate: string | null = null,
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
  stackId: singletonStackIdForTask(id),
  stackOrder: 0,
  completedAt: null,
});

export const createSeedTasks = (): Task[] => {
  const today = getLocalDateKey();

  return [
    createSeedTask(
      "task-1",
      "Finalize the first-stage desktop shell",
      "Keep the foundation focused: Tauri, React, Tailwind, shadcn/ui, Zustand, and the two UI modes.",
      "important",
      ["foundation", "ui"],
      "2026-06-08T08:20:00.000Z",
      today,
    ),
    createSeedTask(
      "task-2",
      "Sketch the desktop pin interaction",
      "Prototype the compact state without WorkerW or advanced Windows desktop embedding.",
      "normal",
      ["prototype"],
      "2026-06-08T08:35:00.000Z",
      today,
    ),
    createSeedTask(
      "task-3",
      "Review lightweight state boundaries",
      "Keep all task data in memory for this stage and avoid persistence.",
      "urgent",
      ["state"],
      "2026-06-08T09:00:00.000Z",
      today,
    ),
    createSeedTask(
      "task-4",
      "Tune quiet macOS-style spacing",
      "Prefer soft borders, clear hierarchy, and a restrained neutral palette.",
      "normal",
      ["visual"],
      "2026-06-08T09:20:00.000Z",
      today,
    ),
  ];
};

export const createSeedTaskSnapshot = (): NormalizedTaskSnapshot => normalizeTaskSnapshot({ tasks: createSeedTasks() });

const isPriority = (value: unknown): value is Task["priority"] =>
  value === "normal" || value === "important" || value === "urgent";

export const normalizeStoredTask = (value: unknown): Task | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Task>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.note !== "string" ||
    typeof candidate.completed !== "boolean" ||
    !isPriority(candidate.priority) ||
    !Array.isArray(candidate.tags) ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title,
    note: candidate.note,
    completed: candidate.completed,
    priority: candidate.priority,
    pinned: typeof candidate.pinned === "boolean" ? candidate.pinned : false,
    tags: candidate.tags.filter((tag): tag is string => typeof tag === "string"),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    plannedDate: typeof candidate.plannedDate === "string" ? candidate.plannedDate : null,
    stackId: typeof candidate.stackId === "string" ? candidate.stackId : singletonStackIdForTask(candidate.id),
    stackOrder: typeof candidate.stackOrder === "number" && Number.isFinite(candidate.stackOrder) ? candidate.stackOrder : 0,
    completedAt: typeof candidate.completedAt === "string" ? candidate.completedAt : null,
  };
};

const normalizeStoredStack = (value: unknown): TaskStack | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TaskStack>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.sortOrder !== "number" ||
    typeof candidate.collapsed !== "boolean" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    sortOrder: candidate.sortOrder,
    collapsed: candidate.collapsed,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
};

const storage = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
};

export const loadStoredTaskSnapshot = (): StoredTaskSnapshotResult => {
  try {
    const localStorage = storage();
    const raw = localStorage?.getItem(TASK_STORAGE_KEY);

    if (!raw) {
      return { status: "missing" };
    }

    const parsed = JSON.parse(raw) as { tasks?: unknown; stacks?: unknown };
    if (!Array.isArray(parsed.tasks)) {
      return { status: "invalid", error: "Stored task snapshot does not contain a tasks array." };
    }

    const tasks = parsed.tasks.map(normalizeStoredTask);
    if (tasks.some((task) => task === null)) {
      return { status: "invalid", error: "Stored task snapshot contains invalid task records." };
    }

    const stacks = Array.isArray(parsed.stacks) ? parsed.stacks.map(normalizeStoredStack) : undefined;
    if (stacks?.some((stack) => stack === null)) {
      return { status: "invalid", error: "Stored task snapshot contains invalid stack records." };
    }

    return {
      status: "valid",
      snapshot: normalizeTaskSnapshot({ tasks: tasks as Task[], stacks: stacks as TaskStack[] | undefined }),
    };
  } catch (error) {
    return {
      status: "invalid",
      error: error instanceof Error ? error.message : "Unable to parse stored task snapshot.",
    };
  }
};

export const loadTaskSnapshot = (): NormalizedTaskSnapshot => {
  const storedSnapshot = loadStoredTaskSnapshot();

  if (storedSnapshot.status === "valid") {
    return storedSnapshot.snapshot;
  }

  return createSeedTaskSnapshot();
};

export const saveTaskSnapshot = (snapshot: TaskSnapshot) => {
  try {
    const normalizedSnapshot = normalizeTaskSnapshot(snapshot);
    storage()?.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        savedAt: nowIso(),
        tasks: normalizedSnapshot.tasks,
        stacks: normalizedSnapshot.stacks,
      }),
    );
  } catch {
    // localStorage is best-effort; UI state should keep working if writes fail.
  }
};
