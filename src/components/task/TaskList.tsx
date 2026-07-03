import { ChevronDown, ChevronRight, Layers3 } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskItem } from "@/components/task/TaskItem";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { Task, TaskStackView } from "@/types/task";

type TaskListProps = {
  tasks?: Task[];
  stackViews?: TaskStackView[];
  selectedTaskId: string | null;
  highlightedTaskId?: string | null;
  compact?: boolean;
  embedded?: boolean;
  limit?: number;
  testId?: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onHighlightTask?: (id: string) => void;
  onToggleStackCollapsed?: (stackId: string) => void;
};

export function TaskList({
  compact = false,
  embedded = false,
  highlightedTaskId = null,
  limit,
  onHighlightTask,
  onSelect,
  onToggle,
  onToggleStackCollapsed,
  selectedTaskId,
  stackViews,
  tasks = [],
  testId = "task-list",
}: TaskListProps) {
  const { t } = useI18n();
  const views = stackViews ?? tasks.map((task, index) => ({
    stack: {
      id: task.stackId,
      sortOrder: index,
      collapsed: true,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
    tasks: [task],
    mainTask: task,
    completedCount: task.completed ? 1 : 0,
    totalCount: 1,
    todayRelevantCount: 0,
  } satisfies TaskStackView));
  const visibleViews = typeof limit === "number" ? views.slice(0, limit) : views;

  const renderStackMeta = (view: TaskStackView) => {
    if (view.totalCount <= 1) {
      return null;
    }

    return (
      <div className="mt-2 flex items-center justify-between gap-2 px-2 text-[11px] text-[var(--text-faint)]">
        <span className="inline-flex items-center gap-1">
          <Layers3 className="h-3 w-3" />
          {view.totalCount - 1} {t("stack.subtasks")}
        </span>
        <span>{view.completedCount}/{view.totalCount}</span>
      </div>
    );
  };

  const renderStack = (view: TaskStackView) => {
    const isSingleton = view.totalCount === 1;
    const isCollapsed = view.stack.collapsed || compact;

    if (isSingleton || isCollapsed) {
      return (
        <div className="task-stack-shell" data-testid="task-stack" key={view.stack.id}>
          <TaskItem
            compact={compact}
            onSelect={onSelect}
            onToggle={onToggle}
            selected={!compact && view.mainTask.id === selectedTaskId}
            task={view.mainTask}
          />
          {renderStackMeta(view)}
          {!compact && view.totalCount > 1 && (
            <Button
              aria-label={t("stack.expand")}
              className="mt-2 h-8 w-full justify-center text-xs"
              onClick={() => onToggleStackCollapsed?.(view.stack.id)}
              type="button"
              variant="ghost"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              {t("stack.expand")}
            </Button>
          )}
        </div>
      );
    }

    return (
      <section className="task-stack-expanded" data-testid="task-stack-expanded" key={view.stack.id}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1 text-xs text-[var(--text-faint)]">
          <span className="inline-flex items-center gap-1.5">
            <Layers3 className="h-3.5 w-3.5" />
            {view.totalCount} {t("stack.tasks")}
          </span>
          <Button
            aria-label={t("stack.collapse")}
            className="h-8 px-3 text-xs"
            onClick={() => onToggleStackCollapsed?.(view.stack.id)}
            type="button"
            variant="ghost"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {t("stack.collapse")}
          </Button>
        </div>
        <div className="space-y-2">
          {view.tasks.map((task, index) => {
            const main = index === 0;
            return (
              <TaskItem
                key={task.id}
                onSelect={main ? onSelect : (id) => (onHighlightTask ?? onSelect)(id)}
                onToggle={onToggle}
                selected={!compact && (main ? task.id === selectedTaskId : task.id === highlightedTaskId)}
                subtask={!main}
                task={task}
              />
            );
          })}
        </div>
      </section>
    );
  };

  const list = (
    <div
      className={compact ? "task-card-list-safe-area-compact space-y-2" : "task-card-list-safe-area space-y-4"}
      data-testid={testId}
    >
      {visibleViews.map(renderStack)}
    </div>
  );

  if (embedded) {
    return list;
  }

  return (
    <ScrollArea className={compact ? "-mx-3 h-full min-h-0 px-3 py-1" : "-mx-5 min-h-0 flex-1 px-4 py-1"}>
      {list}
    </ScrollArea>
  );
}

