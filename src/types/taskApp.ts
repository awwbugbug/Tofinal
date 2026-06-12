export type TaskAppKind = "exe" | "shortcut";

export type TaskApp = {
  id: string;
  taskId: string;
  appName: string;
  appPath: string;
  appKind: TaskAppKind;
  launchArgs: string | null;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
};
