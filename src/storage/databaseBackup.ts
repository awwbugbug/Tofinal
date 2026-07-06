import { sharedSqliteDatabaseContext, type SqliteDatabaseContext } from "@/repositories/sqliteTaskRepository";

export const BACKUP_RETENTION_COUNT = 7;
const BACKUP_DIR = "backups";
const BACKUP_PREFIX = "tofinal-";
const BACKUP_SUFFIX = ".db";

export const backupFileName = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${BACKUP_PREFIX}${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${BACKUP_SUFFIX}`;
};

/** Backup files sorted oldest-first; returns the ones beyond the retention count. */
export const selectBackupsToPrune = (fileNames: string[], retain = BACKUP_RETENTION_COUNT) => {
  const backups = fileNames
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX))
    .sort();
  return backups.slice(0, Math.max(0, backups.length - retain));
};

/**
 * Startup safety net: `VACUUM INTO` writes a consistent SQLite snapshot into
 * `$APPDATA/backups/` through the existing SQL plugin connection (no file
 * copy of a live database), then old backups beyond the retention count are
 * pruned. Best-effort: any failure is reported to the console and never
 * blocks the app.
 */
export const runStartupBackup = async (context: SqliteDatabaseContext = sharedSqliteDatabaseContext) => {
  try {
    const [{ appDataDir, join }, fs] = await Promise.all([
      import("@tauri-apps/api/path"),
      import("@tauri-apps/plugin-fs"),
    ]);

    const appData = await appDataDir();
    await fs.mkdir(BACKUP_DIR, { baseDir: fs.BaseDirectory.AppData, recursive: true });

    const targetPath = await join(appData, BACKUP_DIR, backupFileName());
    // SQLite string literal: escape embedded single quotes.
    const escapedPath = targetPath.replace(/'/g, "''");
    await context.run((db) => db.execute(`VACUUM INTO '${escapedPath}'`));

    const entries = await fs.readDir(BACKUP_DIR, { baseDir: fs.BaseDirectory.AppData });
    const fileNames = entries
      .filter((entry) => entry.isFile !== false && typeof entry.name === "string")
      .map((entry) => entry.name as string);
    for (const staleName of selectBackupsToPrune(fileNames)) {
      await fs
        .remove(`${BACKUP_DIR}/${staleName}`, { baseDir: fs.BaseDirectory.AppData })
        .catch(() => undefined);
    }
  } catch (error) {
    // Browser preview, tests, or a locked file: skip silently but leave a trace.
    console.warn("Startup backup skipped:", error);
  }
};
