import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  Calendar,
  Camera,
  CheckCircle2,
  Clock3,
  MonitorUp,
  ImageIcon,
  ImageOff,
  Pin,
  Play,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AttachmentLightbox } from "@/components/task/AttachmentLightbox";
import { ScreenshotEditorOverlay } from "@/components/task/ScreenshotEditorOverlay";
import { useI18n } from "@/i18n/useI18n";
import { cn } from "@/lib/utils";
import type { AttachmentView, FinalScreenshot, PendingScreenshot } from "@/stores/attachmentStore";
import type { TaskAppView } from "@/stores/taskAppStore";
import type { Task, TaskPriority } from "@/types/task";

type TaskDetailProps = {
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

const priorityOptions: Array<{ labelKey: string; value: TaskPriority; segmentText: string }> = [
  { labelKey: "priority.normal", value: "normal", segmentText: "var(--normal-text)" },
  { labelKey: "priority.important", value: "important", segmentText: "var(--important-text)" },
  { labelKey: "priority.urgent", value: "urgent", segmentText: "var(--urgent-text)" },
];

const priorityBadgeClassName = {
  normal: "border-transparent bg-[var(--normal-bg)] text-[var(--normal-text)]",
  important: "border-transparent bg-[var(--important-bg)] text-[var(--important-text)]",
  urgent: "border-transparent bg-[var(--urgent-bg)] text-[var(--urgent-text)]",
};

type PrioritySegmentStyle = CSSProperties & {
  "--priority-left": string;
  "--segment-bg": string;
  "--segment-ring": string;
};

const prioritySegmentStyle = {
  normal: {
    "--priority-left": "var(--priority-padding)",
    "--segment-bg": "var(--normal-bg)",
    "--segment-ring": "rgb(86 101 121 / 0.18)",
  },
  important: {
    "--priority-left": "calc(33.333333% + 0.333333rem)",
    "--segment-bg": "var(--important-bg)",
    "--segment-ring": "rgb(49 91 145 / 0.20)",
  },
  urgent: {
    "--priority-left": "calc(66.666667% + 0.166667rem)",
    "--segment-bg": "var(--urgent-bg)",
    "--segment-ring": "rgb(148 76 47 / 0.18)",
  },
} satisfies Record<TaskPriority, PrioritySegmentStyle>;

const formatDate = (value: string | null) => {
  if (!value) {
    return "Not completed";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const parseTags = (value: string) => value.split(",");

const formatFileSize = (sizeBytes: number) => {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
};

export function TaskDetail({
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
}: TaskDetailProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [tags, setTags] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [brokenAttachmentIds, setBrokenAttachmentIds] = useState<Record<string, boolean>>({});
  const [lightboxAttachment, setLightboxAttachment] = useState<AttachmentView | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const titleField = titleRef.current;
    if (!titleField) {
      return;
    }

    titleField.style.height = "auto";
    titleField.style.height = `${Math.min(titleField.scrollHeight, 108)}px`;
  }, [title, task?.id]);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNote(task?.note ?? "");
    setPriority(task?.priority ?? "normal");
    setTags(task?.tags.join(", ") ?? "");
    setPinned(task?.pinned ?? false);
    setError("");
    setDeleteDialogOpen(false);
    setBrokenAttachmentIds({});
    setLightboxAttachment(null);
  }, [task]);

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-faint)]">
        {t("task.noTaskSelected")}
      </div>
    );
  }

  const normalizedTags = tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(", ");
  const currentTags = task.tags.join(", ");
  const hasDraftChanges =
    title !== task.title ||
    note !== task.note ||
    priority !== task.priority ||
    pinned !== task.pinned ||
    normalizedTags !== currentTags;
  const saveStatus = persistenceError
    ? `${t("task.saveFailed")}: ${persistenceError}`
    : saving
      ? t("task.savingLocally")
      : lastSavedAt
        ? `${t("task.saved")} ${formatDate(lastSavedAt)}`
        : "";

  const handleSave = () => {
    if (!title.trim()) {
      setError(t("task.titleRequired"));
      return;
    }

    if (!hasDraftChanges && persistenceError) {
      onRetryPersistTasks();
      return;
    }

    const saved = onUpdateTask(task.id, {
      title,
      note,
      priority,
      tags: parseTags(tags),
      pinned,
    });

    setError(saved ? "" : t("task.titleRequired"));
  };

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const handlePriorityChange = (nextPriority: TaskPriority) => {
    setPriority(nextPriority);
  };

  const handleConfirmDelete = () => {
    onDeleteTask(task.id);
    setDeleteDialogOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="-mx-3 min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <Badge className={cn("capitalize", priorityBadgeClassName[task.priority])}>
            {t(`priority.${task.priority}`)}
          </Badge>
          <label
            className={cn(
              "flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]",
              pinned && "selected-glass-pill text-[var(--pinned-text)]",
            )}
          >
            <Checkbox
              aria-label="Pinned task"
              checked={pinned}
              onChange={(event) => setPinned(event.currentTarget.checked)}
            />
            <Pin className={cn("h-3.5 w-3.5", pinned ? "text-[var(--pinned-text)]" : "text-[var(--text-faint)]")} />
            {t("task.pinned")}
          </label>
        </div>

        <label className="block text-xs font-medium uppercase text-[var(--text-faint)]" htmlFor="task-title">
          {t("task.title")}
        </label>
        <textarea
          className="focus-soft min-h-12 max-h-[6.75rem] w-full resize-none overflow-y-auto rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-field)] px-4 py-3 text-2xl font-semibold leading-[1.5] tracking-normal text-[var(--text-primary)] placeholder:text-[var(--text-faint)] outline-none"
          id="task-title"
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}

        <label className="block text-xs font-medium uppercase text-[var(--text-faint)]" htmlFor="task-note">
          {t("task.note")}
        </label>
        <textarea
          className="focus-soft min-h-32 w-full resize-none rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-field)] p-4 text-sm leading-[1.55] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] outline-none"
          id="task-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <div className="block text-xs font-medium uppercase text-[var(--text-faint)]" id="task-priority-label">
          {t("task.priority")}
        </div>
        <div
          aria-labelledby="task-priority-label"
          className="priority-segment-shell grid grid-cols-3 gap-2 overflow-visible rounded-[24px] border p-2"
          role="group"
          style={prioritySegmentStyle[priority] as CSSProperties}
        >
          <span aria-hidden="true" className="priority-segment-thumb" />
          {priorityOptions.map((option) => (
            <button
              aria-pressed={priority === option.value}
              data-selected={priority === option.value}
              className="priority-segment text-center font-medium"
              key={option.value}
              onClick={() => handlePriorityChange(option.value)}
              style={{ "--segment-text": option.segmentText } as CSSProperties}
              type="button"
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium uppercase text-[var(--text-faint)]" htmlFor="task-tags">
          {t("task.tags")}
        </label>
        <Input
          className="border-[var(--border-soft)] bg-[var(--surface-field)]"
          id="task-tags"
          placeholder="foundation, ui, codex"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          {task.tags.length > 0 ? (
            task.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
          ) : (
            <span className="text-sm text-[var(--text-faint)]">0{t("task.tagCount")}</span>
          )}
        </div>

        <section className="space-y-3" aria-labelledby="task-attachments-label">
          <div className="detail-action-row">
            <div
              className="text-xs font-medium uppercase text-[var(--text-faint)]"
              id="task-attachments-label"
            >
              {t("attachments.title")}
            </div>
            <div className="detail-action-buttons detail-action-buttons-grid">
              <Button
                aria-label={t("attachments.addImageAction")}
                className="detail-action-button"
                disabled={attachmentsAdding || attachmentsCapturing}
                onClick={() => onAddImageAttachment(task.id)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Plus className="h-4 w-4" />
                {attachmentsAdding ? t("attachments.adding") : t("attachments.addImage")}
              </Button>
              <Button
                aria-label={t("attachments.screenshot")}
                className="detail-action-button"
                disabled={attachmentsAdding || attachmentsCapturing || screenshotEditing}
                onClick={() => onAddScreenshotAttachment(task.id)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Camera className="h-4 w-4" />
                {attachmentsCapturing ? t("attachments.capturing") : t("attachments.screenshot")}
              </Button>
            </div>
          </div>

          {attachmentError && <p className="text-xs text-[var(--danger)]">{attachmentError}</p>}
          {attachmentsLoading ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-field)] p-4 text-sm text-[var(--text-faint)]">
              {t("attachments.loading")}
            </div>
          ) : attachments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-field)] p-4 text-sm text-[var(--text-faint)]">
              {t("attachments.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {attachments.map((attachment) => {
                const broken = attachment.missing || brokenAttachmentIds[attachment.id];

                return (
                  <article
                    className="flex gap-3 rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-field)] p-3"
                    key={attachment.id}
                  >
                    <button
                      aria-label={`${t("attachments.preview")} ${attachment.originalName}`}
                      className="attachment-preview-trigger"
                      disabled={broken}
                      onClick={() => setLightboxAttachment(attachment)}
                      type="button"
                    >
                      {!broken && attachment.url ? (
                        <img
                          alt={attachment.originalName}
                          className="h-full w-full object-cover"
                          onError={() =>
                            setBrokenAttachmentIds((current) => ({ ...current, [attachment.id]: true }))
                          }
                          src={attachment.url}
                        />
                      ) : (
                        <ImageOff className="h-5 w-5 text-[var(--text-faint)]" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImageIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {attachment.originalName}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {broken ? t("attachments.missing") : `${formatFileSize(attachment.sizeBytes)} ${t("attachments.localImage")}`}
                      </p>
                    </div>
                    <Button
                      aria-label={`${t("attachments.delete")} ${attachment.originalName}`}
                      disabled={Boolean(attachmentDeletingIds[attachment.id])}
                      onClick={() => onDeleteAttachment(attachment.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="task-apps-label">
          <div className="detail-action-row">
            <div className="text-xs font-medium uppercase text-[var(--text-faint)]" id="task-apps-label">
              {t("apps.title")}
            </div>
            <div className="detail-action-buttons detail-action-buttons-grid">
              <Button
                aria-label={t("apps.addApp")}
                className="detail-action-button"
                disabled={taskAppsAdding}
                onClick={() => onAddTaskApp(task.id)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Plus className="h-4 w-4" />
                {taskAppsAdding ? t("apps.adding") : t("apps.addApp")}
              </Button>
              <Button
                aria-label={t("apps.startTask")}
                className="detail-action-button"
                disabled={taskApps.length === 0 || taskAppsLaunching}
                onClick={() => onStartTaskApps(task.id)}
                size="sm"
                type="button"
              >
                <Play className="h-4 w-4" />
                {taskAppsLaunching ? t("apps.starting") : t("apps.startTask")}
              </Button>
            </div>
          </div>

          {taskAppError && <p className="text-xs text-[var(--danger)]">{taskAppError}</p>}
          {!taskAppError && lastTaskAppsStartedAt && (
            <p aria-live="polite" className="text-xs text-[var(--text-muted)]">
              {t("apps.startedLocally")}
            </p>
          )}
          {taskAppsLoading ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-field)] p-4 text-sm text-[var(--text-faint)]">
              {t("apps.loading")}
            </div>
          ) : taskApps.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-field)] p-4 text-sm text-[var(--text-faint)]">
              {t("apps.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {taskApps.map((app) => (
                <article
                  className="rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-field)] p-3"
                  key={app.id}
                >
                  <div className="flex items-start gap-3">
                    <MonitorUp className="mt-2 h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        aria-label={`App name ${app.appName}`}
                        className="h-8 rounded-2xl border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-field)_72%,transparent)] px-3 text-sm font-medium"
                        defaultValue={app.appName}
                        onBlur={(event) => {
                          const nextName = event.currentTarget.value.trim();
                          if (nextName && nextName !== app.appName) {
                            onUpdateTaskAppName(app.id, nextName);
                          }
                        }}
                      />
                      <p className="truncate text-xs text-[var(--text-muted)]" title={app.appPath}>
                        {app.appPath}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge>{app.appKind === "shortcut" ? t("apps.shortcut") : t("apps.exe")}</Badge>
                        {app.missing && <Badge className="bg-[var(--danger-soft)] text-[var(--danger)]">{t("apps.missing")}</Badge>}
                        {app.lastLaunchError && (
                          <span className="text-[var(--danger)]">{app.lastLaunchError}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      aria-label={`${t("apps.delete")} ${app.appName}`}
                      onClick={() => onDeleteTaskApp(app.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <Separator />

        <div className="space-y-3 rounded-3xl border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-field)_72%,transparent)] p-4 text-sm text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <Clock3 className="h-4 w-4 text-[var(--text-faint)]" />
            <span>{t("task.created")} {formatDate(task.createdAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-[var(--text-faint)]" />
            <span>{t("task.updated")} {formatDate(task.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-[var(--text-faint)]" />
            <span>{task.completed ? `${t("task.completed")} ${formatDate(task.completedAt)}` : t("task.openTask")}</span>
          </div>
          <div className="flex items-center gap-3">
            <Tag className="h-4 w-4 text-[var(--text-faint)]" />
            <span>{task.tags.length}{t("task.tagCount")}</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border-soft)] pt-4">
        <div className="flex items-center justify-between gap-3">
        <Button
          aria-label={t("task.deleteTask")}
          className="text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          onClick={handleDelete}
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
          {t("task.delete")}
        </Button>
        <div className="flex min-w-0 flex-col items-end gap-1">
          {saveStatus && (
            <span
              aria-live="polite"
              className={cn(
                "max-w-56 text-right text-xs leading-snug text-[var(--text-faint)]",
                persistenceError && "text-[var(--danger)]",
              )}
              title={saveStatus}
            >
              {saveStatus}
            </span>
          )}
          <Button
            aria-label={saving ? t("task.savingTask") : t("task.saveTask")}
            disabled={!hasDraftChanges && !persistenceError}
            onClick={handleSave}
          >
            {saving ? t("task.saving") : t("task.save")}
          </Button>
        </div>
        </div>
      </div>

      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("task.delete")}
        description={t("task.deleteDialogDescription")}
        open={deleteDialogOpen}
        title={t("task.deleteDialogTitle")}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
      />
      {lightboxAttachment && (
        <AttachmentLightbox attachment={lightboxAttachment} onClose={() => setLightboxAttachment(null)} />
      )}
      {pendingScreenshot && (
        <ScreenshotEditorOverlay
          screenshot={pendingScreenshot}
          onCancel={onCancelScreenshotAttachment}
          onConfirm={onConfirmScreenshotAttachment}
        />
      )}
    </div>
  );
}
