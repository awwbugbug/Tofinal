import { createSeedTasks, loadStoredTaskSnapshot, type TaskSnapshot } from "@/storage/taskStorage";
import type { Task, TaskPriority } from "@/types/task";

export const SQLITE_DATABASE_PATH = "sqlite:tofinal.db";

type SqlValue = string | number | null;

export type SqlDatabaseClient = {
  execute: (sql: string, params?: SqlValue[]) => Promise<unknown>;
  select: <T>(sql: string, params?: SqlValue[]) => Promise<T[]>;
};

export type SqlDatabaseLoader = {
  load: (path: string) => Promise<SqlDatabaseClient>;
};

type SqlTaskRow = {
  id: unknown;
  title: unknown;
  note: unknown;
  completed: unknown;
  priority: unknown;
  pinned: unknown;
  tags: unknown;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown;
  sort_order?: unknown;
};

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    note TEXT NOT NULL,
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL CHECK (priority IN ('normal', 'important', 'urgent')),
    pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
    tags TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT NULL,
    sort_order INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order)",
];

const SELECT_TASKS_SQL = `SELECT
  id,
  title,
  note,
  completed,
  priority,
  pinned,
  tags,
  created_at,
  updated_at,
  completed_at,
  sort_order
FROM tasks
ORDER BY sort_order ASC, created_at DESC, id ASC`;

const INSERT_TASK_SQL = `INSERT INTO tasks (
  id,
  title,
  note,
  completed,
  priority,
  pinned,
  tags,
  created_at,
  updated_at,
  completed_at,
  sort_order
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const isPriority = (value: unknown): value is TaskPriority =>
  value === "normal" || value === "important" || value === "urgent";

const booleanFromInteger = (value: unknown, field: string) => {
  if (value === 0 || value === false) {
    return false;
  }

  if (value === 1 || value === true) {
    return true;
  }

  throw new Error(`Invalid SQLite boolean field: ${field}`);
};

const stringField = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new Error(`Invalid SQLite text field: ${field}`);
  }

  return value;
};

export const taskFromSqlRow = (row: SqlTaskRow): Task => {
  const priority = row.priority;
  if (!isPriority(priority)) {
    throw new Error("Invalid SQLite task priority.");
  }

  const tagsValue = stringField(row.tags, "tags");
  const tags = JSON.parse(tagsValue) as unknown;
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
    throw new Error("Invalid SQLite task tags.");
  }

  const completedAt = row.completed_at;
  if (completedAt !== null && typeof completedAt !== "string") {
    throw new Error("Invalid SQLite completed_at field.");
  }

  return {
    id: stringField(row.id, "id"),
    title: stringField(row.title, "title"),
    note: stringField(row.note, "note"),
    completed: booleanFromInteger(row.completed, "completed"),
    priority,
    pinned: booleanFromInteger(row.pinned, "pinned"),
    tags,
    createdAt: stringField(row.created_at, "created_at"),
    updatedAt: stringField(row.updated_at, "updated_at"),
    completedAt,
  };
};

export const taskToSqlParams = (task: Task, sortOrder: number): SqlValue[] => [
  task.id,
  task.title,
  task.note,
  task.completed ? 1 : 0,
  task.priority,
  task.pinned ? 1 : 0,
  JSON.stringify(task.tags),
  task.createdAt,
  task.updatedAt,
  task.completedAt,
  sortOrder,
];

const nowIso = () => new Date().toISOString();

const writeMeta = async (db: SqlDatabaseClient, key: string, value: string) => {
  await db.execute(
    `INSERT INTO schema_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
};

const runTransaction = async (db: SqlDatabaseClient, operation: () => Promise<void>) => {
  await db.execute("BEGIN IMMEDIATE TRANSACTION");
  try {
    await operation();
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
};

const replaceTasksInTransaction = async (
  db: SqlDatabaseClient,
  tasks: Task[],
  extraMeta: Record<string, string> = {},
) => {
  await runTransaction(db, async () => {
    await db.execute("DELETE FROM tasks");
    for (const [index, task] of tasks.entries()) {
      await db.execute(INSERT_TASK_SQL, taskToSqlParams(task, index));
    }
    await writeMeta(db, "schema_version", "1");
    for (const [key, value] of Object.entries(extraMeta)) {
      await writeMeta(db, key, value);
    }
  });
};

const ensureSchema = async (db: SqlDatabaseClient) => {
  for (const sql of SCHEMA_SQL) {
    await db.execute(sql);
  }
};

const tauriSqlDatabaseLoader: SqlDatabaseLoader = {
  async load(path) {
    const Database = (await import("@tauri-apps/plugin-sql")).default;
    return Database.load(path) as Promise<SqlDatabaseClient>;
  },
};

export const createSqliteTaskRepository = (
  loader: SqlDatabaseLoader = tauriSqlDatabaseLoader,
  databasePath = SQLITE_DATABASE_PATH,
) => {
  let dbPromise: Promise<SqlDatabaseClient> | null = null;
  let initialized = false;

  const getDb = async () => {
    dbPromise ??= loader.load(databasePath);
    return dbPromise;
  };

  const selectTasks = async (db: SqlDatabaseClient) => {
    const rows = await db.select<SqlTaskRow>(SELECT_TASKS_SQL);
    return rows.map(taskFromSqlRow);
  };

  const initializeEmptyDatabase = async (db: SqlDatabaseClient) => {
    const storedSnapshot = loadStoredTaskSnapshot();
    const snapshot =
      storedSnapshot.status === "valid" ? storedSnapshot.snapshot : { tasks: createSeedTasks() };
    const meta: Record<string, string> =
      storedSnapshot.status === "valid"
        ? { localstorage_v1_migrated: "true" }
        : {
            seed_initialized: "true",
            localstorage_v1_migration_source: storedSnapshot.status,
          };

    await replaceTasksInTransaction(db, snapshot.tasks, meta);
  };

  const ensureInitialized = async (db: SqlDatabaseClient) => {
    if (initialized) {
      return;
    }

    await ensureSchema(db);

    const countRows = await db.select<{ count: number }>("SELECT COUNT(*) as count FROM tasks");
    if ((countRows[0]?.count ?? 0) === 0) {
      await initializeEmptyDatabase(db);
    } else {
      await writeMeta(db, "schema_version", "1");
    }

    initialized = true;
  };

  return {
    async loadSnapshot(): Promise<TaskSnapshot> {
      const db = await getDb();
      await ensureInitialized(db);
      return { tasks: await selectTasks(db) };
    },
    async saveSnapshot(snapshot: TaskSnapshot): Promise<void> {
      const db = await getDb();
      await ensureInitialized(db);
      await replaceTasksInTransaction(db, snapshot.tasks);
    },
  };
};

export const sqliteTaskRepository = createSqliteTaskRepository();
