import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import { cn } from "@/lib/utils";

type WheelPickerProps = {
  /** Display labels; the selected value is reported as an index into this. */
  values: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Cyclic wheel (59 wraps to 0), like the iOS hour/minute drums. */
  loop?: boolean;
  disabled?: boolean;
  ariaLabel: string;
};

const ITEM_HEIGHT = 32;
const VISIBLE_ROWS = 5;
// Degrees of cylinder rotation per row away from the lens.
const ROW_TILT_DEG = 18;
const MAX_VISIBLE_DELTA = VISIBLE_ROWS / 2 + 0.6;
// Spring factor per frame (~critically damped at 60fps) for the snap settle.
const SPRING = 0.18;
// How far (in rows) a flick's velocity projects the target.
const FLICK_PROJECTION_MS = 150;
// Trackpads emit many small wheel deltas; accumulate to one detent per step.
const WHEEL_DETENT_THRESHOLD = 50;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Signed minimal cyclic distance from `offset` to item `index` on a loop of `length`. */
const cyclicDelta = (index: number, offset: number, length: number) => {
  const raw = (((index - offset) % length) + length) % length;
  return raw > length / 2 ? raw - length : raw;
};

const normalizeIndex = (value: number, length: number) => ((Math.round(value) % length) + length) % length;

/**
 * iOS-style drum picker: drag with inertia, mouse-wheel detents, click a row
 * to select, spring snap to the nearest row, cylinder-curved rows fading away
 * from the center lens. Selection commits (onSelect) the moment a new target
 * row is chosen; the settle animation follows.
 */
export function WheelPicker({ ariaLabel, disabled = false, loop = true, onSelect, selectedIndex, values }: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Continuous position in row units; the render loop paints from these refs.
  const offsetRef = useRef<number>(selectedIndex);
  const targetRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startOffset: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const wheelAccumRef = useRef(0);
  const lastCommittedRef = useRef(selectedIndex);
  const length = values.length;

  const clampTarget = useCallback(
    (value: number) => (loop ? value : Math.max(0, Math.min(length - 1, value))),
    [length, loop],
  );

  const paint = useCallback(() => {
    const offset = offsetRef.current;
    for (let index = 0; index < length; index += 1) {
      const item = itemRefs.current[index];
      if (!item) {
        continue;
      }
      const delta = loop ? cyclicDelta(index, offset, length) : index - offset;
      if (Math.abs(delta) > MAX_VISIBLE_DELTA) {
        item.style.visibility = "hidden";
        continue;
      }
      item.style.visibility = "visible";
      item.style.transform = `translateY(${delta * ITEM_HEIGHT}px) rotateX(${-delta * ROW_TILT_DEG}deg)`;
      const distance = Math.abs(delta);
      item.style.opacity = String(Math.max(0.14, 1 - distance * 0.32));
      item.dataset.selected = distance < 0.5 ? "true" : "false";
    }
  }, [length, loop]);

  const commitIfSettledOn = useCallback(
    (index: number) => {
      const normalized = loop ? normalizeIndex(index, length) : clampTarget(Math.round(index));
      if (normalized !== lastCommittedRef.current) {
        lastCommittedRef.current = normalized;
        onSelect(normalized);
      }
    },
    [clampTarget, length, loop, onSelect],
  );

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const animateToTarget = useCallback(() => {
    stopAnimation();
    const step = () => {
      const target = targetRef.current;
      if (target === null) {
        rafRef.current = null;
        return;
      }
      const diff = target - offsetRef.current;
      if (Math.abs(diff) < 0.004 || prefersReducedMotion()) {
        offsetRef.current = loop ? normalizeIndex(target, length) + (target - Math.round(target)) : target;
        targetRef.current = null;
        paint();
        rafRef.current = null;
        return;
      }
      offsetRef.current += diff * SPRING;
      paint();
      rafRef.current = window.requestAnimationFrame(step);
    };
    rafRef.current = window.requestAnimationFrame(step);
  }, [length, loop, paint, stopAnimation]);

  /** Choose a settle row: commit the selection now, then spring to it. */
  const settleTo = useCallback(
    (value: number) => {
      const target = clampTarget(Math.round(value));
      targetRef.current = target;
      commitIfSettledOn(target);
      animateToTarget();
    },
    [animateToTarget, clampTarget, commitIfSettledOn],
  );

  // External selection changes (e.g. the parent resets the time) spring the
  // drum to the new row without re-firing onSelect.
  useEffect(() => {
    if (selectedIndex === lastCommittedRef.current) {
      return;
    }
    lastCommittedRef.current = selectedIndex;
    const current = loop ? normalizeIndex(offsetRef.current, length) : offsetRef.current;
    const delta = loop ? cyclicDelta(selectedIndex, current, length) : selectedIndex - current;
    targetRef.current = offsetRef.current + delta;
    animateToTarget();
  }, [animateToTarget, length, loop, selectedIndex]);

  // Paint before the browser shows the first frame so rows never flash unstyled.
  useLayoutEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => stopAnimation, [stopAnimation]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) {
      return;
    }
    stopAnimation();
    targetRef.current = null;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offsetRef.current,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dy = event.clientY - drag.lastY;
    const dt = Math.max(1, event.timeStamp - drag.lastTime);
    // EWMA keeps the flick velocity stable against jittery pointer samples.
    drag.velocity = 0.8 * (-dy / ITEM_HEIGHT / dt) + 0.2 * drag.velocity;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    if (Math.abs(event.clientY - drag.startY) > 3) {
      drag.moved = true;
    }
    let next = drag.startOffset - (event.clientY - drag.startY) / ITEM_HEIGHT;
    if (!loop) {
      // Rubber-band resistance beyond the ends.
      if (next < 0) {
        next = next / 3;
      } else if (next > length - 1) {
        next = length - 1 + (next - (length - 1)) / 3;
      }
    }
    offsetRef.current = next;
    paint();
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!drag.moved) {
      // Plain click: select the row under the cursor.
      const rect = event.currentTarget.getBoundingClientRect();
      const rowFromCenter = Math.round((event.clientY - rect.top - rect.height / 2) / ITEM_HEIGHT);
      settleTo(offsetRef.current + rowFromCenter);
      return;
    }
    settleTo(offsetRef.current + drag.velocity * FLICK_PROJECTION_MS);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    wheelAccumRef.current += event.deltaY;
    if (Math.abs(wheelAccumRef.current) < WHEEL_DETENT_THRESHOLD) {
      return;
    }
    const steps = Math.sign(wheelAccumRef.current);
    wheelAccumRef.current = 0;
    const base = targetRef.current ?? Math.round(offsetRef.current);
    settleTo(base + steps);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    const base = targetRef.current ?? Math.round(offsetRef.current);
    if (event.key === "ArrowUp") {
      event.preventDefault();
      settleTo(base - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      settleTo(base + 1);
    }
  };

  const items = useMemo(() => values.map((label, index) => ({ label, index })), [values]);

  return (
    <div
      aria-label={ariaLabel}
      aria-valuemax={length - 1}
      aria-valuemin={0}
      aria-valuenow={selectedIndex}
      aria-valuetext={values[selectedIndex]}
      className={cn("wheel-picker touch-none", disabled && "wheel-picker-disabled")}
      onKeyDown={handleKeyDown}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onWheel={handleWheel}
      ref={containerRef}
      role="spinbutton"
      style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}
      tabIndex={disabled ? -1 : 0}
    >
      <div aria-hidden="true" className="wheel-picker-lens" style={{ height: ITEM_HEIGHT }} />
      {items.map(({ label, index }) => (
        <div
          className="wheel-picker-item"
          data-wheel-index={index}
          key={index}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          style={{ height: ITEM_HEIGHT, lineHeight: `${ITEM_HEIGHT}px` }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
