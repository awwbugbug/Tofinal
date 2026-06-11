# ToFinal Phase 1 Acceptance Report

Date: 2026-06-09

## 1. Real Implemented Functions

- Tauri v2 desktop app starts through `npm run tauri dev` and reaches `target\debug\tofinal.exe`.
- Normal Window Mode renders a three-column task shell: sidebar, task list, detail panel.
- Desktop Pin Mode renders a compact card with QuickInput, incomplete tasks, checkbox completion, and return-to-normal control.
- QuickInput supports click-to-add and Enter-to-add.
- Empty QuickInput submissions are ignored.
- QuickInput clears after a valid task is added.
- Task checkbox toggles completed/incomplete state.
- Open/completed counts update from the current visible task list.
- Clicking a task selects it and updates DetailPanel.
- DetailPanel displays the selected task's title, note, priority, tags, createdAt, updatedAt, and completion state from live Zustand state.
- Today navigation shows the current first-phase default task list.
- All Tasks navigation shows all in-memory tasks.
- Important navigation shows tasks with `important` or `urgent` priority.
- Current navigation item has an active visual state and `aria-pressed`.
- Custom title bar is enabled with Tauri window decorations disabled.
- Custom title bar supports drag, minimize, maximize/restore, and close through Tauri window APIs with browser fallback.

## 2. Placeholder Functions

- Phase 1 historical status: Pinned navigation was a disabled placeholder because first-phase tasks did not include a pinned field. This is resolved in the Phase 2 addendum below.

## 3. Explicitly Not Implemented

- Database storage.
- localStorage or other persistence.
- Screenshot capture.
- Voice input.
- Image upload.
- AI features.
- Account login.
- Cloud sync.
- Calendar or reminders.
- Windows WorkerW/Progman desktop embedding.

## 4. Visible Control Interaction Status

| Control | Status | Result |
| --- | --- | --- |
| QuickInput text field | Implemented | Accepts task title input. |
| QuickInput Add button | Implemented | Adds non-empty task and clears input. |
| QuickInput Enter key | Implemented | Adds non-empty task and clears input. |
| Task checkbox | Implemented | Toggles completed/incomplete and updates counts/detail state. |
| Task card | Implemented | Selects task and updates DetailPanel. |
| Today nav | Implemented | Activates Today filter and shows default in-memory list. |
| All Tasks nav | Implemented | Activates All Tasks filter and shows all in-memory tasks. |
| Important nav | Implemented | Activates Important filter and shows important/urgent tasks. |
| Pinned nav | Phase 1 placeholder | Disabled in Phase 1; implemented as a real filter in Phase 2. |
| Normal Mode Pin button | Implemented | Switches to Desktop Pin Mode. |
| Desktop Pin return button | Implemented | Switches back to Normal Window Mode without losing Zustand state. |
| Title bar drag area | Implemented with fallback | Calls Tauri `startDragging()`; inert in browser preview. |
| Title bar minimize button | Implemented with fallback | Calls Tauri `minimize()`; inert in browser preview. |
| Title bar maximize/restore button | Implemented with fallback | Calls Tauri `toggleMaximize()`; inert in browser preview. |
| Title bar close button | Implemented with fallback | Calls Tauri `close()`; inert in browser preview. |

## 5. Desktop Pin Mode Real Capability

- Uses the same in-memory Zustand store as Normal Window Mode.
- Shows compact QuickInput.
- Shows incomplete tasks only, limited to a small compact list.
- Supports completing tasks from the compact list.
- Supports adding tasks from compact input.
- Supports returning to Normal Window Mode.
- Attempts Tauri window resize, min-size, always-on-top, and skip-taskbar behavior through `applyWindowMode`.
- If Tauri window APIs fail or the app is running in browser preview, UI mode switching continues without crashing.

## 6. Custom Window Title Bar

- Implemented.
- `src-tauri/tauri.conf.json` sets `"decorations": false`.
- `src-tauri/capabilities/default.json` grants the required window permissions.
- `WindowTitleBar` provides drag, minimize, maximize/restore, and close controls.
- No new dependencies were introduced.

## 7. Files Modified This Round

- `src/types/task.ts`
- `src/stores/taskStore.ts`
- `src/stores/taskStore.test.ts`
- `src/app/App.test.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/NormalModeLayout.tsx`
- `src/components/layout/DesktopPinLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/WindowTitleBar.tsx`
- `src/lib/windowControls.ts`
- `src/lib/windowMode.ts`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `docs/ACCEPTANCE_REPORT.md`

## 8. Test And Build Results

- `npm test`: passed, 2 test files, 13 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri`.
- `npm run tauri dev`: verified startup to `Running target\debug\tofinal.exe`; validation process was then stopped intentionally.

## 9. Second Phase Readiness

The first-stage UI skeleton was acceptable to enter the next phase after product confirmation. At the end of Phase 1, the remaining incomplete visible item was explicitly disabled as a placeholder (`Pinned`), so there were no visible fake buttons that looked active but did nothing.

---

# Phase 2 Acceptance Addendum

Date: 2026-06-09

## 1. Real Implemented Functions

- DetailPanel now supports editing the selected task title, note, priority, tags, and pinned state.
- Task edits are saved explicitly with the Save button.
- Empty task titles are rejected and do not overwrite the existing task.
- `updatedAt` is refreshed when task fields, completion, or pinned state changes.
- Task deletion is available from DetailPanel and uses native `window.confirm`.
- Deleting the selected task selects the next visible task, or shows an empty detail state if none remain.
- Pinned is now a real task field and a real sidebar filter.
- Sidebar counts update from live task data for Today, All Tasks, Important, and Pinned.
- Search input filters by title and note and combines with the active sidebar filter.
- Empty filter/search results show explicit empty states.
- Desktop Pin Mode keeps using the same Zustand store, supports add/complete, and prioritizes pinned incomplete tasks before other incomplete tasks.
- Task data persists to localStorage and survives refresh/restart in the current browser/WebView profile.

## 2. Still Explicitly Not Implemented

- SQLite storage.
- Database migrations.
- localStorage-to-SQLite import flow.
- Screenshot capture.
- Voice input.
- Image upload.
- AI features.
- Account login.
- Cloud sync.
- Calendar or reminders.
- System tray.
- Global shortcuts.
- Windows WorkerW/Progman desktop embedding.

## 3. localStorage Persistence Strategy

- Storage key: `tofinal.tasks.v1`.
- Stored shape: `{ version: 1, savedAt, tasks }`.
- Only task data is persisted.
- UI session state is not persisted: window mode, active filter, search query, and selected task are reset on startup.
- First launch with no stored data uses the seed task list.
- Invalid JSON, malformed task arrays, or unavailable localStorage fall back to seed tasks without crashing.
- Legacy task records without `pinned` are migrated in memory with `pinned: false`.

## 4. SQLite Repository Boundary

- `src/repositories/taskRepository.ts` defines the repository boundary.
- The current repository delegates to localStorage through `src/storage/taskStorage.ts`.
- Phase 3 can replace the repository implementation with SQLite while keeping components free of storage-specific calls.

## 5. Known Limits

- Saving is explicit; edits are not auto-saved while typing.
- Tags are edited as a comma-separated text field.
- Search is simple case-insensitive title/note matching.
- Today remains the default task list and does not perform date calculations.
- Desktop Pin Mode is still a compact UI/window prototype, not a WorkerW/Progman desktop embedding.

## 6. Visible Control Interaction Status

| Control | Status | Result |
| --- | --- | --- |
| Detail title input | Implemented | Edits selected task title; empty title is rejected on Save. |
| Detail note textarea | Implemented | Edits selected task note. |
| Detail priority select | Implemented | Switches normal / important / urgent. |
| Detail tags input | Implemented | Saves comma-separated tags with empty and duplicate tags removed. |
| Detail pinned checkbox | Implemented | Saves pinned state and updates Pinned filter/count. |
| Detail Save button | Implemented | Commits edits and updates `updatedAt`/localStorage. |
| Detail Delete button | Implemented | Confirms, deletes, updates selection/counts/localStorage. |
| Search input | Implemented | Filters title and note with current sidebar filter. |
| Pinned nav | Implemented | Shows pinned tasks and live count. |
| Desktop Pin task list | Implemented | Shows up to five incomplete tasks, pinned first. |

## 7. Files Modified This Round

- `src/types/task.ts`
- `src/stores/taskStore.ts`
- `src/stores/taskStore.test.ts`
- `src/storage/taskStorage.ts`
- `src/storage/taskStorage.test.ts`
- `src/repositories/taskRepository.ts`
- `src/app/App.test.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/NormalModeLayout.tsx`
- `src/components/layout/DesktopPinLayout.tsx`
- `src/components/layout/DetailPanel.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/task/TaskDetail.tsx`
- `docs/ACCEPTANCE_REPORT.md`

## 8. Test And Build Results

- `npm test`: passed, 3 test files, 21 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri`.
- `npm run tauri dev`: final verification launched Vite on port 1420 and started `target\debug\tofinal.exe`; the validation processes were then stopped intentionally.

## 9. Third Phase Readiness

Phase 2 is acceptable to enter a focused SQLite phase. The recommended next stage is replacing the localStorage repository with a SQLite-backed implementation while preserving the current task store API and UI behavior.

---

# Phase 2.5 Visual Polish Addendum

Date: 2026-06-09

## 1. Layout Preservation

- Preserved the existing Normal Window three-column structure: Sidebar, TaskList, and DetailPanel remain in the same positions.
- Preserved Desktop Pin Mode structure: compact QuickInput, incomplete task list, and return-to-normal control.
- Preserved all Phase 2 task behavior and localStorage persistence.

## 2. Visual Tokens Added

- Added centralized CSS variables in `src/styles/globals.css` for app background, app chrome, panel surfaces, sidebar tint, detail surface, card/input surfaces, border colors, text hierarchy, accent, danger, priority colors, radius, and shadows.
- Added reusable utility classes for app shell, chrome, panel/sidebar/detail/card/input surfaces, soft focus rings, and text hierarchy.
- The visual direction is now soft graphite-blue with warm blue-gray surfaces and low-saturation accent states.

## 3. Color And Hierarchy Changes

- Replaced the old flat light-gray/white look with a layered `#eef1f5` app background and tinted panels.
- Sidebar now reads as a tool area with a tinted background, soft selected navigation state, left active indicator, and lower-weight counts.
- Task cards now have clearer hover, selected, and completed states using soft borders, subtle shadows, and muted completed text.
- Priority badges now use distinct low-saturation treatments: neutral gray for Normal, soft blue for Important, and soft warm red/orange for Urgent.
- DetailPanel now reads more like an editable task note: title input is visually lighter, note area uses a paper-like surface, metadata is visually quieter, and Delete uses a low-key danger style.
- The previous native priority select was replaced with segmented pill buttons.
- TitleBar now uses the same app chrome surface and lighter window controls.
- Desktop Pin Mode now uses the same visual token system and feels closer to a desktop widget.

## 4. Dependency And Feature Boundary

- No new dependencies were added.
- No layout restructuring was performed.
- No SQLite, screenshot, voice input, image upload, AI, account, cloud sync, calendar/reminder, system tray, or global shortcut features were added.
- localStorage behavior and repository boundaries remain unchanged.

## 5. Test And Build Results

- `npm test`: passed, 3 test files, 21 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri`.
- `npm run tauri dev`: after clearing an existing ToFinal Vite/dev process on port 1420, verification launched Vite and started `target\debug\tofinal.exe`; validation processes were then stopped intentionally.
- Static color audit: no remaining large-surface matches for `bg-white`, `text-neutral-950`, `bg-neutral-950`, `border-white`, or old `#f2f2f4` in `src`.

## 6. Third Phase Readiness

Phase 2.5 is intended as the visual baseline for Phase 3. The next recommended phase remains SQLite persistence, while preserving the current store API, repository boundary, and visual system.

---

# Phase 2.6A Design System And Color Roles Addendum

Date: 2026-06-09

## 1. Design System Direction

- Reworked the visual system toward calm productivity / soft desktop utility.
- The direction follows Apple HIG-style clarity and restraint, Material Design 3-style color roles, NN/g visual hierarchy principles, and WCAG-oriented text contrast.
- Layout was intentionally preserved: the three-column Normal Window Mode, Sidebar, TaskList, DetailPanel, and Desktop Pin Mode structure remain unchanged.

## 2. Color Role Allocation

- Foundation: `--bg-base`, `--bg-warm`, and `--bg-canvas` define the subtle app background gradient.
- Surfaces: `--surface-sidebar`, `--surface-main`, `--surface-detail`, `--surface-card`, and `--surface-input` define navigation, work area, detail/note, card, and input roles.
- Text: `--text-primary`, `--text-secondary`, `--text-muted`, and `--text-faint` separate headings, body text, secondary labels, and placeholders.
- Borders and focus: `--border-soft`, `--border-medium`, and `--ring-soft` unify panel borders and focus states.
- Accent: `--accent`, `--accent-hover`, `--accent-soft`, and `--accent-surface` are limited to selected navigation, selected tasks, primary actions, and focus.
- Status: Normal, Important, Urgent, and Pinned each use dedicated low-saturation role tokens.
- Danger: Delete continues to use `--danger` and `--danger-soft`, separate from accent.

## 3. Three-Column Hierarchy

- Sidebar now uses a mist-blue surface for the navigation/tool zone.
- TaskList uses a neutral-cool main surface for the primary work area.
- DetailPanel uses a warm-ivory surface to read as a task detail/note area.
- The selected task uses accent surface, border, shadow, and a left indicator so the state is not color-only.
- Metadata, tags, counts, and helper text use muted/faint roles so they no longer compete with task title and primary actions.

## 4. Dependency And Feature Boundary

- No dependencies were added.
- No task features were changed.
- localStorage persistence and repository boundaries were not changed.
- No SQLite, screenshot, voice input, image upload, AI, account, cloud sync, calendar/reminder, system tray, or global shortcut work was added.

## 5. Test And Build Results

- `npm test`: passed, 3 test files, 21 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri`.
- `npm run tauri dev`: after clearing an existing ToFinal Vite/dev process on port 1420, verification launched Vite and started `target\debug\tofinal.exe`; validation processes were then stopped intentionally.
- Static color audit: no component matches for `bg-white`, `bg-black`, `text-black`, `border-white`, `neutral-950`, `neutral-900`, or old `#f2f2f4` in `src`.

## 6. Phase 2.6B Follow-Up Candidates

- Long title and long note display behavior.
- Scrollbar and overflow polish.
- Column width adaptation without introducing drag-to-resize.
- Small micro-interactions that do not affect performance.
- Visual review using actual screenshots if screenshot work becomes allowed later.

---

# Phase 2.6A-Repair Visual Rework Addendum

Date: 2026-06-09

## 1. Why Phase 2.6A Needed Rework

- The previous pass changed token names and reduced obvious pure white/black usage, but the actual interface still read as a pale web form.
- The screenshot showed weak separation between Sidebar, TaskList, and DetailPanel.
- DetailPanel controls still looked like form inputs: the task title was a flat single-line pill, the note field had a hard focus edge, and the priority segmented control used an awkward white selected thumb.

## 2. Controls Reworked

- Task Title is now a textarea instead of a single-line input.
- Title editing now supports wrapping, has a minimum height of roughly 48px, uses 16px horizontal padding and 12px vertical padding, and caps at 3 lines with internal scrolling.
- Task Note now uses a warm note surface, 16px padding, 1.55 line-height, a 22px radius, and the shared soft focus ring.
- The note and title focus state now uses `--ring-soft` and `--surface-note-focus`, replacing the hard browser-like edge.
- Priority is still a three-way segmented control, but the selected thumb now uses status color surfaces instead of a stark white block, with smoother transition, subtle elevation, and stronger selected font weight.
- QuickInput, Search, and Tags input now share the same less-pill-shaped input token with an 18px radius.

## 3. Visible Color And Layering Changes

- App canvas now uses a stronger but restrained cool-to-warm gradient.
- Sidebar uses a clearer mist blue-gray surface.
- TaskList uses a neutral cool main surface.
- DetailPanel and Desktop Pin Mode use a warmer ivory paper surface.
- Task title and note fields use `--surface-note`, making the detail area read as an editable note rather than a generic form.
- Important, Urgent, Normal, Pinned, and Danger colors remain low-saturation but are applied directly in badges, segmented controls, pinned state, and delete controls.

## 4. Selected And Hover States

- Selected tasks now use accent-tinted background, accent-mixed border, a 3px left indicator, and stronger soft elevation.
- Normal task cards now have a subtle surface and border instead of reading as bare table rows.
- Hover states now transition border, background, and elevation more gradually.
- Completed tasks remain muted and line-through while preserving readability.

## 5. Layout And Dependency Boundary

- The three-column layout was preserved.
- Sidebar, TaskList, DetailPanel, and Desktop Pin Mode positions were not changed.
- No dependencies were added.
- No business functionality, localStorage behavior, repository boundary, or Tauri window behavior was changed.

## 6. Visual QA Notes

- Compared with the prior screenshot, the most visible changes are the warm DetailPanel, stronger mist-blue Sidebar, richer selected task card, non-pill title textarea, warmer note editor, and non-white segmented selected state.
- Long task titles now wrap in the title textarea, up to 3 lines before internal scrolling.
- Note focus uses a soft ring (`0 0 0 3px var(--ring-soft)`) and warm focused surface instead of a hard blue outline.
- Priority selected state is now a status-colored thumb with subtle shadow and font-weight change.
- The applied tokens include `--bg-canvas`, `--surface-sidebar`, `--surface-main`, `--surface-detail`, `--surface-note`, `--surface-elevated`, `--accent-surface`, `--normal-bg`, `--important-bg`, `--urgent-bg`, `--pinned-bg`, and `--danger-soft`.

## 7. Test And Build Results

- `npm test`: passed, 3 test files, 21 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri`.
- `npm run tauri dev`: verified Vite on port 1420 and `target\debug\tofinal.exe` startup; validation processes were then stopped intentionally.

---

# Phase 4A Attachment Metadata Layer Addendum

Date: 2026-06-11

## 1. Scope Completed

- Added SQLite schema migration from version `1` to version `2`.
- Added `task_attachments` metadata table.
- Added `TaskAttachment` domain type.
- Added SQLite-backed attachment metadata repository.
- Added row mapping for attachment metadata.
- Enabled `PRAGMA foreign_keys = ON` during SQLite schema initialization.
- Preserved existing task data and task CRUD behavior.

## 2. Explicitly Not Implemented In Phase 4A

- Image file picker UI.
- Image file copying.
- Image preview UI.
- Thumbnail generation.
- Screenshot capture.
- Voice input.
- AI features.
- Cloud sync.
- System tray.
- Global shortcuts.

## 3. SQLite Schema Version

- Current schema version is now `2`.
- `schema_meta` writes are compatible with both:
  - current `key/value/updated_at` schema.
  - legacy `key/value` schema via fallback.

## 4. Attachment Table

`task_attachments` stores metadata only:

- `id`
- `task_id`
- `kind`
- `original_name`
- `stored_name`
- `relative_path`
- `mime_type`
- `size_bytes`
- `width`
- `height`
- `created_at`
- `updated_at`
- `sort_order`

`kind` currently supports `image` and `screenshot`, so Phase 5 screenshot metadata can reuse the same table.

## 5. Foreign Key And Cascade Notes

- `task_attachments.task_id` references `tasks.id` with `ON DELETE CASCADE`.
- `PRAGMA foreign_keys = ON` is required after opening the SQLite connection.
- Task snapshot saving now upserts retained tasks and deletes only missing tasks, so ordinary task saves do not wipe attachment metadata.

## 6. Test And Build Results

- `npm test`: passed, 5 test files, 49 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri`.
- `npm run tauri dev`: verified startup to `target\debug\tofinal.exe`; validation processes were then stopped intentionally.

---

# Phase 3 SQLite Acceptance Addendum

Date: 2026-06-10

## 1. Real Implemented Functions

- Replaced runtime task persistence with SQLite through the official Tauri SQL Plugin.
- Fixed SQLite database path: `sqlite:tofinal.db`.
- Added async repository methods: `loadSnapshot(): Promise<TaskSnapshot>` and `saveSnapshot(snapshot): Promise<void>`.
- Added store hydration state: `hydrated`, `loading`, and `error`.
- App startup now calls `hydrateTasks()` and shows a safe lightweight loading state before tasks are available.
- Task mutations still update UI immediately, then save the full snapshot to SQLite.
- Write failures are captured in store `error` instead of crashing the app.
- Existing Phase 2 task behavior remains: add, edit, delete, complete/reopen, priority, tags, pinned, filters, search, Desktop Pin Mode, and resizable Normal Mode columns.

## 2. SQLite Schema Actually Implemented

- `schema_meta`
  - `key TEXT PRIMARY KEY`
  - `value TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
- `tasks`
  - `id TEXT PRIMARY KEY`
  - `title TEXT NOT NULL`
  - `note TEXT NOT NULL`
  - `completed INTEGER NOT NULL CHECK (completed IN (0, 1))`
  - `priority TEXT NOT NULL CHECK (priority IN ('normal', 'important', 'urgent'))`
  - `pinned INTEGER NOT NULL CHECK (pinned IN (0, 1))`
  - `tags TEXT NOT NULL`
  - `created_at TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
  - `completed_at TEXT NULL`
  - `sort_order INTEGER NOT NULL`
- `idx_tasks_sort_order` keeps explicit snapshot ordering.
- All task reads use explicit `ORDER BY sort_order ASC, created_at DESC, id ASC`.

## 3. Migration Strategy Actually Implemented

- On startup, the SQLite repository opens `sqlite:tofinal.db` and ensures `schema_meta` and `tasks` exist.
- If SQLite already contains task rows, SQLite wins and localStorage is not used to overwrite it.
- If SQLite is empty, the repository reads localStorage key `tofinal.tasks.v1`.
- Valid localStorage snapshots are migrated into SQLite in a transaction and `localstorage_v1_migrated=true` is written to `schema_meta`.
- Missing or invalid localStorage falls back to seed tasks and writes `seed_initialized=true`.
- localStorage data is not deleted after migration.
- `tags` are stored as JSON TEXT.
- booleans are mapped to SQLite INTEGER `0` / `1`.
- `completedAt` maps to nullable `completed_at`.

## 4. Dependencies And Permissions Added

- npm dependency: `@tauri-apps/plugin-sql`.
- Cargo dependency: `tauri-plugin-sql` with `sqlite` feature.
- Tauri capability permissions added:
  - `sql:default`
  - `sql:allow-execute`
  - `sql:allow-select`
- No filesystem, shell, clipboard, tray, shortcut, screenshot, or other unrelated permissions were added.

## 5. Still Explicitly Not Implemented

- Screenshot capture.
- Voice input.
- Image upload.
- AI features.
- Account login.
- Cloud sync.
- Calendar or reminders.
- System tray.
- Global shortcuts.
- Windows WorkerW/Progman desktop embedding.

## 6. Test And Build Results

- `npm test`: passed, 4 test files, 35 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri` with Tauri SQL Plugin compiled.
- `npm run tauri dev`: verified startup to `target\debug\tofinal.exe`; validation processes were then stopped intentionally.

## 7. Manual Acceptance Checklist

- New task persists after restart: implemented by SQLite snapshot save/load; manual restart check still recommended as product QA.
- Edited title/note persists after restart: implemented by SQLite snapshot save/load; manual restart check still recommended as product QA.
- Deleted task stays deleted after restart: implemented by SQLite snapshot save/load; manual restart check still recommended as product QA.
- Completed/reopened state persists after restart: implemented by SQLite snapshot save/load; manual restart check still recommended as product QA.
- `priority`, `tags`, and `pinned` persist after restart: implemented by SQLite snapshot save/load; manual restart check still recommended as product QA.
- v0.2 localStorage data migrates when SQLite is empty.
- localStorage key `tofinal.tasks.v1` remains untouched after migration.
- UI behavior should match Phase 2 because components still only talk to Zustand actions.

## 8. Phase 3 Tag Recommendation

After `npm run tauri dev` is manually confirmed and restart persistence is checked, tag a Phase 3 baseline such as `v0.3-sqlite-task-baseline`.
- Static color audit: no matches for `bg-white`, `bg-black`, `text-black`, `border-white`, `neutral-950`, `neutral-900`, or old `#f2f2f4` in `src`.

## 8. Phase 2.6B Readiness

Phase 2.6A-Repair is suitable to move into Phase 2.6B after product review. Suggested follow-ups remain long-content polish, scroll behavior, density tuning, and optional micro-interactions.

---

# Phase 2.7 Engineering Audit And Version Freeze Preparation

Date: 2026-06-10

## 1. Audit Summary

- The project remains within the v0.2 scope: local-first tasks, localStorage persistence, Tauri desktop shell, Normal Mode, Desktop Pin Mode, and custom titlebar.
- No SQLite, screenshot, voice, image upload, AI, account, cloud sync, tray, global shortcut, or WorkerW/Progman implementation was added.
- The main architecture is suitable for a v0.2 baseline, with the largest Phase 3 concern being the current synchronous repository/store coupling.

## 2. Project Structure Findings

- `src/app` owns the app entry and integration tests.
- `src/components/layout` owns app shell, window chrome, Normal Mode, Desktop Pin Mode, Sidebar, and DetailPanel.
- `src/components/task` owns task creation, list, item, and detail editing UI.
- `src/components/ui` contains small local primitives only.
- `src/stores`, `src/repositories`, `src/storage`, and `src/types` form the current domain/data boundary.
- `src-tauri` is limited to Tauri configuration, capabilities, Rust entrypoints, and bundle assets.

## 3. Data And State Findings

- Task flow is UI -> Zustand task store -> repository -> localStorage key `tofinal.tasks.v1`.
- The `Task` schema includes `id`, `title`, `note`, `completed`, `priority`, `pinned`, `tags`, `createdAt`, `updatedAt`, and `completedAt`.
- localStorage loading validates snapshot shape and task shape, falls back to seed tasks on invalid data, and migrates missing `pinned` to `false`.
- Store state currently includes `tasks`, `selectedTaskId`, `mode`, `activeFilter`, and `searchQuery`.
- Store actions include task CRUD/editing, completion, pinned toggle, selection, mode switching, filter/search updates, and filtered task lookup.
- Normal Mode and Desktop Pin Mode safely share the same store.
- Selected task behavior is covered for delete, filter/search changes, completion, and update paths.

## 4. Tauri Findings

- `tauri.conf.json` uses app identifier `com.tofinal.tasks`, custom decorations disabled, initial size `1120x760`, min size `920x620`, and bundle icons.
- Current capabilities are window-control oriented: resize, min-size, always-on-top, skip-taskbar, dragging, minimize, maximize/restore, close, plus `opener:default`.
- No filesystem, shell, SQL, notification, global shortcut, tray, screenshot, or clipboard permissions are currently granted.
- Current permissions are not overly broad for v0.2.

## 5. Visual System Findings

- Visual tokens are centralized in `src/styles/globals.css`.
- Remaining hardcoded color usage is mostly in token definitions, local `color-mix(...)`, shadows, and status/control edge cases.
- No large UI redesign was performed in Phase 2.7.
- The latest right-side DetailPanel behavior is fixed neutral/cool white; priority color is expressed through priority badge and segmented control only.

## 6. Test Coverage Findings

- `src/stores/taskStore.test.ts` covers task creation, empty-title rejection, editing, deletion, completion toggle, priority/tags/pinned, mode switching, filters, and search.
- `src/storage/taskStorage.test.ts` covers seed fallback, save/load, invalid JSON fallback, and legacy `pinned` migration.
- `src/app/App.test.tsx` covers app-level interactions, Desktop Pin state sharing, titlebar rendering, custom delete dialog, filters/search, editing, and resizable columns.
- No additional low-cost critical test gap was found beyond current coverage for v0.2.

## 7. Documentation Created

- `docs/ARCHITECTURE.md`
- `docs/TECH_DEBT.md`
- `docs/ROADMAP.md`
- `docs/VERSION_BASELINE.md`

## 8. Phase 3 Readiness

- The app is ready to plan Phase 3 SQLite.
- Before implementing SQLite, the repository boundary should be made async-friendly or wrapped with a hydration strategy.
- The current localStorage repository is acceptable as a v0.2 baseline but should not be treated as a final persistence abstraction.

## 9. Phase 2.7 Verification Results

- `npm test`: passed, 3 test files, 24 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed for `src-tauri`.
- `npm run tauri dev`: verified Vite on port 1420 and `target\debug\tofinal.exe` startup; validation processes were then stopped intentionally.
