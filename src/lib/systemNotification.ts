/**
 * Best-effort OS toast notifications via the Tauri notification plugin.
 * Degrades to a no-op outside Tauri (browser preview, tests) or when the user
 * denies permission — notifications must never break the reminder loop.
 */

let permissionChecked = false;
let permissionGranted = false;

export const sendSystemNotification = async (title: string, body: string) => {
  try {
    const notification = await import("@tauri-apps/plugin-notification");

    if (!permissionChecked) {
      permissionChecked = true;
      permissionGranted = await notification.isPermissionGranted();
      if (!permissionGranted) {
        permissionGranted = (await notification.requestPermission()) === "granted";
      }
    }
    if (!permissionGranted) {
      return;
    }

    notification.sendNotification({ title, body });
  } catch {
    // Not running under Tauri, or the plugin is unavailable — skip silently.
  }
};
