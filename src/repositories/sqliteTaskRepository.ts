import { createSeedTasks, loadStoredTaskSnapshot, type TaskSnapshot } from "@/storage/taskStorage";
import type { Task, TaskPriority } from "@/types/task";

export const SQLITE_DATABASE_PATH = "sqlite:tofinal.db";
export const SQLITE_SCHEMA_VERSION = "3";

export type SqlValue = string | number | null;

export type SqlDatabaseClient = {
  execute: (sql: string, params?: SqlValue[]) => Promise<unknown>;
  select: <T>(sql: string, params?: SqlValue[]) => Promise<T[]>;
};

export type SqlDatabaseLoader = {
  load: (path: string) => Promise<SqlDatabaseClient>;
};

export type SqliteDatabaseContext = {
  run: <T>(operation: (db: SqlDatabaseClient) => Promise<T>) => Promise<T>;
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
  `CREATE TABLE IF NOT EXISTS task_attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'screenshot')),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    width INTEGER NULL,
    height INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id_sort
    ON task_attachments(task_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_task_attachments_created_at
    ON task_attachments(created_at)`,
  `CREATE TABLE IF NOT EXISTS task_apps (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    app_path TEXT NOT NULL,
    app_kind TEXT NOT NULL CHECK (app_kind IN ('exe', 'shortcut')),
    launch_args TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_task_apps_task_id_sort_order
    ON task_apps(task_id, sort_order, created_at, id)`,
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

const SELECT_TASK_IDS_SQL = "SELECT id FROM tasks";

const UPSERT_TASK_SQL = `INSERT INTO tasks (
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
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  note = excluded.note,
  completed = excluded.completed,
  priority = excluded.priority,
  pinned = excluded.pinned,
  tags = excluded.tags,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  completed_at = excluded.completed_at,
  sort_order = excluded.sort_order`;

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

const schemaMetaHasUpdatedAt = async (db: SqlDatabaseClient) => {
  const columns = await db.select<{ name: unknown }>("PRAGMA table_info(schema_meta)");
  return columns.some((column) => column.name === "updated_at");
};

export const writeSchemaMeta = async (db: SqlDatabaseClient, key: string, value: string) => {
  if (await schemaMetaHasUpdatedAt(db)) {
    await db.execute(
      `INSERT INTO schema_meta (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, nowIso()],
    );
    return;
  }

  await db.execute(
    `INSERT INTO schema_meta (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
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
    const existingRows = await db.select<{ id: unknown }>(SELECT_TASK_IDS_SQL);
    const nextTaskIds = new Set(tasks.map((task) => task.id));
    for (const row of existingRows) {
      if (typeof row.id === "string" && !nextTaskIds.has(row.id)) {
        await db.execute("DELETE FROM tasks WHERE id = ?", [row.id]);
      }
    }

    for (const [index, task] of tasks.entries()) {
      await db.execute(UPSERT_TASK_SQL, taskToSqlParams(task, index));
    }
    await writeSchemaMeta(db, "schema_version", SQLITE_SCHEMA_VERSION);
    for (const [key, value] of Object.entries(extraMeta)) {
      await writeSchemaMeta(db, key, value);
    }
  });
};

export const ensureSqliteSchema = async (db: SqlDatabaseClient) => {
  await db.execute("PRAGMA foreign_keys = ON");
  await db.execute("PRAGMA busy_timeout = 5000");
  for (const sql of SCHEMA_SQL) {
    await db.execute(sql);
  }
  await writeSchemaMeta(db, "schema_version", SQLITE_SCHEMA_VERSION);
};

export const tauriSqlDatabaseLoader: SqlDatabaseLoader = {
  async load(path) {
    const Database = (await import("@tauri-apps/plugin-sql")).default;
    return Database.load(path) as Promise<SqlDatabaseClient>;
  },
};

export const createSqliteDatabaseContext = (
  loader: SqlDatabaseLoader = tauriSqlDatabaseLoader,
  databasePath = SQLITE_DATABASE_PATH,
): SqliteDatabaseContext => {
  let dbPromise: Promise<SqlDatabaseClient> | null = null;
  let initialized = false;
  let operationQueue: Promise<unknown> = Promise.resolve();

  const getDb = async () => {
    dbPromise ??= loader.load(databasePath);
    return dbPromise;
  };

  return {
    run(operation) {
      const queuedOperation = operationQueue
        .catch(() => undefined)
        .then(async () => {
          const db = await getDb();
          if (!initialized) {
            await ensureSqliteSchema(db);
            initialized = true;
          }

          return operation(db);
        });

      operationQueue = queuedOperation.then(
        () => undefined,
        () => undefined,
      );

      return queuedOperation;
    },
  };
};

export const sharedSqliteDatabaseContext = createSqliteDatabaseContext();

type SqliteRepositorySource = SqlDatabaseLoader | SqliteDatabaseContext;

const isSqliteDatabaseContext = (source: SqliteRepositorySource): source is SqliteDatabaseContext =>
  "run" in source;

export const createSqliteTaskRepository = (
  source: SqliteRepositorySource = sharedSqliteDatabaseContext,
  databasePath = SQLITE_DATABASE_PATH,
) => {
  let initialized = false;
  const context = isSqliteDatabaseContext(source)
    ? source
    : createSqliteDatabaseContext(source, databasePath);

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

  const ensureTaskDataInitialized = async (db: SqlDatabaseClient) => {
    if (initialized) {
      return;
    }

    const countRows = await db.select<{ count: number }>("SELECT COUNT(*) as count FROM tasks");
    if ((countRows[0]?.count ?? 0) === 0) {
      await initializeEmptyDatabase(db);
    }

    initialized = true;
  };

  return {
    async loadSnapshot(): Promise<TaskSnapshot> {
      return context.run(async (db) => {
        await ensureTaskDataInitialized(db);
        return { tasks: await selectTasks(db) };
      });
    },
    async saveSnapshot(snapshot: TaskSnapshot): Promise<void> {
      await context.run(async (db) => {
        await ensureTaskDataInitialized(db);
        await replaceTasksInTransaction(db, snapshot.tasks);
      });
    },
  };
};

export const sqliteTaskRepository = createSqliteTaskRepository();
