import { type RefObject, useEffect, useRef, useState } from "react";

type DragDropPayload =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

type UseExternalImageDropOptions = {
  enabled: boolean;
  zoneRef: RefObject<HTMLElement | null>;
  onDropPaths: (paths: string[]) => void;
};

/**
 * Native OS file drag-and-drop for the attachments dropzone.
 *
 * Tauri v2 intercepts native drops (dragDropEnabled default), so DOM drop
 * events never carry file paths; the webview's drag-drop event is the only
 * source. Positions arrive in physical pixels and are converted with
 * devicePixelRatio before hit-testing the dropzone rect. Best-effort: in
 * browser preview or tests the webview API import simply fails and the hook
 * stays inert.
 */
export function useExternalImageDrop({ enabled, onDropPaths, zoneRef }: UseExternalImageDropOptions) {
  const [dropActive, setDropActive] = useState(false);
  const enabledRef = useRef(enabled);
  const onDropPathsRef = useRef(onDropPaths);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      setDropActive(false);
    }
  }, [enabled]);

  useEffect(() => {
    onDropPathsRef.current = onDropPaths;
  }, [onDropPaths]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const isOverZone = (position: { x: number; y: number }) => {
      const element = zoneRef.current;
      if (!element) {
        return false;
      }

      const scale = window.devicePixelRatio || 1;
      const x = position.x / scale;
      const y = position.y / scale;
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const setup = async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (!enabledRef.current) {
            setDropActive(false);
            return;
          }

          const payload = event.payload as DragDropPayload;
          if (payload.type === "enter" || payload.type === "over") {
            setDropActive(isOverZone(payload.position));
            return;
          }

          if (payload.type === "drop") {
            const overZone = isOverZone(payload.position);
            setDropActive(false);
            if (overZone && payload.paths.length > 0) {
              onDropPathsRef.current(payload.paths);
            }
            return;
          }

          setDropActive(false);
        });

        if (disposed) {
          unlisten();
        }
      } catch {
        // Not running inside Tauri (browser preview, jsdom): stay inert.
      }
    };

    void setup();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [zoneRef]);

  return dropActive;
}
