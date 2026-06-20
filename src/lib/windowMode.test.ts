import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyWindowMode } from "@/lib/windowMode";

const tauriMocks = vi.hoisted(() => {
  class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  }

  const appWindow = {
    setAlwaysOnTop: vi.fn(async () => undefined),
    setMaxSize: vi.fn(async () => undefined),
    setMinSize: vi.fn(async () => undefined),
    setResizable: vi.fn(async () => undefined),
    setSize: vi.fn(async () => undefined),
    setSkipTaskbar: vi.fn(async () => undefined),
  };

  return {
    appWindow,
    LogicalSize,
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  LogicalSize: tauriMocks.LogicalSize,
  getCurrentWindow: () => tauriMocks.appWindow,
}));

describe("windowMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies the compact Desktop Pin window profile", async () => {
    await applyWindowMode("pin");

    expect(tauriMocks.appWindow.setMinSize).toHaveBeenCalledWith(
      expect.objectContaining({ height: 420, width: 320 }),
    );
    expect(tauriMocks.appWindow.setMaxSize).toHaveBeenCalledWith(
      expect.objectContaining({ height: 680, width: 480 }),
    );
    expect(tauriMocks.appWindow.setResizable).toHaveBeenCalledWith(true);
    expect(tauriMocks.appWindow.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ height: 520, width: 360 }),
    );
    expect(tauriMocks.appWindow.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(tauriMocks.appWindow.setSkipTaskbar).toHaveBeenCalledWith(true);
  });

  it("restores the normal window profile", async () => {
    await applyWindowMode("normal");

    expect(tauriMocks.appWindow.setMinSize).toHaveBeenCalledWith(
      expect.objectContaining({ height: 620, width: 920 }),
    );
    expect(tauriMocks.appWindow.setMaxSize).toHaveBeenCalledWith(null);
    expect(tauriMocks.appWindow.setResizable).toHaveBeenCalledWith(true);
    expect(tauriMocks.appWindow.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ height: 760, width: 1120 }),
    );
    expect(tauriMocks.appWindow.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(tauriMocks.appWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
  });
});
