import { describe, expect, it, vi } from "vitest";

import {
  createSqliteDatabaseContext,
  SQLITE_DATABASE_PATH,
  type SqlDatabaseClient,
} from "@/repositories/sqliteTaskRepository";

class FakeSqlDatabase implements SqlDatabaseClient {
  activeOperations = 0;
  maxConcurrentOperations = 0;
  executed: string[] = [];

  async execute(sql: string) {
    this.executed.push(sql);
  }

  async select<T>(sql: string): Promise<T[]> {
    this.executed.push(sql);
    if (sql.startsWith("PRAGMA table_info(schema_meta)")) {
      return [{ name: "key" }, { name: "value" }, { name: "updated_at" }] as T[];
    }

    return [] as T[];
  }

  async trackOperation() {
    this.activeOperations += 1;
    this.maxConcurrentOperations = Math.max(this.maxConcurrentOperations, this.activeOperations);
    await Promise.resolve();
    this.activeOperations -= 1;
  }
}

describe("sqlite database context", () => {
  it("serializes operations across repositories sharing the same context", async () => {
    const db = new FakeSqlDatabase();
    const loader = {
      load: vi.fn(async (path) => {
        expect(path).toBe(SQLITE_DATABASE_PATH);
        return db;
      }),
    };
    const context = createSqliteDatabaseContext(loader);

    await Promise.all([
      context.run(async (database) => (database as FakeSqlDatabase).trackOperation()),
      context.run(async (database) => (database as FakeSqlDatabase).trackOperation()),
      context.run(async (database) => (database as FakeSqlDatabase).trackOperation()),
    ]);

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(db.maxConcurrentOperations).toBe(1);
    expect(db.executed).toContain("PRAGMA foreign_keys = ON");
    expect(db.executed).toContain("PRAGMA busy_timeout = 5000");
  });
});
