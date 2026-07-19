import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { WheelPicker } from "@/components/ui/wheel-picker";
import { useI18n } from "@/i18n/useI18n";

type TimeWheelPopoverProps = {
  /** "HH:MM" 24h; the popover is only opened once a start time exists. */
  startTime: string;
  durationMinutes: number | null;
  onChangeStartTime: (startTime: string) => void;
  /** 0 minutes means "no duration" and is reported as null. */
  onChangeDuration: (durationMinutes: number | null) => void;
  onClose: () => void;
};

const HOURS_24 = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTES_60 = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));
// Duration allows a full 24h allocation; 24h forces minutes to 0.
const DURATION_HOURS = Array.from({ length: 25 }, (_, hour) => String(hour));
const MAX_DURATION_MINUTES = 24 * 60;

const parseStartTime = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return { hours: Math.max(0, Math.min(23, hours)), minutes: Math.max(0, Math.min(59, minutes)) };
};

/**
 * Anchored popover with two iOS drum groups: the task's start time (hour |
 * minute) and its allocated duration (hour | minute, up to 24h). Changes apply
 * live, mirroring the priority/date segmented controls.
 */
export function TimeWheelPopover({
  durationMinutes,
  onChangeDuration,
  onChangeStartTime,
  onClose,
  startTime,
}: TimeWheelPopoverProps) {
  const { t } = useI18n();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ top?: number; bottom?: number; left: number; flipped: boolean } | null>(null);
  const start = parseStartTime(startTime);
  const duration = Math.max(0, Math.min(MAX_DURATION_MINUTES, durationMinutes ?? 0));
  const durationHours = Math.floor(duration / 60);
  const durationMins = duration % 60;

  // Fixed positioning centered under the anchor row, flipping above when there
  // is no room below and clamping to the viewport (CalendarPopover pattern).
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

    let left = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popoverRect.width - margin));

    // Anchor the edge NEAREST the trigger (top when below, bottom when
    // flipped above) so later content-height changes grow away from the
    // trigger and the gap stays identical in both directions.
    if (anchorRect.bottom + gap + popoverRect.height <= window.innerHeight - margin) {
      setPlacement({ top: anchorRect.bottom + gap, left, flipped: false });
      return;
    }
    setPlacement({ bottom: Math.max(margin, window.innerHeight - anchorRect.top + gap), left, flipped: true });
  }, []);

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

  const applyStart = (hours: number, minutes: number) => {
    onChangeStartTime(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
  };

  const applyDuration = (hours: number, minutes: number) => {
    const total = Math.min(MAX_DURATION_MINUTES, hours * 60 + (hours === 24 ? 0 : minutes));
    onChangeDuration(total === 0 ? null : total);
  };

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-30" onClick={onClose} />
      <div
        aria-label={t("time.title")}
        className="calendar-popover time-wheel-popover"
        data-flipped={placement?.flipped ? "true" : undefined}
        data-testid="time-wheel-popover"
        ref={popoverRef}
        role="dialog"
        style={placement ? ({ top: placement.top, bottom: placement.bottom, left: placement.left, visibility: "visible" } as CSSProperties) : { visibility: "hidden" }}
      >
        <div className="text-xs font-medium uppercase text-[var(--text-label)]">{t("time.start")}</div>
        <div className="mt-1 flex items-center gap-1">
          <WheelPicker
            ariaLabel={t("time.startHour")}
            onSelect={(index) => applyStart(index, start.minutes)}
            selectedIndex={start.hours}
            values={HOURS_24}
          />
          <span className="wheel-picker-colon">:</span>
          <WheelPicker
            ariaLabel={t("time.startMinute")}
            onSelect={(index) => applyStart(start.hours, index)}
            selectedIndex={start.minutes}
            values={MINUTES_60}
          />
        </div>

        <div className="mt-3 text-xs font-medium uppercase text-[var(--text-label)]">{t("time.duration")}</div>
        <div className="mt-1 flex items-center gap-1">
          <WheelPicker
            ariaLabel={t("time.durationHours")}
            loop={false}
            onSelect={(index) => applyDuration(index, durationMins)}
            selectedIndex={durationHours}
            values={DURATION_HOURS}
          />
          <span className="wheel-picker-unit">{t("time.hoursUnit")}</span>
          <WheelPicker
            ariaLabel={t("time.durationMinutes")}
            disabled={durationHours === 24}
            onSelect={(index) => applyDuration(durationHours, index)}
            selectedIndex={durationHours === 24 ? 0 : durationMins}
            values={MINUTES_60}
          />
          <span className="wheel-picker-unit">{t("time.minutesUnit")}</span>
        </div>
        <p className="mt-2 min-h-4 text-center text-[11px] leading-4 text-[var(--text-faint)]">
          {duration === 0 ? t("time.durationNoneHint") : ""}
        </p>
      </div>
    </>
  );
}
