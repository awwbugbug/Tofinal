import type { Task } from "@/types/task";

export const TASK_STORAGE_KEY = "tofinal.tasks.v1";

const STORAGE_VERSION = 1;

export type TaskSnapshot = {
  tasks: Task[];
};

const nowIso = () => new Date().toISOString();

const createSeedTask = (
  id: string,
  title: string,
  note: string,
  priority: Task["priority"],
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

export const createSeedTasks = (): Task[] => [
  createSeedTask(
    "task-1",
    "Finalize the first-stage desktop shell",
    "Keep the foundation focused: Tauri, React, Tailwind, shadcn/ui, Zustand, and the two UI modes.",
    "important",
    ["foundation", "ui"],
    "2026-06-08T08:20:00.000Z",
  ),
  createSeedTask(
    "task-2",
    "Sketch the desktop pin interaction",
    "Prototype the compact state without WorkerW or advanced Windows desktop embedding.",
    "normal",
    ["prototype"],
    "2026-06-08T08:35:00.000Z",
  ),
  createSeedTask(
    "task-3",
    "Review lightweight state boundaries",
    "Keep all task data in memory for this stage and avoid persistence.",
    "urgent",
    ["state"],
    "2026-06-08T09:00:00.000Z",
  ),
  createSeedTask(
    "task-4",
    "Tune quiet macOS-style spacing",
    "Prefer soft borders, clear hierarchy, and a restrained neutral palette.",
    "normal",
    ["visual"],
    "2026-06-08T09:20:00.000Z",
  ),
];

const isPriority = (value: unknown): value is Task["priority"] =>
  value === "normal" || value === "important" || value === "urgent";

const normalizeTask = (value: unknown): Task | null => {
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
    completedAt: typeof candidate.completedAt === "string" ? candidate.completedAt : null,
  };
};

const storage = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
};

export const loadTaskSnapshot = (): TaskSnapshot => {
  try {
    const localStorage = storage();
    const raw = localStorage?.getItem(TASK_STORAGE_KEY);

    if (!raw) {
      return { tasks: createSeedTasks() };
    }

    const parsed = JSON.parse(raw) as { tasks?: unknown };
    if (!Array.isArray(parsed.tasks)) {
      return { tasks: createSeedTasks() };
    }

    const tasks = parsed.tasks.map(normalizeTask);
    if (tasks.some((task) => task === null)) {
      return { tasks: createSeedTasks() };
    }

    return { tasks: tasks as Task[] };
  } catch {
    return { tasks: createSeedTasks() };
  }
};

export const saveTaskSnapshot = (snapshot: TaskSnapshot) => {
  try {
    storage()?.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        savedAt: nowIso(),
        tasks: snapshot.tasks,
      }),
    );
  } catch {
    // localStorage is best-effort in phase 2; UI state should keep working if writes fail.
  }
};
