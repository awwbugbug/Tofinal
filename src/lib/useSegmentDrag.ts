import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Orientation = "horizontal" | "vertical";

type SegmentDragOptions = {
  /** Axis the thumb travels along. */
  orientation?: Orientation;
  /** Commit a selection for the segment at `index`. */
  onSelectIndex: (index: number) => void;
};

// A press that never travels this far (px) stays a plain click; past it the
// gesture becomes a thumb drag and the trailing synthetic click is swallowed.
const DRAG_THRESHOLD = 4;

/**
 * Makes a segmented control draggable: press the thumb (or anywhere on the
 * track) and slide along the axis to select the segment under the pointer.
 * Plain clicks and keyboard activation still flow through each segment's own
 * handlers untouched — only genuine drags are intercepted.
 *
 * Segments are located by their live DOM rects, so this works for any column
 * count, gap, or orientation. Mark each segment button with
 * `data-segment-button` and spread the returned handlers on the track element.
 */
export function useSegmentDrag({ orientation = "horizontal", onSelectIndex }: SegmentDragOptions) {
  const stateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
    lastIndex: number;
  } | null>(null);
  // Set on the drag-ending pointerup so the browser's follow-up click on the
  // segment button doesn't re-fire the selection.
  const suppressClickRef = useRef(false);

  const indexAtPoint = useCallback(
    (container: HTMLElement, clientX: number, clientY: number) => {
      const buttons = Array.from(container.querySelectorAll<HTMLElement>("[data-segment-button]"));
      if (buttons.length === 0) {
        return -1;
      }
      const pos = orientation === "horizontal" ? clientX : clientY;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      buttons.forEach((button, index) => {
        const rect = button.getBoundingClientRect();
        const start = orientation === "horizontal" ? rect.left : rect.top;
        const end = orientation === "horizontal" ? rect.right : rect.bottom;
        if (pos >= start && pos <= end) {
          best = index;
          bestDistance = -1;
          return;
        }
        if (bestDistance === -1) {
          return;
        }
        const center = (start + end) / 2;
        const distance = Math.abs(pos - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    },
    [orientation],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      stateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        lastIndex: indexAtPoint(event.currentTarget, event.clientX, event.clientY),
      };
    },
    [indexAtPoint],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      const container = event.currentTarget;
      if (!state.dragging) {
        const travelled = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
        if (travelled < DRAG_THRESHOLD) {
          return;
        }
        state.dragging = true;
        container.setPointerCapture?.(event.pointerId);
        // Land on whatever segment the drag opened over, even if it matches the
        // press target (e.g. pressing an unselected segment then nudging).
        const index = indexAtPoint(container, event.clientX, event.clientY);
        if (index >= 0) {
          state.lastIndex = index;
          onSelectIndex(index);
        }
        return;
      }
      const index = indexAtPoint(container, event.clientX, event.clientY);
      if (index >= 0 && index !== state.lastIndex) {
        state.lastIndex = index;
        onSelectIndex(index);
      }
    },
    [indexAtPoint, onSelectIndex],
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = stateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    if (state.dragging) {
      suppressClickRef.current = true;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    stateRef.current = null;
  }, []);

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture };
}
