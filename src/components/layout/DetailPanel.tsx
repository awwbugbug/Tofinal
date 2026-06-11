import { TaskDetail } from "@/components/task/TaskDetail";
import type { Task } from "@/types/task";

type DetailPanelProps = {
  task: Task | null;
  saving: boolean;
  lastSavedAt: string | null;
  persistenceError: string | null;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (
    id: string,
    update: Partial<Pick<Task, "title" | "note" | "priority" | "tags" | "pinned">>,
  ) => boolean;
};

export function DetailPanel({
  lastSavedAt,
  onDeleteTask,
  onUpdateTask,
  persistenceError,
  saving,
  task,
}: DetailPanelProps) {
  return (
    <aside
      className="surface-detail flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border p-6"
      data-testid="detail-panel"
    >
      <TaskDetail
        lastSavedAt={lastSavedAt}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        persistenceError={persistenceError}
        saving={saving}
        task={task}
      />
    </aside>
  );
}
