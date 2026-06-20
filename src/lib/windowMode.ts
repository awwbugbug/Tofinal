import type { AppMode } from "@/types/task";

type TauriWindowModule = typeof import("@tauri-apps/api/window");

const windowProfiles = {
  normal: {
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    maxWidth: null,
    maxHeight: null,
    alwaysOnTop: false,
    skipTaskbar: false,
  },
  pin: {
    width: 360,
    height: 520,
    minWidth: 320,
    minHeight: 420,
    maxWidth: 480,
    maxHeight: 680,
    alwaysOnTop: true,
    skipTaskbar: true,
  },
} satisfies Record<AppMode, Record<string, number | boolean | null>>;

export async function applyWindowMode(mode: AppMode) {
  try {
    const tauriWindow: TauriWindowModule = await import("@tauri-apps/api/window");
    const appWindow = tauriWindow.getCurrentWindow();
    const profile = windowProfiles[mode];

    await appWindow.setMinSize(
      new tauriWindow.LogicalSize(profile.minWidth as number, profile.minHeight as number),
    );
    await appWindow.setMaxSize(
      profile.maxWidth && profile.maxHeight
        ? new tauriWindow.LogicalSize(profile.maxWidth as number, profile.maxHeight as number)
        : null,
    );
    await appWindow.setResizable(true);
    await appWindow.setSize(new tauriWindow.LogicalSize(profile.width as number, profile.height as number));
    await appWindow.setAlwaysOnTop(profile.alwaysOnTop as boolean);
    await appWindow.setSkipTaskbar(profile.skipTaskbar as boolean);
  } catch {
    // Browser preview or restricted Tauri permissions still keep the UI mode switch usable.
  }
}
