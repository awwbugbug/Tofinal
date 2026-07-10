import type { Task } from "@/types/task";

export type ReminderKind = "start" | "end";

export type ReminderEvent = {
  task: Task;
  kind: ReminderKind;
  atMs: number;
};

/**
 * Wall-clock schedule window for a task: the start instant and, when a
 * duration is allocated, the end instant. Local-time semantics — the planned
 * date plus the "HH:MM" start time interpreted in the user's zone.
 */
export const taskScheduleWindow = (task: Task): { startMs: number; endMs: number | null } | null => {
  if (!task.plannedDate || !task.startTime || task.deletedAt) {
    return null;
  }

  const [year, month, day] = task.plannedDate.split("-").map(Number);
  const [hours, minutes] = task.startTime.split(":").map(Number);
  if (!year || !month || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  const startMs = new Date(year, month - 1, day ?? 1, hours, minutes, 0, 0).getTime();
  const endMs = task.durationMinutes ? startMs + task.durationMinutes * 60_000 : null;
  return { startMs, endMs };
};

/** Stable dedupe key so an event never fires twice across ticks or restarts. */
export const reminderEventKey = (event: ReminderEvent) =>
  `${event.task.id}:${event.kind}:${event.atMs}`;

/**
 * Events whose instant falls inside (fromMs, toMs]. Completed tasks are
 * silent: finishing early cancels the end alert, and reopening re-arms it.
 */
export const collectReminderEvents = (tasks: Task[], fromMs: number, toMs: number): ReminderEvent[] => {
  const events: ReminderEvent[] = [];
  for (const task of tasks) {
    if (task.completed || task.deletedAt) {
      continue;
    }
    const window = taskScheduleWindow(task);
    if (!window) {
      continue;
    }
    if (window.startMs > fromMs && window.startMs <= toMs) {
      events.push({ task, kind: "start", atMs: window.startMs });
    }
    if (window.endMs !== null && window.endMs > fromMs && window.endMs <= toMs) {
      events.push({ task, kind: "end", atMs: window.endMs });
    }
  }
  return events.sort((first, second) => first.atMs - second.atMs);
};
