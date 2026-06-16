import { describe, expect, it } from "vitest";

import { createTauriScreenshotCapture } from "@/storage/screenshotCapture";

describe("screenshot capture adapter", () => {
  it("hides the current window before capture and restores it afterward", async () => {
    const calls: string[] = [];
    const capture = createTauriScreenshotCapture({
      delay: async () => {
        calls.push("delay");
      },
      getCurrentWindow: () => ({
        hide: async () => {
          calls.push("hide");
        },
        setFocus: async () => {
          calls.push("focus");
        },
        show: async () => {
          calls.push("show");
        },
      }),
      invoke: async () => {
        calls.push("capture");
        return {
          height: 1080,
          pngBytes: [137, 80, 78, 71],
          width: 1920,
        };
      },
    });

    const result = await capture.captureFullscreen();

    expect(result).toEqual({
      height: 1080,
      pngBytes: new Uint8Array([137, 80, 78, 71]),
      width: 1920,
    });
    expect(calls).toEqual(["hide", "delay", "capture", "show", "focus"]);
  });

  it("restores the current window when capture fails", async () => {
    const calls: string[] = [];
    const capture = createTauriScreenshotCapture({
      delay: async () => {
        calls.push("delay");
      },
      getCurrentWindow: () => ({
        hide: async () => {
          calls.push("hide");
        },
        setFocus: async () => {
          calls.push("focus");
        },
        show: async () => {
          calls.push("show");
        },
      }),
      invoke: async () => {
        calls.push("capture");
        throw new Error("capture failed");
      },
    });

    await expect(capture.captureFullscreen()).rejects.toThrow("capture failed");
    expect(calls).toEqual(["hide", "delay", "capture", "show", "focus"]);
  });
});
