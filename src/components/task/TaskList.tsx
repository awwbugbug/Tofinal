import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskItem } from "@/components/task/TaskItem";
import type { Task } from "@/types/task";

type TaskListProps = {
  tasks: Task[];
  selectedTaskId: string | null;
  compact?: boolean;
  embedded?: boolean;
  limit?: number;
  testId?: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

export function TaskList({
  compact = false,
  embedded = false,
  limit,
  onSelect,
  onToggle,
  selectedTaskId,
  testId = "task-list",
  tasks,
}: TaskListProps) {
  const visibleTasks = typeof limit === "number" ? tasks.slice(0, limit) : tasks;
  const list = (
    <div
      className={compact ? "task-card-list-safe-area-compact space-y-2" : "task-card-list-safe-area space-y-4"}
      data-testid={testId}
    >
      {visibleTasks.map((task) => (
        <TaskItem
          compact={compact}
          key={task.id}
          onSelect={onSelect}
          onToggle={onToggle}
          selected={!compact && task.id === selectedTaskId}
          task={task}
        />
      ))}
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
