# ToFinal Architecture

## Current Stack

- Desktop shell: Tauri v2 with custom window chrome and one primary app window (`main`).
- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn-style local UI primitives.
- State: Zustand.
- Icons: lucide-react.
- Persistence: SQLite through the official Tauri SQL Plugin for task data; localStorage is retained for v0.2 task migration and Phase 7B UI preferences.
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
    i18n/
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
- `src/components/layout`: window title bar, app shell, Normal Mode, Sidebar, and DetailPanel composition.
- `src/components/task`: task input, list, item, and editable detail components.
- `src/components/ui`: small local UI primitives used by the app.
- `src/lib`: shared helpers and Tauri window wrappers.
- `src/repositories`: async persistence-facing repository interface boundary plus SQLite-backed task and attachment metadata implementations.
- `src/storage`: localStorage snapshot utilities plus attachment file storage for AppData-owned image copies.
- `src/stores`: Zustand task, attachment, task app, and preferences stores plus store tests.
- `src/i18n`: lightweight key-based UI text dictionaries and translation hook.
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
- `src/stores/preferencesStore.ts`: owns UI preferences, including theme, resolved theme, language, initialization, localStorage persistence, and `data-theme` application.
- `src/i18n/messages.ts`: centralizes Chinese and English UI text keys for the lightweight dictionary.
- `src/i18n/useI18n.ts`: exposes the current translator from the preferences language.
- `src/types/task.ts`: defines `Task`, `TaskPriority`, `AppMode`, and `TaskFilter`.
- `src/types/attachment.ts`: defines `TaskAttachment` and `AttachmentKind`.
- `src/lib/windowMode.ts`: best-effort single-window Normal/Desktop Pin mode window profile helper. It changes size, minimum size, always-on-top, and taskbar visibility through Tauri window APIs.
- `src/lib/windowControls.ts`: wraps Tauri current-window controls for dragging, minimize, maximize/restore, and close.
- `src/components/layout/*`: composes app-level surfaces, window modes, navigation, title bar, details, and resizable Normal Mode columns.
- `src/components/task/*`: implements task creation, list rendering, completion, selection, and detail editing.
- `src/components/task/AttachmentLightbox.tsx`: owns enlarged image preview rendering, local close animation, backdrop click, close button, and Escape handling.
- `src-tauri/tauri.conf.json`: product metadata, dev/build commands, the single `main` window, and bundle icons.
- `src-tauri/capabilities/default.json`: grants the `main` window the current core/window permissions plus opener, SQL, dialog, and scoped filesystem permissions.

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

Preferences data flow:

1. `AppShell` calls `preferencesStore.loadPreferences()` on startup.
2. The preferences store reads localStorage key `tofinal.preferences.v1`.
3. Invalid JSON, unavailable localStorage, or invalid preference values fall back to `theme = "system"` and `language = "zh-CN"`.
4. `theme = "system"` resolves through `window.matchMedia("(prefers-color-scheme: dark)")` when available.
5. The store applies `document.documentElement.dataset.theme = "light"` or `"dark"`; it never writes `data-theme="system"`.
6. UI components read translated labels through `useI18n()`.
7. User task titles, notes, tags, attachment names, and task app names are not translated or mutated by i18n.

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
- localStorage key `tofinal.preferences.v1` stores UI preferences only.
- Window mode and column width state are session UI state. The app no longer persists a separate widget/window-state key for Desktop Pin Mode.
- Invalid localStorage snapshots are not migrated; empty SQLite then falls back to seed tasks.
- Task data, attachment metadata, and task app metadata remain in SQLite. UI preferences remain outside SQLite for Phase 7B.
- Window mode remains session UI state and restarts in Normal Mode. Widget/normal window bounds are best-effort local UI state. Column widths, active filter, search query, and selection remain session UI state.

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

Preferences store state:
- `theme`
- `resolvedTheme`
- `language`
- `initialized`

Preferences store actions:
- `loadPreferences`
- `setTheme`
- `setLanguage`
- `resetPreferences`

The preferences store is separate from `taskStore`, does not access SQLite repositories, and does not route through the task save queue.

## Window Modes

- Normal Mode uses the full three-column layout: Sidebar, TaskList, DetailPanel.
- Desktop Pin Mode is the original compact single-window mode. It uses `DesktopPinLayout` inside the same Tauri `main` window instead of a second transparent widget window.
- `taskStore.mode` is the only mode state: `normal` renders `NormalModeLayout`; `pin` renders `DesktopPinLayout`.
- `DesktopPinLayout` shows QuickInput, the current open task count, up to five unfinished tasks with pinned tasks first, completion checkboxes, task selection, and one return-to-Normal control.
- Desktop Pin Mode intentionally does not load or render DetailPanel, attachments, Screenshot Editor, Lightbox, task app bindings, Start Task, settings, search, priority editor, tag editor, or note editor.
- `applyWindowMode(mode)` is best-effort. It resizes the current window to about `1120x760` for Normal Mode and `360x520` for Desktop Pin Mode, applies minimum sizes, toggles always-on-top, and toggles skip-taskbar.
- If Tauri window APIs fail or the app is running in browser preview, React mode switching still works.
- The dual-window WidgetCard/Handoff experiment was removed because it added too much complexity for the current product value and caused unstable desktop behavior.
- The main window is frameless through `tauri.conf.json` with `"decorations": false`.
- Normal Mode column widths are session-only React state and are clamped on drag and window resize.

## Tauri Permissions

Current capability permissions:
- `core:default`
- `core:window:allow-get-all-windows`
- `core:window:allow-set-size`
- `core:window:allow-set-min-size`
- `core:window:allow-set-max-size`
- `core:window:allow-set-resizable`
- `core:window:allow-set-position`
- `core:window:allow-set-always-on-top`
- `core:window:allow-set-skip-taskbar`
- `core:window:allow-start-dragging`
- `core:window:allow-minimize`
- `core:window:allow-toggle-maximize`
- `core:window:allow-close`
- `core:window:allow-hide`
- `core:window:allow-show`
- `core:window:allow-set-focus`
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

These permissions are narrow for the current feature set. Size, min-size, always-on-top, and skip-taskbar support the single-window Normal/Desktop Pin mode switch. Show/hide/focus support user-triggered screenshot capture without including the ToFinal window. SQL permissions are limited to the plugin defaults plus select/execute. Dialog permission is limited to open-file selection. Filesystem writes/removes are scoped to AppData attachments; selected source files are read through the temporary scope granted by the dialog plugin. No shell, clipboard, global shortcut, tray, notification, runtime-transparent, set-position, resizable, max-size, or set-decorations permission is currently granted.

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

Screenshot capture reuses this boundary by writing only confirmed screenshot PNGs into the same attachments directory and inserting a `task_attachments` row with `kind = "screenshot"`.

## Screenshot Capture And Editor Boundary

Phase 6B adds a user-triggered full-screen screenshot capture command. Phase 6C changes the UI contract to a single `Screenshot` button that opens a Screenshot Editor before persistence. SQLite schema version remains `3`.

- `src-tauri/src/lib.rs` exposes `capture_fullscreen_screenshot`.
- The Rust command uses `xcap` to capture available monitors and returns encoded PNG bytes plus image dimensions.
- `src/storage/screenshotCapture.ts` is the frontend adapter around the Tauri command.
- Before invoking the Rust command, the adapter hides the current Tauri window, waits briefly for the desktop compositor to settle, and restores/focuses the window in `finally`.
- `attachmentStore.addScreenshotAttachment(taskId)` captures the PNG as temporary in-memory data, creates a preview URL, and opens editor state.
- `TaskDetail` renders `ScreenshotEditorOverlay` from local/detail UI composition; the editor does not query SQLite, mutate tasks, or write files.
- `ScreenshotEditorOverlay` owns preview display, rectangular crop selection, Reset Crop, Confirm, Cancel, and Escape behavior.
- `attachmentStore.confirmScreenshotAttachment(finalScreenshot)` writes the confirmed final PNG under AppData, inserts `kind = "screenshot"` metadata through `sqliteAttachmentRepository`, revokes the temporary preview URL, and reloads selected task attachments.
- `attachmentStore.cancelScreenshotAttachment()` revokes the temporary preview URL and writes no file or metadata.
- `attachmentFileStorage.writeScreenshotToAppData` stores screenshots under `attachments/images/<taskId>/<attachmentId>.png`.
- TaskDetail exposes a single `Screenshot` button in the existing Attachments section.
- The responsive action row keeps Add Image and Screenshot from clipping in narrow DetailPanel widths.
- Existing attachment preview, delete, missing-file state, and Lightbox behavior are reused.

The screenshot flow is:

1. TaskDetail Screenshot is clicked by the user.
2. `attachmentStore.addScreenshotAttachment(taskId)` calls `screenshotCapture.captureFullscreen()`.
3. The screenshot adapter hides the ToFinal window, waits briefly, invokes `capture_fullscreen_screenshot`, then restores/focuses the window.
4. The captured PNG remains temporary and is shown in `ScreenshotEditorOverlay`.
5. The user may drag a crop rectangle, Reset Crop, Confirm, Cancel, or press Escape.
6. Confirm with no crop passes the full PNG back to the store.
7. Confirm with a valid crop passes cropped PNG bytes and final dimensions back to the store.
8. The confirmed PNG is written to Tauri AppData through the attachment file storage adapter.
9. A `task_attachments` row is inserted with `kind = "screenshot"` and `mime_type = "image/png"`.
10. The selected task attachment list reloads and the screenshot appears as a normal attachment preview.

Cancel and Escape are persistence no-ops: no final PNG and no `task_attachments` row.

No background screenshot listener, global shortcut, tray integration, OCR, AI, cloud upload, screenshot table, SQLite blob storage, annotation UI, or separate Region Screenshot entry is used.

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

## Temporal Task View Boundary

Phase 9B upgrades task persistence to SQLite schema version `4`.

The `tasks` table now includes:

```sql
planned_date TEXT NULL
```

The TypeScript `Task` model maps this field as:

```ts
plannedDate: string | null
```

`completed_at` continues to map to:

```ts
completedAt: string | null
```

Date semantics:

- `plannedDate` uses a local date key in `YYYY-MM-DD` format.
- `getLocalDateKey(date = new Date())` uses local calendar fields, not UTC string slicing.
- `completedAt` remains an ISO timestamp written when a task is completed.
- Reopening a completed task clears `completedAt`.

View semantics:

- `Today` is the execution view. It shows incomplete tasks whose `plannedDate` equals today's local date key.
- `Today` also exposes a completed-today section based on `completedAt`.
- `All Tasks` is the management/backlog view. It shows all incomplete tasks regardless of whether `plannedDate` is `null`, today, or future.
- `Important` and `Pinned` keep their existing semantics and are not treated as temporal execution views.

Task creation:

- Quick add in `Today` sets `plannedDate = today`.
- Quick add in `All Tasks`, `Important`, or `Pinned` sets `plannedDate = null`.

Phase 9B intentionally does not introduce `task_stacks`, `stack_id`, `stack_order`, drag reorder, drag merge, subtasks, or a date picker.

## Task Stack Boundary

Phase 9C upgrades task persistence to SQLite schema version `5`.

New table:

```sql
CREATE TABLE IF NOT EXISTS task_stacks (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  collapsed INTEGER NOT NULL CHECK (collapsed IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

New task columns:

```sql
stack_id TEXT NULL;
stack_order INTEGER NULL;
```

Migration behavior:

- Existing v4 tasks are migrated to singleton stacks.
- Each existing task receives `stack_id = 'stack-' || task.id` and `stack_order = 0`.
- Each generated stack inherits the task's previous `sort_order`.
- `task_attachments` and `task_apps` are not migrated because they remain attached to concrete task ids.

Data flow:

1. `sqliteTaskRepository.loadSnapshot()` loads tasks and stacks through the shared SQLite context.
2. The repository normalizes missing stack data into singleton stacks for backward compatibility.
3. `taskStore` stores `tasks` and `stacks` together.
4. Stack selectors build `TaskStackView` objects for rendering.
5. Mutations persist `{ tasks, stacks }` through the existing serialized save queue.

Rendering rules:

- `mainTask` is always the task with the smallest `stackOrder` inside a stack.
- Collapsed singleton rendering behaves like a normal task capsule.
- Collapsed multi-task rendering keeps the main task as the visible top card. Stack depth is shown iOS-notification style: each backplate is a full-size card silhouette (narrowed with `scaleX`, nudged down) so only its bottom edge peeks below the top card. Hover slightly fans the plates out without shifting layout.
- There is no visible expand/collapse button. Collapsed multi-task stacks expand via double-click on the stack card or Enter/Space; expanded stacks collapse via double-click on the main card or Enter/Space. Nested controls such as checkboxes remain independent.
- Single-click on a collapsed stack's main card selects the main task like any other card.
- The collapsed stack main card uses a frosted-glass surface (near-opaque background plus `backdrop-filter` blur) so the backplates read as blurred depth instead of raw shapes showing through, and child cards unfold from the plate state (narrow, tucked under the top card) for expansion continuity.
- Expanded stack rendering keeps the main task at the top and unfolds child tasks below it, ordered by `stackOrder`. Child cards stay slightly narrower than the main card (centered), echoing the collapsed plate silhouettes they unfold from.
- Selecting any task in a stack — main or child — sets `selectedTaskId` and opens DetailPanel with full editing. The former `highlightedTaskId` highlight-only state was removed.
- A selected child task stays selected (and visible in DetailPanel) even if its stack is collapsed afterwards; selection only falls back when the task leaves the visible view entirely.

Current limits:

- No drag reorder, merge, split, or nested stack support.
- No new DnD dependency.
- Desktop Pin Mode remains lightweight and does not expose stack editing controls.

## Task Stack Drag Mutation Boundary

Phase 9D keeps SQLite schema version `5` and adds stack mutation behavior in the application layer.

DnD strategy:

- Uses native Pointer Events in `TaskList`; no DnD library is installed.
- Drag/drop is limited to the current visible view.
- `Today` drag/drop never changes `plannedDate` and does not support cross-view transfer.
- `All Tasks` remains the main stack-management view.
- All drag geometry (insertion index, merge target, push-apart offsets) is computed against a rect snapshot captured once at drag activation, with scroll-delta compensation. Live `getBoundingClientRect`/`elementFromPoint` are not used during the drag, so sibling transforms never feed back into hit testing.
- The dragged frame follows the pointer through an inline transform; siblings are pushed apart with `translate3d` transforms plus the shared 220ms transition. Layout never changes during a drag, and the old drop-indicator lines were removed in favor of the moving gap.
- While dragging a task over another stack, the middle band of the target card resolves to merge and the top/bottom edge bands (28% each) resolve to insertion, replacing the old element-under-pointer merge rule.

Store mutation API:

- `reorderStacks(sourceStackId, targetIndex, visibleStackIds)` reorders visible stacks and normalizes `task_stacks.sort_order`.
- `reorderTaskWithinStack(stackId, taskId, targetIndex)` reorders tasks inside one stack and normalizes `tasks.stack_order`.
- `moveTaskToStack(taskId, targetStackId, targetIndex?)` moves a task into another stack and removes an empty source singleton stack.
- `splitTaskToNewStack(taskId, targetGlobalIndex, visibleStackIds)` creates a new singleton stack for a task moved out of a multi-task stack.

Persistence and rollback:

- Stack mutations optimistically update Zustand state.
- Each stack mutation passes a rollback snapshot into the existing serialized save queue.
- If the latest stack save fails, tasks and stacks are restored from that rollback snapshot and `error` is set.
- Attachments, screenshots, and task app bindings are not moved or deleted by stack mutations because they remain attached to concrete task ids.

Main-task rule:

- `mainTask` continues to be the lowest `stackOrder` task.
- Reordering a child to index `0` promotes it to main.
- Non-main tasks open full DetailPanel editing like main tasks.

Presentation boundary:

- Phase 9E adds Apple-style layered visual presentation for collapsed multi-task stacks.
- The Phase 9E repair removes the old wrapper-style expanded container; stack presentation is now main-card-first in both collapsed and expanded states.
- The second Phase 9E repair removes all visible expand/collapse controls: double-click toggles expand/collapse on the main card, single-click selects the main task, and the backplates hug the card with a slight hover fan-out.
- The presentation is CSS/interaction only; it does not change `task_stacks`, `tasks.stack_id`, `tasks.stack_order`, or persistence behavior.
- Double-click, keyboard expand/collapse, and drag gestures share the same `TaskList` interaction boundary. The drag threshold suppresses accidental click toggles after drag.

Current limits:

- No nested stacks.
- No keyboard DnD.
- No cross-view drag between Today and All.
