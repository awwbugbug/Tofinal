import { useCallback, useLayoutEffect, useState, type CSSProperties } from "react";

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
  // The track lives in STATE, not a plain ref, so the effect re-runs whenever it
  // mounts or remounts. TaskDetail renders an empty state when no task is
  // selected (switching the viewed date can deselect), which unmounts the track;
  // with a plain ref the effect would not re-run, leaving the thumb on stale
  // pixels and its observer bound to the detached node — so the thumb kept a
  // width measured at a different panel size and spilled out of the track.
  const [shell, setShell] = useState<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const shellRef = useCallback((node: HTMLDivElement | null) => setShell(node), []);

  useLayoutEffect(() => {
    if (!shell) {
      // Track is gone: drop the stale pixels so a remount starts from the CSS
      // column geometry instead of the previous measurement.
      setThumb(null);
      return undefined;
    }

    const measure = () => {
      const selected = shell.querySelector<HTMLElement>('[data-segment-button][data-selected="true"]');
      if (!selected) {
        return;
      }
      // offsetLeft/offsetWidth are LAYOUT values measured against the shell (the
      // thumb's positioned ancestor), so they line up with the thumb's `left`
      // with no border correction, and — unlike getBoundingClientRect — they are
      // immune to ancestor transforms and mid-animation reads.
      const width = selected.offsetWidth;
      if (width === 0) {
        // Hidden or not laid out yet; keep the CSS geometry rather than pinning
        // a bogus zero.
        return;
      }
      setThumb({ left: selected.offsetLeft, width });
    };

    measure();
    // Web fonts can change label widths after first paint.
    document.fonts?.ready.then(measure).catch(() => {});
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(shell);
    return () => observer?.disconnect();
  }, [shell, activeKey, depsKey]);

  const thumbStyle: CSSProperties | undefined = thumb ? { left: thumb.left, width: thumb.width } : undefined;
  return { shellRef, thumbStyle };
}
