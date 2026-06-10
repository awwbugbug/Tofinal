# Phase 3 SQLite Design

## 1. Current Persistence State

ToFinal v0.2 stores task data in localStorage through a small repository boundary.

- localStorage key: `tofinal.tasks.v1`
- Storage file: `src/storage/taskStorage.ts`
- Repository file: `src/repositories/taskRepository.ts`
- Store file: `src/stores/taskStore.ts`
- Type file: `src/types/task.ts`

Current `Task` schema:

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

Current snapshot shape:

```ts
type TaskSnapshot = {
  tasks: Task[];
};
```

Current saved localStorage payload:

```ts
{
  version: 1,
  savedAt: string,
  tasks: Task[]
}
```

Current behavior:

- `taskStore` synchronously calls `localTaskRepository.loadSnapshot()` during initial state creation.
- Every mutating action writes synchronously through `localTaskRepository.saveSnapshot({ tasks })`.
- First launch with no localStorage data uses seed tasks from `createSeedTasks()`.
- Invalid JSON, invalid snapshot shape, invalid task shape, or unavailable localStorage falls back to seed tasks.
- Legacy tasks without `pinned` are migrated in memory to `pinned: false`.
- Writes are best-effort: localStorage write failures are swallowed so the UI can continue working.

## 2. SQLite Technical Options

### Option A: Tauri SQL Plugin

Use the Tauri SQL plugin from the frontend repository layer, with SQLite as the database backend.

Pros:

- Lower implementation complexity than writing Rust command plumbing manually.
- Fits the current React/Zustand/repository shape well: `TaskRepository` can call a plugin-backed adapter.
- Keeps most persistence code in TypeScript, close to current tests and store behavior.
- Tauri permission impact is explicit and plugin-scoped.
- Good enough for Phase 3 task CRUD and simple migrations.
- Later tables for attachment metadata and screenshot metadata can be added without changing the UI layer.

Cons:

- SQL result typing is still mostly application-managed; TypeScript must validate rows into `Task`.
- Repository tests need plugin mocking or a separated adapter interface.
- More complex database operations may eventually feel less ergonomic than Rust-owned persistence.

### Option B: Rust Commands With rusqlite Or sqlx

Implement SQLite persistence in Rust and expose command APIs to the frontend.

Pros:

- Stronger control over database path, migrations, transactions, and error mapping.
- Better long-term fit if the app grows heavy local processing, attachment indexing, screenshot metadata, or background maintenance.
- Rust-side tests can exercise the real database layer directly.
- Type safety can be stronger around row mapping and domain conversion, especially with well-structured Rust types.

Cons:

- Higher implementation complexity.
- Requires designing and maintaining a Tauri command API.
- The current TypeScript repository must become an async IPC client.
- More moving parts for Phase 3, including Rust error types, serde payloads, and command permissions.
- Higher maintenance cost before the app actually needs Rust-side persistence complexity.

### Comparison

| Dimension | Tauri SQL Plugin | Rust Commands + rusqlite/sqlx |
| --- | --- | --- |
| Implementation complexity | Lower | Higher |
| Fit with current React/Zustand/repository | Better for Phase 3 | Good but requires more restructuring |
| Type safety | TypeScript validation required | Stronger Rust-side mapping possible |
| Test difficulty | Moderate; mock adapter or use test DB if supported | Moderate to high; add Rust and frontend tests |
| Tauri permission impact | Plugin-scoped SQL permission | Custom command permissions |
| Attachments/screenshot metadata later | Adequate with new tables | Stronger for advanced processing |
| Maintenance cost | Lower now | Higher now, potentially lower later for complex features |

### Recommendation

Use **Option A: Tauri SQL Plugin** for Phase 3.

Reasoning:

- Phase 3 is strictly a persistence replacement, not a backend rewrite.
- The current app already has a TypeScript repository boundary and a React/Zustand data flow.
- The Tauri SQL plugin is the smallest path to durable SQLite while keeping UI behavior unchanged.
- Rust commands can be reconsidered later if attachments, screenshot processing, indexing, or background maintenance become complex enough to justify a Rust-owned data layer.

## 3. SQLite Schema Draft

Recommended initial schema:

```sql
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'important', 'urgent')),
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
  tags TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_pinned ON tasks(pinned);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
```

Recommended `tags` representation: **JSON TEXT in `tasks.tags`**.

Reasons:

- Current tags are a simple string array with no tag-specific metadata.
- The UI only displays and edits all tags for a task at once.
- Search currently only covers title and note, not tag queries.
- JSON TEXT keeps Phase 3 focused on persistence replacement and avoids extra join logic.
- A later phase can normalize tags into `task_tags` if tag search, tag management, tag colors, or tag analytics become real requirements.

Row mapping:

```ts
Task.completed = row.completed === 1;
Task.pinned = row.pinned === 1;
Task.tags = JSON.parse(row.tags);
Task.createdAt = row.created_at;
Task.updatedAt = row.updated_at;
Task.completedAt = row.completed_at;
```

Validation rules:

- Reject or quarantine rows with invalid `priority`.
- Treat invalid `tags` JSON as an empty array only if the rest of the row is valid and the error is recoverable.
- Preserve ISO timestamp strings as text in Phase 3; do not introduce date math.

## 4. Migration Strategy

Startup sequence:

1. Initialize/open SQLite database.
2. Ensure `schema_meta` and `tasks` tables exist.
3. Read `schema_meta.schema_version`.
4. Apply schema migrations until current version is reached.
5. Count rows in `tasks`.
6. If `tasks` has rows, load SQLite data and do not migrate localStorage.
7. If `tasks` is empty, read localStorage snapshot from `tofinal.tasks.v1`.
8. If localStorage snapshot is valid, insert those tasks into SQLite inside one transaction.
9. If localStorage is missing or invalid, insert seed tasks into SQLite inside one transaction.
10. Set a migration marker in `schema_meta`.

Recommended markers:

```text
schema_version = 1
localstorage_v1_migrated = true
seed_initialized = true
```

Handling localStorage after successful migration:

- Keep localStorage data in place for Phase 3.
- Add a marker such as `localstorage_v1_migrated = true` in SQLite to avoid repeated migration.
- Do not delete localStorage automatically in Phase 3; preserving it provides a rollback path to `v0.2-local-task-baseline`.
- A later cleanup phase can remove or archive localStorage after SQLite has proven stable.

Migration failure policy:

- If SQLite opens but localStorage migration fails, log/report a persistence error and fall back to seed initialization only if no partial rows were committed.
- Use transactions so migration is all-or-nothing.
- If SQLite cannot open at all, the app should show a persistence error state and may offer a read-only seed fallback for UI continuity, but must not silently pretend durable persistence is working.
- If old localStorage format is invalid, ignore it and seed the empty database, while exposing a warning/error state for diagnostics.

Avoiding repeated migration:

- SQLite existing rows always win over localStorage.
- `schema_meta.localstorage_v1_migrated = true` prevents reimport when the user has already migrated.
- Migration should be idempotent by using primary keys and a transaction, but the normal path should not re-run once rows exist.

## 5. Repository Interface Changes

Current repository is synchronous:

```ts
type TaskRepository = {
  loadSnapshot: () => TaskSnapshot;
  saveSnapshot: (snapshot: TaskSnapshot) => void;
};
```

Phase 3 repository should become async:

```ts
type TaskRepository = {
  loadSnapshot: () => Promise<TaskSnapshot>;
  saveSnapshot: (snapshot: TaskSnapshot) => Promise<void>;
};
```

Recommended files:

- Keep `src/repositories/taskRepository.ts` as the public interface location.
- Add a SQLite-backed implementation, for example `sqliteTaskRepository`.
- Keep localStorage storage utilities available for migration only.
- UI components must not import SQLite, localStorage, or Tauri SQL plugin APIs.

Zustand store changes:

- Add hydration state:
  - `hydrated: boolean`
  - `loading: boolean`
  - `error: string | null`
- Initial store state should start with empty or seed-safe memory state plus `loading: true`.
- Add async action:
  - `hydrateTasks: () => Promise<void>`
- `AppShell` or an app bootstrap component should call `hydrateTasks()` once on startup.
- Mutating actions should keep the UI responsive but handle `saveSnapshot` failures.
- Persist failures should set `error` and keep in-memory task changes visible unless a stricter rollback policy is chosen.

Save strategy:

- Phase 3 can keep immediate save after each mutation.
- Debounce is not required for the current low-write workload.
- If later features add rapid edits or autosave, introduce a debounced save queue with a visible unsaved/error state.

UI isolation:

- Components continue to call store actions only.
- Store calls repository only.
- Repository hides SQLite/plugin details.

## 6. Error Handling

SQLite cannot open:

- Set store `error` to a clear persistence startup message.
- Keep UI from crashing.
- Do not silently report data as durably saved.
- Consider seed read-only fallback only if the UI clearly indicates persistence is unavailable.

Migration fails:

- Use a transaction and roll back partial migration.
- Preserve localStorage data.
- Set `error`.
- Do not set `localstorage_v1_migrated`.

Write fails:

- Keep in-memory state visible.
- Set `error` with enough detail for diagnosis.
- Do not retry in a tight loop.
- Add tests that failed writes do not crash the app.

Data corruption:

- Validate rows when converting to `Task`.
- If one row is invalid, prefer quarantine/skip plus error over crashing the entire app.
- If the database schema is invalid or unreadable, surface startup error.

Invalid localStorage:

- Treat as no valid migration source.
- Seed empty SQLite database if SQLite has no rows.
- Preserve invalid localStorage for manual recovery unless a later cleanup tool exists.

Permissions or path problems:

- Surface a startup persistence error.
- Document the database path used by the chosen plugin.
- Do not request broad filesystem permissions for Phase 3 unless the plugin requires them.

Initial empty database:

- Create schema.
- Seed with current seed tasks.
- Set `seed_initialized = true`.

## 7. Test Plan

Repository tests:

- Opens/initializes an empty SQLite database.
- Creates expected schema.
- Saves and loads a task snapshot.
- Maps boolean fields between INTEGER and boolean.
- Maps `tags` JSON TEXT to `string[]`.
- Preserves nullable `completed_at`.
- Rejects or handles invalid priority rows.

Migration tests:

- Migrates valid localStorage `tofinal.tasks.v1` data into SQLite.
- Migrates legacy localStorage tasks without `pinned` to `pinned = 0`.
- Falls back to seed tasks when localStorage is invalid.
- Does not rerun migration when SQLite already has tasks.
- Does not mark migration complete when transaction fails.

Store tests:

- Hydrates tasks from repository.
- Shows `loading` before hydration completes.
- Sets `error` on load failure.
- Keeps filters/search/pinned behavior after hydration.
- Persists add/edit/delete/complete changes.
- Handles failed write without crashing.

App tests:

- Displays a loading state while hydrating.
- Existing UI interactions remain unchanged after hydration.
- Desktop Pin Mode still shares state with Normal Mode.
- Current filters/search/pinned work after SQLite-backed hydration.

Manual verification:

- Add task, restart app, task remains.
- Edit task, restart app, edit remains.
- Delete task, restart app, deleted task stays deleted.
- Complete task, restart app, completed state remains.
- Existing v0.2 localStorage data migrates or follows the documented fallback policy.

## 8. Phase 3 Strict Non-Goals

Phase 3 is only SQLite replacing localStorage.

Do not implement:

- Screenshot capture.
- Voice input.
- Image upload.
- File attachments.
- AI.
- Accounts or login.
- Cloud sync.
- Calendar/reminder logic.
- System tray.
- Global shortcuts.
- WorkerW/Progman desktop embedding.
- Major UI redesign.
- New task features unrelated to persistence.

## 9. Phase 3 Acceptance Criteria

- `npm test` passes.
- `npm run build` passes.
- `cargo check` passes.
- `npm run tauri dev` starts the desktop app.
- New task persists after app restart.
- Edited task persists after app restart.
- Deleted task remains deleted after app restart.
- Completed/reopened state persists after app restart.
- Priority, tags, pinned, filters, and search behavior remain unchanged.
- Existing localStorage v0.2 data migrates to SQLite or follows the explicit fallback policy.
- Invalid localStorage data does not crash the app.
- SQLite startup/write failures surface controlled error state.
- UI components do not import SQLite/plugin APIs directly.
- Git can revert to `v0.2-local-task-baseline` if Phase 3 fails.
