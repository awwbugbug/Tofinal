import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { FinalScreenshot, PendingScreenshot } from "@/stores/attachmentStore";

const MIN_CROP_PIXELS = 16;
const CLOSE_ANIMATION_MS = 190;

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

export type ScreenshotCropper = (
  image: HTMLImageElement,
  crop: Rect,
  outputWidth: number,
  outputHeight: number,
) => Promise<Uint8Array>;

type ScreenshotEditorOverlayProps = {
  screenshot: PendingScreenshot;
  cropper?: ScreenshotCropper;
  onCancel: () => void;
  onConfirm: (screenshot: FinalScreenshot) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const normalizeSelection = (start: Point, current: Point, bounds: { width: number; height: number }): Rect => {
  const startX = clamp(start.x, 0, bounds.width);
  const startY = clamp(start.y, 0, bounds.height);
  const currentX = clamp(current.x, 0, bounds.width);
  const currentY = clamp(current.y, 0, bounds.height);

  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
};

export const mapSelectionToBitmapCrop = (
  selection: Rect,
  imageRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  bitmapWidth: number,
  bitmapHeight: number,
): Rect => {
  const scaleX = bitmapWidth / imageRect.width;
  const scaleY = bitmapHeight / imageRect.height;
  const cropX = Math.round((selection.left - imageRect.left) * scaleX);
  const cropY = Math.round((selection.top - imageRect.top) * scaleY);
  const cropWidth = Math.round(selection.width * scaleX);
  const cropHeight = Math.round(selection.height * scaleY);
  const left = clamp(cropX, 0, bitmapWidth);
  const top = clamp(cropY, 0, bitmapHeight);

  return {
    left,
    top,
    width: clamp(cropWidth, 0, bitmapWidth - left),
    height: clamp(cropHeight, 0, bitmapHeight - top),
  };
};

const defaultCropper: ScreenshotCropper = async (image, crop, outputWidth, outputHeight) => {
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare screenshot crop.");
  }

  context.drawImage(
    image,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error("Unable to encode cropped screenshot."));
        return;
      }

      resolve(nextBlob);
    }, "image/png");
  });

  return new Uint8Array(await blob.arrayBuffer());
};

export function ScreenshotEditorOverlay({
  cropper = defaultCropper,
  onCancel,
  onConfirm,
  screenshot,
}: ScreenshotEditorOverlayProps) {
  const { t } = useI18n();
  const imageRef = useRef<HTMLImageElement>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);

  const requestCancel = () => {
    if (closing) {
      return;
    }

    setClosing(true);
    window.setTimeout(onCancel, CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const pointFromEvent = (event: PointerEvent | ReactPointerEvent) => {
    const image = imageRef.current;
    if (!image) {
      return null;
    }

    const rect = image.getBoundingClientRect();
    return {
      bounds: rect,
      point: {
        x: clamp(event.clientX - rect.left, 0, rect.width),
        y: clamp(event.clientY - rect.top, 0, rect.height),
      },
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const next = pointFromEvent(event);
    if (!next) {
      return;
    }

    const start = next.point;
    setError("");
    setDragStart(start);
    setSelection({ left: start.x, top: start.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const current = pointFromEvent(moveEvent);
      if (!current) {
        return;
      }

      setSelection(normalizeSelection(start, current.point, current.bounds));
    };

    const stopDragging = () => {
      setDragStart(null);
      window.removeEventListener("pointermove", handlePointerMove);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging, { once: true });
  };

  const handleReset = () => {
    setSelection(null);
    setError("");
  };

  const handleConfirm = async () => {
    const image = imageRef.current;
    if (!image) {
      setError(t("screenshot.previewUnavailable"));
      return;
    }

    if (!selection || selection.width === 0 || selection.height === 0) {
      onConfirm({
        pngBytes: screenshot.pngBytes,
        width: screenshot.width,
        height: screenshot.height,
      });
      return;
    }

    const imageRect = image.getBoundingClientRect();
    const viewportSelection = {
      ...selection,
      left: selection.left + imageRect.left,
      top: selection.top + imageRect.top,
    };
    const crop = mapSelectionToBitmapCrop(viewportSelection, imageRect, screenshot.width, screenshot.height);

    if (crop.width < MIN_CROP_PIXELS || crop.height < MIN_CROP_PIXELS) {
      setError(t("screenshot.smallCrop"));
      return;
    }

    try {
      const pngBytes = await cropper(image, crop, crop.width, crop.height);
      onConfirm({ pngBytes, width: crop.width, height: crop.height });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("screenshot.cropFailed"));
    }
  };

  return (
    <div
      aria-label={t("screenshot.editor")}
      aria-modal="true"
      className="screenshot-editor"
      data-closing={closing}
      role="dialog"
    >
      <button
        aria-label={t("screenshot.cancelBackdrop")}
        className="screenshot-editor-backdrop"
        data-testid="screenshot-editor-backdrop"
        onClick={requestCancel}
        type="button"
      />
      <div className="screenshot-editor-panel">
        <div className="screenshot-editor-toolbar">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{t("screenshot.title")}</p>
            <p className="text-xs text-white/60">{t("screenshot.hint")}</p>
          </div>
          <Button
            aria-label={t("screenshot.cancelEditor")}
            className="overlay-edge-icon-button"
            edgeSafe
            onClick={requestCancel}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          className="screenshot-editor-preview-frame"
          data-testid="screenshot-editor-preview-frame"
          onPointerDown={handlePointerDown}
        >
          <img
            alt={t("screenshot.previewAlt")}
            className="screenshot-editor-image"
            draggable={false}
            ref={imageRef}
            src={screenshot.previewUrl}
          />
          {selection && (selection.width > 0 || selection.height > 0) && (
            <div
              aria-hidden="true"
              className="screenshot-editor-selection"
              style={{
                height: `${selection.height}px`,
                left: `${selection.left}px`,
                top: `${selection.top}px`,
                width: `${selection.width}px`,
              }}
            />
          )}
        </div>

        <div className="screenshot-editor-footer">
          <div className="min-w-0">
            {error ? (
              <p className="text-xs text-[var(--danger-soft)]">{error}</p>
            ) : (
              <p className="text-xs text-white/60">
                {dragStart ? t("screenshot.selecting") : selection ? t("screenshot.cropSelected") : t("screenshot.noCropSelected")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              className="bg-white/12 text-white hover:bg-white/20 hover:text-white"
              onClick={handleReset}
              type="button"
              variant="ghost"
            >
              <RotateCcw className="h-4 w-4" />
              {t("screenshot.resetCrop")}
            </Button>
            <Button
              className="bg-white/12 text-white hover:bg-white/20 hover:text-white"
              onClick={requestCancel}
              type="button"
              variant="ghost"
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleConfirm()} type="button">
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
