import { TaskDetail } from "@/components/task/TaskDetail";
import type { AttachmentView } from "@/stores/attachmentStore";
import type { Task } from "@/types/task";

type DetailPanelProps = {
  task: Task | null;
  attachments: AttachmentView[];
  attachmentsLoading: boolean;
  attachmentsAdding: boolean;
  attachmentDeletingIds: Record<string, boolean>;
  attachmentError: string | null;
  saving: boolean;
  lastSavedAt: string | null;
  persistenceError: string | null;
  onAddImageAttachment: (taskId: string) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (
    id: string,
    update: Partial<Pick<Task, "title" | "note" | "priority" | "tags" | "pinned">>,
  ) => boolean;
};

export function DetailPanel({
  attachmentDeletingIds,
  attachmentError,
  attachments,
  attachmentsAdding,
  attachmentsLoading,
  lastSavedAt,
  onAddImageAttachment,
  onDeleteAttachment,
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
        attachmentDeletingIds={attachmentDeletingIds}
        attachmentError={attachmentError}
        attachments={attachments}
        attachmentsAdding={attachmentsAdding}
        attachmentsLoading={attachmentsLoading}
        lastSavedAt={lastSavedAt}
        onAddImageAttachment={onAddImageAttachment}
        onDeleteAttachment={onDeleteAttachment}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        persistenceError={persistenceError}
        saving={saving}
        task={task}
      />
    </aside>
  );
}
