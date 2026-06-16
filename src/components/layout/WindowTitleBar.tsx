import { Minus, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import { closeWindow, minimizeWindow, startWindowDrag, toggleMaximizeWindow } from "@/lib/windowControls";
import type { AppMode } from "@/types/task";

type WindowTitleBarProps = {
  mode: AppMode;
};

export function WindowTitleBar({ mode }: WindowTitleBarProps) {
  const { t } = useI18n();
  const modeLabel = mode === "pin" ? t("mode.pin") : t("mode.normal");

  return (
    <header
      className="app-chrome flex h-11 shrink-0 items-center justify-between border-b px-3"
      data-testid="window-title-bar"
      onMouseDown={() => {
        void startWindowDrag();
      }}
    >
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent-soft)] ring-1 ring-[var(--border-soft)]" />
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{t("app.name")}</span>
        <span className="text-xs text-[var(--text-faint)]">{modeLabel}</span>
      </div>

      <div
        className="flex items-center gap-1"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <Button aria-label={t("window.minimize")} onClick={() => void minimizeWindow()} size="icon" variant="ghost">
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t("window.maximizeRestore")}
          onClick={() => void toggleMaximizeWindow()}
          size="icon"
          variant="ghost"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button aria-label={t("window.close")} onClick={() => void closeWindow()} size="icon" variant="ghost">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
