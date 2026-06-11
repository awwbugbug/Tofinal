import {
  ensureSqliteSchema,
  SQLITE_DATABASE_PATH,
  tauriSqlDatabaseLoader,
  type SqlDatabaseClient,
  type SqlDatabaseLoader,
  type SqlValue,
} from "@/repositories/sqliteTaskRepository";
import type { AttachmentKind, TaskAttachment } from "@/types/attachment";

type SqlAttachmentRow = {
  id: unknown;
  task_id: unknown;
  kind: unknown;
  original_name: unknown;
  stored_name: unknown;
  relative_path: unknown;
  mime_type: unknown;
  size_bytes: unknown;
  width: unknown;
  height: unknown;
  created_at: unknown;
  updated_at: unknown;
  sort_order: unknown;
};

const SELECT_ATTACHMENT_COLUMNS = `id,
  task_id,
  kind,
  original_name,
  stored_name,
  relative_path,
  mime_type,
  size_bytes,
  width,
  height,
  created_at,
  updated_at,
  sort_order`;

const SELECT_ATTACHMENTS_BY_TASK_SQL = `SELECT ${SELECT_ATTACHMENT_COLUMNS}
FROM task_attachments
WHERE task_id = ?
ORDER BY sort_order ASC, created_at ASC, id ASC`;

const SELECT_ATTACHMENT_BY_ID_SQL = `SELECT ${SELECT_ATTACHMENT_COLUMNS}
FROM task_attachments
WHERE id = ?
LIMIT 1`;

const INSERT_ATTACHMENT_SQL = `INSERT INTO task_attachments (
  id,
  task_id,
  kind,
  original_name,
  stored_name,
  relative_path,
  mime_type,
  size_bytes,
  width,
  height,
  created_at,
  updated_at,
  sort_order
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const isAttachmentKind = (value: unknown): value is AttachmentKind =>
  value === "image" || value === "screenshot";

const stringField = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new Error(`Invalid SQLite attachment text field: ${field}`);
  }

  return value;
};

const numberField = (value: unknown, field: string) => {
  if (typeof value !== "number") {
    throw new Error(`Invalid SQLite attachment number field: ${field}`);
  }

  return value;
};

const nullableNumberField = (value: unknown, field: string) => {
  if (value === null) {
    return null;
  }

  return numberField(value, field);
};

export const attachmentFromSqlRow = (row: SqlAttachmentRow): TaskAttachment => {
  if (!isAttachmentKind(row.kind)) {
    throw new Error("Invalid attachment kind.");
  }

  return {
    id: stringField(row.id, "id"),
    taskId: stringField(row.task_id, "task_id"),
    kind: row.kind,
    originalName: stringField(row.original_name, "original_name"),
    storedName: stringField(row.stored_name, "stored_name"),
    relativePath: stringField(row.relative_path, "relative_path"),
    mimeType: stringField(row.mime_type, "mime_type"),
    sizeBytes: numberField(row.size_bytes, "size_bytes"),
    width: nullableNumberField(row.width, "width"),
    height: nullableNumberField(row.height, "height"),
    createdAt: stringField(row.created_at, "created_at"),
    updatedAt: stringField(row.updated_at, "updated_at"),
    sortOrder: numberField(row.sort_order, "sort_order"),
  };
};

export const attachmentToSqlParams = (attachment: TaskAttachment): SqlValue[] => {
  if (!isAttachmentKind(attachment.kind)) {
    throw new Error("Invalid attachment kind.");
  }

  return [
    attachment.id,
    attachment.taskId,
    attachment.kind,
    attachment.originalName,
    attachment.storedName,
    attachment.relativePath,
    attachment.mimeType,
    attachment.sizeBytes,
    attachment.width,
    attachment.height,
    attachment.createdAt,
    attachment.updatedAt,
    attachment.sortOrder,
  ];
};

export type AttachmentRepository = {
  listByTaskId: (taskId: string) => Promise<TaskAttachment[]>;
  getAttachment: (id: string) => Promise<TaskAttachment | null>;
  insertAttachment: (attachment: TaskAttachment) => Promise<void>;
  deleteAttachment: (id: string) => Promise<void>;
  deleteByTaskId: (taskId: string) => Promise<void>;
};

export const createSqliteAttachmentRepository = (
  loader: SqlDatabaseLoader = tauriSqlDatabaseLoader,
  databasePath = SQLITE_DATABASE_PATH,
): AttachmentRepository => {
  let dbPromise: Promise<SqlDatabaseClient> | null = null;
  let initialized = false;

  const getDb = async () => {
    dbPromise ??= loader.load(databasePath);
    return dbPromise;
  };

  const ensureInitialized = async (db: SqlDatabaseClient) => {
    if (initialized) {
      return;
    }

    await ensureSqliteSchema(db);
    initialized = true;
  };

  return {
    async listByTaskId(taskId) {
      const db = await getDb();
      await ensureInitialized(db);
      const rows = await db.select<SqlAttachmentRow>(SELECT_ATTACHMENTS_BY_TASK_SQL, [taskId]);
      return rows.map(attachmentFromSqlRow);
    },
    async getAttachment(id) {
      const db = await getDb();
      await ensureInitialized(db);
      const rows = await db.select<SqlAttachmentRow>(SELECT_ATTACHMENT_BY_ID_SQL, [id]);
      return rows[0] ? attachmentFromSqlRow(rows[0]) : null;
    },
    async insertAttachment(attachment) {
      const db = await getDb();
      await ensureInitialized(db);
      await db.execute(INSERT_ATTACHMENT_SQL, attachmentToSqlParams(attachment));
    },
    async deleteAttachment(id) {
      const db = await getDb();
      await ensureInitialized(db);
      await db.execute("DELETE FROM task_attachments WHERE id = ?", [id]);
    },
    async deleteByTaskId(taskId) {
      const db = await getDb();
      await ensureInitialized(db);
      await db.execute("DELETE FROM task_attachments WHERE task_id = ?", [taskId]);
    },
  };
};

export const sqliteAttachmentRepository = createSqliteAttachmentRepository();
