# ToFinal Technical Debt

## Known Issues

- SQLite persistence is now implemented through an async repository boundary, but the store still writes full task snapshots after each mutation instead of row-level changes.
- localStorage remains in the codebase for v0.2 task migration and rollback; it should not regain responsibility for normal task data persistence.
- `Today` is still a default task collection, not a real date-based view.
- Task ordering is simple insertion order, with Desktop Pin Mode only sorting pinned open tasks first.
- Normal Mode column widths are session-only and are not persisted.
- Visual styles are mostly tokenized, but a few component-level `color-mix(...)`, shadow, and status-color classes remain inline for local visual states.
- App version in `package.json` and `tauri.conf.json` is still `0.1.0`; product baseline can be named v0.2 in docs/tagging even if package version has not yet been bumped.
- There is no formal SQLite backup/export/recovery flow yet.

## Current Risks

- SQLite improves durability over localStorage, but the app still lacks backup/export and database corruption recovery UI.
- Full-snapshot writes are simple and safe for the current task count, but row-level writes may be needed if task volume grows substantially.
- UI preferences now have a separate Zustand store; future preference expansion should keep this boundary and avoid mixing settings into task persistence.
- Advanced desktop features will expand Tauri permissions and increase platform-specific failure modes.
- Image attachment import, copying, thumbnail preview, Lightbox preview, and delete UI now exist, but full orphan-file scanning/repair and backup policy are still not implemented.
- Task App Binding MVP exists, but it is intentionally manual-only and does not scan installed apps, extract icons, track processes, or manage launch arguments.

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

## Resolved By Phase 5B Task App Binding MVP

- SQLite schema version advanced to `3`.
- `task_apps` metadata table exists with cascade delete from `tasks`.
- `TaskApp` type and `sqliteTaskAppRepository` exist separately from task and attachment repositories.
- `taskAppStore` is separate from `taskStore`.
- Users can manually bind `.exe` and `.lnk` paths through a file picker.
- TaskDetail has minimal Add App, editable display name, Start Task, error, missing, and delete binding controls.
- App launch is user-triggered and routed through a narrow Rust command that validates path existence and file extension.
- No broad shell permission, arbitrary command input, automatic app scanning, icon extraction, process monitoring, or background launching was added.

## Resolved By Phase 6B Screenshot Capture MVP

- TaskDetail has a user-triggered Add Screenshot action in the existing Attachments section.
- Full-screen screenshots are saved as PNG files under the existing AppData attachment directory.
- Screenshot metadata reuses `task_attachments` with `kind = "screenshot"`; no new SQLite table or schema migration was added.
- Existing thumbnail preview, delete behavior, missing-file state, and Lightbox preview are reused for screenshots.
- The screenshot command is invoked only from an explicit user click.
- No region capture, annotation, OCR, AI, global shortcut, tray, background capture, timed capture, or upload path was added.

## Resolved By Phase 6B.1 Screenshot UI Repair

- The Attachments action row wraps Add Image and Full Screenshot instead of clipping in narrow DetailPanel widths.
- The Apps action row uses the same responsive button wrapping for Add App and Start Task.
- Screenshot copy now makes the MVP boundary explicit: it captures the full screen for now.

## Resolved By Phase 6C Screenshot Editor MVP

- The Attachments section now has one screenshot entry: `Screenshot`.
- Screenshot capture opens a preview/editor overlay before persistence.
- Confirm without crop preserves full-screen screenshot behavior.
- Confirm with a valid rectangular crop saves the cropped screenshot through the existing attachment system.
- Cancel and Escape are persistence no-ops and do not write files or metadata.
- Reset Crop clears the selection and returns Confirm to full-screenshot behavior.
- Tiny crop selections are rejected instead of producing invalid attachments.
- Screenshot metadata still reuses `task_attachments`; no screenshot table or schema migration was added.

## Resolved By Phase 6C.1 Screenshot Window Exclusion

- Full-screen screenshot capture now hides the ToFinal window before invoking the Rust capture command.
- The app window is restored and focused after capture, including failure paths.
- The fix uses narrow current-window permissions only and does not add tray, global shortcut, shell, OCR, AI, or background capture behavior.

## Resolved By Phase 7B Preferences MVP

- `preferencesStore` is separate from `taskStore`.
- UI preferences persist to localStorage key `tofinal.preferences.v1` with payload version `1`.
- Theme supports `light`, `dark`, and `system`; `system` resolves to `light` or `dark` through `prefers-color-scheme`.
- The app applies `data-theme="light"` or `data-theme="dark"` on `document.documentElement`; it does not apply `data-theme="system"`.
- Language supports `zh-CN` and `en-US` through a lightweight key-based dictionary.
- User task titles, notes, tags, attachment original names, and task app names are not automatically translated.
- SQLite schema, task persistence, attachment metadata, screenshot files, and task app bindings were not changed.
- No i18n dependency, AI, MCP, account system, or cloud sync was added.

## Must Fix Before Preferences Expansion

- Decide whether date/time formatting should follow language preference.
- Decide whether the initial language should eventually follow OS/browser language instead of the current fixed `zh-CN` default.
- Add export/import or sync semantics only after an account/profile phase is explicitly designed.

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
- Validate multi-monitor screenshot behavior across real Windows display arrangements, especially mixed scaling and negative monitor coordinates.
- Validate Screenshot Editor crop mapping across real Windows DPI and multi-monitor arrangements.
- Validate the hide-before-capture timing on slower Windows machines; adjust the compositor-settle delay only if manual QA still shows window remnants.
- Consider post-drag crop resize handles if manual QA shows crop adjustment is too rigid.
- Consider screenshot annotation, quick notes, OCR, or AI review only as separate later phases.
- Continue ensuring file import never writes images, `tofinal.db`, `*.db`, or `*.sqlite` into the Git working tree.

## Must Fix Before System Tray Or Global Shortcuts

- Separate app-window state from task data state.
- Define lifecycle behavior for hidden/minimized windows.
- Add conflict handling for global shortcut registration failure.
- Add platform-specific tests or manual QA checklist for Windows behavior.
- Add Tauri permissions/plugins only when the feature is implemented.

## Must Fix Before Expanding Task App Binding

- Decide whether `.lnk` launch should use a deeper Windows-native ShellExecute wrapper if the current best-effort launcher is insufficient.
- Add optional app icon extraction only after the metadata and launch behavior are stable.
- Add launch argument support only with a constrained UI model; do not allow free-form shell command execution.
- Add installed-app discovery only as an explicit later phase with a separate security review.
- Add better missing-path repair UX if users move or uninstall bound applications.

## Temporarily Not Recommended

- Cloud sync, accounts, and login.
- AI features.
- Calendar/reminder semantics.
- WorkerW/Progman desktop embedding.
- Large UI template libraries or Redux.
- Voice features before task creation/editing paths are stable.
- Automatic installed-app scanning or AI-driven app launching before manual binding is stable.

## Suggested Priority

1. Freeze v0.2 baseline and keep the current feature set stable.
2. Implement Phase 3 SQLite with migration and repository hardening.
3. Add import/export or backup after SQLite is stable.
4. Add attachment backup/export and orphan cleanup.
5. Manually validate screenshot capture on the primary target Windows setup and refine multi-monitor behavior if needed.
6. Add voice input only after task creation/editing paths are stable.
7. Add tray/global shortcuts after window lifecycle is explicitly designed.
8. Package and sign the app for regular personal use.
