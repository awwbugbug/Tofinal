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

type ScreenshotWindow = {
  hide: () => Promise<void>;
  show: () => Promise<void>;
  setFocus: () => Promise<void>;
};

type ScreenshotCaptureRuntime = {
  invoke: () => Promise<CaptureFullscreenScreenshotResult>;
  getCurrentWindow: () => ScreenshotWindow | Promise<ScreenshotWindow>;
  delay: (milliseconds: number) => Promise<void>;
};

const CAPTURE_WINDOW_SETTLE_MS = 180;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const restoreWindow = async (appWindow: ScreenshotWindow | null) => {
  if (!appWindow) {
    return;
  }

  try {
    await appWindow.show();
    await appWindow.setFocus();
  } catch {
    // Browser/dev fallback: screenshot capture should report the real capture error, not restoration failures.
  }
};

export const createTauriScreenshotCapture = (runtime: ScreenshotCaptureRuntime): ScreenshotCapture => ({
  async captureFullscreen() {
    let appWindow: ScreenshotWindow | null = null;

    try {
      appWindow = await runtime.getCurrentWindow();
      await appWindow.hide();
      await runtime.delay(CAPTURE_WINDOW_SETTLE_MS);
    } catch {
      // Non-Tauri/browser fallback continues to the capture command; the command itself will surface errors.
      appWindow = null;
    }

    try {
      const result = await runtime.invoke();

      return {
        pngBytes: new Uint8Array(result.pngBytes),
        width: result.width,
        height: result.height,
      };
    } finally {
      await restoreWindow(appWindow);
    }
  },
});

export const tauriScreenshotCapture: ScreenshotCapture = createTauriScreenshotCapture({
  delay: wait,
  async getCurrentWindow() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  },
  invoke: () => invoke<CaptureFullscreenScreenshotResult>("capture_fullscreen_screenshot"),
});
