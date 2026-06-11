import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSqliteTaskRepository,
  SQLITE_DATABASE_PATH,
  taskFromSqlRow,
  taskToSqlParams,
  type SqlDatabaseClient,
} from "@/repositories/sqliteTaskRepository";
import { TASK_STORAGE_KEY, createSeedTasks, type TaskSnapshot } from "@/storage/taskStorage";
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
  sort_order: number;
};

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-test",
  title: "SQLite task",
  note: "Stored in SQLite",
  completed: false,
  priority: "normal",
  pinned: false,
  tags: ["sqlite"],
  createdAt: "2026-06-10T08:00:00.000Z",
  updatedAt: "2026-06-10T08:00:00.000Z",
  completedAt: null,
  ...overrides,
});

class FakeSqlDatabase implements SqlDatabaseClient {
  rows: TaskRow[] = [];
  meta = new Map<string, string>();
  executed: string[] = [];
  failWrites = false;
  delayTaskInserts = false;
  activeTaskInserts = 0;
  maxConcurrentTaskInserts = 0;

  async execute(sql: string, params: unknown[] = []) {
    this.executed.push(sql);

    if (this.failWrites && (sql.includes("INSERT INTO tasks") || sql.includes("DELETE FROM tasks"))) {
      throw new Error("write failed");
    }

    if (sql.startsWith("DELETE FROM tasks")) {
      this.rows = [];
      return;
    }

    if (sql.startsWith("INSERT INTO schema_meta")) {
      this.meta.set(String(params[0]), String(params[1]));
      return;
    }

    if (sql.startsWith("INSERT INTO tasks")) {
      this.activeTaskInserts += 1;
      this.maxConcurrentTaskInserts = Math.max(this.maxConcurrentTaskInserts, this.activeTaskInserts);
      if (this.delayTaskInserts) {
        await Promise.resolve();
      }

      const [
        id,
        title,
        note,
        completed,
        priority,
        pinned,
        tags,
        createdAt,
        updatedAt,
        completedAt,
        sortOrder,
      ] = params as [
        string,
        string,
        string,
        number,
        Task["priority"],
        number,
        string,
        string,
        string,
        string | null,
        number,
      ];

      this.rows.push({
        id,
        title,
        note,
        completed,
        priority,
        pinned,
        tags,
        created_at: createdAt,
        updated_at: updatedAt,
        completed_at: completedAt,
        sort_order: sortOrder,
      });
      this.activeTaskInserts -= 1;
    }
  }

  async select<T>(sql: string): Promise<T[]> {
    if (sql.includes("COUNT(*)")) {
      return [{ count: this.rows.length }] as T[];
    }

    if (sql.includes("FROM tasks")) {
      return [...this.rows].sort((a, b) => a.sort_order - b.sort_order) as T[];
    }

    return [] as T[];
  }
}

const createRepository = (db: FakeSqlDatabase) =>
  createSqliteTaskRepository({
    load: vi.fn(async (path) => {
      expect(path).toBe(SQLITE_DATABASE_PATH);
      return db;
    }),
  });

describe("sqlite task repository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("maps tasks to SQLite rows with integer booleans, JSON tags, and nullable completed_at", () => {
    const openTask = task({ completed: false, pinned: true, tags: ["a", "b"], completedAt: null });
    const doneTask = task({ completed: true, pinned: false, completedAt: "2026-06-10T08:30:00.000Z" });

    expect(taskToSqlParams(openTask, 2)).toEqual([
      openTask.id,
      openTask.title,
      openTask.note,
      0,
      openTask.priority,
      1,
      JSON.stringify(["a", "b"]),
      openTask.createdAt,
      openTask.updatedAt,
      null,
      2,
    ]);

    expect(taskToSqlParams(doneTask, 0)[3]).toBe(1);
    expect(taskFromSqlRow({
      ...taskToRow(openTask, 2),
      completed: 1,
      pinned: 0,
      completed_at: null,
    })).toMatchObject({
      completed: true,
      pinned: false,
      tags: ["a", "b"],
      completedAt: null,
    });
  });

  it("migrates a valid localStorage snapshot when SQLite is empty", async () => {
    const db = new FakeSqlDatabase();
    const localTask = task({ id: "task-local", title: "Migrated from localStorage", pinned: true });
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ version: 1, tasks: [localTask] }));

    const repository = createRepository(db);
    const snapshot = await repository.loadSnapshot();

    expect(snapshot.tasks).toEqual([localTask]);
    expect(db.meta.get("schema_version")).toBe("1");
    expect(db.meta.get("localstorage_v1_migrated")).toBe("true");
    expect(localStorage.getItem(TASK_STORAGE_KEY)).toContain("Migrated from localStorage");
  });

  it("falls back to seed tasks when localStorage is invalid and SQLite is empty", async () => {
    const db = new FakeSqlDatabase();
    localStorage.setItem(TASK_STORAGE_KEY, "{broken json");

    const repository = createRepository(db);
    const snapshot = await repository.loadSnapshot();

    expect(snapshot.tasks).toHaveLength(createSeedTasks().length);
    expect(snapshot.tasks[0].title).toBe("Finalize the first-stage desktop shell");
    expect(db.meta.get("schema_version")).toBe("1");
    expect(db.meta.get("seed_initialized")).toBe("true");
  });

  it("uses existing SQLite rows instead of overwriting them from localStorage", async () => {
    const db = new FakeSqlDatabase();
    db.rows = [taskToRow(task({ id: "task-sqlite", title: "SQLite wins" }), 0)];
    localStorage.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({ version: 1, tasks: [task({ id: "task-local", title: "Local loses" })] }),
    );

    const repository = createRepository(db);
    const snapshot = await repository.loadSnapshot();

    expect(snapshot.tasks.map((item) => item.title)).toEqual(["SQLite wins"]);
    expect(db.rows).toHaveLength(1);
  });

  it("saves snapshots asynchronously and reloads them in explicit sort order", async () => {
    const db = new FakeSqlDatabase();
    const repository = createRepository(db);
    const snapshot: TaskSnapshot = {
      tasks: [
        task({ id: "task-b", title: "Second" }),
        task({ id: "task-a", title: "First", priority: "urgent", tags: ["urgent", "local"] }),
      ],
    };

    await repository.saveSnapshot(snapshot);
    const loaded = await repository.loadSnapshot();

    expect(loaded.tasks.map((item) => item.id)).toEqual(["task-b", "task-a"]);
    expect(loaded.tasks[1]).toMatchObject({
      priority: "urgent",
      tags: ["urgent", "local"],
    });
  });

  it("writes task rows sequentially inside the save transaction", async () => {
    const db = new FakeSqlDatabase();
    db.delayTaskInserts = true;
    const repository = createRepository(db);

    await repository.loadSnapshot();
    db.activeTaskInserts = 0;
    db.maxConcurrentTaskInserts = 0;

    await repository.saveSnapshot({
      tasks: [
        task({ id: "task-a", title: "A" }),
        task({ id: "task-b", title: "B" }),
        task({ id: "task-c", title: "C" }),
      ],
    });

    expect(db.maxConcurrentTaskInserts).toBe(1);
    expect(db.executed.some((sql) => sql.startsWith("BEGIN IMMEDIATE TRANSACTION"))).toBe(true);
    expect(db.executed.some((sql) => sql.startsWith("COMMIT"))).toBe(true);
  });

  it("rolls back and rejects when a write fails", async () => {
    const db = new FakeSqlDatabase();
    const repository = createRepository(db);

    await repository.loadSnapshot();
    db.failWrites = true;

    await expect(repository.saveSnapshot({ tasks: [task({ id: "task-fail" })] })).rejects.toThrow(
      /write failed/i,
    );
    expect(db.executed.some((sql) => sql.startsWith("ROLLBACK"))).toBe(true);
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
  sort_order: sortOrder,
});
