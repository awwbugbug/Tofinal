import { describe, expect, it } from "vitest";

import { selectBackupsToPrune } from "@/storage/databaseBackup";
import { buildExportJson, buildExportMarkdown, exportFileName } from "@/storage/dataExport";
import type { Task, TaskStack } from "@/types/task";

const task = (overrides: Partial<Task> = {}): Task => {
  const id = overrides.id ?? "task-test";
  return {
    id,
    title: "Export me",
    note: "",
    completed: false,
    priority: "normal",
    pinned: false,
    tags: [],
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
    completedAt: null,
    plannedDate: null,
    startTime: null,
    durationMinutes: null,
    stackId: `stack-${id}`,
    stackOrder: 0,
    deletedAt: null,
    ...overrides,
  };
};

const stack = (id: string, sortOrder = 0): TaskStack => ({
  id,
  sortOrder,
  collapsed: true,
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-07-01T08:00:00.000Z",
});

describe("data export", () => {
  it("builds full-fidelity JSON including trashed tasks", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", deletedAt: "2026-07-02T00:00:00.000Z" })];
    const parsed = JSON.parse(buildExportJson(tasks, [stack("stack-a"), stack("stack-b", 1)]));

    expect(parsed.app).toBe("ToFinal");
    expect(parsed.version).toBe(1);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[1].deletedAt).toBe("2026-07-02T00:00:00.000Z");
    expect(parsed.stacks).toHaveLength(2);
  });

  it("builds markdown grouped by open, done, and trash with stack hierarchy and metadata", () => {
    const tasks = [
      task({ id: "main", title: "Main task", stackId: "stack-main", priority: "important", tags: ["work"], plannedDate: "2026-07-08", note: "line one\nline two" }),
      task({ id: "child", title: "Child task", stackId: "stack-main", stackOrder: 1 }),
      task({ id: "done", title: "Done task", completed: true, completedAt: "2026-07-01T09:00:00.000Z" }),
      task({ id: "gone", title: "Trashed task", deletedAt: "2026-07-02T00:00:00.000Z" }),
    ];
    const markdown = buildExportMarkdown(tasks, [stack("stack-main"), stack("stack-done", 1)], new Date("2026-07-06T00:00:00.000Z"));

    expect(markdown).toContain("- [ ] Main task (important, planned: 2026-07-08, #work)");
    expect(markdown).toContain("  line one\n  line two");
    expect(markdown).toContain("  - [ ] Child task");
    expect(markdown).toContain("- [x] Done task");
    expect(markdown).toContain("## Trash");
    expect(markdown).toContain("- [ ] Trashed task");
    expect(markdown.indexOf("## Open")).toBeLessThan(markdown.indexOf("## Done"));
  });

  it("names export files by kind and date", () => {
    const date = new Date(2026, 6, 6);
    expect(exportFileName("json", date)).toBe("tofinal-export-20260706.json");
    expect(exportFileName("markdown", date)).toBe("tofinal-export-20260706.md");
  });

  it("prunes only backup files beyond the retention count, oldest first", () => {
    const names = [
      "tofinal-20260701-080000.db",
      "tofinal-20260702-080000.db",
      "tofinal-20260703-080000.db",
      "tofinal-20260704-080000.db",
      "tofinal-20260705-080000.db",
      "tofinal-20260706-080000.db",
      "tofinal-20260707-080000.db",
      "tofinal-20260708-080000.db",
      "unrelated.txt",
    ];

    expect(selectBackupsToPrune(names, 7)).toEqual(["tofinal-20260701-080000.db"]);
    expect(selectBackupsToPrune(names.slice(0, 3), 7)).toEqual([]);
  });
});
