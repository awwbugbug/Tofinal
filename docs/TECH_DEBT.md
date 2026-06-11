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
- Attachment metadata now exists in SQLite, but actual image import, file copying, preview, cleanup, and backup policy are still not implemented.

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

## Must Fix Before Next Persistence Expansion

- Add a user-facing backup/export and restore strategy.
- Decide whether to keep full-snapshot writes or introduce row-level repository methods.
- Add schema migration tests before any future Task or attachment schema change.
- Define database recovery UX for corrupted SQLite rows or failed migrations.

## Must Fix Before Screenshot Or Image Upload

- Implement local file storage root and path strategy.
- Add file size/type validation.
- Add cleanup rules for deleted tasks and orphaned files.
- Add Tauri permissions/plugins only for the exact file APIs required.
- Avoid storing binary data in localStorage.
- Ensure file import never writes images, `tofinal.db`, `*.db`, or `*.sqlite` into the Git working tree.

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
- File attachment UI before file storage policy and cleanup behavior are implemented.
- Screenshot/voice features before the local data model is stable.

## Suggested Priority

1. Freeze v0.2 baseline and keep the current feature set stable.
2. Implement Phase 3 SQLite with migration and repository hardening.
3. Add import/export or backup after SQLite is stable.
4. Add local file attachment support with a clear storage policy.
5. Add screenshot capture only after attachments are modeled.
6. Add voice input only after task creation/editing paths are stable.
7. Add tray/global shortcuts after window lifecycle is explicitly designed.
8. Package and sign the app for regular personal use.
