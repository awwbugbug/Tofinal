/**
 * OS reminder toasts via the app's own Rust command (WinRT), which — unlike
 * the notification plugin — reports clicks: activating a toast refocuses the
 * window and emits "reminder-notification-activated" with the task id.
 * Degrades to a no-op outside Tauri; failures must never break reminders.
 */
export const sendSystemNotification = async (title: string, body: string, taskId: string) => {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("notify_reminder", { title, body, taskId });
  } catch (error) {
    console.warn("System notification unavailable:", error);
  }
};

/** Subscribe to OS toast clicks; resolves to an unlisten function. */
export const listenForNotificationActivation = async (onActivate: (taskId: string) => void) => {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<string>("reminder-notification-activated", (event) => {
      if (typeof event.payload === "string") {
        onActivate(event.payload);
      }
    });
  } catch {
    return () => {};
  }
};
