# ToFinal Technical Debt

## Phase 8 Widget Experiment Withdrawn

- The dual-window transparent Widget Mode experiment has been removed from active code.
- Current Desktop Pin Mode is the original single-window compact layout: QuickInput, up to five unfinished tasks, completion checkboxes, and one return-to-Normal control.
- Removed active code paths include `WidgetCard`, `useWidgetController`, `windowHandoff`, `windowState`, `widgetGeometry`, the hidden `widget` Tauri window, and widget-specific CSS/tests.
- Reason: the dual-window/transparent/strip-panel-rescue approach added too much desktop-window complexity for the current product value and created unstable behavior.
- Legacy Phase 8B notes below are historical context only and no longer describe the active implementation.

## Known Issues

- SQLite persistence is now implemented through an async repository boundary, but the store still writes full task snapshots after each mutation instead of row-level changes.
- localStorage remains in the codebase for v0.2 task migration and rollback; it should not regain responsibility for normal task data persistence.
- `Today` is still a default task collection, not a real date-based view.
- Task ordering is simple insertion order, with Desktop Pin Mode only sorting pinned open tasks first.
- Normal Mode column widths are session-only and are not persisted.
- Visual styles are mostly tokenized, but a few component-level `color-mix(...)`, shadow, and status-color classes remain inline for local visual states.
- App version in `package.json` and `tauri.conf.json` is still `0.1.0`; product baseline can be named v0.2 in docs/tagging even if package version has not yet been bumped.
- There is no formal SQLite backup/export/recovery flow yet.
- Desktop Pin Mode is intentionally basic. It is not a true desktop widget, WorkerW/Progman embed, tray surface, global shortcut surface, or edge dock.

## Current Risks

- SQLite improves durability over localStorage, but the app still lacks backup/export and database corruption recovery UI.
- Full-snapshot writes are simple and safe for the current task count, but row-level writes may be needed if task volume grows substantially.
- UI preferences now have a separate Zustand store; future preference expansion should keep this boundary and avoid mixing settings into task persistence.
- Advanced desktop features will expand Tauri permissions and increase platform-specific failure modes.
- Image attachment import, copying, thumbnail preview, Lightbox preview, and delete UI now exist, but full orphan-file scanning/repair and backup policy are still not implemented.
- Task App Binding MVP exists, but it is intentionally manual-only and does not scan installed apps, extract icons, track processes, or manage launch arguments.
- Runtime window decoration changes are not used. The main window is configured with `decorations: false`, so frameless behavior is stable without runtime decoration toggling.
- Desktop Pin Mode still relies on best-effort Tauri window size/topmost/taskbar calls; UI mode switching remains usable if these native calls fail.

## Resolved By Phase 8B.7 Widget Dual-Window Handoff

- Normal Mode and Widget Mode no longer share one native OS window for large-to-small geometry transitions.
- Tauri configuration now defines static `main` and `widget` windows.
- React routes by current window label, so the `main` window never renders `WidgetCard` and the `widget` window never renders the Normal Mode three-column shell.
- Widget handoff shows/focuses the target window, emits an enter event, and hides the previous window after the handoff delay.
- Returning to Normal Mode emits a task hydrate event so the hidden main-window Zustand store refreshes task changes written from the widget window.
- Widget sizing remains bounded and single-shot; the large-window native resize flash is avoided by not resizing `main` into the widget shape.
- SQLite schema, dependencies, Edge Dock, tray, global shortcut, AI, and MCP remained unchanged.

## Resolved By Phase 8B.8 Widget Stability And Bounded Resize

- Widget resize and surface sync no longer reapply saved widget position, preventing jumps back to the saved corner during resize adjustment.
- Widget enter resets hidden Widget state to `strip`, preventing stale `panel` or half-expanded state from appearing after re-entry.
- Widget resize supports bounded width and height: strip range is `280x56` to `380x140`, and panel range is `300x300` to `400x560`.
- Legacy `tofinal.window.v1` widget sizes are clamped on load and save.
- Widget CSS no longer animates width, height, translate, or scale, reducing transparent-window residual artifacts.
- `useWidgetController` now owns Widget surface/frame/resize state so AppShell only coordinates app-level window handoff.
- SQLite schema, dependencies, Edge Dock, tray, global shortcut, AI, and MCP remained unchanged.

## Resolved By Phase 8B.4 Widget Interaction Closure

- `applyWindowMode` now returns a verified result object instead of a blind fire-and-forget promise.
- Widget Mode validates the actual Tauri outer window size after applying each widget surface.
- If Widget sizing fails or returns a clearly mismatched actual size, AppShell enters a `rescue` surface instead of rendering a compact tag inside a large stale window.
- `rescue` provides Restore Widget and Open Normal Mode controls.
- `strip`, `panel`, and `rescue` all provide a path back to Normal Mode.
- The earlier `dockedTag` recovery path was superseded by removing the unreliable count-only tag mode from the active state machine.
- Widget-specific CSS no longer uses `border-radius: 999px`, avoiding the giant oval failure mode when transparent-window resizing is unreliable.
- SQLite schema, dependencies, Edge Dock, tray, global shortcut, AI, and MCP remained unchanged.

## Resolved By Phase 8B.5 Widget Drag And Size Constraints

- The unreliable count-only `dockedTag` mode was removed from the active Widget state machine.
- The strip surface now has a dedicated drag region instead of relying on action buttons for dragging.
- Widget Mode now applies tight min/max size constraints for the strip and panel surfaces.
- Widget Mode sets the main window always-on-top; Normal Mode clears always-on-top on return.
- Normal Mode clears the Widget max-size constraint so the full app window can resize normally.
- Added the required Tauri permissions for `setMaxSize` and `setResizable`.

## Resolved By Phase 8B.6 Widget Edge Snap And Motion

- Widget Mode now disables native window resizing with `setResizable(false)` so Windows edge Snap cannot enlarge the widget while dragging.
- Widget strip and panel now support custom in-widget resizing within bounded ranges, without enabling native window resize handles.
- Normal Mode restores `setResizable(true)` and clears Widget max-size constraints.
- The strip surface now prioritizes the next task title over the app identity.
- Strip and panel share a fixed two-slot control rail so expand/collapse controls do not jump when changing surfaces.
- WidgetCard now uses one outer card container and no timeout-based rendered-surface mirror state.
- Widget native window resizing now uses single-shot frame syncs instead of multiple programmatic `setSize` animation steps.
- Normal-to-Widget and Widget-to-Normal transitions now use React-local staging plus CSS enter/exit animations, without reintroducing repeated native window resize animation.
- Widget visual dimensions are driven by CSS variables, and resizing disables expensive transitions/backdrop intensity while the pointer is active.
- Widget surface CSS motion uses non-linear easing and respects `prefers-reduced-motion: reduce`.
- `tofinal.window.v1` now stores recent strip and panel widget sizes; SQLite schema remained unchanged.

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

## Resolved By Phase 8B Widget Mode MVP

- Desktop Pin Mode was redefined in the UI as Widget Mode.
- Widget Mode now renders a dedicated `WidgetCard` instead of the Normal Mode three-column shell.
- Widget Mode no longer renders the custom `WindowTitleBar`, DetailPanel, attachments, Screenshot Editor entry, Lightbox entry, task app bindings, Start Task controls, settings panel, search, priority editor, tags editor, or note editor.
- Widget Mode supports a default strip, temporary panel quick-add, visible unfinished task count, up to three unfinished tasks in the panel, task completion, and one Open Normal Mode control.
- Widget Mode reuses `taskStore`; quick-add and completion still use the existing task save queue and SQLite repository boundary.
- Widget Mode reuses `preferencesStore`; current theme, resolved theme, and language continue to apply.
- Window placement is persisted separately from preferences at localStorage key `tofinal.window.v1`.
- SQLite schema was not changed.
- No dependency, Edge Dock, system tray, global shortcut, WorkerW/Progman desktop hack, AI, or MCP was added.

## Resolved By Phase 8B.2 Transparent Widget Surface

- The main Tauri window is created with `transparent: true`.
- Widget Mode root is transparent and no longer renders the normal app background.
- Widget Mode defaults to a strip surface around `300x64`.
- Clicking the strip opens a temporary panel surface around `320x260`.
- Moving the Widget window to the top edge automatically switches it to a top-docked tag surface around `92x32`.
- The tag surface shows only the unfinished task count and expands back to the strip when clicked.
- Normal Mode continues to paint the full app background through `app-shell-bg`.
- `html`, `body`, and `#root` do not provide the Normal Mode background.
- No runtime transparent toggle, runtime decorations toggle, Edge Dock, tray, global shortcut, AI, MCP, dependency, or SQLite schema change was added.

## Must Fix Before Further Transparent Widget Polish

- Validate Windows transparent-window click regions and background behavior on real hardware.
- Validate whether outer card shadows are clipped by the transparent window bounds and whether extra transparent margin is worth the tradeoff.
- Reconsider larger rounded widget corners only after real Windows QA proves transparent corners are clean across DPI settings.
- Validate Normal Mode on a transparent Tauri window across light/dark/system themes.
- Avoid runtime `transparent` toggling unless Tauri exposes a stable, permissioned API for the target platforms.
- If runtime `setDecorations` is considered later, add `core:window:allow-set-decorations` only after manual QA proves it is stable. Phase 8B intentionally did not add this permission.
- Consider an optional always-on-top preference later. Phase 8B intentionally does not force Widget Mode to stay on top.

## Must Fix Before Preferences Expansion

- Decide whether date/time formatting should follow language preference.
- Decide whether the initial language should eventually follow OS/browser language instead of the current fixed `zh-CN` default.
- Add export/import or sync semantics only after an account/profile phase is explicitly designed.

## Must Fix Before Next Persistence Expansion

- Add a user-facing backup/export and restore strategy.
- Decide whether to keep full-snapshot writes or introduce row-level repository methods.
- Add schema migration tests before any future Task or attachment schema change.
- Define database recovery UX for corrupted SQLite rows or failed migrations.
- After Phase 9B, manually verify schema version `4` migration on a real v0.8 database with existing task, attachment, screenshot, and app binding data.
- Decide whether future temporal work needs `dueDate`; Phase 9B intentionally added only `plannedDate`.
- Add explicit scheduling UI before relying on users to manage future planned tasks at scale.

## Must Fix Before Advanced Task Stack Work

- Phase 9C now provides the first `task_stacks` schema and stack rendering MVP.
- Define explicit stack-level mutation APIs before implementing merge, split, reorder, or drag-to-combine.
- Decide whether drag-and-drop will use native Pointer Events or a constrained DnD dependency; do not add a DnD dependency without a separate implementation plan.
- Decide how non-main task detail editing should expose notes, attachments, screenshots, and app bindings before enabling full child-task editing.
- Manually validate schema version `5` migration on a real v0.9B database before freezing the next baseline.

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

## Phase 9C Stack Follow-Ups

Resolved in Phase 9C:

- Basic `task_stacks` schema exists at SQLite schema version `5`.
- Existing v4 tasks migrate into singleton stacks.
- Normal Mode renders stack views and supports expand/collapse persistence.
- Non-main task selection is intentionally highlight-only.

Still deferred:

- Phase 9D added explicit stack merge, split, and reorder commands.
- Phase 9D uses native Pointer Events for the first DnD MVP; no DnD dependency was added.
- Add full non-main task editing only after deciding how attachments, screenshots, and app bindings should be surfaced for child tasks.
- Manually verify schema version `5` migration on a real v0.9B database with existing attachments, screenshots, task apps, and preferences.
- Consider stack-level accessibility labels and keyboard expand/collapse shortcuts before polishing stack interaction.

## Phase 9D Stack Drag Follow-Ups

Resolved in Phase 9D:

- Current-view stack reorder.
- Stack-internal task reorder.
- Singleton task merge into another stack.
- Split a task out of a multi-task stack into a new singleton stack.
- Main-task promotion by moving a task to the first stack position.
- Rollback snapshot for failed stack mutation persistence.

Still deferred:

- Keyboard-accessible drag/reorder controls.
- Cross-view drag between `Today` and `All Tasks`.
- Dragging entire multi-task stacks into other stacks as a single grouped operation.
- More advanced collision detection or drag overlay if manual QA shows Pointer Events MVP is not precise enough.
- Full child-task editing and attachment/app/screenshot access for non-main tasks.
- Deeper animation polish beyond subtle scale, highlight, and drop indicators.

## Phase 9E Stack Presentation Follow-Ups

Resolved in Phase 9E:

- Collapsed multi-task stacks now have visible layered-card depth instead of looking like ordinary single capsules.
- Stack expansion no longer depends on a large visible `Expand stack` button; the stack body is the primary affordance.
- Expanded stacks now unfold child tasks below the main task instead of rendering as a large wrapper around ordinary task rows.
- A compact collapse control remains available without dominating the stack surface.
- Nested completion controls are protected from accidental stack expand/collapse.

Still deferred:

- FLIP-style displacement animation when neighboring stacks move out of the way during drag.
- Advanced spring physics for drag previews.
- Keyboard-accessible reorder/merge/split controls.
- Full child-task detail editing and attachment/app/screenshot access for non-main tasks.

