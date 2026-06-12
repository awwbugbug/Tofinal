import {
  createSqliteDatabaseContext,
  SQLITE_DATABASE_PATH,
  sharedSqliteDatabaseContext,
  type SqlDatabaseLoader,
  type SqlValue,
  type SqliteDatabaseContext,
} from "@/repositories/sqliteTaskRepository";
import type { TaskApp, TaskAppKind } from "@/types/taskApp";

type SqlTaskAppRow = {
  id: unknown;
  task_id: unknown;
  app_name: unknown;
  app_path: unknown;
  app_kind: unknown;
  launch_args: unknown;
  created_at: unknown;
  updated_at: unknown;
  sort_order: unknown;
};

type TaskAppUpdate = {
  appName: string;
  updatedAt: string;
};

const SELECT_TASK_APP_COLUMNS = `id,
  task_id,
  app_name,
  app_path,
  app_kind,
  launch_args,
  created_at,
  updated_at,
  sort_order`;

const SELECT_TASK_APPS_BY_TASK_SQL = `SELECT ${SELECT_TASK_APP_COLUMNS}
FROM task_apps
WHERE task_id = ?
ORDER BY sort_order ASC, created_at ASC, id ASC`;

const SELECT_TASK_APP_BY_ID_SQL = `SELECT ${SELECT_TASK_APP_COLUMNS}
FROM task_apps
WHERE id = ?
LIMIT 1`;

const INSERT_TASK_APP_SQL = `INSERT INTO task_apps (
  id,
  task_id,
  app_name,
  app_path,
  app_kind,
  launch_args,
  created_at,
  updated_at,
  sort_order
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const isTaskAppKind = (value: unknown): value is TaskAppKind =>
  value === "exe" || value === "shortcut";

const stringField = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new Error(`Invalid SQLite task app text field: ${field}`);
  }

  return value;
};

const numberField = (value: unknown, field: string) => {
  if (typeof value !== "number") {
    throw new Error(`Invalid SQLite task app number field: ${field}`);
  }

  return value;
};

const nullableStringField = (value: unknown, field: string) => {
  if (value === null) {
    return null;
  }

  return stringField(value, field);
};

export const taskAppFromSqlRow = (row: SqlTaskAppRow): TaskApp => {
  if (!isTaskAppKind(row.app_kind)) {
    throw new Error("Invalid task app kind.");
  }

  return {
    id: stringField(row.id, "id"),
    taskId: stringField(row.task_id, "task_id"),
    appName: stringField(row.app_name, "app_name"),
    appPath: stringField(row.app_path, "app_path"),
    appKind: row.app_kind,
    launchArgs: nullableStringField(row.launch_args, "launch_args"),
    createdAt: stringField(row.created_at, "created_at"),
    updatedAt: stringField(row.updated_at, "updated_at"),
    sortOrder: numberField(row.sort_order, "sort_order"),
  };
};

export const taskAppToSqlParams = (taskApp: TaskApp): SqlValue[] => {
  if (!isTaskAppKind(taskApp.appKind)) {
    throw new Error("Invalid task app kind.");
  }

  return [
    taskApp.id,
    taskApp.taskId,
    taskApp.appName,
    taskApp.appPath,
    taskApp.appKind,
    taskApp.launchArgs,
    taskApp.createdAt,
    taskApp.updatedAt,
    taskApp.sortOrder,
  ];
};

export type TaskAppRepository = {
  listByTaskId: (taskId: string) => Promise<TaskApp[]>;
  getTaskApp: (id: string) => Promise<TaskApp | null>;
  insertTaskApp: (taskApp: TaskApp) => Promise<void>;
  updateTaskApp: (id: string, update: TaskAppUpdate) => Promise<void>;
  deleteTaskApp: (id: string) => Promise<void>;
  deleteByTaskId: (taskId: string) => Promise<void>;
};

export const createSqliteTaskAppRepository = (
  source: SqlDatabaseLoader | SqliteDatabaseContext = sharedSqliteDatabaseContext,
  databasePath = SQLITE_DATABASE_PATH,
): TaskAppRepository => {
  const context =
    "run" in source
      ? source
      : createSqliteDatabaseContext(source, databasePath);

  return {
    async listByTaskId(taskId) {
      return context.run(async (db) => {
        const rows = await db.select<SqlTaskAppRow>(SELECT_TASK_APPS_BY_TASK_SQL, [taskId]);
        return rows.map(taskAppFromSqlRow);
      });
    },
    async getTaskApp(id) {
      return context.run(async (db) => {
        const rows = await db.select<SqlTaskAppRow>(SELECT_TASK_APP_BY_ID_SQL, [id]);
        return rows[0] ? taskAppFromSqlRow(rows[0]) : null;
      });
    },
    async insertTaskApp(taskApp) {
      await context.run(async (db) => {
        await db.execute(INSERT_TASK_APP_SQL, taskAppToSqlParams(taskApp));
      });
    },
    async updateTaskApp(id, update) {
      await context.run(async (db) => {
        await db.execute("UPDATE task_apps SET app_name = ?, updated_at = ? WHERE id = ?", [
          update.appName,
          update.updatedAt,
          id,
        ]);
      });
    },
    async deleteTaskApp(id) {
      await context.run(async (db) => {
        await db.execute("DELETE FROM task_apps WHERE id = ?", [id]);
      });
    },
    async deleteByTaskId(taskId) {
      await context.run(async (db) => {
        await db.execute("DELETE FROM task_apps WHERE task_id = ?", [taskId]);
      });
    },
  };
};

export const sqliteTaskAppRepository = createSqliteTaskAppRepository();
