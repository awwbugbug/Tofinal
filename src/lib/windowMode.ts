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

async function applyWindowModeNow(mode: AppMode) {
  try {
    const tauriWindow: TauriWindowModule = await import("@tauri-apps/api/window");
    const appWindow = tauriWindow.getCurrentWindow();
    const { LogicalSize } = tauriWindow;
    const profile = windowProfiles[mode];

    await appWindow.setResizable(true);
    // Relax both constraints before resizing so setSize is the ONLY resize.
    // If the target max is smaller than the current window (shrinking to pin)
    // or the target min is larger than it (growing to normal), applying the
    // constraint first forces the OS to clamp the window immediately — a second
    // resize on top of setSize. That double resize is what can leave WebView2
    // painting a black frame during the mode switch.
    await appWindow.setMaxSize(null);
    await appWindow.setMinSize(new LogicalSize(1, 1));
    await appWindow.setSize(new LogicalSize(profile.width as number, profile.height as number));
    await appWindow.setMinSize(new LogicalSize(profile.minWidth as number, profile.minHeight as number));
    if (profile.maxWidth && profile.maxHeight) {
      await appWindow.setMaxSize(new LogicalSize(profile.maxWidth as number, profile.maxHeight as number));
    }
    await appWindow.setAlwaysOnTop(profile.alwaysOnTop as boolean);
    await appWindow.setSkipTaskbar(profile.skipTaskbar as boolean);
  } catch {
    // Browser preview or restricted Tauri permissions still keep the UI mode switch usable.
  }
}

// Serialize calls: overlapping mode switches must not interleave their
// setMinSize/setSize/setMaxSize calls, or the window can land in a clamped,
// half-applied size.
let pending: Promise<void> = Promise.resolve();

export function applyWindowMode(mode: AppMode): Promise<void> {
  pending = pending.then(() => applyWindowModeNow(mode));
  return pending;
}
