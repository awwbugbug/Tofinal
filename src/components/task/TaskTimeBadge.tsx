import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

import { taskScheduleWindow } from "@/lib/timeReminders";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/task";

// Minute-granularity countdown; a 30s tick keeps it honest without churn.
const TICK_MS = 30_000;

const RING_RADIUS = 5.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const formatRemaining = (remainingMs: number) => {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
};

type BadgeState = "upcoming" | "active" | "over" | "started";

/**
 * Corner time chip for scheduled tasks: the start time before it arrives, a
 * live countdown ring + remaining label while the allocated duration burns
 * down, and an urgent full ring once it has run out. Wall-clock derived, so
 * it self-corrects across restarts and sleep; only scheduled cards tick.
 */
export function TaskTimeBadge({ compact = false, task }: { task: Task; compact?: boolean }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const schedule = task.completed ? null : taskScheduleWindow(task);

  useEffect(() => {
    if (!schedule) {
      return undefined;
    }
    const intervalId = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [schedule !== null]);

  if (!schedule) {
    return null;
  }

  const state: BadgeState =
    nowMs < schedule.startMs
      ? "upcoming"
      : schedule.endMs === null
        ? "started"
        : nowMs < schedule.endMs
          ? "active"
          : "over";

  const remainingFraction =
    state === "active" && schedule.endMs !== null
      ? Math.max(0, Math.min(1, (schedule.endMs - nowMs) / (schedule.endMs - schedule.startMs)))
      : state === "over"
        ? 1
        : 0;

  const label =
    state === "active" && schedule.endMs !== null ? formatRemaining(schedule.endMs - nowMs) : task.startTime;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium leading-none tabular-nums",
        compact ? "text-[10px]" : "text-[11px]",
        state === "upcoming" && "text-[var(--text-faint)]",
        state === "started" && "text-[var(--accent-hover)]",
        state === "active" && "text-[var(--accent-hover)]",
        state === "over" && "text-[var(--urgent-text)]",
      )}
      data-state={state}
      data-testid="task-time-badge"
    >
      {state === "active" || state === "over" ? (
        <svg aria-hidden="true" className="-rotate-90" height={14} viewBox="0 0 14 14" width={14}>
          <circle cx="7" cy="7" fill="none" opacity="0.25" r={RING_RADIUS} stroke="currentColor" strokeWidth="2" />
          <circle
            cx="7"
            cy="7"
            fill="none"
            r={RING_RADIUS}
            stroke="currentColor"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - remainingFraction)}
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      ) : (
        <Clock3 aria-hidden="true" className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
