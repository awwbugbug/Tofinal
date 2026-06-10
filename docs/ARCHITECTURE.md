# ToFinal Architecture

## Current Stack

- Desktop shell: Tauri v2 with custom window chrome.
- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn-style local UI primitives.
- State: Zustand.
- Icons: lucide-react.
- Persistence: localStorage through a repository boundary.
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
- `src/repositories`: persistence-facing repository interface boundary.
- `src/storage`: localStorage snapshot load/save and migration logic.
- `src/stores`: Zustand task store and store tests.
- `src/styles`: global CSS tokens and utility classes.
- `src/test`: test setup.
- `src/types`: shared TypeScript domain types.
- `src-tauri`: Tauri app config, permissions, Rust entrypoints, and bundle assets.

## Core File Responsibilities

- `src/stores/taskStore.ts`: owns in-memory task state, selected task, app mode, filter/search state, task mutations, filtering, and persistence calls.
- `src/storage/taskStorage.ts`: reads/writes task snapshots to localStorage key `tofinal.tasks.v1`, seeds first-run data, validates stored tasks, and migrates missing `pinned` to `false`.
- `src/repositories/taskRepository.ts`: defines `TaskRepository` and exports the current localStorage-backed implementation.
- `src/types/task.ts`: defines `Task`, `TaskPriority`, `AppMode`, and `TaskFilter`.
- `src/lib/windowMode.ts`: applies Normal/Pin Tauri window profiles with try/catch fallback.
- `src/lib/windowControls.ts`: wraps Tauri current-window controls for dragging, minimize, maximize/restore, and close.
- `src/components/layout/*`: composes app-level surfaces, window modes, navigation, title bar, details, and resizable Normal Mode columns.
- `src/components/task/*`: implements task creation, list rendering, completion, selection, and detail editing.
- `src-tauri/tauri.conf.json`: product metadata, dev/build commands, main window dimensions, custom titlebar decorations setting, and bundle icons.
- `src-tauri/capabilities/default.json`: grants the main window only the current core/window permissions plus opener default.

## Data Flow

1. User interacts with UI components such as `QuickInput`, `TaskItem`, `TaskDetail`, Sidebar, or mode buttons.
2. `AppShell` passes the relevant Zustand actions into layout/task components.
3. `taskStore` updates task state in memory and recomputes `selectedTaskId` when filtering, searching, updating, completing, or deleting can change visible tasks.
4. Task mutations call `localTaskRepository.saveSnapshot({ tasks })`.
5. `localTaskRepository` delegates to `saveTaskSnapshot`.
6. `taskStorage` serializes `{ version: 1, savedAt, tasks }` into localStorage key `tofinal.tasks.v1`.
7. On startup, `taskStore` calls `localTaskRepository.loadSnapshot()`, which delegates to `loadTaskSnapshot()`.
8. If no valid snapshot exists, seed tasks are used.

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

- Current persistence is intentionally localStorage-only.
- `TASK_STORAGE_KEY` is `tofinal.tasks.v1`.
- Stored JSON includes `version`, `savedAt`, and `tasks`.
- Invalid JSON, invalid snapshot shape, invalid task shape, or unavailable localStorage falls back to seed tasks.
- Legacy tasks missing `pinned` are normalized to `pinned: false`.
- Only task data is persisted. Window mode, column widths, active filter, search query, and selection are session UI state.

## State Management

Store state:
- `tasks`
- `selectedTaskId`
- `mode`
- `activeFilter`
- `searchQuery`

Store actions:
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

The store currently mixes task data with lightweight UI state. This is acceptable for v0.2 because the app has one local user and simple mode/filter state. Larger features should split persistent task data from ephemeral UI preferences before adding more global UI state.

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

These permissions are narrow for the current feature set. No filesystem, shell, clipboard, global shortcut, tray, screenshot, notification, or SQL permissions are currently granted.

## SQLite Replacement Recommendation

Phase 3 should replace the `localTaskRepository` implementation rather than changing UI components. Recommended shape:

- Keep `TaskRepository` as the frontend-facing boundary.
- Add an async repository path before SQLite if Tauri commands are used.
- Move persistence effects out of direct synchronous store calls if SQLite access becomes async.
- Add a migration/version layer for `Task` schema before writing SQLite data.
- Keep localStorage import/export fallback only if explicitly needed for migration.
