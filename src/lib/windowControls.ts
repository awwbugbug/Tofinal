type TauriWindowModule = typeof import("@tauri-apps/api/window");

async function withCurrentWindow(action: (appWindow: ReturnType<TauriWindowModule["getCurrentWindow"]>) => Promise<void>) {
  try {
    const { getCurrentWindow }: TauriWindowModule = await import("@tauri-apps/api/window");

    await action(getCurrentWindow());
  } catch {
    // Window controls are active in Tauri. Browser preview falls back to inert controls.
  }
}

export async function startWindowDrag() {
  await withCurrentWindow((appWindow) => appWindow.startDragging());
}

export async function minimizeWindow() {
  await withCurrentWindow((appWindow) => appWindow.minimize());
}

export async function toggleMaximizeWindow() {
  await withCurrentWindow((appWindow) => appWindow.toggleMaximize());
}

export async function closeWindow() {
  await withCurrentWindow((appWindow) => appWindow.close());
}
