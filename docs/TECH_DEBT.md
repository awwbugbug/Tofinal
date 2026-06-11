# ToFinal Technical Debt

## Known Issues

- SQLite persistence is now implemented through an async repository boundary, but the store still writes full task snapshots after each mutation instead of row-level changes.
- localStorage remains in the codebase for v0.2 migration and rollback; it should not regain responsibility for normal runtime persistence.
- `Today` is still a default task collection, not a real date-based view.
- Task ordering is simple insertion order, with Desktop Pin Mode only sorting pinned open tasks first.
- Normal Mode column widths are session-only and are not persisted.
- Visual styles are mostly tokenized, but a few component-level `color-mix(...)`, shadow, and status-color classes remain inline for local visual states.
- App version in `package.json` and `tauri.conf.json` is still `0.1.0`; product baseline can be named v0.2 in docs/tagging even if package version has not yet been bumped.
- There is no formal SQLite backup/export/recovery flow yet.

## Current Risks

- SQLite improves durability over localStorage, but the app still lacks backup/export and database corruption recovery UI.
- Full-snapshot writes are simple and safe for the current task count, but row-level writes may be needed if task volume grows substantially.
- More UI preferences in Zustand could blur business state and ephemeral state if not separated.
- Advanced desktop features will expand Tauri permissions and increase platform-specific failure modes.
- Image attachment import, copying, thumbnail preview, Lightbox preview, and delete UI now exist, but full orphan-file scanning/repair and backup policy are still not implemented.

## Resolved By Phase 3 SQLite

- Repository APIs are async: `loadSnapshot(): Promise<TaskSnapshot>` and `saveSnapshot(snapshot): Promise<void>`.
- Store hydration state exists: `hydrated`, `loading`, and `error`.
- SQLite schema versioning begins with `schema_meta.schema_version = 1`.
- v0.2 localStorage migration is implemented and preserves the original localStorage key.
- Repository failure and startup hydration behavior are covered by tests.

## Resolved By Phase 4A Attachment Metadata

- SQLite schema version advanced to `2`.
- `task_attachments` metadata table exists.
- `TaskAttachment` type exists separately from core `Task`.
- Attachment metadata repository exists for list/insert/delete operations.
- `PRAGMA foreign_keys = ON` is enabled during SQLite schema initialization.
- `ON DELETE CASCADE` is covered for attachment metadata when a task is deleted.
- `schema_meta` writes support both current `updated_at` and key/value-only fallback.

## Resolved By Phase 4B Local Image Attachments

- Native file picker is available for image import.
- Supported image formats are validated: PNG, JPG/JPEG, and WebP.
- Per-file size validation rejects images larger than 10 MB.
- Imported images are copied into Tauri AppData under `attachments/images/<taskId>/`.
- SQLite stores attachment metadata only; image binaries are not stored in SQLite.
- TaskDetail has a minimal Attachments section with Add Image, preview, original file name, size, missing-file state, and delete control.
- Deleting an attachment deletes metadata first and then attempts app-owned file cleanup.
- Deleting a task triggers attachment metadata cleanup and app-owned file cleanup.
- UI and stores do not persist original source image paths as the attachment source of truth.

## Resolved By Phase 4C Image Lightbox

- TaskDetail image thumbnails can open a centered Lightbox preview.
- Lightbox closes via close button, backdrop click, and Escape.
- Preview uses the app-owned copied image URL already loaded by the attachment store.
- Lightbox is local UI state and does not alter tasks, SQLite metadata, or file storage.
- Broken preview state is handled without crashing the detail panel.

## Must Fix Before Next Persistence Expansion

- Add a user-facing backup/export and restore strategy.
- Decide whether to keep full-snapshot writes or introduce row-level repository methods.
- Add schema migration tests before any future Task or attachment schema change.
- Define database recovery UX for corrupted SQLite rows or failed migrations.

## Must Fix Before Screenshot Or Advanced Image Work

- Add an orphan-file scanner/repair path for copied files that lose metadata due to partial failures.
- Add backup/export and restore semantics for copied attachment files together with SQLite metadata.
- Decide whether to add thumbnail generation for large image lists.
- Add image dimension extraction if UI needs width/height-aware layouts.
- Add optional Lightbox enhancements only if needed: previous/next navigation, zoom/pan, and rotation.
- Ensure screenshot-generated files reuse the attachment file storage adapter instead of creating a parallel screenshot file system.
- Continue ensuring file import never writes images, `tofinal.db`, `*.db`, or `*.sqlite` into the Git working tree.

## Must Fix Before System Tray Or Global Shortcuts

- Separate app-window state from task data state.
- Define lifecycle behavior for hidden/minimized windows.
- Add conflict handling for global shortcut registration failure.
- Add platform-specific tests or manual QA checklist for Windows behavior.
- Add Tauri permissions/plugins only when the feature is implemented.

## Temporarily Not Recommended

- Cloud sync, accounts, and login.
- AI features.
- Calendar/reminder semantics.
- WorkerW/Progman desktop embedding.
- Large UI template libraries or Redux.
- Screenshot/voice features before attachment backup and cleanup policy is stable.

## Suggested Priority

1. Freeze v0.2 baseline and keep the current feature set stable.
2. Implement Phase 3 SQLite with migration and repository hardening.
3. Add import/export or backup after SQLite is stable.
4. Add attachment backup/export and orphan cleanup.
5. Add screenshot capture only by reusing the attachment system.
6. Add voice input only after task creation/editing paths are stable.
7. Add tray/global shortcuts after window lifecycle is explicitly designed.
8. Package and sign the app for regular personal use.
