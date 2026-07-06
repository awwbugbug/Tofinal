import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSqliteTaskRepository,
  SQLITE_DATABASE_PATH,
  taskFromSqlRow,
  taskToSqlParams,
  type SqlDatabaseClient,
} from "@/repositories/sqliteTaskRepository";
import { TASK_STORAGE_KEY, createSeedTasks, type TaskSnapshot } from "@/storage/taskStorage";
import type { Task, TaskStack } from "@/types/task";

type StackRow = {
  id: string;
  sort_order: number;
  collapsed: number;
  created_at: string;
  updated_at: string;
};

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
  stack_id: string;
  stack_order: number;
  sort_order: number;
  deleted_at?: string | null;
};

const task = (overrides: Partial<Task> = {}): Task => {
  const id = overrides.id ?? "task-test";
  return {
    id,
    title: "SQLite task",
    note: "Stored in SQLite",
    completed: false,
    priority: "normal",
    pinned: false,
    tags: ["sqlite"],
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:00:00.000Z",
    completedAt: null,
    plannedDate: null,
    stackId: `stack-${id}`,
    stackOrder: 0,
    deletedAt: null,
    ...overrides,
  } as Task;
};

const stack = (overrides: Partial<TaskStack> = {}): TaskStack => {
  const id = overrides.id ?? "stack-task-test";
  return {
    id,
    sortOrder: 0,
    collapsed: true,
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:00:00.000Z",
    ...overrides,
  } as TaskStack;
};

class FakeSqlDatabase implements SqlDatabaseClient {
  rows: TaskRow[] = [];
  stacks: StackRow[] = [];
  meta = new Map<string, string>();
  executed: string[] = [];
  taskColumns = new Set([
    "id",
    "title",
    "note",
    "completed",
    "priority",
    "pinned",
    "tags",
    "created_at",
    "updated_at",
    "completed_at",
    "planned_date",
    "stack_id",
    "stack_order",
    "sort_order",
  ]);
  failWrites = false;
  delayTaskInserts = false;
  activeTaskInserts = 0;
  maxConcurrentTaskInserts = 0;

  async execute(sql: string, params: unknown[] = []) {
    this.executed.push(sql);

    if (this.failWrites && (sql.includes("INSERT INTO tasks") || sql.includes("DELETE FROM tasks"))) {
      throw new Error("write failed");
    }

    if (sql.startsWith("DELETE FROM tasks WHERE id = ?")) {
      this.rows = this.rows.filter((row) => row.id !== params[0]);
      return;
    }

    if (sql.startsWith("DELETE FROM tasks")) {
      this.rows = [];
      return;
    }

    if (sql.startsWith("DELETE FROM task_stacks WHERE id = ?")) {
      this.stacks = this.stacks.filter((row) => row.id !== params[0]);
      return;
    }

    if (sql.startsWith("INSERT INTO schema_meta")) {
      this.meta.set(String(params[0]), String(params[1]));
      return;
    }

    if (sql.includes("ALTER TABLE tasks ADD COLUMN planned_date TEXT NULL")) {
      this.taskColumns.add("planned_date");
      return;
    }

    if (sql.includes("ALTER TABLE tasks ADD COLUMN stack_id TEXT NULL")) {
      this.taskColumns.add("stack_id");
      return;
    }

    if (sql.includes("ALTER TABLE tasks ADD COLUMN stack_order INTEGER NULL")) {
      this.taskColumns.add("stack_order");
      return;
    }

    if (sql.startsWith("UPDATE tasks SET stack_id = ?, stack_order = ? WHERE id = ?")) {
      this.rows = this.rows.map((row) =>
        row.id === params[2] ? { ...row, stack_id: String(params[0]), stack_order: Number(params[1]) } : row,
      );
      return;
    }

    if (sql.startsWith("INSERT INTO task_stacks")) {
      const [id, sortOrder, third, fourth, fifth] = params;
      const collapsed = typeof fifth === "undefined" ? 1 : Number(third);
      const createdAt = String(typeof fifth === "undefined" ? third : fourth);
      const updatedAt = String(typeof fifth === "undefined" ? fourth : fifth);
      const row: StackRow = {
        id: String(id),
        sort_order: Number(sortOrder),
        collapsed,
        created_at: createdAt,
        updated_at: updatedAt,
      };
      const existingIndex = this.stacks.findIndex((existing) => existing.id === row.id);
      if (existingIndex >= 0 && !sql.includes("DO NOTHING")) {
        this.stacks[existingIndex] = row;
      } else if (existingIndex < 0) {
        this.stacks.push(row);
      }
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
        plannedDate,
        stackId,
        stackOrder,
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
        string | null,
        string,
        number,
        number,
      ];

      const row: TaskRow = {
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
        planned_date: plannedDate,
        stack_id: stackId,
        stack_order: stackOrder,
        sort_order: sortOrder,
      };
      const existingIndex = this.rows.findIndex((existing) => existing.id === id);
      if (existingIndex >= 0) {
        this.rows[existingIndex] = row;
      } else {
        this.rows.push(row);
      }
      this.activeTaskInserts -= 1;
    }
  }

  async select<T>(sql: string): Promise<T[]> {
    if (sql.includes("PRAGMA table_info(tasks)")) {
      return [...this.taskColumns].map((name) => ({ name })) as T[];
    }

    if (sql.includes("FROM task_stacks")) {
      if (sql.trim() === "SELECT id FROM task_stacks") {
        return this.stacks.map((row) => ({ id: row.id })) as T[];
      }
      return [...this.stacks].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)) as T[];
    }

    if (sql.includes("COUNT(*)")) {
      return [{ count: this.rows.length }] as T[];
    }

    if (sql.trim() === "SELECT id FROM tasks") {
      return this.rows.map((row) => ({ id: row.id })) as T[];
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

  it("maps tasks to SQLite rows with integer booleans, JSON tags, nullable completed_at, planned_date, and stack fields", () => {
    const openTask = task({ completed: false, pinned: true, tags: ["a", "b"], completedAt: null, plannedDate: "2026-06-20" });
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
      "2026-06-20",
      openTask.stackId,
      openTask.stackOrder,
      2,
      null,
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
      plannedDate: "2026-06-20",
      stackId: openTask.stackId,
      stackOrder: openTask.stackOrder,
    });
  });

  it("adds stack columns during schema migration and writes schema version 6", async () => {
    const db = new FakeSqlDatabase();
    db.taskColumns.delete("planned_date");
    db.taskColumns.delete("stack_id");
    db.taskColumns.delete("stack_order");
    const repository = createRepository(db);

    await repository.loadSnapshot();

    expect(db.executed.some((sql) => sql.includes("ALTER TABLE tasks ADD COLUMN planned_date TEXT NULL"))).toBe(true);
    expect(db.executed.some((sql) => sql.includes("ALTER TABLE tasks ADD COLUMN stack_id TEXT NULL"))).toBe(true);
    expect(db.executed.some((sql) => sql.includes("ALTER TABLE tasks ADD COLUMN stack_order INTEGER NULL"))).toBe(true);
    expect(db.taskColumns.has("planned_date")).toBe(true);
    expect(db.taskColumns.has("stack_id")).toBe(true);
    expect(db.taskColumns.has("stack_order")).toBe(true);
    const stackIndexPosition = db.executed.findIndex((sql) => sql.includes("idx_tasks_stack_order"));
    const stackOrderColumnPosition = db.executed.findIndex((sql) => sql.includes("ALTER TABLE tasks ADD COLUMN stack_order"));
    expect(stackIndexPosition).toBeGreaterThan(stackOrderColumnPosition);
    expect(db.meta.get("schema_version")).toBe("6");
  });

  it("migrates existing v4 tasks into singleton stacks", async () => {
    const db = new FakeSqlDatabase();
    db.rows = [taskToRow(task({ id: "task-legacy", title: "Legacy task" }), 7)];
    db.stacks = [];
    const repository = createRepository(db);

    const snapshot = await repository.loadSnapshot();

    expect(db.stacks).toEqual([
      expect.objectContaining({ id: "stack-task-legacy", sort_order: 7, collapsed: 1 }),
    ]);
    expect(snapshot.tasks[0]).toMatchObject({ id: "task-legacy", stackId: "stack-task-legacy", stackOrder: 0 });
    expect(snapshot.stacks![0]).toMatchObject({ id: "stack-task-legacy", sortOrder: 7, collapsed: true });
  });

  it("migrates a valid localStorage snapshot when SQLite is empty", async () => {
    const db = new FakeSqlDatabase();
    const localTask = task({ id: "task-local", title: "Migrated from localStorage", pinned: true, stackId: "stack-task-local" });
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ version: 1, tasks: [localTask] }));

    const repository = createRepository(db);
    const snapshot = await repository.loadSnapshot();

    expect(snapshot.tasks).toEqual([localTask]);
    expect(snapshot.stacks).toEqual([expect.objectContaining({ id: "stack-task-local" })]);
    expect(db.meta.get("schema_version")).toBe("6");
    expect(db.meta.get("localstorage_v1_migrated")).toBe("true");
    expect(localStorage.getItem(TASK_STORAGE_KEY)).toContain("Migrated from localStorage");
  });

  it("falls back to seed tasks when localStorage is invalid and SQLite is empty", async () => {
    const db = new FakeSqlDatabase();
    localStorage.setItem(TASK_STORAGE_KEY, "{broken json");

    const repository = createRepository(db);
    const snapshot = await repository.loadSnapshot();

    expect(snapshot.tasks).toHaveLength(createSeedTasks().length);
    expect(snapshot.stacks).toHaveLength(createSeedTasks().length);
    expect(snapshot.tasks[0].title).toBe("Finalize the first-stage desktop shell");
    expect(db.meta.get("schema_version")).toBe("6");
    expect(db.meta.get("seed_initialized")).toBe("true");
  });

  it("uses existing SQLite rows instead of overwriting them from localStorage", async () => {
    const db = new FakeSqlDatabase();
    db.rows = [taskToRow(task({ id: "task-sqlite", title: "SQLite wins" }), 0)];
    db.stacks = [stackToRow(stack({ id: "stack-task-sqlite" }))];
    localStorage.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({ version: 1, tasks: [task({ id: "task-local", title: "Local loses" })] }),
    );

    const repository = createRepository(db);
    const snapshot = await repository.loadSnapshot();

    expect(snapshot.tasks.map((item) => item.title)).toEqual(["SQLite wins"]);
    expect(db.rows).toHaveLength(1);
  });

  it("saves snapshots asynchronously and reloads tasks and stacks in explicit sort order", async () => {
    const db = new FakeSqlDatabase();
    const repository = createRepository(db);
    const firstStack = stack({ id: "stack-task-b", sortOrder: 10, collapsed: false });
    const secondStack = stack({ id: "stack-task-a", sortOrder: 20, collapsed: true });
    const snapshot: TaskSnapshot = {
      tasks: [
        task({ id: "task-b", stackId: firstStack.id, title: "Second" }),
        task({ id: "task-a", stackId: secondStack.id, title: "First", priority: "urgent", tags: ["urgent", "local"] }),
      ],
      stacks: [firstStack, secondStack],
    };

    await repository.saveSnapshot(snapshot);
    const loaded = await repository.loadSnapshot();

    expect(loaded.tasks.map((item) => item.id)).toEqual(["task-b", "task-a"]);
    expect(loaded.stacks!.map((item) => item.id)).toEqual([firstStack.id, secondStack.id]);
    expect(loaded.stacks![0].collapsed).toBe(false);
    expect(loaded.tasks[1]).toMatchObject({
      priority: "urgent",
      tags: ["urgent", "local"],
      stackId: secondStack.id,
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
  planned_date: value.plannedDate,
  stack_id: value.stackId,
  stack_order: value.stackOrder,
  sort_order: sortOrder,
  deleted_at: value.deletedAt,
});

const stackToRow = (value: TaskStack): StackRow => ({
  id: value.id,
  sort_order: value.sortOrder,
  collapsed: value.collapsed ? 1 : 0,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
});



