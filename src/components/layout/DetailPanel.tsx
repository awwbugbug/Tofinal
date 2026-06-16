import { TaskDetail } from "@/components/task/TaskDetail";
import type { AttachmentView, FinalScreenshot, PendingScreenshot } from "@/stores/attachmentStore";
import type { TaskAppView } from "@/stores/taskAppStore";
import type { Task } from "@/types/task";

type DetailPanelProps = {
  task: Task | null;
  attachments: AttachmentView[];
  attachmentsLoading: boolean;
  attachmentsAdding: boolean;
  attachmentsCapturing: boolean;
  screenshotEditing: boolean;
  pendingScreenshot: PendingScreenshot | null;
  attachmentDeletingIds: Record<string, boolean>;
  attachmentError: string | null;
  taskApps: TaskAppView[];
  taskAppsLoading: boolean;
  taskAppsAdding: boolean;
  taskAppsLaunching: boolean;
  taskAppError: string | null;
  lastTaskAppsStartedAt: string | null;
  saving: boolean;
  lastSavedAt: string | null;
  persistenceError: string | null;
  onAddImageAttachment: (taskId: string) => void;
  onAddScreenshotAttachment: (taskId: string) => void;
  onConfirmScreenshotAttachment: (screenshot: FinalScreenshot) => void;
  onCancelScreenshotAttachment: () => void;
  onDeleteAttachment: (attachmentId: string) => void;
  onAddTaskApp: (taskId: string) => void;
  onDeleteTaskApp: (appId: string) => void;
  onStartTaskApps: (taskId: string) => void;
  onUpdateTaskAppName: (appId: string, appName: string) => void;
  onRetryPersistTasks: () => void;
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
  attachmentsCapturing,
  attachmentsLoading,
  onCancelScreenshotAttachment,
  onConfirmScreenshotAttachment,
  pendingScreenshot,
  screenshotEditing,
  taskAppError,
  taskApps,
  taskAppsAdding,
  taskAppsLaunching,
  taskAppsLoading,
  lastTaskAppsStartedAt,
  lastSavedAt,
  onAddImageAttachment,
  onAddScreenshotAttachment,
  onAddTaskApp,
  onDeleteAttachment,
  onDeleteTaskApp,
  onDeleteTask,
  onStartTaskApps,
  onUpdateTask,
  onUpdateTaskAppName,
  onRetryPersistTasks,
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
        attachmentsCapturing={attachmentsCapturing}
        attachmentsLoading={attachmentsLoading}
        onCancelScreenshotAttachment={onCancelScreenshotAttachment}
        onConfirmScreenshotAttachment={onConfirmScreenshotAttachment}
        pendingScreenshot={pendingScreenshot}
        screenshotEditing={screenshotEditing}
        taskAppError={taskAppError}
        taskApps={taskApps}
        taskAppsAdding={taskAppsAdding}
        taskAppsLaunching={taskAppsLaunching}
        taskAppsLoading={taskAppsLoading}
        lastTaskAppsStartedAt={lastTaskAppsStartedAt}
        lastSavedAt={lastSavedAt}
        onAddImageAttachment={onAddImageAttachment}
        onAddScreenshotAttachment={onAddScreenshotAttachment}
        onAddTaskApp={onAddTaskApp}
        onDeleteAttachment={onDeleteAttachment}
        onDeleteTaskApp={onDeleteTaskApp}
        onDeleteTask={onDeleteTask}
        onStartTaskApps={onStartTaskApps}
        onUpdateTask={onUpdateTask}
        onUpdateTaskAppName={onUpdateTaskAppName}
        onRetryPersistTasks={onRetryPersistTasks}
        persistenceError={persistenceError}
        saving={saving}
        task={task}
      />
    </aside>
  );
}
