import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSqliteAttachmentRepository,
  attachmentFromSqlRow,
  attachmentToSqlParams,
} from "@/repositories/sqliteAttachmentRepository";
import {
  createSqliteTaskRepository,
  SQLITE_DATABASE_PATH,
  type SqlDatabaseClient,
} from "@/repositories/sqliteTaskRepository";
import type { TaskAttachment } from "@/types/attachment";
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

type AttachmentRow = {
  id: string;
  task_id: string;
  kind: string;
  original_name: string;
  stored_name: string;
  relative_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
};

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "Task with attachments",
  note: "Metadata only",
  completed: false,
  priority: "normal",
  pinned: false,
  tags: [],
  createdAt: "2026-06-11T08:00:00.000Z",
  updatedAt: "2026-06-11T08:00:00.000Z",
  completedAt: null,
  ...overrides,
});

const attachment = (overrides: Partial<TaskAttachment> = {}): TaskAttachment => ({
  id: "attachment-1",
  taskId: "task-1",
  kind: "image",
  originalName: "source.png",
  storedName: "attachment-1.png",
  relativePath: "attachments/images/task-1/attachment-1.png",
  mimeType: "image/png",
  sizeBytes: 1024,
  width: 800,
  height: 600,
  createdAt: "2026-06-11T08:10:00.000Z",
  updatedAt: "2026-06-11T08:10:00.000Z",
  sortOrder: 0,
  ...overrides,
});

class FakeSqlDatabase implements SqlDatabaseClient {
  tasks: TaskRow[] = [];
  attachments: AttachmentRow[] = [];
  meta = new Map<string, string>([["schema_version", "1"]]);
  executed: string[] = [];
  foreignKeysEnabled = false;
  schemaMetaHasUpdatedAt = true;
  attachmentTableExists = false;

  async execute(sql: string, params: Array<string | number | null> = []) {
    this.executed.push(sql);

    if (sql.startsWith("PRAGMA foreign_keys = ON")) {
      this.foreignKeysEnabled = true;
      return;
    }

    if (sql.includes("CREATE TABLE IF NOT EXISTS task_attachments")) {
      this.attachmentTableExists = true;
      return;
    }

    if (sql.startsWith("INSERT INTO schema_meta")) {
      if (sql.includes("updated_at") && !this.schemaMetaHasUpdatedAt) {
        throw new Error("schema_meta has no updated_at column");
      }

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
        this.attachments = this.attachments.filter((row) => row.task_id !== taskId);
      }
      return;
    }

    if (sql.startsWith("INSERT INTO task_attachments")) {
      const row = attachmentToRowFromParams(params);
      if (row.kind !== "image" && row.kind !== "screenshot") {
        throw new Error("CHECK constraint failed: kind");
      }

      this.attachments.push(row);
      return;
    }

    if (sql.startsWith("DELETE FROM task_attachments WHERE task_id =")) {
      const taskId = String(params[0]);
      this.attachments = this.attachments.filter((row) => row.task_id !== taskId);
      return;
    }

    if (sql.startsWith("DELETE FROM task_attachments WHERE id =")) {
      const id = String(params[0]);
      this.attachments = this.attachments.filter((row) => row.id !== id);
    }
  }

  async select<T>(sql: string, params: Array<string | number | null> = []): Promise<T[]> {
    if (sql.startsWith("PRAGMA table_info(schema_meta)")) {
      const columns = [{ name: "key" }, { name: "value" }];
      if (this.schemaMetaHasUpdatedAt) {
        columns.push({ name: "updated_at" });
      }
      return columns as T[];
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

    if (sql.includes("FROM task_attachments") && sql.includes("WHERE id =")) {
      return this.attachments.filter((row) => row.id === params[0]) as T[];
    }

    if (sql.includes("FROM task_attachments") && sql.includes("WHERE task_id =")) {
      return this.attachments
        .filter((row) => row.task_id === params[0])
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)) as T[];
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

describe("sqlite attachment repository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates schema v1 to v2, keeps existing tasks, and enables foreign keys", async () => {
    const db = new FakeSqlDatabase();
    db.tasks = [taskToRow(task(), 0)];
    const repository = createSqliteAttachmentRepository(createLoader(db));

    await repository.listByTaskId("task-1");

    expect(db.attachmentTableExists).toBe(true);
    expect(db.foreignKeysEnabled).toBe(true);
    expect(db.meta.get("schema_version")).toBe("2");
    expect(db.tasks.map((row) => row.title)).toEqual(["Task with attachments"]);
  });

  it("updates schema_version with updated_at when schema_meta has the column", async () => {
    const db = new FakeSqlDatabase();
    const repository = createSqliteAttachmentRepository(createLoader(db));

    await repository.listByTaskId("task-1");

    expect(db.executed.some((sql) => sql.includes("INSERT INTO schema_meta (key, value, updated_at)"))).toBe(true);
  });

  it("falls back to key/value-only schema_meta updates when updated_at is absent", async () => {
    const db = new FakeSqlDatabase();
    db.schemaMetaHasUpdatedAt = false;
    const repository = createSqliteAttachmentRepository(createLoader(db));

    await repository.listByTaskId("task-1");

    expect(db.meta.get("schema_version")).toBe("2");
    expect(db.executed.some((sql) => sql.includes("INSERT INTO schema_meta (key, value)\n"))).toBe(true);
  });

  it("maps nullable dimensions and attachment rows", () => {
    const item = attachment({ width: null, height: null, kind: "screenshot" });

    expect(attachmentToSqlParams(item)).toEqual([
      item.id,
      item.taskId,
      "screenshot",
      item.originalName,
      item.storedName,
      item.relativePath,
      item.mimeType,
      item.sizeBytes,
      null,
      null,
      item.createdAt,
      item.updatedAt,
      item.sortOrder,
    ]);
    expect(attachmentFromSqlRow(attachmentToRow(item))).toEqual(item);
  });

  it("inserts, loads, and deletes attachment metadata", async () => {
    const db = new FakeSqlDatabase();
    const repository = createSqliteAttachmentRepository(createLoader(db));
    const item = attachment();

    await repository.insertAttachment(item);
    expect(await repository.getAttachment(item.id)).toEqual(item);

    await repository.deleteAttachment(item.id);
    expect(await repository.getAttachment(item.id)).toBeNull();
  });

  it("lists attachments by task id in sort_order order", async () => {
    const db = new FakeSqlDatabase();
    const repository = createSqliteAttachmentRepository(createLoader(db));

    await repository.insertAttachment(attachment({ id: "attachment-b", sortOrder: 2 }));
    await repository.insertAttachment(attachment({ id: "attachment-a", sortOrder: 1 }));
    await repository.insertAttachment(attachment({ id: "attachment-other", taskId: "task-2", sortOrder: 0 }));

    expect((await repository.listByTaskId("task-1")).map((item) => item.id)).toEqual([
      "attachment-a",
      "attachment-b",
    ]);
  });

  it("allows image and screenshot kinds but rejects invalid kinds", async () => {
    const db = new FakeSqlDatabase();
    const repository = createSqliteAttachmentRepository(createLoader(db));

    await repository.insertAttachment(attachment({ id: "image", kind: "image" }));
    await repository.insertAttachment(attachment({ id: "screenshot", kind: "screenshot" }));
    await expect(
      repository.insertAttachment(attachment({ id: "bad", kind: "document" as TaskAttachment["kind"] })),
    ).rejects.toThrow(/invalid attachment kind|check constraint/i);
  });

  it("cascades attachment metadata when a task is deleted", async () => {
    const db = new FakeSqlDatabase();
    db.tasks = [taskToRow(task(), 0)];
    const loader = createLoader(db);
    const attachmentRepository = createSqliteAttachmentRepository(loader);
    const taskRepository = createSqliteTaskRepository(loader);

    await attachmentRepository.insertAttachment(attachment());
    await taskRepository.saveSnapshot({ tasks: [] });

    expect(await attachmentRepository.listByTaskId("task-1")).toEqual([]);
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
  sort_order: Number(params[10]),
});

const attachmentToRow = (value: TaskAttachment): AttachmentRow => ({
  id: value.id,
  task_id: value.taskId,
  kind: value.kind,
  original_name: value.originalName,
  stored_name: value.storedName,
  relative_path: value.relativePath,
  mime_type: value.mimeType,
  size_bytes: value.sizeBytes,
  width: value.width,
  height: value.height,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
  sort_order: value.sortOrder,
});

const attachmentToRowFromParams = (params: Array<string | number | null>): AttachmentRow => ({
  id: String(params[0]),
  task_id: String(params[1]),
  kind: String(params[2]),
  original_name: String(params[3]),
  stored_name: String(params[4]),
  relative_path: String(params[5]),
  mime_type: String(params[6]),
  size_bytes: Number(params[7]),
  width: params[8] === null ? null : Number(params[8]),
  height: params[9] === null ? null : Number(params[9]),
  created_at: String(params[10]),
  updated_at: String(params[11]),
  sort_order: Number(params[12]),
});
