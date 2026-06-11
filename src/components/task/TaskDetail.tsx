import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Calendar, CheckCircle2, Clock3, Pin, Tag, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority } from "@/types/task";

type TaskDetailProps = {
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

const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: "Normal", value: "normal" },
  { label: "Important", value: "important" },
  { label: "Urgent", value: "urgent" },
];

const priorityBadgeClassName = {
  normal: "border-transparent bg-[var(--normal-bg)] text-[var(--normal-text)]",
  important: "border-transparent bg-[var(--important-bg)] text-[var(--important-text)]",
  urgent: "border-transparent bg-[var(--urgent-bg)] text-[var(--urgent-text)]",
};

const prioritySegmentClassName = {
  normal: "text-[var(--normal-text)]",
  important: "text-[var(--important-text)]",
  urgent: "text-[var(--urgent-text)]",
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

export function TaskDetail({
  lastSavedAt,
  onDeleteTask,
  onUpdateTask,
  persistenceError,
  saving,
  task,
}: TaskDetailProps) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [tags, setTags] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
  }, [task]);

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-faint)]">
        No task selected
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
    ? `Save failed: ${persistenceError}`
    : saving
      ? "Saving locally..."
      : lastSavedAt
        ? `Saved ${formatDate(lastSavedAt)}`
        : "";

  const handleSave = () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    const saved = onUpdateTask(task.id, {
      title,
      note,
      priority,
      tags: parseTags(tags),
      pinned,
    });

    setError(saved ? "" : "Title is required.");
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
          <Badge className={cn("capitalize", priorityBadgeClassName[task.priority])}>{task.priority}</Badge>
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
            Pinned
          </label>
        </div>

        <label className="block text-xs font-medium uppercase text-[var(--text-faint)]" htmlFor="task-title">
          Task title
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
          Task note
        </label>
        <textarea
          className="focus-soft min-h-32 w-full resize-none rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-field)] p-4 text-sm leading-[1.55] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] outline-none"
          id="task-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <div className="block text-xs font-medium uppercase text-[var(--text-faint)]" id="task-priority-label">
          Task priority
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
              className={cn(
                "priority-segment text-center font-medium",
                prioritySegmentClassName[option.value],
              )}
              key={option.value}
              onClick={() => handlePriorityChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium uppercase text-[var(--text-faint)]" htmlFor="task-tags">
          Task tags
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
            <span className="text-sm text-[var(--text-faint)]">No tags</span>
          )}
        </div>

        <Separator />

        <div className="space-y-3 rounded-3xl border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-field)_72%,transparent)] p-4 text-sm text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <Clock3 className="h-4 w-4 text-[var(--text-faint)]" />
            <span>Created {formatDate(task.createdAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-[var(--text-faint)]" />
            <span>Updated {formatDate(task.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-[var(--text-faint)]" />
            <span>{task.completed ? `Completed ${formatDate(task.completedAt)}` : "Open task"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Tag className="h-4 w-4 text-[var(--text-faint)]" />
            <span>{task.tags.length} tags</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border-soft)] pt-4">
        <div className="flex items-center justify-between gap-3">
        <Button
          aria-label="Delete task"
          className="text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          onClick={handleDelete}
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <div className="flex min-w-0 flex-col items-end gap-1">
          {saveStatus && (
            <span
              aria-live="polite"
              className={cn(
                "max-w-40 truncate text-xs text-[var(--text-faint)]",
                persistenceError && "text-[var(--danger)]",
              )}
            >
              {saveStatus}
            </span>
          )}
          <Button
            aria-label={saving ? "Saving task" : "Save task"}
            disabled={!hasDraftChanges}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Delete"
        description={`This will remove "${task.title}" from your local task list. This action cannot be undone.`}
        open={deleteDialogOpen}
        title="Delete this task?"
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
