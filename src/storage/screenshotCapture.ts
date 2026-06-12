import { invoke } from "@tauri-apps/api/core";

export type CapturedScreenshot = {
  pngBytes: Uint8Array;
  width: number | null;
  height: number | null;
};

export type ScreenshotCapture = {
  captureFullscreen: () => Promise<CapturedScreenshot>;
};

type CaptureFullscreenScreenshotResult = {
  pngBytes: number[];
  width: number;
  height: number;
};

export const tauriScreenshotCapture: ScreenshotCapture = {
  async captureFullscreen() {
    const result = await invoke<CaptureFullscreenScreenshotResult>("capture_fullscreen_screenshot");

    return {
      pngBytes: new Uint8Array(result.pngBytes),
      width: result.width,
      height: result.height,
    };
  },
};
