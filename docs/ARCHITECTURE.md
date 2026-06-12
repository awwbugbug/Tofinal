# ToFinal Architecture

## Current Stack

- Desktop shell: Tauri v2 with custom window chrome.
- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn-style local UI primitives.
- State: Zustand.
- Icons: lucide-react.
- Persistence: SQLite through the official Tauri SQL Plugin, with localStorage retained only as a v0.2 migration source.
- Local files: Tauri Dialog and FS plugins for AppData-owned image attachments.
- Tests: Vitest, Testing Library, jsdom.

## Project Structure

```text
ToFinal/
  docs/
    ACCEPTANCE_REPORT.md
    ARCHITECTURE.md
    ROADMAP.md
    TECH_DEBT.md
    VERSION_BASELINE.md
  src/
    app/
    components/
      layout/
      task/
      ui/
    lib/
    repositories/
    storage/
    stores/
    styles/
    test/
    types/
  src-tauri/
    capabilities/
    icons/
    src/
    tauri.conf.json
```

- `src/app`: React app entry component and app-level interaction tests.
- `src/components/layout`: window title bar, app shell, Normal Mode, Desktop Pin Mode, Sidebar, and DetailPanel composition.
- `src/components/task`: task input, list, item, and editable detail components.
- `src/components/ui`: small local UI primitives used by the app.
- `src/lib`: shared helpers and Tauri window wrappers.
- `src/repositories`: async persistence-facing repository interface boundary plus SQLite-backed task and attachment metadata implementations.
- `src/storage`: localStorage snapshot utilities plus attachment file storage for AppData-owned image copies.
- `src/stores`: Zustand task store, attachment store, and store tests.
- `src/styles`: global CSS tokens and utility classes.
- `src/test`: test setup.
- `src/types`: shared TypeScript domain types.
- `src-tauri`: Tauri app config, permissions, Rust entrypoints, and bundle assets.

## Core File Responsibilities

- `src/stores/taskStore.ts`: owns in-memory task state, selected task, app mode, filter/search state, task mutations, filtering, async hydration, and persistence calls.
- `src/storage/taskStorage.ts`: reads/writes v0.2 task snapshots at localStorage key `tofinal.tasks.v1`, seeds first-run data, validates stored tasks, and migrates missing `pinned` to `false`.
- `src/repositories/taskRepository.ts`: defines async `TaskRepository`, exposes the active repository, and allows tests to inject a memory repository.
- `src/repositories/sqliteTaskRepository.ts`: opens `sqlite:tofinal.db`, ensures schema version 2, maps SQLite rows to `Task`, migrates v0.2 localStorage snapshots, and saves task snapshots transactionally.
- `src/repositories/sqliteAttachmentRepository.ts`: manages `task_attachments` metadata only; it does not copy files, open file pickers, or render previews.
- `src/storage/attachmentFileStorage.ts`: owns local image selection, validation, AppData attachment path generation, file copy/delete, and preview URL creation.
- `src/stores/attachmentStore.ts`: owns selected-task attachment loading, add/delete flows, preview state, stale-load protection, and task-delete file cleanup coordination.
- `src/types/task.ts`: defines `Task`, `TaskPriority`, `AppMode`, and `TaskFilter`.
- `src/types/attachment.ts`: defines `TaskAttachment` and `AttachmentKind`.
- `src/lib/windowMode.ts`: applies Normal/Pin Tauri window profiles with try/catch fallback.
- `src/lib/windowControls.ts`: wraps Tauri current-window controls for dragging, minimize, maximize/restore, and close.
- `src/components/layout/*`: composes app-level surfaces, window modes, navigation, title bar, details, and resizable Normal Mode columns.
- `src/components/task/*`: implements task creation, list rendering, completion, selection, and detail editing.
- `src/components/task/AttachmentLightbox.tsx`: owns enlarged image preview rendering, local close animation, backdrop click, close button, and Escape handling.
- `src-tauri/tauri.conf.json`: product metadata, dev/build commands, main window dimensions, custom titlebar decorations setting, and bundle icons.
- `src-tauri/capabilities/default.json`: grants the main window only the current core/window permissions plus opener default.

## Data Flow

1. `AppShell` calls `taskStore.hydrateTasks()` on startup.
2. `taskStore` calls the active async `TaskRepository.loadSnapshot()`.
3. The default repository opens `sqlite:tofinal.db` through `@tauri-apps/plugin-sql`.
4. The SQLite repository ensures `schema_meta`, `tasks`, and `task_attachments` exist.
5. If SQLite contains rows, tasks are loaded from SQLite with explicit sort order.
6. If SQLite is empty, the repository reads localStorage key `tofinal.tasks.v1`; valid v0.2 snapshots are migrated into SQLite, while missing/invalid localStorage falls back to seed tasks.
7. User interactions flow from UI components to Zustand actions.
8. `taskStore` updates memory immediately and recomputes `selectedTaskId` when filtering, searching, updating, completing, or deleting can change visible tasks.
9. Mutations call `TaskRepository.saveSnapshot({ tasks })`, which writes the full snapshot to SQLite in a transaction.
10. UI components do not import SQLite, localStorage, or plugin APIs directly.

## Task Schema

```ts
type Task = {
  id: string;
  title: string;
  note: string;
  completed: boolean;
  priority: "normal" | "important" | "urgent";
  pinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
```

## Persistence Strategy

- Current persistence is SQLite.
- Database path: `sqlite:tofinal.db`.
- SQLite schema version: `2`, stored in `schema_meta`.
- Tasks are stored in the `tasks` table with `sort_order` for deterministic ordering.
- Attachment metadata is stored in `task_attachments`; image files themselves are not stored in SQLite.
- Image attachment files are copied into the Tauri AppData base directory under `attachments/images/<taskId>/<attachmentId>.<ext>`.
- `tags` are JSON TEXT.
- `completed` and `pinned` are SQLite INTEGER booleans with `CHECK (value IN (0, 1))`.
- `completedAt` maps to nullable `completed_at`.
- localStorage key `tofinal.tasks.v1` is retained for v0.2 migration and rollback only.
- Invalid localStorage snapshots are not migrated; empty SQLite then falls back to seed tasks.
- Only task data is persisted. Window mode, column widths, active filter, search query, and selection remain session UI state.

## State Management

Store state:
- `tasks`
- `selectedTaskId`
- `mode`
- `activeFilter`
- `searchQuery`
- `hydrated`
- `loading`
- `error`

Store actions:
- `hydrateTasks`
- `addTask`
- `updateTask`
- `deleteTask`
- `toggleTask`
- `togglePinned`
- `selectTask`
- `setMode`
- `setActiveFilter`
- `setSearchQuery`
- `getFilteredTasks`

The store mixes task data with lightweight UI state. This remains acceptable for the current single-user desktop app, but larger features should split persistent task data from ephemeral UI preferences before adding more global UI state.

Attachment store state:
- `itemsByTaskId`
- `loadingTaskIds`
- `adding`
- `deletingIds`
- `error`

Attachment store actions:
- `loadByTaskId`
- `addImageAttachment`
- `deleteAttachment`
- `deleteTaskWithAttachmentCleanup`

The attachment store is separate from `taskStore` so Desktop Pin Mode and task filtering do not carry image preview state. UI components call attachment store actions; they do not import Tauri dialog/fs APIs or SQLite repositories directly.

## Window Modes

- Normal Mode uses the full three-column layout: Sidebar, TaskList, DetailPanel.
- Desktop Pin Mode uses the same task store and shows QuickInput plus up to five open tasks, with pinned tasks sorted first.
- `applyWindowMode` attempts Tauri window size, min size, always-on-top, and skip-taskbar changes. Browser/dev fallback keeps UI switching usable.
- Normal Mode column widths are session-only React state and are clamped on drag and window resize.

## Tauri Permissions

Current capability permissions:
- `core:default`
- `core:window:allow-set-size`
- `core:window:allow-set-min-size`
- `core:window:allow-set-always-on-top`
- `core:window:allow-set-skip-taskbar`
- `core:window:allow-start-dragging`
- `core:window:allow-minimize`
- `core:window:allow-toggle-maximize`
- `core:window:allow-close`
- `opener:default`
- `sql:default`
- `sql:allow-execute`
- `sql:allow-select`
- `dialog:allow-open`
- `fs:allow-exists`
- `fs:allow-mkdir`
- `fs:allow-read-file`
- `fs:allow-remove`
- `fs:allow-stat`
- `fs:allow-write-file`
- scoped filesystem access for `$APPDATA/attachments/**`

These permissions are narrow for the current feature set. SQL permissions are limited to the plugin defaults plus select/execute. Dialog permission is limited to open-file selection. Filesystem writes/removes are scoped to AppData attachments; selected source files are read through the temporary scope granted by the dialog plugin. No shell, clipboard, global shortcut, tray, screenshot, or notification permissions are currently granted.

## SQLite Repository Boundary

The SQLite replacement is implemented behind the same repository boundary:

- `loadSnapshot(): Promise<TaskSnapshot>`
- `saveSnapshot(snapshot: TaskSnapshot): Promise<void>`

Future schema work should extend the repository layer and SQLite migrations instead of letting UI components access SQL directly. Attachments, screenshots, and metadata should add their own tables instead of expanding the task row with binary data.

## Attachment Metadata Boundary

Phase 4A adds metadata-only attachment persistence:

- `listByTaskId(taskId): Promise<TaskAttachment[]>`
- `getAttachment(id): Promise<TaskAttachment | null>`
- `insertAttachment(attachment): Promise<void>`
- `deleteAttachment(id): Promise<void>`
- `deleteByTaskId(taskId): Promise<void>`

The table uses:

```sql
FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
```

`PRAGMA foreign_keys = ON` is enabled during SQLite schema initialization. Task snapshot saving no longer deletes every task row before reinsert; it upserts retained tasks and deletes only missing task ids, so retained task attachments are not removed by ordinary task saves.

## Attachment File Boundary

Phase 4B adds local image file handling behind `src/storage/attachmentFileStorage.ts`:

1. The UI requests `attachmentStore.addImageAttachment(taskId)`.
2. The file storage adapter opens a native image picker.
3. The selected source image is validated by extension and file size.
4. The source image is copied to AppData under `attachments/images/<taskId>/`.
5. SQLite stores only metadata, including `relative_path`.
6. Preview URLs are created from the app-owned copied file, not from the original source path.

Deleting an attachment removes metadata first and then attempts to remove the copied file. If file deletion fails, metadata stays deleted and the error is surfaced through attachment store state.

Screenshot capture should reuse this boundary in Phase 5 by writing the screenshot image into the same attachments directory and inserting a `task_attachments` row with `kind = "screenshot"`.

## Attachment Preview Boundary

Phase 4C adds a TaskDetail-local Lightbox for image attachments:

- TaskDetail holds the currently previewed attachment in local React state.
- `AttachmentLightbox` renders the centered preview, backdrop, close control, Escape listener, and broken-image state.
- The Lightbox consumes the preview URL already produced by `attachmentStore`; it does not read files, query SQLite, or mutate task data.
- The preview is intentionally read-only. It does not edit, rotate, crop, zoom, or generate thumbnails.
- Desktop Pin Mode does not render the Lightbox entry because it does not load attachment previews.

## Task App Binding Boundary

Phase 5B adds manual task app binding without automatic software discovery.

SQLite schema version `3` adds `task_apps`:

```sql
CREATE TABLE IF NOT EXISTS task_apps (
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
);
```

`PRAGMA foreign_keys = ON` remains part of SQLite initialization, so deleting a task cascades task app metadata.

Task app code is intentionally split:

- `src/types/taskApp.ts` defines `TaskApp` and `TaskAppKind`.
- `src/repositories/sqliteTaskAppRepository.ts` owns SQL row mapping and metadata CRUD.
- `src/storage/taskAppSelection.ts` owns manual `.exe` / `.lnk` file selection.
- `src/lib/appLauncher.ts` owns the frontend launcher adapter.
- `src/stores/taskAppStore.ts` owns selected-task app loading, add, rename, delete, and Start Task state.
- `src-tauri/src/lib.rs` exposes `launch_task_app`, a narrow command that validates the selected path and app kind before launching.

The UI data flow is:

1. TaskDetail calls `taskAppStore.addApp(taskId)`.
2. The selection adapter opens a user-triggered file picker.
3. The store validates `.exe` or `.lnk`, builds metadata, and inserts through `sqliteTaskAppRepository`.
4. TaskDetail reloads the selected task app list from store state.
5. Start Task calls `taskAppStore.startTask(taskId)`, which delegates to `appLauncher.launch(taskApp)`.
6. The Tauri command launches only the stored, validated path.

Task apps are not stored in `taskStore`, and Desktop Pin Mode does not load or render the app binding list.

No shell plugin permission, clipboard permission, notification permission, tray permission, global shortcut permission, or software-scanning permission is used for Phase 5B.
