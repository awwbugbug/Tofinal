import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mapSelectionToBitmapCrop,
  normalizeSelection,
  ScreenshotEditorOverlay,
  type ScreenshotCropper,
} from "@/components/task/ScreenshotEditorOverlay";
import type { PendingScreenshot } from "@/stores/attachmentStore";
import { resetPreferencesStore, usePreferencesStore } from "@/stores/preferencesStore";

const screenshot = (overrides: Partial<PendingScreenshot> = {}): PendingScreenshot => ({
  taskId: "task-1",
  pngBytes: new Uint8Array([137, 80, 78, 71]),
  previewUrl: "blob:image/png:pending",
  width: 1920,
  height: 1080,
  ...overrides,
});

const renderEditor = (options: {
  cropper?: ScreenshotCropper;
  onConfirm?: (value: { pngBytes: Uint8Array; width: number; height: number }) => void;
  onCancel?: () => void;
} = {}) => {
  const onCancel = options.onCancel ?? vi.fn();
  const onConfirm = options.onConfirm ?? vi.fn();
  const cropper = options.cropper ?? vi.fn(async () => new Uint8Array([1, 2, 3]));

  const view = render(
    <ScreenshotEditorOverlay
      cropper={cropper}
      screenshot={screenshot()}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );

  const previewImage = screen.getByRole("img", { name: /captured screenshot preview/i });
  vi.spyOn(previewImage, "getBoundingClientRect").mockReturnValue({
    bottom: 640,
    height: 540,
    left: 100,
    right: 1060,
    top: 100,
    width: 960,
    x: 100,
    y: 100,
    toJSON: () => undefined,
  } as DOMRect);

  return {
    cropper,
    onCancel,
    onConfirm,
    previewFrame: screen.getByTestId("screenshot-editor-preview-frame"),
    unmount: view.unmount,
  };
};

describe("ScreenshotEditorOverlay", () => {
  beforeEach(() => {
    resetPreferencesStore();
    usePreferencesStore.getState().setLanguage("en-US");
  });

  it("maps normalized preview selections to bitmap crop bounds", () => {
    expect(normalizeSelection({ x: 300, y: 260 }, { x: -20, y: 20 }, { width: 500, height: 400 })).toEqual({
      left: 0,
      top: 20,
      width: 300,
      height: 240,
    });

    expect(
      mapSelectionToBitmapCrop(
        { left: 340, top: 220, width: 480, height: 270 },
        { left: 100, top: 100, width: 960, height: 540 },
        1920,
        1080,
      ),
    ).toEqual({
      left: 480,
      top: 240,
      width: 960,
      height: 540,
    });
  });

  it("confirms the full screenshot when no crop exists", async () => {
    const { cropper, onConfirm } = renderEditor();

    await userEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(cropper).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith({
      pngBytes: new Uint8Array([137, 80, 78, 71]),
      width: 1920,
      height: 1080,
    });
  });

  it("confirms a valid crop with mapped bitmap dimensions", async () => {
    const cropper = vi.fn(async () => new Uint8Array([9, 8, 7]));
    const { onConfirm, previewFrame } = renderEditor({ cropper });

    fireEvent.pointerDown(previewFrame, { clientX: 340, clientY: 220, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 820, clientY: 490 });
    fireEvent.pointerUp(window);
    await userEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => expect(cropper).toHaveBeenCalled());
    expect(cropper).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      { left: 480, top: 240, width: 960, height: 540 },
      960,
      540,
    );
    expect(onConfirm).toHaveBeenCalledWith({ pngBytes: new Uint8Array([9, 8, 7]), width: 960, height: 540 });
  });

  it("rejects too-small crops and reset crop makes confirm save full screenshot", async () => {
    const { cropper, onConfirm, previewFrame } = renderEditor();

    fireEvent.pointerDown(previewFrame, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 104, clientY: 104 });
    fireEvent.pointerUp(window);
    await userEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(screen.getByText(/select a larger crop area/i)).toBeInTheDocument();
    expect(cropper).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /reset crop/i }));
    await userEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      pngBytes: new Uint8Array([137, 80, 78, 71]),
      width: 1920,
      height: 1080,
    });
  });

  it("cancels with button, backdrop, and Escape without confirming", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    let editor = renderEditor({ onCancel, onConfirm });

    const closeButton = screen.getByRole("button", { name: /^cancel screenshot editor$/i });
    expect(closeButton).toHaveClass("glass-icon-button");
    expect(closeButton).toHaveClass("glass-icon-button-safe");
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(onConfirm).not.toHaveBeenCalled();
    editor.unmount();

    onCancel.mockClear();
    editor = renderEditor({ onCancel, onConfirm });
    await userEvent.click(screen.getByTestId("screenshot-editor-backdrop"));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    editor.unmount();

    onCancel.mockClear();
    renderEditor({ onCancel, onConfirm });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));

    expect(within(screen.getByRole("dialog", { name: /screenshot editor/i })).queryByText(/ocr/i)).not.toBeInTheDocument();
  });
});
