import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { AlertCircle, CircleDot, Flag, Layers3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskTimeBadge } from "@/components/task/TaskTimeBadge";
import { useI18n } from "@/i18n/useI18n";
import { cn } from "@/lib/utils";
import { getLocalDateKey } from "@/stores/taskStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { Task } from "@/types/task";

type TaskItemProps = {
  task: Task;
  selected?: boolean;
  compact?: boolean;
  subtask?: boolean;
  stackCount?: number;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

const priorityIcon = {
  normal: CircleDot,
  important: Flag,
  urgent: AlertCircle,
};

const priorityClassName = {
  normal: "border-transparent bg-[var(--normal-bg)] text-[var(--normal-text)]",
  important: "border-transparent bg-[var(--important-bg)] text-[var(--important-text)]",
  urgent: "border-transparent bg-[var(--urgent-bg)] text-[var(--urgent-text)]",
};

const CONFETTI_COLORS = ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#fcff42", "#ffa62d", "#ff36ff"];
const CONFETTI_PARTICLE_COUNT = 150;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const supportsCanvasConfetti = () => {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    const getContext = canvas.getContext as HTMLCanvasElement["getContext"] & { mock?: unknown };
    if (navigator.userAgent.includes("jsdom") && !getContext.mock) {
      return false;
    }

    return Boolean(getContext.call(canvas, "2d"));
  } catch {
    return false;
  }
};

const fireCompletionConfetti = (element: HTMLElement | null) => {
  if (!element || typeof window === "undefined" || prefersReducedMotion() || !supportsCanvasConfetti()) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  const defaults = {
    origin: { x, y },
    zIndex: 100,
    colors: CONFETTI_COLORS,
  };
  const fire = (particleRatio: number, options: confetti.Options) => {
    void confetti({
      ...defaults,
      ...options,
      particleCount: Math.floor(CONFETTI_PARTICLE_COUNT * particleRatio),
    });
  };

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, {
    spread: 60,
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
};

const dateKeyToUtc = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year || 0, (month || 1) - 1, day || 1);
};

type PlannedLabel = {
  text: string;
  overdue: boolean;
};

export function TaskItem({ compact = false, onSelect, onToggle, selected = false, stackCount, subtask = false, task }: TaskItemProps) {
  const { t } = useI18n();
  const completionCelebrationsEnabled = usePreferencesStore((state) => state.completionCelebrationsEnabled);
  const language = usePreferencesStore((state) => state.language);
  const PriorityIcon = priorityIcon[task.priority];

  // Planned-date label, self-computed: red "overdue Nd" for past dates,
  // "tomorrow" or a short date for the future, nothing for today/unplanned.
  // The stack count chip wins the shared corner slot.
  const plannedLabel = ((): PlannedLabel | null => {
    if (compact || task.completed || !task.plannedDate || (typeof stackCount === "number" && stackCount > 1)) {
      return null;
    }

    const todayKey = getLocalDateKey();
    if (task.plannedDate === todayKey) {
      return null;
    }

    if (task.plannedDate < todayKey) {
      const days = Math.max(1, Math.round((dateKeyToUtc(todayKey) - dateKeyToUtc(task.plannedDate)) / 86400000));
      return { text: `${t("task.overdueBadgePrefix")}${days}${t("task.overdueBadgeSuffix")}`, overdue: true };
    }

    const [year, month, day] = todayKey.split("-").map(Number);
    const tomorrowKey = getLocalDateKey(new Date(year || 1970, (month || 1) - 1, (day || 1) + 1));
    if (task.plannedDate === tomorrowKey) {
      return { text: t("date.tomorrow"), overdue: false };
    }

    const [plannedYear, plannedMonth, plannedDay] = task.plannedDate.split("-").map(Number);
    const plannedDate = new Date(plannedYear || 1970, (plannedMonth || 1) - 1, plannedDay || 1);
    const locale = language === "en-US" ? "en-US" : "zh-CN";
    return {
      text: new Intl.DateTimeFormat(locale, { month: language === "en-US" ? "short" : "long", day: "numeric" }).format(plannedDate),
      overdue: false,
    };
  })();
  const hasStackCount = typeof stackCount === "number" && stackCount > 1;
  const itemRef = useRef<HTMLElement | null>(null);
  // The corner slot fits one chip; stack count and date labels outrank the
  // time badge (a future-dated task shows its date until the day arrives).
  const showTimeBadge = Boolean(task.startTime) && !task.completed && !hasStackCount && !plannedLabel;
  const previousCompletedRef = useRef(task.completed);
  const completionCelebrationHandledRef = useRef(false);
  // The store toggle may be delayed to let the exit animation play, so the
  // checkbox flips optimistically the moment it is clicked.
  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean | null>(null);
  const displayCompleted = optimisticCompleted ?? task.completed;

  useEffect(() => {
    setOptimisticCompleted(null);
  }, [task.completed]);

  useEffect(() => {
    const wasCompleted = previousCompletedRef.current;
    previousCompletedRef.current = task.completed;

    if (!task.completed) {
      completionCelebrationHandledRef.current = false;
      return;
    }

    if (!wasCompleted && !completionCelebrationHandledRef.current && completionCelebrationsEnabled) {
      completionCelebrationHandledRef.current = true;
      fireCompletionConfetti(itemRef.current);
    }
  }, [completionCelebrationsEnabled, task.completed]);

  return (
    <article
      className={cn(
        "task-card-shell group relative cursor-pointer rounded-[22px] border p-3.5 transition-all duration-200 ease-out hover:z-10 active:scale-[1.004]",
        selected
          ? "z-10 scale-[1.012] border-[color-mix(in_srgb,var(--accent)_38%,var(--border-medium))] bg-[color-mix(in_srgb,var(--accent-surface)_82%,var(--surface-elevated))] shadow-[var(--shadow-card-around)]"
          : "scale-100 border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-card)_64%,transparent)] hover:scale-[1.004] hover:border-[var(--border-medium)] hover:bg-[var(--surface-card-hover)] hover:shadow-[var(--shadow-card-hover)]",
        displayCompleted && "opacity-70",
        compact && "rounded-[18px] p-2.5 hover:bg-[var(--surface-card-hover)]",
        subtask && "rounded-[18px] bg-[color-mix(in_srgb,var(--surface-card)_44%,transparent)] p-3 shadow-none hover:scale-[1.002]",
      )}
      data-selected={selected ? "true" : "false"}
      data-task-card-id={task.id}
      data-testid="task-card"
      onClick={() => onSelect(task.id)}
      ref={itemRef}
    >
      <div
        className={cn(
          "task-card-grid grid min-w-0 items-start gap-x-3 gap-y-1",
          compact
            ? (hasStackCount ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)]")
            : "grid-cols-[auto_minmax(0,1fr)_auto]",
        )}
        data-testid="task-card-grid"
      >
        <Checkbox
          aria-label={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
          checked={displayCompleted}
          onChange={(event) => {
            event.stopPropagation();
            setOptimisticCompleted(!task.completed);
            if (!task.completed && completionCelebrationsEnabled) {
              completionCelebrationHandledRef.current = true;
              fireCompletionConfetti(itemRef.current);
            }
            onToggle(task.id);
          }}
        />
        <h3
          className={cn(
            "min-w-0 truncate text-sm font-medium leading-5",
            displayCompleted ? "text-[var(--text-faint)] line-through" : "text-[var(--text-secondary)]",
          )}
        >
          {task.title}
        </h3>
        {!compact && (
          <Badge className={cn("shrink-0 justify-self-end gap-1 self-start", priorityClassName[task.priority])}>
            <PriorityIcon className="h-3 w-3" />
            {t(`priority.${task.priority}`)}
          </Badge>
        )}
        {!compact && <p className="col-start-2 min-w-0 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{task.note}</p>}
        {plannedLabel && (
          <span
            className={cn(
              "col-start-3 row-start-2 self-end justify-self-end text-[11px] font-medium leading-none",
              plannedLabel.overdue ? "task-overdue-label" : "text-[var(--text-faint)]",
            )}
            data-testid={plannedLabel.overdue ? "task-overdue-label" : "task-planned-label"}
          >
            {plannedLabel.text}
          </span>
        )}
        {hasStackCount && (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex items-center gap-1 justify-self-end leading-none text-[var(--text-faint)]",
              compact
                ? "col-start-3 row-start-1 self-center text-[10px]"
                : "col-start-3 row-start-2 self-end text-[11px]",
            )}
            data-testid="task-stack-count"
          >
            <Layers3 className="h-3 w-3" />
            {stackCount}
          </span>
        )}
        {!compact && showTimeBadge && (
          <span className="col-start-3 row-start-2 self-end justify-self-end">
            <TaskTimeBadge task={task} />
          </span>
        )}
        {compact && showTimeBadge && (
          <span className="col-start-2 min-w-0">
            <TaskTimeBadge compact task={task} />
          </span>
        )}
        {compact && !showTimeBadge && task.tags[0] && <p className="col-start-2 min-w-0 truncate text-[11px] text-[var(--text-faint)]">{task.tags[0]}</p>}
      </div>
    </article>
  );
}





