# ToFinal Phase 4 Attachments Design

Date: 2026-06-11

## 1. Current Baseline State

- Current stable baselines:
  - `v0.2-local-task-baseline`
  - `v0.3-sqlite-task-baseline`
- Task data is persisted by SQLite through the Tauri SQL Plugin.
- Current database path is `sqlite:tofinal.db`.
- Current SQLite schema has `schema_meta` and `tasks`.
- Current SQLite schema version is `1`.
- localStorage key `tofinal.tasks.v1` is retained only as a v0.2 migration / rollback source.
- Current app has no image attachments, screenshot capture, voice input, AI, account, cloud sync, tray, or global shortcut features.
- Current UI has Normal Window Mode and Desktop Pin Mode.

Phase 4 must preserve the v0.3 task behavior while adding a file and metadata foundation for task-bound image attachments.

## 2. Phase 4 Scope

Phase 4 should only design and later implement:

- Image attachment data model.
- Local file storage strategy.
- SQLite attachment metadata.
- Task-to-attachment relationship.
- File import, copy, delete, and cleanup strategy.
- Minimal Tauri permission changes required for local image import/storage.
- Tests for attachment metadata, file operations, migration, and task regression.
- Acceptance criteria for local-only image attachments.

Phase 4 must not implement:

- Screenshot capture.
- Voice input.
- OCR.
- AI recognition.
- Cloud sync.
- Image editing.
- Deep image compression optimization.
- System tray.
- Global shortcuts.
- Major UI redesign.

Screenshot support belongs to Phase 5, but it should reuse the Phase 4 attachment storage and metadata system.

## 3. User Scenarios

### Add One Local Image To A Task

1. User opens a task in DetailPanel.
2. User clicks Add Image.
3. App opens a file picker limited to supported image types.
4. App validates file type and size.
5. App copies the file into ToFinal app data storage.
6. App writes a `task_attachments` row bound to the task.
7. Attachment appears in the selected task detail.
8. Restarting the app still shows the attachment.

### Add Multiple Images To A Task

1. User selects multiple image files or adds files one at a time.
2. Each valid image is copied into app data with a unique stored filename.
3. Each image gets a `task_attachments` row with increasing `sort_order`.
4. Invalid files are rejected without blocking valid files.

### Delete One Attachment

1. User clicks Delete on an attachment.
2. App removes metadata and schedules/removes the stored file.
3. Restarting the app does not show the deleted attachment.

### Delete A Task With Attachments

Recommended behavior:

1. Delete task metadata inside SQLite.
2. `task_attachments` rows are deleted by `ON DELETE CASCADE`.
3. Associated files are removed by an application cleanup step because SQLite cannot delete filesystem files.
4. If file cleanup fails, record the issue for later orphan cleanup instead of resurrecting the task.

### Original Image Path Changes

Imported attachments must remain usable if the original image is moved or deleted. ToFinal must not rely on the original source path as the only copy.

### Future Screenshot Reuse

Phase 5 screenshot capture should:

1. Generate an image file.
2. Write it into the same attachments storage root.
3. Insert a `task_attachments` row with `kind = 'screenshot'`.
4. Reuse the same preview, delete, cleanup, and migration paths.

## 4. File Storage Strategy

### Recommendation

Use controlled app data storage and copy imported files into ToFinal-owned directories.

Do:

- Copy imported images into the ToFinal app data directory.
- Store only relative paths or controlled app-data paths in SQLite.
- Keep image binary data out of SQLite.
- Keep image files out of the project directory.
- Keep image files out of Git.

Do not:

- Treat the original user-selected path as the durable attachment source.
- Store image blobs in SQLite.
- Copy user images into `src`, `docs`, `dist`, `src-tauri`, or the repository root.

### Recommended Directory Structure

Preferred logical structure:

```text
app_data/
  tofinal.db
  attachments/
    images/
      <taskId>/
        <attachmentId>.<ext>
    thumbnails/
      <taskId>/
        <attachmentId>.webp
```

Phase 4 should implement only the `attachments/images/<taskId>/...` path unless thumbnail generation is explicitly added. The `thumbnails` path is reserved.

### File Naming

Recommended stored filename:

```text
<attachmentId>.<normalized-ext>
```

Reasons:

- Avoids collisions.
- Avoids leaking original filenames into filesystem paths.
- Keeps the path stable if the user renames the original file.
- Makes cleanup by `attachmentId` straightforward.

The original filename should be preserved in SQLite as `original_name` for display.

### Extensions And MIME Types

Recommended Phase 4 supported formats:

- `.png` / `image/png`
- `.jpg` / `image/jpeg`
- `.jpeg` / `image/jpeg`
- `.webp` / `image/webp`

Optional later formats:

- `.gif` if animated preview behavior is explicitly designed.
- `.heic` only if platform support and preview behavior are verified.

Validation should use both extension and MIME/type detection when available. Extension-only validation is not enough for a durable local app.

### File Size Limit

Recommended Phase 4 limit:

- Default max image size: 10 MB per file.
- Hard upper bound can be made configurable later.

Reasoning:

- Keeps local app responsive.
- Avoids accidental storage bloat.
- Large-file handling, compression, and backup policy are not Phase 4 goals.

### Thumbnails

Recommendation:

- Do not implement thumbnail generation in the first Phase 4 pass unless preview performance requires it.
- Store `width` and `height` when cheap to read.
- If thumbnails are added later, store them as derived files under `attachments/thumbnails/<taskId>/`.
- Do not store thumbnails in SQLite.

For initial implementation, UI can render the stored image with constrained dimensions and lazy loading. If large images cause performance issues, add thumbnail generation as a focused follow-up.

## 5. SQLite Schema Design

Phase 4 should migrate SQLite schema from version `1` to version `2`.

Current Phase 3 code defines `schema_meta` as:

```sql
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Because `updated_at` is present in the current implementation, Phase 4 migration examples may update that column. Before implementation, still verify the actual user database with `PRAGMA table_info(schema_meta)` because early design drafts used a simpler key/value-only example.

Recommended table:

```sql
CREATE TABLE IF NOT EXISTS task_attachments (
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
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id_sort
  ON task_attachments(task_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_task_attachments_created_at
  ON task_attachments(created_at);
```

### Foreign Keys

Use:

```sql
FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
```

Important SQLite requirement:

```sql
PRAGMA foreign_keys = ON;
```

The repository must enable foreign keys after opening the database connection. Without this pragma, `ON DELETE CASCADE` may not execute.

### `kind`

Use `kind` as a narrow type:

- `image`: user-imported image attachment.
- `screenshot`: future Phase 5 screenshot-generated image.

This avoids a separate screenshot metadata system and makes UI preview code reusable.

### Metadata Notes

- `original_name` is for display.
- `stored_name` is the actual app-owned filename.
- `relative_path` should be relative to ToFinal app data root or attachments root.
- `mime_type` helps preview and validation.
- `size_bytes` supports display, limits, and cleanup audits.
- `width` and `height` are nullable because metadata extraction can fail without invalidating the attachment.
- `sort_order` gives stable per-task display order.

## 6. Task Schema Change Decision

Two options:

### Option A: Put Attachments Inside `Task`

```ts
type Task = {
  // existing fields
  attachments: Attachment[];
};
```

Pros:

- Simple for DetailPanel rendering.
- One load path can return all task data.

Cons:

- Bloats every task load, including TaskList and Desktop Pin Mode.
- Increases memory use when tasks have many images.
- Makes task CRUD persistence depend on attachment metadata.
- Encourages full-snapshot task saves to accidentally rewrite or drop attachments.
- Harder to extend for screenshots, file cleanup states, and orphan repair.

### Option B: Keep `Task` Core Fields, Query Attachments By `task_id`

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

type TaskAttachment = {
  id: string;
  taskId: string;
  kind: "image" | "screenshot";
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
};
```

Pros:

- Keeps TaskList and Desktop Pin Mode lightweight.
- Keeps task persistence independent from file metadata persistence.
- Reduces accidental coupling between task save and attachment save.
- Scales better for many images.
- Fits future screenshot reuse.
- Allows DetailPanel to load only selected task attachments.

Cons:

- Requires an attachment repository/store boundary.
- DetailPanel must handle attachment loading state.

### Recommendation

Use **Option B**.

Keep `Task` as the core task entity. Store attachments in `task_attachments` and query by `task_id`. This is better for current UI performance, Desktop Pin Mode simplicity, and Phase 5 screenshot extensibility.

## 7. Repository And State Design

### Recommended New Boundaries

Add three focused boundaries in Phase 4 implementation:

- `attachmentRepository`
  - Public attachment metadata API used by UI/state.
  - Methods such as `listByTaskId`, `addImageAttachment`, `deleteAttachment`.
- `fileStorage` adapter
  - Owns app data paths, file copy, file delete, existence checks, and relative path resolution.
- SQLite attachment metadata repository
  - Owns `task_attachments` SQL mapping and migration v2.

### Recommended Data Flow

```text
UI chooses image
  -> file picker
  -> validate source file
  -> copy file into app data attachments directory
  -> read file metadata where practical
  -> insert task_attachments row
  -> update attachment state
  -> DetailPanel reloads selected task attachments
```

### State Ownership

Recommendation:

- Keep `taskStore` focused on tasks.
- Add a small `attachmentStore` or DetailPanel-local hook for selected task attachments.
- Do not store every attachment for every task in `taskStore`.
- DetailPanel should load attachments for the current `selectedTask.id`.
- Desktop Pin Mode should not load image attachment data in Phase 4.

Possible attachment state:

```ts
type AttachmentState = {
  byTaskId: Record<string, TaskAttachment[]>;
  loadingTaskIds: Record<string, boolean>;
  error: string | null;
};
```

Hydration recommendation:

- Task hydration remains unchanged.
- Attachments are loaded on demand by task id.
- If DetailPanel selected task changes, cancel or ignore stale attachment load results using a request id.

## 8. Tauri Permission Design

Likely Phase 4 Tauri plugins / APIs:

- Dialog plugin for file picker.
- File system capability for reading selected source files.
- File system capability for writing/copying into app data attachments directory.
- Path API for resolving app data directory.

Permission principles:

- Open only the exact plugin permissions needed.
- Do not open shell.
- Do not open global shortcut.
- Do not open clipboard.
- Do not open notification.
- Do not grant broad filesystem access unless the selected file workflow requires it and the reason is documented.

Recommended permission posture:

- Dialog open file permission for user-selected image files.
- FS read permission for files selected through dialog.
- FS write/create/remove permissions scoped to app data attachment paths.
- Path permission for app data directory resolution.

Windows considerations:

- User-selected files may live under OneDrive, removable drives, protected folders, or paths with non-ASCII characters.
- Import should copy immediately after selection; do not rely on long-term read access to the original location.
- App data path resolution should use Tauri path APIs, not hardcoded Windows paths.
- File operations must handle locked files and antivirus delays gracefully.

## 9. File Delete And Cleanup Strategy

### Delete Single Attachment

Recommended order:

1. Mark or delete metadata inside a SQLite transaction.
2. Attempt to delete the app-owned stored file.
3. If file deletion fails, keep a diagnostic error and allow orphan cleanup later.

Rationale:

- Metadata drives UI. Once metadata is gone, deleted attachments do not reappear.
- Failed file deletion creates storage bloat, not user-visible stale UI.
- File deletion cannot be atomically coupled to SQLite, so cleanup must be resilient.

Alternative order, delete file first, has a worse failure mode: if file deletion succeeds but database deletion fails, UI shows a broken attachment.

### Delete Task With Attachments

Recommended flow:

1. Query attachments for task id.
2. Delete task in SQLite transaction.
3. Let `ON DELETE CASCADE` remove attachment metadata.
4. Delete stored files for the previously queried attachments.
5. If file deletion fails, record it for orphan cleanup.

### Failure Cases

Database delete succeeds, file delete fails:

- UI no longer shows attachment.
- File is orphaned.
- Record in logs/store error.
- Cleanup can remove it later.

File delete succeeds, database delete fails:

- Avoid this path by deleting metadata first.
- If it happens due to future implementation changes, mark attachment as missing/broken on next load.

### Orphan Files

Orphan file examples:

- File exists under attachments directory but no `task_attachments` row references it.
- Task deleted but file cleanup failed.
- App crashed after file copy but before metadata insert.

Recommended Phase 4 stance:

- Do not build a heavy cleanup UI.
- Implement or plan a repository-level cleanup function that can scan app-owned attachments directory and remove unreferenced files.
- If cleanup is not implemented in Phase 4, add it to `docs/TECH_DEBT.md`.

Startup scan:

- Optional in Phase 4.
- Prefer a manual or periodic maintenance function later to avoid startup latency.
- If implemented, keep it conservative and limited to ToFinal-owned attachments directories.

## 10. Error Handling

User selects a nonexistent file:

- Reject import with a clear error.
- Do not insert metadata.

File too large:

- Reject before copying.
- Include max size in error.

Non-image file:

- Reject before copying.
- Validate extension and MIME/type where possible.

File copy fails:

- Do not insert metadata.
- If a partial file exists, attempt to remove it.
- Show/save a controlled error.

App data directory is not writable:

- Do not insert metadata.
- Surface storage error.
- Keep task data intact.

Database write fails:

- If file copy already succeeded, remove the copied file or mark it for orphan cleanup.
- Do not show attachment as saved.

Metadata write succeeds but file copy fails:

- Avoid by copying first, then inserting metadata.
- If detected, delete the metadata row or mark attachment as missing.

File exists but database record is lost:

- Treat as orphan file.
- Cleanup can remove it later.

Database record exists but file is missing:

- UI should show a broken/missing attachment state.
- Do not crash preview.
- Allow user to delete the broken attachment metadata.

Image is damaged and cannot preview:

- Keep metadata.
- Show broken preview state.
- Allow delete.

## 11. Test Plan

Repository and metadata tests:

- Insert, load, and delete an attachment row.
- Query attachments by `task_id`.
- Preserve `kind`, `original_name`, `stored_name`, `relative_path`, `mime_type`, `size_bytes`, dimensions, timestamps, and `sort_order`.
- Verify `kind = 'image'` and `kind = 'screenshot'` are both allowed.
- Verify invalid `kind` is rejected.
- Verify `ON DELETE CASCADE` behavior with `PRAGMA foreign_keys=ON`.

File storage tests:

- Copy a valid image into app data attachment path.
- Generate unique stored filenames.
- Preserve original filename in metadata.
- Reject invalid file type.
- Reject oversized file.
- Handle missing source file.
- Handle copy failure and partial file cleanup.
- Resolve relative path to app-owned file path.

Cleanup tests:

- Delete attachment removes metadata and attempts file cleanup.
- Delete task removes attachment metadata.
- Orphan cleanup identifies files not referenced by SQLite.
- Orphan cleanup does not touch files outside ToFinal app data.

Migration tests:

- Migrate schema version `1` to `2`.
- Create `task_attachments` without modifying existing `tasks`.
- Preserve all v0.3 task rows.
- Roll back migration on failure.
- Handle empty database.

Regression tests:

- Existing task CRUD still works.
- Existing task filters/search/pinned behavior still works.
- Desktop Pin Mode still works and does not load full attachment data.
- SQLite task save/load remains stable.

## 12. Migration Design

Current schema version: `1`.

Phase 4 target schema version: `2`.

Current implementation note:

- `src/repositories/sqliteTaskRepository.ts` creates `schema_meta` with `key`, `value`, and `updated_at`.
- The migration SQL below intentionally uses `updated_at` because it matches the current Phase 3 implementation.
- If a real user database is found with only `key` and `value`, Phase 4 implementation must either add `updated_at` first or use a key/value-only metadata update path for that database. Do not assume the design document alone proves the on-disk schema.

Migration steps:

1. Open SQLite database.
2. Enable foreign keys:
   ```sql
   PRAGMA foreign_keys = ON;
   ```
3. Read `schema_meta.schema_version`.
4. If version is `1`, begin transaction.
5. Create `task_attachments`.
6. Create indexes.
7. Update `schema_meta.schema_version` to `2`.
8. Commit.

Migration SQL:

```sql
BEGIN IMMEDIATE TRANSACTION;

CREATE TABLE IF NOT EXISTS task_attachments (
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
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id_sort
  ON task_attachments(task_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_task_attachments_created_at
  ON task_attachments(created_at);

INSERT INTO schema_meta (key, value, updated_at)
VALUES ('schema_version', '2', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE
SET value = excluded.value,
    updated_at = excluded.updated_at;

COMMIT;
```

Compatibility fallback if `schema_meta` is key/value only:

```sql
INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '2')
ON CONFLICT(key) DO UPDATE
SET value = excluded.value;
```

Use this fallback only if `PRAGMA table_info(schema_meta)` confirms `updated_at` is absent. The preferred path remains the current Phase 3 schema with `updated_at`.

Failure handling:

- Roll back transaction on failure.
- Do not modify existing `tasks`.
- Do not create partial attachment metadata.
- Surface a migration error and prevent attachment operations.

Backup strategy:

- Phase 4 should at least document the DB path and recommend manual backup before migration.
- A formal in-app backup/export feature is not part of Phase 4 unless explicitly approved.

Empty database compatibility:

- If `tasks` exists but is empty, migration still creates `task_attachments`.
- If schema initialization creates both `tasks` and `task_attachments` for a fresh install, set `schema_version = 2`.

### Implementation Caution

- Before Phase 4 implementation, confirm the real `schema_meta` columns with `PRAGMA table_info(schema_meta)`.
- `PRAGMA foreign_keys = ON` must be executed after opening the database connection and before relying on `ON DELETE CASCADE`.
- Do not write imported images, generated thumbnails, `tofinal.db`, `*.db`, or `*.sqlite` files into the Git working tree.
- App-owned files must live under the Tauri app data directory, not under the project directory.

## 13. UI Implementation Boundary

Phase 4 UI should use minimal additions only:

- Add an Attachments section in `TaskDetail`.
- Add one Add Image button.
- Show image thumbnail/preview items.
- Add delete button per attachment.
- Show broken/missing attachment state.
- Show count or no attachments empty state.

Desktop Pin Mode:

- Recommended Phase 4 behavior: do not show attachment previews in Desktop Pin Mode.
- Optional low-cost behavior: show attachment count only.
- Do not load image files in Desktop Pin Mode.

Do not:

- Redesign the whole detail panel.
- Change Sidebar/TaskList layout.
- Change Normal/Pin mode behavior.
- Add screenshot UI in Phase 4.
- Add image editing UI.

## 14. Phase 4 Acceptance Criteria

Required automated verification:

- `npm test` passes.
- `npm run build` passes.
- `cargo check` passes.
- `npm run tauri dev` starts the desktop app.

Functional acceptance:

- Add image attachment to a task.
- Restart app; attachment remains visible.
- Move or delete the original source image; ToFinal attachment remains visible.
- Add multiple images to one task.
- Delete one attachment; restart app; deleted attachment does not return.
- Delete a task; attachment metadata does not remain.
- Existing v0.3 task data is not lost.
- Existing task add/edit/delete/complete/filter/search/pinned behavior still works.
- Desktop Pin Mode behavior is not broken.
- No image or database files are created inside the Git working tree.
- `git status --short` does not show attachment files or `tofinal.db`.

Manual filesystem acceptance:

- Imported image exists under ToFinal app data, not under the repository.
- SQLite stores relative/controlled path metadata, not source-only paths.
- localStorage key `tofinal.tasks.v1` remains untouched.

## 15. Relationship To Phase 5 Screenshot

Phase 5 screenshot should reuse Phase 4 attachments:

1. Screenshot capture creates an image file.
2. File is written to the same app data attachments storage root.
3. Metadata row is inserted into `task_attachments`.
4. `kind = 'screenshot'`.
5. UI preview/delete logic is reused.
6. Cleanup/orphan handling is reused.

Do not build a separate screenshot-only file system or screenshot-only metadata table unless a later requirement proves the shared attachment model insufficient.

## 16. Recommended Phase 4 Implementation Order

1. Add schema migration v1 -> v2 tests.
2. Implement SQLite migration for `task_attachments`.
3. Add `TaskAttachment` type.
4. Add attachment metadata repository tests.
5. Implement attachment metadata repository.
6. Add file storage adapter tests with fake app data root.
7. Implement file storage adapter.
8. Add Tauri dialog/fs/path permissions and adapters.
9. Add minimal DetailPanel attachment section.
10. Add error states and cleanup behavior.
11. Run full regression suite and manual filesystem acceptance.

This order keeps task persistence stable and prevents UI work from hiding storage failures.
