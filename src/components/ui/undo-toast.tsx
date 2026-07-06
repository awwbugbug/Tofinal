import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

const AUTO_DISMISS_MS = 5000;

type UndoToastProps = {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
};

/**
 * Bottom-centered transient toast with a single undo action. Auto-dismisses
 * after five seconds; hovering pauses the countdown.
 */
export function UndoToast({ actionLabel, message, onAction, onDismiss }: UndoToastProps) {
  const timeoutRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      onDismissRef.current();
    }, AUTO_DISMISS_MS);
  };

  useEffect(() => {
    startTimer();
    return clearTimer;
    // The timer restarts only when a new toast instance mounts (keyed by parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="undo-toast"
      data-testid="undo-toast"
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      role="status"
    >
      <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">{message}</span>
      <Button
        className="undo-toast-action"
        onClick={onAction}
        size="sm"
        type="button"
        variant="ghost"
      >
        {actionLabel}
      </Button>
    </div>
  );
}
