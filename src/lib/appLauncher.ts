import { invoke } from "@tauri-apps/api/core";

import type { TaskApp } from "@/types/taskApp";

export type AppLauncher = {
  launch: (taskApp: TaskApp) => Promise<void>;
};

export const tauriAppLauncher: AppLauncher = {
  async launch(taskApp) {
    await invoke("launch_task_app", {
      appPath: taskApp.appPath,
      appKind: taskApp.appKind,
    });
  },
};
