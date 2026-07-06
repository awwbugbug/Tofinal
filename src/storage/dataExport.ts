import { buildStackViews } from "@/stores/taskStore";
import type { Task, TaskStack } from "@/types/task";

export type ExportKind = "json" | "markdown";

const EXPORT_VERSION = 1;

const dateStamp = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
};

export const exportFileName = (kind: ExportKind, date = new Date()) =>
  `tofinal-export-${dateStamp(date)}.${kind === "json" ? "json" : "md"}`;

/** Full-fidelity export: everything needed for a future import, trash included. */
export const buildExportJson = (tasks: Task[], stacks: TaskStack[], exportedAt = new Date().toISOString()) =>
  JSON.stringify(
    {
      app: "ToFinal",
      version: EXPORT_VERSION,
      exportedAt,
      tasks,
      stacks,
    },
    null,
    2,
  );

const taskLine = (task: Task, indent = "") => {
  const parts = [`${indent}- [${task.completed ? "x" : " "}] ${task.title}`];
  const meta: string[] = [];
  if (task.priority !== "normal") {
    meta.push(task.priority === "urgent" ? "urgent" : "important");
  }
  if (task.pinned) {
    meta.push("pinned");
  }
  if (task.plannedDate) {
    meta.push(`planned: ${task.plannedDate}`);
  }
  meta.push(...task.tags.map((tag) => `#${tag}`));
  if (meta.length > 0) {
    parts.push(` (${meta.join(", ")})`);
  }

  const lines = [parts.join("")];
  if (task.note.trim()) {
    for (const noteLine of task.note.trim().split(/\r?\n/)) {
      lines.push(`${indent}  ${noteLine}`);
    }
  }
  return lines.join("\n");
};

/** Human-readable export grouped by stack hierarchy; open first, then done, then trash. */
export const buildExportMarkdown = (tasks: Task[], stacks: TaskStack[], exportedAt = new Date()) => {
  const views = buildStackViews(tasks, stacks);
  const openSections: string[] = [];
  const doneSections: string[] = [];

  for (const view of views) {
    const [mainTask, ...children] = view.tasks;
    const lines = [taskLine(mainTask), ...children.map((child) => taskLine(child, "  "))];
    if (view.tasks.every((task) => task.completed)) {
      doneSections.push(lines.join("\n"));
    } else {
      openSections.push(lines.join("\n"));
    }
  }

  const trashedLines = tasks
    .filter((task) => task.deletedAt)
    .map((task) => taskLine(task));

  const sections = [
    "# ToFinal Tasks",
    "",
    `Exported: ${exportedAt.toISOString()}`,
  ];
  sections.push("", "## Open", "", openSections.length > 0 ? openSections.join("\n") : "_none_");
  sections.push("", "## Done", "", doneSections.length > 0 ? doneSections.join("\n") : "_none_");
  if (trashedLines.length > 0) {
    sections.push("", "## Trash", "", trashedLines.join("\n"));
  }

  return `${sections.join("\n")}\n`;
};

/**
 * Opens a save dialog and writes the export. The dialog grants a temporary
 * fs scope for the chosen path, so no static scope covers it. Returns the
 * saved path, or null when the user cancels.
 */
export const exportTasksToFile = async (kind: ExportKind, tasks: Task[], stacks: TaskStack[]) => {
  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);

  const targetPath = await save({
    defaultPath: exportFileName(kind),
    filters: [
      kind === "json"
        ? { name: "JSON", extensions: ["json"] }
        : { name: "Markdown", extensions: ["md"] },
    ],
  });
  if (!targetPath) {
    return null;
  }

  const content = kind === "json" ? buildExportJson(tasks, stacks) : buildExportMarkdown(tasks, stacks);
  await writeFile(targetPath, new TextEncoder().encode(content));
  return targetPath;
};
