import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSqliteTaskAppRepository,
  taskAppFromSqlRow,
  taskAppToSqlParams,
} from "@/repositories/sqliteTaskAppRepository";
import {
  createSqliteTaskRepository,
  SQLITE_DATABASE_PATH,
  SQLITE_SCHEMA_VERSION,
  type SqlDatabaseClient,
} from "@/repositories/sqliteTaskRepository";
import type { TaskApp } from "@/types/taskApp";
import type { Task } from "@/types/task";

type TaskRow = {
  id: string;
  title: string;
  note: string;
  completed: number;
  priority: Task["priority"];
  pinned: number;
  tags: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  planned_date: string | null;
  sort_order: number;
};

type TaskAppRow = {
  id: string;
  task_id: string;
  app_name: string;
  app_path: string;
  app_kind: string;
  launch_args: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
};

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "Task with apps",
  note: "",
  completed: false,
  priority: "normal",
  pinned: false,
  tags: [],
  createdAt: "2026-06-11T08:00:00.000Z",
  updatedAt: "2026-06-11T08:00:00.000Z",
  plannedDate: null,
  stackId: "stack-task-1",
  stackOrder: 0,
  completedAt: null,
  ...overrides,
}) as Task;

const taskApp = (overrides: Partial<TaskApp> = {}): TaskApp => ({
  id: "task-app-1",
  taskId: "task-1",
  appName: "Notepad",
  appPath: "C:\\Windows\\notepad.exe",
  appKind: "exe",
  launchArgs: null,
  createdAt: "2026-06-11T08:10:00.000Z",
  updatedAt: "2026-06-11T08:10:00.000Z",
  sortOrder: 0,
  ...overrides,
}) as TaskApp;

class FakeSqlDatabase implements SqlDatabaseClient {
  tasks: TaskRow[] = [];
  taskApps: TaskAppRow[] = [];
  taskAttachments: unknown[] = [{ id: "attachment-1", task_id: "task-1" }];
  meta = new Map<string, string>([["schema_version", "2"]]);
  executed: string[] = [];
  foreignKeysEnabled = false;
  taskAppsTableExists = false;

  async execute(sql: string, params: Array<string | number | null> = []) {
    this.executed.push(sql);

    if (sql.startsWith("PRAGMA foreign_keys = ON")) {
      this.foreignKeysEnabled = true;
      return;
    }

    if (sql.includes("CREATE TABLE IF NOT EXISTS task_apps")) {
      this.taskAppsTableExists = true;
      return;
    }

    if (sql.startsWith("INSERT INTO schema_meta")) {
      this.meta.set(String(params[0]), String(params[1]));
      return;
    }

    if (sql.startsWith("INSERT INTO tasks")) {
      const row = taskToRowFromParams(params);
      const existingIndex = this.tasks.findIndex((item) => item.id === row.id);
      if (existingIndex >= 0) {
        this.tasks[existingIndex] = row;
      } else {
        this.tasks.push(row);
      }
      return;
    }

    if (sql.startsWith("DELETE FROM tasks WHERE id =")) {
      const taskId = String(params[0]);
      this.tasks = this.tasks.filter((row) => row.id !== taskId);
      if (this.foreignKeysEnabled) {
        this.taskApps = this.taskApps.filter((row) => row.task_id !== taskId);
      }
      return;
    }

    if (sql.startsWith("INSERT INTO task_apps")) {
      const row = taskAppToRowFromParams(params);
      if (row.app_kind !== "exe" && row.app_kind !== "shortcut") {
        throw new Error("CHECK constraint failed: app_kind");
      }
      this.taskApps.push(row);
      return;
    }

    if (sql.startsWith("UPDATE task_apps")) {
      const id = String(params[2]);
      this.taskApps = this.taskApps.map((row) =>
        row.id === id
          ? {
              ...row,
              app_name: String(params[0]),
              updated_at: String(params[1]),
            }
          : row,
      );
      return;
    }

    if (sql.startsWith("DELETE FROM task_apps WHERE task_id =")) {
      const taskId = String(params[0]);
      this.taskApps = this.taskApps.filter((row) => row.task_id !== taskId);
      return;
    }

    if (sql.startsWith("DELETE FROM task_apps WHERE id =")) {
      const id = String(params[0]);
      this.taskApps = this.taskApps.filter((row) => row.id !== id);
    }
  }

  async select<T>(sql: string, params: Array<string | number | null> = []): Promise<T[]> {
    if (sql.startsWith("PRAGMA table_info(schema_meta)")) {
      return [{ name: "key" }, { name: "value" }, { name: "updated_at" }] as T[];
    }

    if (sql.includes("COUNT(*)") && sql.includes("FROM tasks")) {
      return [{ count: this.tasks.length }] as T[];
    }

    if (sql.startsWith("SELECT id FROM tasks")) {
      return this.tasks.map(({ id }) => ({ id })) as T[];
    }

    if (sql.includes("FROM tasks")) {
      return [...this.tasks].sort((a, b) => a.sort_order - b.sort_order) as T[];
    }

    if (sql.includes("FROM task_apps") && sql.includes("WHERE id =")) {
      return this.taskApps.filter((row) => row.id === params[0]) as T[];
    }

    if (sql.includes("FROM task_apps") && sql.includes("WHERE task_id =")) {
      return this.taskApps
        .filter((row) => row.task_id === params[0])
        .sort((first, second) => first.sort_order - second.sort_order || first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id)) as T[];
    }

    return [] as T[];
  }
}

const createLoader = (db: FakeSqlDatabase) => ({
  load: vi.fn(async (path) => {
    expect(path).toBe(SQLITE_DATABASE_PATH);
    return db;
  }),
});

describe("sqlite task app repository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates to the current schema, keeps tasks and attachments, and enables foreign keys", async () => {
    const db = new FakeSqlDatabase();
    db.tasks = [taskToRow(task(), 0)];
    const repository = createSqliteTaskAppRepository(createLoader(db));

    await repository.listByTaskId("task-1");

    expect(db.taskAppsTableExists).toBe(true);
    expect(db.foreignKeysEnabled).toBe(true);
    expect(db.meta.get("schema_version")).toBe(SQLITE_SCHEMA_VERSION);
    expect(db.tasks.map((row) => row.title)).toEqual(["Task with apps"]);
    expect(db.taskAttachments).toHaveLength(1);
  });

  it("maps nullable launch args and task app rows", () => {
    const item = taskApp({ appKind: "shortcut", appPath: "C:\\Apps\\Editor.lnk", launchArgs: null });

    expect(taskAppToSqlParams(item)).toEqual([
      item.id,
      item.taskId,
      item.appName,
      item.appPath,
      "shortcut",
      null,
      item.createdAt,
      item.updatedAt,
      item.sortOrder,
    ]);
    expect(taskAppFromSqlRow(taskAppToRow(item))).toEqual(item);
  });

  it("inserts, loads, updates, and deletes task app metadata", async () => {
    const db = new FakeSqlDatabase();
    const repository = createSqliteTaskAppRepository(createLoader(db));
    const item = taskApp();

    await repository.insertTaskApp(item);
    expect(await repository.getTaskApp(item.id)).toEqual(item);

    await repository.updateTaskApp(item.id, {
      appName: "Renamed Notepad",
      updatedAt: "2026-06-11T09:00:00.000Z",
    });
    expect(await repository.getTaskApp(item.id)).toMatchObject({ appName: "Renamed Notepad" });

    await repository.deleteTaskApp(item.id);
    expect(await repository.getTaskApp(item.id)).toBeNull();
  });

  it("lists task apps by task id in sort_order order", async () => {
    const db = new FakeSqlDatabase();
    const repository = createSqliteTaskAppRepository(createLoader(db));

    await repository.insertTaskApp(taskApp({ id: "task-app-b", sortOrder: 2 }));
    await repository.insertTaskApp(taskApp({ id: "task-app-a", sortOrder: 1 }));
    await repository.insertTaskApp(taskApp({ id: "task-app-other", taskId: "task-2", sortOrder: 0 }));

    expect((await repository.listByTaskId("task-1")).map((item) => item.id)).toEqual(["task-app-a", "task-app-b"]);
  });

  it("allows exe and shortcut kinds but rejects invalid kinds", async () => {
    const db = new FakeSqlDatabase();
    const repository = createSqliteTaskAppRepository(createLoader(db));

    await repository.insertTaskApp(taskApp({ id: "exe", appKind: "exe" }));
    await repository.insertTaskApp(taskApp({ id: "shortcut", appKind: "shortcut" }));
    await expect(
      repository.insertTaskApp(taskApp({ id: "bad", appKind: "url" as TaskApp["appKind"] })),
    ).rejects.toThrow(/invalid task app kind|check constraint/i);
  });

  it("cascades task app metadata when a task is deleted", async () => {
    const db = new FakeSqlDatabase();
    db.tasks = [taskToRow(task(), 0)];
    const loader = createLoader(db);
    const taskAppRepository = createSqliteTaskAppRepository(loader);
    const taskRepository = createSqliteTaskRepository(loader);

    await taskAppRepository.insertTaskApp(taskApp());
    await taskRepository.saveSnapshot({ tasks: [] });

    expect(await taskAppRepository.listByTaskId("task-1")).toEqual([]);
  });
});

const taskToRow = (value: Task, sortOrder: number): TaskRow => ({
  id: value.id,
  title: value.title,
  note: value.note,
  completed: value.completed ? 1 : 0,
  priority: value.priority,
  pinned: value.pinned ? 1 : 0,
  tags: JSON.stringify(value.tags),
  created_at: value.createdAt,
  updated_at: value.updatedAt,
  completed_at: value.completedAt,
  planned_date: value.plannedDate,
  sort_order: sortOrder,
});

const taskToRowFromParams = (params: Array<string | number | null>): TaskRow => ({
  id: String(params[0]),
  title: String(params[1]),
  note: String(params[2]),
  completed: Number(params[3]),
  priority: params[4] as Task["priority"],
  pinned: Number(params[5]),
  tags: String(params[6]),
  created_at: String(params[7]),
  updated_at: String(params[8]),
  completed_at: params[9] === null ? null : String(params[9]),
  planned_date: params[10] === null ? null : String(params[10]),
  sort_order: Number(params[11]),
});

const taskAppToRow = (value: TaskApp): TaskAppRow => ({
  id: value.id,
  task_id: value.taskId,
  app_name: value.appName,
  app_path: value.appPath,
  app_kind: value.appKind,
  launch_args: value.launchArgs,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
  sort_order: value.sortOrder,
});

const taskAppToRowFromParams = (params: Array<string | number | null>): TaskAppRow => ({
  id: String(params[0]),
  task_id: String(params[1]),
  app_name: String(params[2]),
  app_path: String(params[3]),
  app_kind: String(params[4]),
  launch_args: params[5] === null ? null : String(params[5]),
  created_at: String(params[6]),
  updated_at: String(params[7]),
  sort_order: Number(params[8]),
});







