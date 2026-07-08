import { useState } from "react";
import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TrashBinIcon } from "@/components/ui/trash-bin-icon";
import { useI18n } from "@/i18n/useI18n";
import type { Task } from "@/types/task";

type TrashPanelProps = {
  open: boolean;
  trashedTasks: Task[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onEmpty: () => void;
};

const formatDeletedAt = (deletedAt: string | null) => {
  if (!deletedAt) {
    return "";
  }

  const date = new Date(deletedAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function TrashPanel({ onClose, onEmpty, onPurge, onRestore, open, trashedTasks }: TrashPanelProps) {
  const { t } = useI18n();
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-label={t("trash.title")}
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(23_32_51_/_0.24)] px-5 backdrop-blur-sm"
      role="dialog"
    >
      <section className="flex max-h-[70vh] w-full max-w-md flex-col rounded-[28px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-detail)_94%,transparent)] p-5 shadow-[var(--shadow-soft)]">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-[var(--text-faint)]">
              <TrashBinIcon className="h-3.5 w-3.5" />
              {t("trash.title")}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{t("trash.retention")}</p>
          </div>
          <Button
            aria-label={t("trash.close")}
            edgeSafe
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="-mx-1 mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-1" data-testid="trash-panel-list">
          {trashedTasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-field)] p-4 text-center text-sm text-[var(--text-faint)]">
              {t("trash.emptyState")}
            </div>
          ) : (
            trashedTasks.map((task) => (
              <article
                className="flex items-center gap-3 rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-field)] p-3"
                key={task.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{task.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                    {t("trash.deletedAt")} {formatDeletedAt(task.deletedAt)}
                  </p>
                </div>
                <Button
                  aria-label={`${t("trash.restore")} ${task.title}`}
                  onClick={() => onRestore(task.id)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("trash.restore")}
                </Button>
                <Button
                  aria-label={`${t("trash.purge")} ${task.title}`}
                  className="danger-glass-button"
                  onClick={() => onPurge(task.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </article>
            ))
          )}
        </div>

        {trashedTasks.length > 0 && (
          <footer className="mt-4 flex justify-end">
            <Button
              aria-label={t("trash.empty")}
              className="danger-glass-button"
              onClick={() => setEmptyDialogOpen(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("trash.empty")}
            </Button>
          </footer>
        )}
      </section>

      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("trash.empty")}
        description={t("trash.emptyConfirmDescription")}
        open={emptyDialogOpen}
        title={t("trash.emptyConfirmTitle")}
        onCancel={() => setEmptyDialogOpen(false)}
        onConfirm={() => {
          setEmptyDialogOpen(false);
          onEmpty();
        }}
      />
    </div>
  );
}
