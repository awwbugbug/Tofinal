import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { AlertCircle, CircleDot, Flag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/i18n/useI18n";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { Task } from "@/types/task";

type TaskItemProps = {
  task: Task;
  selected?: boolean;
  compact?: boolean;
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

export function TaskItem({ compact = false, onSelect, onToggle, selected = false, task }: TaskItemProps) {
  const { t } = useI18n();
  const completionCelebrationsEnabled = usePreferencesStore((state) => state.completionCelebrationsEnabled);
  const PriorityIcon = priorityIcon[task.priority];
  const itemRef = useRef<HTMLElement | null>(null);
  const previousCompletedRef = useRef(task.completed);

  useEffect(() => {
    const wasCompleted = previousCompletedRef.current;
    previousCompletedRef.current = task.completed;

    if (!wasCompleted && task.completed && completionCelebrationsEnabled) {
      fireCompletionConfetti(itemRef.current);
    }
  }, [completionCelebrationsEnabled, task.completed]);

  return (
    <article
      className={cn(
        "group relative flex origin-center cursor-pointer items-start gap-3 rounded-[22px] border p-3.5 transition-all duration-200 ease-out hover:z-10 active:scale-[1.01]",
        selected
          ? "z-10 scale-[1.018] border-[color-mix(in_srgb,var(--accent)_38%,var(--border-medium))] bg-[color-mix(in_srgb,var(--accent-surface)_82%,var(--surface-elevated))] shadow-[var(--shadow-card-around)]"
          : "scale-100 border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-card)_64%,transparent)] hover:scale-[1.008] hover:border-[var(--border-medium)] hover:bg-[var(--surface-card-hover)] hover:shadow-[var(--shadow-card-hover)]",
        task.completed && "opacity-70",
        compact && "rounded-[18px] p-2.5 hover:bg-[var(--surface-card-hover)]",
      )}
      onClick={() => onSelect(task.id)}
      ref={itemRef}
    >
      <Checkbox
        aria-label={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
        checked={task.completed}
        onChange={(event) => {
          event.stopPropagation();
          onToggle(task.id);
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              task.completed ? "text-[var(--text-faint)] line-through" : "text-[var(--text-secondary)]",
            )}
          >
            {task.title}
          </h3>
          {!compact && (
            <Badge className={cn("shrink-0 self-start gap-1", priorityClassName[task.priority])}>
              <PriorityIcon className="h-3 w-3" />
              {t(`priority.${task.priority}`)}
            </Badge>
          )}
        </div>
        {!compact && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{task.note}</p>}
        {compact && task.tags[0] && <p className="mt-1 truncate text-[11px] text-[var(--text-faint)]">{task.tags[0]}</p>}
      </div>
    </article>
  );
}
