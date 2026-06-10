import { AlertCircle, CircleDot, Flag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
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

const priorityLabel = {
  normal: "Normal",
  important: "Important",
  urgent: "Urgent",
};

const priorityClassName = {
  normal: "border-transparent bg-[var(--normal-bg)] text-[var(--normal-text)]",
  important: "border-transparent bg-[var(--important-bg)] text-[var(--important-text)]",
  urgent: "border-transparent bg-[var(--urgent-bg)] text-[var(--urgent-text)]",
};

export function TaskItem({ compact = false, onSelect, onToggle, selected = false, task }: TaskItemProps) {
  const PriorityIcon = priorityIcon[task.priority];

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
              "truncate text-sm font-medium",
              task.completed ? "text-[var(--text-faint)] line-through" : "text-[var(--text-secondary)]",
            )}
          >
            {task.title}
          </h3>
          {!compact && (
            <Badge className={cn("gap-1", priorityClassName[task.priority])}>
              <PriorityIcon className="h-3 w-3" />
              {priorityLabel[task.priority]}
            </Badge>
          )}
        </div>
        {!compact && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{task.note}</p>}
        {compact && task.tags[0] && <p className="mt-1 truncate text-[11px] text-[var(--text-faint)]">{task.tags[0]}</p>}
      </div>
    </article>
  );
}
