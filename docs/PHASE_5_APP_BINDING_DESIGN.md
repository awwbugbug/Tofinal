# ToFinal Phase 5A Task App Binding Design

Date: 2026-06-11

## 1. Current Baseline State

- Current stable baseline: `v0.4c-image-lightbox-baseline`.
- Task data is persisted by SQLite.
- Current database path is `sqlite:tofinal.db`.
- Current SQLite schema includes task persistence and attachment metadata.
- Current app has image attachment metadata, local image import/copy/delete, thumbnail preview, and Lightbox preview.
- Current app does not have task APP binding, Start Task, AI, screenshot capture, voice input, account login, cloud sync, system tray, or global shortcuts.
- Current UI has Normal Window Mode and Desktop Pin Mode.

Phase 5A is design-only. It defines how a task can manually bind one or more local apps and how the user can explicitly launch those apps from TaskDetail in a later implementation phase.

## 2. Phase 5A Scope

Phase 5A designs:

- Task App Binding data model.
- Manual app selection flow.
- Start Task launch flow.
- SQLite schema.
- Tauri permission strategy.
- Security boundary.
- Repository/store architecture.
- Error handling.
- Testing plan.
- Phase 5B implementation acceptance standards.

Phase 5A does not design or implement:

- Automatic installed-app scanning.
- Start menu scanning.
- Registry scanning.
- Installation directory scanning.
- Microsoft Store app discovery.
- PATH command discovery.
- AI recommendations or AI execution.
- Automatic task execution.
- Background auto-launch.
- Process monitoring.
- Automatic app closing.
- App icon extraction.
- Cross-device sync.
- Screenshot capture.
- Voice input.
- System tray.
- Global shortcuts.

## 3. User Scenarios

### Add One App To A Task

1. User opens a task in DetailPanel.
2. User clicks Add App.
3. App opens a file picker.
4. User manually selects an executable or shortcut.
5. App validates the selected path and supported type.
6. App derives a default display name from the selected file name.
7. User can edit the display name.
8. App saves metadata into SQLite.
9. The app binding appears in the task's Apps section.

### Add Multiple Apps To A Task

1. User adds apps one at a time, or the file picker allows multiple selection if Phase 5B chooses to support it.
2. Each selected app gets a `task_apps` row with increasing `sort_order`.
3. The Apps section lists all apps bound to the task.
4. Start Task can launch one selected app or all apps depending on the final MVP UX; the recommended MVP is a primary Start Task button that launches all bound apps in `sort_order`.

### Delete One App Binding

1. User clicks Delete on one app binding.
2. App deletes only the `task_apps` metadata row.
3. The actual external app file is not deleted.
4. Restarting ToFinal does not show the deleted binding.

### Start Task

1. User clicks Start Task from TaskDetail.
2. App loads the selected task's app bindings.
3. App validates each path still exists where possible.
4. App launches the bound app or apps.
5. Success/failure state is shown in the UI.
6. Task data is not automatically changed by launching apps.

### Restart Persistence

1. User binds apps to a task.
2. User closes and restarts ToFinal.
3. Task app bindings are loaded from SQLite and still appear.

### App Path Becomes Invalid

1. User moves, deletes, or uninstalls the bound app.
2. ToFinal detects missing path when listing or launching.
3. UI marks the binding as missing/broken.
4. Start Task refuses that binding and shows a clear error instead of crashing.

### Delete Task With App Bindings

1. User deletes a task.
2. `task_apps` metadata rows are deleted by SQLite foreign-key cascade.
3. No external app files are deleted.

## 4. MVP Functional Boundary

Recommended MVP:

- Add App button in TaskDetail.
- Native file picker for manual selection.
- Supported selected file types:
  - `.exe`
  - `.lnk`
  - optionally app-like files on other platforms in the future.
- Editable display name.
- Save selected `app_path`.
- Save app kind.
- Start Task button.
- User-initiated launch only.
- Delete app binding.
- Missing path indicator.

Explicitly not in MVP:

- Automatic installed-app scanning.
- Automatic app recommendation.
- Automatic launch on task selection or app startup.
- App icon extraction.
- Complex launch arguments editor.
- AI planning.
- Process monitoring.
- App close/kill controls.
- Cross-task app templates.

## 5. SQLite Schema Design

Phase 5B should migrate SQLite schema from version `2` to version `3`.

Recommended table: `task_apps`.

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

CREATE INDEX IF NOT EXISTS idx_task_apps_task_id_sort_order
ON task_apps(task_id, sort_order, created_at, id);
```

### Field Notes

- `id`: client-generated stable UUID string.
- `task_id`: owner task id.
- `app_name`: user-visible display name, editable.
- `app_path`: selected absolute local path.
- `app_kind`: first version should support:
  - `exe` for Windows executable files.
  - `shortcut` for Windows `.lnk` shortcuts.
- `launch_args`: nullable. MVP should keep this `NULL`; complex launch arguments should be a later feature.
- `sort_order`: deterministic display and launch order.

### URL And File Support

MVP should not support arbitrary URLs or generic files by default.

Reasons:

- URLs introduce browser/default-handler behavior and phishing-like ambiguity.
- Generic files require opener/default-app semantics, which is different from binding an app.
- The product goal is "task processing app binding", not general hyperlink management.

If future requirements need them, add explicit `app_kind` values such as `url` or `file` in a later schema migration with separate validation and launch rules.

### Foreign Keys

- `FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE` should be used.
- `PRAGMA foreign_keys = ON` must be executed after opening the SQLite connection.
- Deleting a task should automatically remove app binding metadata.

## 6. Path And Security Strategy

Security principles:

- Do not let users type arbitrary shell commands in MVP.
- Do not concatenate shell strings.
- Do not launch apps in the background.
- Start Task must be triggered by an explicit user click.
- Only paths chosen through the file picker should be saved as app bindings.
- Every launch request should validate that the path still exists.
- Path validation should reject unsupported file types.
- `launch_args` should remain `NULL` or ignored in MVP.
- App paths stay local. They are not uploaded to any cloud service.
- AI must not generate or execute commands.
- ToFinal should never delete the external app file when deleting metadata.

### Path Validity

Recommended validation:

- Normalize file extension case-insensitively.
- Accept `.exe` as `exe`.
- Accept `.lnk` as `shortcut`.
- Reject unsupported extensions.
- Store the exact selected path for Windows compatibility with Chinese characters and spaces.
- Treat missing paths as broken state, not fatal application errors.

## 7. Tauri Permission Design

Phase 5B needs two capabilities:

1. Selecting an app path.
2. Launching the selected app when the user clicks Start Task.

### Option A: Tauri Shell Plugin / Open

Possible approach:

- Use Tauri shell/open APIs to launch the selected path.

Pros:

- Less Rust code.
- May handle platform-specific opener behavior.
- Can be straightforward for opening files or URLs.

Cons:

- Shell permissions can become broad if not carefully scoped.
- Command-like APIs increase risk of accidental shell-string execution.
- More difficult to prove that only file-picker-selected paths are launched.
- `.exe` and `.lnk` behavior may need platform-specific handling anyway.
- Test boundaries can become less explicit if UI calls plugin APIs directly.

Security impact:

- Must not grant broad shell execution permissions.
- Must not expose arbitrary command execution to UI.
- If used at all, input must come from persisted task app metadata, not raw text fields.

### Option B: Custom Rust Command

Possible approach:

- Add a narrow Tauri command such as `launch_task_app`.
- Frontend passes a task app id plus persisted metadata.
- Rust validates:
  - path exists.
  - kind is supported.
  - extension matches kind.
  - launch is user-initiated.
- Rust launches via platform-appropriate APIs without shell-string concatenation.

Pros:

- Narrower permission surface than broad shell plugin access.
- Validation is centralized.
- Easier to avoid shell-string injection.
- Easier to add Windows-specific `.lnk` handling later.
- UI and Zustand do not need direct shell access.

Cons:

- Requires Rust implementation and tests.
- Windows `.lnk` launch may need platform-specific API such as ShellExecute-style behavior.
- Cross-platform behavior must be designed if macOS/Linux support becomes relevant.

### Recommendation

Recommend Option B: a narrow custom Rust command for Phase 5B.

Reasoning:

- The feature launches local executables and shortcuts, so safety matters more than implementation convenience.
- A custom command can avoid broad shell permissions.
- MVP should not expose arbitrary command strings.
- The command can be designed around selected, persisted app metadata only.

Phase 5B should not add:

- shell permission.
- clipboard permission.
- notification permission.
- global shortcut permission.
- tray permission.
- unrelated filesystem scopes.

It may need:

- dialog/open file picker for selecting `.exe` / `.lnk`.
- limited file existence/stat checks for selected paths.
- one narrow custom command permission for `launch_task_app`.

## 8. Repository / Store Design

Recommended new modules:

- `src/types/taskApp.ts`
- `src/repositories/sqliteTaskAppRepository.ts`
- `src/stores/taskAppStore.ts`
- `src/lib/appLauncher.ts` or `src/repositories/appLauncher.ts`

Do not put app bindings into `taskStore`.

Reasons:

- App bindings are secondary task metadata, similar to attachments.
- Desktop Pin Mode does not need full app binding data.
- Keeping a separate store avoids making task filtering and task save queue responsible for external launch state.
- Future launch errors and missing-path state are UI/session concerns, not core task fields.

### Suggested Type

```ts
type TaskAppKind = "exe" | "shortcut";

type TaskApp = {
  id: string;
  taskId: string;
  appName: string;
  appPath: string;
  appKind: TaskAppKind;
  launchArgs: string | null;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
};
```

### Repository Methods

```ts
type TaskAppRepository = {
  listByTaskId(taskId: string): Promise<TaskApp[]>;
  getTaskApp(id: string): Promise<TaskApp | null>;
  insertTaskApp(taskApp: TaskApp): Promise<void>;
  updateTaskApp(id: string, update: Pick<TaskApp, "appName">): Promise<void>;
  deleteTaskApp(id: string): Promise<void>;
  deleteByTaskId(taskId: string): Promise<void>;
};
```

### Store Methods

```ts
type TaskAppStore = {
  appsByTaskId: Record<string, TaskAppView[]>;
  loadingTaskIds: Record<string, boolean>;
  launching: boolean;
  error: string | null;
  loadByTaskId(taskId: string): Promise<void>;
  addApp(taskId: string): Promise<void>;
  updateAppName(id: string, appName: string): Promise<void>;
  deleteApp(id: string): Promise<void>;
  startTask(taskId: string): Promise<void>;
};
```

`TaskAppView` may include derived UI state:

- `missing: boolean`
- `launching: boolean`
- `lastLaunchError: string | null`

### Data Flow: Add App

```text
UI Add App
-> file picker
-> validate selected path/type
-> create TaskApp metadata
-> insert task_apps row
-> reload selected task apps
```

### Data Flow: Start Task

```text
UI Start Task
-> taskAppStore.startTask(taskId)
-> load persisted task apps
-> validate paths
-> appLauncher.launch(taskApp)
-> update success/error state
```

UI components should not directly call shell APIs, Rust launch commands, or SQLite. They should call store actions.

## 9. UI Minimal Boundary

Phase 5B UI should make small additions to TaskDetail only:

- Add an Apps section.
- Add App button.
- App item displays:
  - `app_name`
  - path or shortened path
  - missing/broken status
- Editable display name.
- Start Task button.
- Delete app binding button.
- Launch error state.

Desktop Pin Mode:

- Recommended MVP: do not display the app list.
- Optional low-cost addition: show app count only.
- Do not add launch controls to Desktop Pin Mode in MVP.

No overall visual redesign is required.

## 10. Error Handling

### Path Does Not Exist

- Mark binding as missing.
- Disable or skip launch for that binding.
- Show a concise error.
- Do not delete metadata automatically.

### Unsupported File Type

- Reject before insert.
- Supported MVP extensions: `.exe`, `.lnk`.
- Do not write invalid metadata.

### User Cancels Selection

- No-op.
- Do not set an error unless the picker itself fails.
- Do not insert database rows.

### Launch Failure

- Capture and display error.
- Do not crash.
- Do not change task completion or task data automatically.

### Permission Denied

- Show launch failed / permission denied message.
- Keep app binding metadata intact.

### `.lnk` Cannot Be Resolved Or Launched

- Treat as launch failure.
- Keep metadata.
- Mark item with an error state if the failure is persistent.

### App Moved Or Uninstalled

- Mark missing when path validation fails.
- Let user delete and re-add the binding.

### Multiple Apps Partially Fail

- Launch available valid apps.
- Report which apps failed.
- Do not rollback already launched apps.

### Database Write Failure

- Keep UI state consistent.
- Surface store error.
- Do not show unsaved binding as persisted.

## 11. Test Plan

Schema/repository tests:

- Schema migration from version `2` to version `3`.
- `task_apps` table exists.
- `schema_version` updates to `3`.
- Existing v0.4 task and attachment data are preserved.
- Insert/load/delete task app.
- `listByTaskId` returns `sort_order` order.
- Invalid `app_kind` is rejected.
- Task deletion cascades `task_apps`.
- `PRAGMA foreign_keys = ON` remains active.

Store/adapter tests:

- User cancel selection does not write database rows.
- Valid `.exe` selection inserts metadata.
- Valid `.lnk` selection inserts metadata.
- Invalid extension is rejected.
- Missing path is represented as `missing`.
- Start Task launcher mock success.
- Start Task launcher mock failure.
- Multiple app launch partial failure is surfaced.
- Stale load for one selected task does not overwrite another selected task's app list.

Regression tests:

- Existing task CRUD and save queue still pass.
- Attachment metadata repository still passes.
- Image import/copy/delete still passes.
- Lightbox open/close tests still pass.
- Desktop Pin Mode remains unaffected.

## 12. Phase 5B Implementation Acceptance Standards

Phase 5B should be accepted only if:

- `npm test` passes.
- `npm run build` passes.
- `cargo check` passes.
- `npm run tauri dev` starts the desktop app.
- User can manually bind an app to a task.
- Bound app remains after restart.
- Clicking Start Task opens the bound app.
- Missing app path does not crash the app.
- Deleting a task removes `task_apps` metadata.
- Existing task CRUD, save queue, filters, Desktop Pin Mode, image attachments, and Lightbox still work.
- No screenshots, AI, voice input, tray, global shortcuts, or automatic scanning were added.
- No abnormal Git files are produced.

## 13. Later Enhancement Route

Later optional enhancements:

- Start menu shortcut scanning.
- Registry-based installed app discovery.
- Microsoft Store app discovery.
- Recent apps list.
- App icon extraction.
- Launch multiple apps with per-app delay or launch groups.
- Task execution workspace.
- Launch argument templates.
- AI-generated task steps based on task content and bound apps.

These are explicitly outside MVP and should not be implemented in Phase 5B unless a new design phase approves them.

