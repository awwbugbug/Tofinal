import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  open: boolean;
  title: string;
  variant?: "danger";
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  description,
  open,
  title,
  variant = "danger",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby="confirm-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(23_32_51_/_0.22)] px-5 backdrop-blur-sm"
      role="dialog"
    >
      <div
        className="w-full max-w-sm rounded-[28px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-detail)_88%,white)] p-5 shadow-[0_24px_60px_rgb(39_58_78_/_0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              variant === "danger" && "bg-[var(--danger-soft)] text-[var(--danger)]",
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--text-primary)]" id="confirm-dialog-title">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button aria-label={cancelLabel} onClick={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            aria-label={confirmLabel}
            className="bg-[var(--danger)] text-white hover:bg-[color-mix(in_srgb,var(--danger)_86%,black)] active:bg-[color-mix(in_srgb,var(--danger)_82%,black)]"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
