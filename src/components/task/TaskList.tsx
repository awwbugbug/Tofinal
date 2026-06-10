import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskItem } from "@/components/task/TaskItem";
import type { Task } from "@/types/task";

type TaskListProps = {
  tasks: Task[];
  selectedTaskId: string | null;
  compact?: boolean;
  limit?: number;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

export function TaskList({
  compact = false,
  limit,
  onSelect,
  onToggle,
  selectedTaskId,
  tasks,
}: TaskListProps) {
  const visibleTasks = typeof limit === "number" ? tasks.slice(0, limit) : tasks;

  return (
    <ScrollArea className={compact ? "-mx-3 max-h-[330px] px-3 py-1" : "-mx-5 min-h-0 flex-1 px-5 py-2"}>
      <div className={compact ? "space-y-2 px-1 py-1.5" : "space-y-3 px-3 pb-7 pt-3"} data-testid="task-list">
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
    </ScrollArea>
  );
}
