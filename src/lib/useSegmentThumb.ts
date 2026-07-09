import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Positions a segmented-control thumb by MEASURING the currently-selected
 * segment rather than assuming equal-width columns. This lets the segments size
 * to their content (so long labels like "Tomorrow" get the room they need)
 * while the thumb still lands exactly on the active one.
 *
 * Mark the track element with the returned ref, mark each segment button with
 * `data-segment-button` and the active one with `data-selected="true"`, and
 * spread `thumbStyle` onto the thumb. `activeKey`/`depsKey` re-measure on
 * selection and language (font width) changes; a ResizeObserver handles the
 * panel resizing.
 */
export function useSegmentThumb(activeKey: string, depsKey: string) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return undefined;
    }

    const measure = () => {
      const selected = shell.querySelector<HTMLElement>('[data-segment-button][data-selected="true"]');
      if (!selected) {
        return;
      }
      const shellRect = shell.getBoundingClientRect();
      const borderLeft = parseFloat(window.getComputedStyle(shell).borderLeftWidth) || 0;
      const buttonRect = selected.getBoundingClientRect();
      // `left` resolves against the shell's padding box (its positioned
      // ancestor), so subtract the shell border to align with the button's box.
      setThumb({ left: buttonRect.left - shellRect.left - borderLeft, width: buttonRect.width });
    };

    measure();
    // Web fonts can change label widths after first paint.
    document.fonts?.ready.then(measure).catch(() => {});
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(shell);
    return () => observer?.disconnect();
  }, [activeKey, depsKey]);

  const thumbStyle: CSSProperties | undefined = thumb ? { left: thumb.left, width: thumb.width } : undefined;
  return { shellRef, thumbStyle };
}
