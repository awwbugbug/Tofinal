# ToFinal Phase 6A Screenshot Capture Design

Date: 2026-06-12

## 1. Current Baseline State

- Current stable baseline: `v0.5b-task-app-binding-baseline`.
- Current persistence uses SQLite at `sqlite:tofinal.db`.
- Current SQLite schema version is `3`.
- Current schema includes `tasks`, `task_attachments`, and `task_apps`.
- `task_attachments.kind` already supports `image` and `screenshot`.
- Current app already supports:
  - SQLite task persistence.
  - Image attachment metadata.
  - Local image import, copy, preview, and delete.
  - Image Lightbox preview.
  - Task app binding.
  - User-triggered Start Task for bound apps.
- Current app does not support:
  - Screenshot capture.
  - Screenshot region selection.
  - OCR.
  - AI.
  - Global shortcut.
  - System tray.

Phase 6A is design-only. It defines how screenshot capture should reuse the existing attachment system.

## 2. Phase 6A Scope

Phase 6A designs:

- Screenshot capture approach.
- Screenshot file storage path.
- Screenshot metadata insertion.
- Relationship to existing `task_attachments`.
- Minimal UI boundary.
- Tauri / Rust permission boundary.
- Error handling.
- Test plan.
- Phase 6B acceptance criteria.

Phase 6A does not design or implement:

- OCR.
- AI image understanding.
- Image editing.
- Annotation tools.
- Scrolling screenshots.
- Video recording.
- Cloud sync.
- Automatic screenshots.
- Background screen monitoring.
- Global shortcuts.
- System tray.

## 3. User Scenarios

### Add Screenshot To Current Task

1. User opens a task in TaskDetail.
2. User clicks Add Screenshot.
3. App captures the selected MVP target.
4. App writes a PNG into ToFinal-owned AppData attachment storage.
5. App inserts a `task_attachments` row with `kind = 'screenshot'`.
6. The screenshot appears in the same attachment list as imported images.

### Restart Persistence

1. User adds a screenshot to a task.
2. User restarts ToFinal.
3. The screenshot attachment still appears because metadata is in SQLite and the PNG is in AppData.

### Lightbox Reuse

1. User clicks the screenshot thumbnail.
2. Existing Lightbox opens the screenshot image.
3. No screenshot-specific preview path is required.

### Delete Screenshot Attachment

1. User deletes the screenshot attachment.
2. Existing attachment delete flow removes metadata and attempts file cleanup.
3. Restarting ToFinal does not show the deleted screenshot.

### Delete Task With Screenshots

1. User deletes a task.
2. SQLite foreign-key cascade removes `task_attachments` metadata.
3. Existing task attachment cleanup should attempt to remove screenshot PNG files.
4. If file cleanup fails, the file becomes an orphan cleanup candidate; the task must not be resurrected.

### Screenshot Failure

If screenshot capture or file writing fails, the app shows an error and leaves existing tasks, attachments, and app bindings unchanged.

## 4. Screenshot MVP Boundary

### Option A: Full-Screen Screenshot MVP

- Complexity: medium.
- Windows feasibility: good with a Rust screenshot crate or Windows APIs.
- Tauri/Rust permissions: narrow custom command permission plus AppData file write path.
- User value: good enough for quickly capturing visible work context.
- Testing difficulty: moderate; adapter can be mocked.
- Existing attachment impact: minimal, because the result is a PNG file plus metadata row.
- Region screenshot expansion cost: moderate; later phases can add a region selector before writing the same attachment output.

### Option B: Current Window Screenshot MVP

- Complexity: medium to high.
- Windows feasibility: depends on reliable target window identification.
- Tauri/Rust permissions: likely similar to full-screen capture, plus window-handle complexity.
- User value: narrower than full-screen; may miss related context outside the app.
- Testing difficulty: higher due to platform/window focus behavior.
- Existing attachment impact: minimal after capture succeeds.
- Region screenshot expansion cost: similar to Option A.

### Option C: Mouse Drag Region Screenshot MVP

- Complexity: high.
- Windows feasibility: possible, but needs overlay window, coordinate mapping, multi-monitor handling, cancellation, and input capture.
- Tauri/Rust permissions: custom overlay/window behavior plus capture.
- User value: highest precision.
- Testing difficulty: high, especially for drag and multi-monitor scenarios.
- Existing attachment impact: still minimal after capture succeeds.
- Region screenshot expansion cost: already included, but initial implementation risk is much higher.

### Recommendation

Use Option A, full-screen screenshot MVP, for Phase 6B.

Reasoning:

- It provides real screenshot value with the smallest reliable implementation surface.
- It avoids overlay-window and coordinate complexity.
- It keeps Phase 6B focused on capture -> AppData PNG -> `task_attachments`.
- It can later evolve into region capture without changing storage or metadata.

Privacy rule: full-screen screenshot must only happen after an explicit user click. No automatic, periodic, background, tray, or global-shortcut screenshot behavior belongs in Phase 6B.

## 5. File Storage Strategy

Screenshot files must use the existing attachment directory structure:

```text
app_data/
  attachments/
    images/
      <taskId>/
        <attachmentId>.png
```

Rules:

- Save screenshots as PNG.
- Do not save screenshots into the project directory.
- Do not write screenshots into the Git working tree.
- Do not store screenshots as SQLite blobs.
- SQLite stores metadata only.
- Reuse the existing `relative_path` convention from `attachmentFileStorage`.
- Example `relative_path`: `attachments/images/<taskId>/<attachmentId>.png`.
- `original_name` should use a generated name such as `screenshot-YYYYMMDD-HHMMSS.png`.
- `stored_name` should be `<attachmentId>.png`.
- `mime_type` must be `image/png`.
- `kind` must be `screenshot`.

Phase 6B should extend the existing file storage adapter or add a screenshot-specific helper beside it, but the resulting file must follow the same attachment path rules.

## 6. SQLite Metadata Design

Do not add a screenshot-specific table.

Continue using `task_attachments`:

```sql
id TEXT PRIMARY KEY
task_id TEXT NOT NULL
kind TEXT NOT NULL CHECK (kind IN ('image', 'screenshot'))
original_name TEXT NOT NULL
stored_name TEXT NOT NULL
relative_path TEXT NOT NULL
mime_type TEXT NOT NULL
size_bytes INTEGER NOT NULL
width INTEGER NULL
height INTEGER NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
sort_order INTEGER NOT NULL
FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
```

Recommended metadata values for screenshots:

- `kind = 'screenshot'`
- `mime_type = 'image/png'`
- `original_name = screenshot-YYYYMMDD-HHMMSS.png`
- `stored_name = <attachmentId>.png`
- `relative_path = attachments/images/<taskId>/<attachmentId>.png`
- `width` and `height` should be saved if the capture adapter can provide them cheaply; otherwise `null` is acceptable for MVP.

Schema decision:

- No schema upgrade is required for Phase 6B if no new fields are added.
- Keep `schema_version = 3`.
- Only introduce `schema_version = 4` if Phase 6B discovers a concrete metadata field that cannot be represented by the existing table. The current recommendation is not to add one.

## 7. Repository / Store Design

Reuse:

- `sqliteAttachmentRepository`
- `attachmentFileStorage` path conventions
- `attachmentStore`
- Existing attachment preview and delete flows

Add:

- `screenshotCapture` adapter/service.
- Tauri command wrapper for capture.

Recommended data flow:

```text
UI Click Add Screenshot
-> screenshotCapture.capture()
-> write PNG into AppData attachments/images/<taskId>/<attachmentId>.png
-> build TaskAttachment metadata with kind = "screenshot"
-> insert via existing sqliteAttachmentRepository
-> reload current task attachments
-> existing thumbnail and Lightbox display it
```

Store recommendation:

- Do not create a new global screenshot store.
- Extend `attachmentStore` with a focused `addScreenshotAttachment(taskId)` action.
- Keep screenshot-specific state small: `capturing: boolean` and reuse attachment `error`.
- Do not put screenshots in `taskStore`.
- Do not load screenshots in Desktop Pin Mode.

## 8. Tauri / Rust Implementation Options

### Option A: Rust Command With Windows APIs / Screenshot Crate

- Permissions: narrow custom command plus existing AppData file writing if file writing remains frontend-side, or custom command writes bytes directly to AppData.
- Security: good, because capture is exposed as a single user-triggered command.
- Windows compatibility: good if a maintained screenshot crate or explicit Windows APIs are selected.
- Packaging complexity: medium; native dependencies must be checked.
- Performance: good for MVP full-screen capture.
- Region expansion: possible later by accepting capture bounds.
- Testing: good with frontend adapter mocks and Rust command smoke tests where feasible.

### Option B: Tauri Plugin Or JS/Web API

- Permissions: depends on plugin availability and browser capabilities.
- Security: variable.
- Windows compatibility: uncertain for desktop screen capture from WebView.
- Packaging complexity: low if plugin exists and is maintained; otherwise uncertain.
- Performance: acceptable if supported.
- Region expansion: plugin-dependent.
- Testing: adapter can be mocked, but real capture behavior may be harder to control.

### Option C: External Command / System Tool

- Permissions: likely needs shell/process execution.
- Security: weaker, especially if command strings or external tools are involved.
- Windows compatibility: depends on external availability.
- Packaging complexity: high or brittle.
- Performance: variable.
- Region expansion: tool-dependent.
- Testing: brittle.

### Recommendation

Use Option A: a narrow Rust command for user-triggered full-screen capture.

Rules:

- Do not use broad shell.
- Do not call external uncontrolled commands.
- Do not add background screen monitoring.
- Do not add global shortcut or tray capture in Phase 6B.
- Do not upload screenshots.
- Do not send screenshots to AI.
- The command should either return PNG bytes plus dimensions to the frontend storage adapter, or write the PNG into the app-owned attachment path and return metadata. Prefer the simpler implementation after checking the chosen Rust capture library's API, but keep the final metadata in `task_attachments`.

## 9. UI Minimal Boundary

Phase 6B should make the smallest UI addition:

- Add an Add Screenshot button in TaskDetail's Attachments section.
- Screenshot success adds an item to the same attachment list.
- Screenshot thumbnail is rendered like any other image attachment.
- Lightbox uses the existing attachment preview URL.
- Delete uses the existing attachment delete action.
- Desktop Pin Mode does not show screenshot previews.
- No screenshot editor, annotation toolbar, crop UI, or OCR panel.

## 10. Privacy And Security Boundary

- Screenshots may contain sensitive information.
- Capture must only occur after an explicit user click.
- No background automatic screenshots.
- No periodic screenshots.
- No tray-triggered screenshot in Phase 6B.
- No global shortcut screenshot in Phase 6B.
- No cloud upload.
- No AI processing.
- Screenshots are stored only in local ToFinal AppData.
- Delete removes metadata and attempts to delete the copied screenshot file.
- If deletion fails, record it as orphan cleanup debt; do not resurrect deleted metadata.

## 11. Error Handling

Phase 6B must handle:

- User cancels screenshot flow.
- Screenshot permission is denied or unavailable.
- Screenshot capture fails.
- Multi-monitor capture fails or returns unexpected coordinates.
- PNG encoding fails.
- AppData directory is not writable.
- Screenshot file write fails.
- Metadata insert fails.
- File write succeeds but metadata insert fails.
- Metadata insert succeeds but preview fails.
- Screenshot file delete fails.

Recommended handling:

- Cancellation is a no-op.
- Capture/write/metadata errors surface through the Attachments section error state.
- If file write succeeds but metadata insert fails, attempt to delete the written PNG.
- If metadata insert succeeds but preview fails, show existing broken/missing attachment state.
- Existing task data must not be modified on screenshot failure.

## 12. Test Plan

Phase 6B should add or update tests for:

- `screenshotCapture` adapter mock success.
- `screenshotCapture` adapter mock failure.
- Screenshot file metadata construction.
- `kind = 'screenshot'` insertion into `task_attachments`.
- Screenshot appears in `listByTaskId`.
- Lightbox opens a screenshot attachment.
- Deleting screenshot attachment removes metadata from future loads.
- File write success plus metadata failure triggers file cleanup.
- Task deletion cascades screenshot metadata.
- Existing image attachment import/copy/delete still works.
- Existing Lightbox tests still pass.
- Existing task app binding and Start Task tests still pass.
- Existing task CRUD/save queue tests still pass.

## 13. Phase 6B Acceptance Criteria

- `npm test` passes.
- `npm run build` passes.
- `cargo check` passes.
- `npm run tauri dev` starts the desktop app.
- User can click Add Screenshot from TaskDetail.
- Screenshot is saved as an attachment for the current task.
- Restarting the app still shows the screenshot.
- Clicking screenshot thumbnail opens the existing Lightbox.
- Deleting screenshot and restarting does not show it again.
- Deleting a task removes screenshot metadata.
- Screenshot files are stored in AppData, not the repository.
- Git working tree does not contain screenshot files, `tofinal.db`, `*.db`, or `*.sqlite`.
- Existing image attachments, Lightbox, task app binding, Start Task, and task CRUD/save behavior are not broken.

## 14. Future Enhancements

These are explicitly outside Phase 6B:

- Region screenshot.
- Screenshot annotation.
- Quick note after screenshot.
- Global shortcut screenshot.
- Tray quick screenshot.
- OCR.
- AI screenshot summary.
- AI-generated task steps from screenshot content.

All future screenshot variants should continue writing files into the same attachment storage and inserting rows into `task_attachments`.
