import { useEffect } from "react";
import { NotebookText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NoteMarkdown } from "@/components/task/NoteMarkdown";
import { useI18n } from "@/i18n/useI18n";

type NotePreviewOverlayProps = {
  title: string;
  note: string;
  onClose: () => void;
};

/** Read-only expanded note view, rendered as Markdown. */
export function NotePreviewOverlay({ note, onClose, title }: NotePreviewOverlayProps) {
  const { t } = useI18n();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      aria-label={t("note.expandedTitle")}
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(23_32_51_/_0.24)] px-5 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="note-overlay flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[28px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-detail)_96%,transparent)] p-6 shadow-[var(--shadow-soft)]"
        data-testid="note-preview-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-[var(--text-faint)]">
              <NotebookText className="h-3.5 w-3.5" />
              {t("note.expandedTitle")}
            </div>
            <h3 className="mt-2 truncate text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
          </div>
          <Button
            aria-label={t("note.close")}
            edgeSafe
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="-mx-2 mt-4 min-h-0 flex-1 overflow-y-auto px-2">
          {note.trim() ? (
            <NoteMarkdown text={note} />
          ) : (
            <p className="text-sm text-[var(--text-faint)]">{t("note.empty")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
