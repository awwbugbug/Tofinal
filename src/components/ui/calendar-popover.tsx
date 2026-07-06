import { useLayoutEffect, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { getLocalDateKey } from "@/stores/taskStore";
import { usePreferencesStore } from "@/stores/preferencesStore";

type CalendarPopoverProps = {
  value: string | null;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
  /** When set, renders a footer shortcut that selects today. */
  todayShortcutLabel?: string;
};

type CalendarDay = {
  key: string;
  day: number;
  inMonth: boolean;
};

const parseDateKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
};

/** Monday-first calendar grid covering the whole month in full weeks. */
const buildCalendarDays = (year: number, month: number): CalendarDay[] => {
  const firstOfMonth = new Date(year, month, 1);
  const leading = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - leading);
  const daysInGrid = Math.ceil((leading + new Date(year, month + 1, 0).getDate()) / 7) * 7;

  return Array.from({ length: daysInGrid }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      key: getLocalDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
};

export function CalendarPopover({ onClose, onSelect, todayShortcutLabel, value }: CalendarPopoverProps) {
  const language = usePreferencesStore((state) => state.language);
  const locale = language === "en-US" ? "en-US" : "zh-CN";
  const initial = value ? parseDateKey(value) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const todayKey = getLocalDateKey();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number; flipped: boolean } | null>(null);

  // Fixed positioning escapes the detail panel's scroll clipping: anchor to
  // the trigger row, flip above when there is no room below, and clamp to
  // the viewport.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const anchor = popover?.parentElement;
    if (!popover || !anchor) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const margin = 12;
    const gap = 8;

    let top = anchorRect.bottom + gap;
    let flipped = false;
    if (top + popoverRect.height > window.innerHeight - margin) {
      top = anchorRect.top - popoverRect.height - gap;
      flipped = true;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - popoverRect.height - margin));

    let left = anchorRect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - popoverRect.width - margin));

    setPlacement({ top, left, flipped });
  }, [viewYear, viewMonth]);

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

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(viewYear, viewMonth, 1),
  );
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 2024-01-01 is a Monday; use it to derive Monday-first weekday initials.
  const weekdays = Array.from({ length: 7 }, (_, index) => weekdayFormat.format(new Date(2024, 0, 1 + index)));
  const days = buildCalendarDays(viewYear, viewMonth);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-30" onClick={onClose} />
      <div
        aria-label={monthLabel}
        className="calendar-popover"
        data-flipped={placement?.flipped ? "true" : undefined}
        data-testid="calendar-popover"
        ref={popoverRef}
        role="dialog"
        style={placement ? ({ top: placement.top, left: placement.left, visibility: "visible" } as CSSProperties) : { visibility: "hidden" }}
      >
        <div className="flex items-center justify-between gap-2">
          <button aria-label="previous month" className="calendar-nav-button" onClick={() => shiftMonth(-1)} type="button">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-[var(--text-secondary)]">{monthLabel}</span>
          <button aria-label="next month" className="calendar-nav-button" onClick={() => shiftMonth(1)} type="button">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
          {weekdays.map((weekday, index) => (
            <span className="py-1 text-[10px] font-medium text-[var(--text-faint)]" key={`${weekday}-${index}`}>
              {weekday}
            </span>
          ))}
          {days.map((calendarDay) => (
            <button
              className={cn(
                "calendar-day",
                !calendarDay.inMonth && "calendar-day-outside",
                calendarDay.key === todayKey && "calendar-day-today",
                calendarDay.key === value && "calendar-day-selected",
              )}
              data-date-key={calendarDay.key}
              key={calendarDay.key}
              onClick={() => onSelect(calendarDay.key)}
              type="button"
            >
              {calendarDay.day}
            </button>
          ))}
        </div>
        {todayShortcutLabel && (
          <div className="mt-2 border-t border-[var(--border-soft)] pt-2">
            <button
              className="calendar-today-shortcut"
              disabled={value === todayKey}
              onClick={() => onSelect(todayKey)}
              type="button"
            >
              {todayShortcutLabel}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
