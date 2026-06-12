# ToFinal Phase 6C Screenshot Editor Design

Date: 2026-06-12

## 1. Current Baseline State

Current stable baseline: `v0.6b-screenshot-attachments-baseline`.

The app already has:

- SQLite task persistence.
- `task_attachments.kind = "screenshot"`.
- `attachmentFileStorage` for AppData attachment files.
- `attachmentStore` for selected-task attachment state.
- Local image import, copy, preview, and delete.
- Full-screen screenshot attachment MVP.
- Existing image/screenshot Lightbox preview.
- Existing image attachment delete flow.
- Task app binding and user-triggered Start Task.
- Screenshot UI repair for narrow DetailPanel widths.

The app does not currently have:

- Screenshot editor / preview overlay.
- Region crop selection inside an editor.
- Screenshot annotation.
- OCR.
- AI screenshot analysis.
- Global shortcut screenshot.
- Tray screenshot.
- Background screenshot capture.

Phase 6C is design-only. It changes the product direction from separate full-screen and region screenshot entry points to one unified Screenshot entry that opens a screenshot editor.

## 2. Final UI Entry Strategy

TaskDetail Attachments should expose only two attachment actions:

```text
[ Add Image ] [ Screenshot ]
```

The Screenshot button is the only screenshot entry point.

Rules:

- Do not add a separate Region Screenshot button.
- Do not add a screenshot mode menu.
- Do not ask the user to choose Full Screen or Select Region before capture.
- Clicking Screenshot captures the current full screen first.
- After capture, ToFinal opens a Screenshot Editor / Preview Overlay.
- The user decides inside the editor whether to crop.
- Confirm with no crop saves the full screenshot.
- Confirm with a valid crop saves the cropped region.
- Cancel or Escape saves nothing and writes no metadata.

Reasoning:

- User mental model is simpler: one Screenshot button.
- DetailPanel space is limited, so avoiding button/menu growth matters.
- Cropping is an editing decision after capture, not a mode decision before capture.
- Future annotation, OCR, quick note, or AI review can naturally live inside the screenshot editor.
- The architecture still maximizes reuse of full-screen capture, attachment storage, thumbnail preview, Lightbox, and delete flow.

## 3. Phase 6C Scope

Phase 6C designs:

- Unified Screenshot button behavior.
- Screenshot Editor / Preview Overlay.
- Optional rectangular crop selection.
- Confirm / Cancel / Escape / Reset Crop behavior.
- Coordinate model.
- DPI scaling handling.
- Multi-monitor handling.
- Temporary screenshot handling.
- Screenshot crop flow.
- File storage path.
- `task_attachments` metadata insertion.
- Error handling.
- Test plan.
- Acceptance criteria.

Phase 6C does not design or implement:

- Screenshot annotation tools.
- OCR.
- AI.
- Scrolling screenshots.
- Video recording.
- Automatic screenshots.
- Global shortcut screenshots.
- System tray screenshots.
- Cloud sync.

## 4. User Scenarios

### Save Full Screenshot Without Cropping

1. User opens a task in TaskDetail.
2. User clicks Screenshot.
3. ToFinal captures the current full screen as temporary screenshot data.
4. ToFinal opens the Screenshot Editor with a full-screen screenshot preview.
5. User does not draw a crop rectangle.
6. User clicks Confirm.
7. ToFinal saves the full screenshot PNG as a current-task attachment.
8. The screenshot appears in the existing attachment list.

### Save Cropped Screenshot

1. User clicks Screenshot.
2. ToFinal captures the current full screen as temporary screenshot data.
3. ToFinal opens the Screenshot Editor.
4. User drags a rectangular crop area over the preview.
5. User clicks Confirm.
6. ToFinal crops the temporary screenshot to the selected region.
7. ToFinal saves the cropped PNG as a current-task attachment.
8. The screenshot appears in the existing attachment list.

### Reset Crop And Save Full Screenshot

1. User draws a crop rectangle in the editor.
2. User clicks Reset Crop.
3. The crop rectangle is cleared.
4. User clicks Confirm.
5. ToFinal saves the full screenshot.

### Cancel With Escape

1. User clicks Screenshot.
2. Screenshot Editor opens.
3. User presses Escape.
4. Editor closes.
5. No PNG is saved.
6. No `task_attachments` row is inserted.

### Cancel With Button

1. User opens Screenshot Editor.
2. User clicks Cancel.
3. Editor closes without writing a file or metadata.

### Small Crop Selection

1. User draws a tiny crop area below the minimum size.
2. Editor marks the crop invalid.
3. Confirm should either be blocked for that crop or save full screenshot only after Reset Crop.
4. No invalid cropped attachment is generated.

### Restart Persistence

1. User confirms a full or cropped screenshot.
2. User restarts ToFinal.
3. Screenshot still appears because PNG is in AppData and metadata is in SQLite.

### Lightbox Reuse

1. User clicks the screenshot thumbnail.
2. Existing Lightbox opens the image.
3. No screenshot-editor-specific Lightbox is needed.

### Delete Screenshot

1. User deletes the screenshot attachment.
2. Existing attachment delete flow removes metadata and attempts file cleanup.
3. Restarting ToFinal does not show the deleted screenshot.

### Delete Task With Screenshots

1. User deletes a task that has screenshot attachments.
2. SQLite cascade removes screenshot metadata.
3. Existing task attachment cleanup attempts to remove screenshot PNG files.
4. If file cleanup fails, the file becomes orphan cleanup debt; the task must not be resurrected.

## 5. Screenshot Editor MVP

The Screenshot Editor should:

- Display the captured full-screen screenshot preview.
- Support mouse drag to draw a rectangular crop box.
- Support Confirm.
- Support Cancel.
- Support Escape to cancel.
- Support Reset Crop.
- Treat crop boxes below the minimum size as invalid.
- Save the full screenshot when Confirm is clicked with no crop.
- Save the cropped region when Confirm is clicked with a valid crop.

MVP editor behavior:

- Selection is rectangular only.
- Dragging left/up must normalize the rectangle.
- Crop bounds must clamp to the rendered screenshot preview.
- The editor should show a lightweight validation message if the crop is too small.
- The editor should keep the temporary screenshot in memory if practical.
- If a temporary file is required, it must live in AppData temp or another ToFinal-owned temp location and be deleted on confirm, cancel, or failure.

Out of scope for the editor MVP:

- Freeform selection.
- Screenshot annotation.
- Post-drag resize handles.
- OCR.
- AI.
- Scrolling screenshot.
- Video capture.
- Global shortcuts.
- Tray integration.

## 6. Implementation Options

### Option A: Frontend Tauri Overlay Window + Rust Capture/Crop

The frontend creates a transparent or semi-transparent Tauri overlay window. React renders the editor/selection UI. On Confirm, the frontend sends crop bounds to a Rust command or screenshot service that crops and returns or writes PNG output.

- Implementation complexity: medium to high.
- Windows feasibility: good with Tauri window controls and the existing Rust screenshot capture foundation.
- Tauri window management complexity: medium; requires a separate editor/overlay window lifecycle.
- Multi-monitor compatibility: moderate; easiest if first version works from the captured bitmap preview.
- DPI scaling risk: medium if using live screen coordinates; lower if using preview-to-bitmap mapping.
- Coordinate conversion difficulty: medium.
- Testing difficulty: medium; crop math and store flow can be tested with mocks, real overlay behavior needs manual QA.
- Reuse of existing full-screen screenshot: good.
- Annotation extensibility: good; React overlay can later host annotation controls.

### Option B: Native Rust Transparent Overlay + Capture/Crop

Rust owns the translucent overlay, input handling, selection rectangle, crop, and PNG output. The frontend only starts the flow and receives a result.

- Implementation complexity: high.
- Windows feasibility: possible, but requires more platform-specific native window/input work.
- Tauri window management complexity: lower on the frontend, higher in Rust.
- Multi-monitor compatibility: potentially strong if built carefully, but more native code is required.
- DPI scaling risk: lower if the Rust layer uses native physical coordinates consistently.
- Coordinate conversion difficulty: medium.
- Testing difficulty: high; native UI interaction is harder to automate.
- Reuse of existing full-screen screenshot: moderate.
- Annotation extensibility: weaker for React-based UI; future annotation would need native UI or a second frontend layer.

### Option C: Full-Screen Capture First + Screenshot Editor Crop

When the user clicks Screenshot, ToFinal captures a full-screen screenshot first, shows that captured bitmap in a frontend Screenshot Editor, collects optional crop bounds over the preview, maps those bounds into the screenshot bitmap, and saves either the full bitmap or the cropped result on Confirm.

- Implementation complexity: medium.
- Windows feasibility: good because Phase 6B already captures full-screen screenshots.
- Tauri window management complexity: medium; still needs editor/overlay presentation.
- Multi-monitor compatibility: tied to the full-screen screenshot bitmap produced by the existing command.
- DPI scaling risk: lower because selection occurs over a scaled preview of the actual bitmap.
- Coordinate conversion difficulty: medium; map preview pixels to bitmap pixels.
- Testing difficulty: good; crop math can be unit tested with deterministic bitmap dimensions.
- Reuse of existing full-screen screenshot: strongest.
- Annotation extensibility: good; the editor can later become an annotation canvas.

### Recommendation

Recommend Option C for the Phase 6C MVP.

Reasoning:

- It preserves full-screen screenshot capability through Confirm without crop.
- It avoids a separate mode choice before capture.
- It reuses the existing Rust full-screen capture path most directly.
- It avoids the hardest live-screen coordinate conversion problem for the first editor version.
- It makes DPI handling more deterministic by mapping from editor preview coordinates to captured bitmap coordinates.
- It still outputs the same final artifact: a PNG saved through the attachment system with `kind = "screenshot"`.
- It leaves a natural path toward future annotation, OCR, quick notes, or AI review inside the editor.

Option A is the best later upgrade if live screen selection is required before capture. Option B is not recommended for MVP because it moves too much UI/input complexity into native code.

## 7. MVP Recommendation

The Phase 6C MVP should:

- Replace separate screenshot entry points with one Screenshot button.
- Keep Add Image as the other attachment action.
- Capture the current full screen through the existing screenshot command.
- Open Screenshot Editor with the captured preview.
- Let the user optionally drag a rectangular crop selection.
- Let the user click Reset Crop to clear the crop.
- Let the user click Confirm.
- If a valid crop exists, crop the captured image.
- If no crop exists, use the full captured image.
- Save the final PNG through existing attachment storage.
- Insert metadata through existing `sqliteAttachmentRepository`.
- Reload selected task attachments.

The first editor version should only support:

- Rectangular crop selection.
- Mouse drag to select.
- Confirm.
- Cancel.
- Escape cancel.
- Reset Crop.
- Minimum crop size.

The first editor version should not support:

- Freeform selection.
- Annotation.
- Post-drag resize handles.
- Scrolling screenshot.
- Video capture.
- OCR.
- AI image analysis.

## 8. Temporary Screenshot Policy

The initial full-screen capture is temporary until the user confirms.

Rules:

- Do not insert `task_attachments` before Confirm.
- Do not write the final attachment PNG before Confirm.
- Cancel must leave no metadata.
- Escape must leave no metadata.
- If the editor uses in-memory PNG bytes or an image buffer, clear it when the editor closes.
- If the editor uses a temporary file, store it only in AppData temp or another ToFinal-owned temp location.
- Temporary screenshots must never be written into the Git working tree.
- Temporary files must be deleted on Confirm, Cancel, Escape, and failure.
- Final storage should contain only the one PNG produced by Confirm.

Failure cases:

- If final PNG write succeeds but metadata insert fails, attempt to delete the final PNG.
- If temp cleanup fails, surface an error or record technical debt; do not resurrect metadata.

## 9. Coordinate And Crop Design

The editor must explicitly distinguish:

- CSS pixels: coordinates used by the React editor overlay.
- Device-independent window coordinates: Tauri/WebView window layout units.
- Physical bitmap pixels: pixels in the captured screenshot PNG.

Key risks:

- Windows DPI scaling can make CSS pixel bounds differ from physical screenshot pixels.
- Multi-monitor setups can include negative screen coordinates.
- Mixed-DPI monitors can make direct screen-coordinate math unreliable.
- If the captured bitmap contains multiple monitors, the preview may be letterboxed or scaled.

Recommended MVP coordinate model:

1. Capture the full screenshot first.
2. Render the captured bitmap in the editor preview.
3. Track the rendered image rectangle in CSS pixels.
4. Track the optional crop rectangle in CSS pixels relative to that rendered image.
5. If no crop exists, use the full bitmap.
6. If a crop exists, map crop bounds to bitmap pixels using:

```text
scaleX = bitmapWidth / renderedImageWidth
scaleY = bitmapHeight / renderedImageHeight
cropX = round((selectionLeft - imageLeft) * scaleX)
cropY = round((selectionTop - imageTop) * scaleY)
cropWidth = round(selectionWidth * scaleX)
cropHeight = round(selectionHeight * scaleY)
```

Crop rules:

- Selection bounds must be clamped to the rendered screenshot preview.
- Dragging left/up must normalize the rectangle.
- Crop dimensions must be clamped to bitmap bounds after scaling.
- Crop smaller than the minimum size must be invalid.
- Reset Crop clears the selection and returns Confirm to full-screenshot behavior.

Primary monitor versus multi-monitor:

- Preferred MVP: support whatever bitmap the existing full-screen screenshot command returns.
- If the screenshot command returns a combined multi-monitor bitmap, the editor should show that full bitmap scaled to fit.
- If previewing the combined bitmap is too complex, explicitly limit Phase 6C MVP to the primary monitor and record that limitation in UI/helper text and `docs/TECH_DEBT.md`.
- Future multi-monitor expansion can add per-monitor preview, monitor selection, or native monitor bounds mapping.

## 10. Screenshot Editor Interaction Design

The editor should:

- Use a focused overlay or modal-style editor window.
- Show the captured screenshot preview.
- Show Confirm, Cancel, and Reset Crop controls.
- Start crop selection on mouse down over the preview.
- Update crop rectangle on mouse move.
- End crop selection on mouse up.
- Cancel on Escape.
- Optionally cancel on right click.
- Prevent accidental tiny crops with a minimum size such as `16x16` physical pixels.
- Show a lightweight error if the crop is too small.

Confirm behavior:

- No crop: save full screenshot.
- Valid crop: save cropped region.
- Invalid crop: block Confirm or prompt the user to Reset Crop / reselect.

Capturing editor itself:

- In the recommended Option C, the screenshot is captured before the editor opens, so the editor cannot be captured into the screenshot.
- If a later version captures after selection, it must hide the editor and delay capture briefly before reading the screen.

ToFinal main window behavior:

- MVP should not hide or minimize the main ToFinal window unless product review requires it.
- Because Option C captures before showing the editor, the current screen state is captured exactly when the user clicks Screenshot.
- If the main window should not appear in captures, a later option can hide the main window before capture and restore it afterward. That should be a separate design decision because it changes user expectations.

## 11. Screenshot File And Metadata

Confirmed screenshots continue using the existing attachment file path:

```text
app_data/
  attachments/
    images/
      <taskId>/
        <attachmentId>.png
```

Metadata uses existing `task_attachments`:

- `kind = "screenshot"`
- `mime_type = "image/png"`
- `original_name = screenshot-YYYYMMDD-HHMMSS.png`
- `stored_name = <attachmentId>.png`
- `relative_path = attachments/images/<taskId>/<attachmentId>.png`
- `width = final saved image width`
- `height = final saved image height`
- `size_bytes = final PNG byte length`
- `sort_order = next attachment sort order for task`

Schema decision:

- Do not add a screenshot table.
- Do not add screenshot-specific columns.
- Do not upgrade SQLite schema.
- Keep `schema_version = 3`.

## 12. Repository / Store Design

Reuse:

- `sqliteAttachmentRepository`
- `attachmentFileStorage`
- `attachmentStore`
- Existing Lightbox
- Existing delete attachment flow

Add:

- `screenshotEditor` or equivalent editor component.
- Optional crop selection controller.
- Cropping helper for bitmap-space selection bounds.
- Screenshot editor service/adapter that returns final PNG bytes and dimensions after Confirm.
- Rust command wrapper only if crop is done in Rust; otherwise frontend can pass final PNG bytes to existing file storage.

Recommended `attachmentStore` additions:

- `addScreenshotAttachment(taskId): Promise<void>` can evolve into the unified flow, or a new internal action can call the editor.
- `screenshotEditing: boolean` or reuse existing `capturing` if the state remains clear.
- Reuse existing `error` for failures.

Do not add:

- A global `screenshotStore`.
- Screenshot data in `taskStore`.
- Screenshot-specific metadata tables.
- Screenshot-specific file storage roots.

Recommended data flow:

```text
UI click Screenshot
-> capture full-screen screenshot as temporary image/buffer
-> open screenshot editor
-> user optionally selects crop region
-> user confirms
-> if crop exists, crop to selected region
-> if no crop exists, use full screenshot
-> save final PNG into app data attachment path
-> insert task_attachments row with kind = "screenshot"
-> reload current task attachments
-> existing thumbnail / Lightbox / delete flow handles result
```

Cancel data flow:

```text
UI click Screenshot
-> capture temporary image/buffer
-> open screenshot editor
-> user clicks Cancel or presses Escape
-> close editor
-> cleanup temporary image/buffer or temp file
-> do not write final PNG
-> do not insert metadata
```

## 13. Rust / Tauri Permission Design

Phase 6C may need:

- Tauri window permissions to create/show/hide/focus/close an editor or overlay window.
- Screenshot command permission for the existing or extended screenshot command.
- Existing AppData filesystem permissions for final attachment writes.
- Optional AppData temp access if temporary files are used.

Phase 6C should not need:

- Shell permission.
- Clipboard permission.
- Notification permission.
- Global shortcut permission.
- Tray permission.
- Broad filesystem access.

Rules:

- Screenshot capture can only be triggered by explicit user click.
- Editor/overlay must not run as a background resident process.
- Screenshots must not be uploaded.
- Screenshots must not be sent to AI.
- Editor lifecycle should be short: open for review/crop, then close/destroy.
- If an editor window is created, capabilities should target only the required window operations and not open unrelated Tauri permissions.

## 14. Error Handling

Phase 6C must handle:

- User presses Escape.
- User clicks Cancel.
- User clicks Reset Crop.
- User crop is too small.
- Editor creation fails.
- Editor does not display the captured preview.
- DPI coordinate conversion fails.
- Multi-monitor bitmap preview is unsupported or invalid.
- Full-screen capture fails.
- Crop fails.
- PNG encoding fails.
- Temporary file write or cleanup fails.
- Final file write fails.
- Metadata insert fails.
- Final file write succeeds but metadata insert fails.
- Metadata insert succeeds but preview fails.

Required behavior:

- Cancel is a no-op for persistence: no final file and no metadata.
- Escape is a no-op for persistence: no final file and no metadata.
- Reset Crop clears crop state and makes Confirm save the full screenshot.
- Small crop must not create an invalid cropped attachment.
- Failure must not modify task data.
- Failure must not remove or corrupt existing attachments.
- If final file write succeeds but metadata insert fails, attempt to delete the final PNG.
- If metadata succeeds but preview fails, show existing broken/missing attachment state.
- The app must not crash.

## 15. Test Plan

Phase 6C should add tests for:

- Screenshot button is the only screenshot entry in Attachments.
- Screenshot click opens editor with captured preview.
- Confirm with no crop writes full screenshot metadata.
- Confirm with valid crop writes cropped screenshot metadata.
- Reset Crop followed by Confirm writes full screenshot metadata.
- Escape cancel does not write final file or metadata.
- Cancel button does not write final file or metadata.
- Crop bounds calculation.
- Dragging in all directions normalizes the rectangle.
- Selection is clamped to the screenshot preview.
- Small crop is rejected.
- Correct `kind = "screenshot"` metadata.
- Correct `width` and `height` from final saved image.
- Correct `original_name`, `stored_name`, and `relative_path`.
- Screenshot appears in `listByTaskId`.
- Lightbox opens screenshot attachment.
- Deleting screenshot removes metadata from future loads.
- Final file write success plus metadata failure triggers PNG cleanup.
- Temporary file cleanup on confirm/cancel/failure if temp files are used.
- Current full-screen screenshot behavior is preserved through no-crop Confirm.
- Image attachment import/copy/delete regression.
- Task app binding and Start Task regression.
- Task CRUD/save queue regression.

Manual QA should include:

- Confirm without crop.
- Confirm with crop.
- Reset Crop then Confirm.
- Small crop rejection.
- Escape cancellation.
- Cancel button.
- Primary monitor at 100% scaling.
- Primary monitor at non-100% scaling.
- Restart persistence.
- Deleting screenshot and task cleanup.
- If enabled, multi-monitor layout with a monitor at negative coordinates.

## 16. Phase 6C Implementation Acceptance Criteria

- `npm test` passes.
- `npm run build` passes.
- `cargo check` passes.
- `npm run tauri dev` starts the desktop app.
- Attachments area has one Screenshot button.
- Clicking Screenshot enters screenshot preview/editor mode.
- Confirm without crop saves the full screenshot.
- Drawing a crop and clicking Confirm saves the cropped region.
- Cancel does not create an attachment.
- Escape does not create an attachment.
- Reset Crop followed by Confirm saves the full screenshot.
- Tiny crop selections do not generate invalid cropped attachments.
- Restarting ToFinal still shows confirmed screenshots.
- Existing Lightbox opens screenshots.
- Deleting screenshot prevents it from reappearing after restart.
- Deleting a task removes screenshot metadata.
- Full Screenshot capability is preserved through no-crop Confirm.
- Screenshot button is not clipped in narrow DetailPanel widths.
- Image attachments still work.
- Task app binding and Start Task still work.
- Task save/edit/delete/filter behavior still works.
- Git working tree does not contain screenshot files, `tofinal.db`, `*.db`, or `*.sqlite`.

## 17. Future Enhancements

Out of scope for Phase 6C but possible later:

- Full multi-monitor editor support.
- Crop resize handles after drag.
- Screenshot annotation.
- Quick note after screenshot.
- Global shortcut screenshot.
- Tray-triggered screenshot.
- OCR.
- AI screenshot summary.
- AI-generated task steps from screenshot content.
- Scroll capture.
- Window-specific capture.

All future screenshot variants should keep the same storage contract:

```text
PNG
-> AppData attachments/images/<taskId>/<attachmentId>.png
-> task_attachments.kind = "screenshot"
-> existing TaskDetail attachment list
-> existing Lightbox
-> existing delete flow
```
