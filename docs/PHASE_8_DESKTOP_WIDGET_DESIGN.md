# ToFinal Phase 8A Desktop Widget Mode Redesign

Date: 2026-06-16

Current stable baseline: `v0.7b-preferences-baseline`.

Phase 8A is design-only. It defines a new product direction for the current Desktop Pin Mode and prepares the implementation plan for Phase 8B. It must not change runtime code, UI, Tauri configuration, SQLite schema, dependencies, MCP, AI, system tray behavior, global shortcuts, or Edge Dock auto-hide behavior.

## 1. Current Problem Diagnosis

The current Desktop Pin Mode does not yet behave like a real desktop widget.

Observed problems:

- The outer container is still visually and structurally a normal large app window.
- The center of that window contains a capsule/card, but the app still feels like a full window with a card inside.
- The mode does not visually merge into the desktop.
- It consumes nearly the same perceived space as a normal window.
- Users do not clearly perceive the value of a small widget mode.
- The title bar, large background, and window boundary create extra visual load.
- The product role is unclear: it is neither a complete task management window nor a lightweight desktop widget.

The core issue is that the current mode is a visual variant of the normal app, not a separate lightweight desktop surface.

## 2. Naming And Product Positioning

The current Desktop Pin Mode should be redefined as:

```text
Widget Mode
```

The future mode boundaries should be:

| Mode | Product role | Phase |
| --- | --- | --- |
| Normal Mode | Full task management window. | Existing |
| Widget Mode | Lightweight desktop task capsule widget. | Phase 8B target |
| Edge Dock Mode | Later screen-edge auto-hide tag/dock mode. | Future phase |

Phase 8A designs only Widget Mode. Edge Dock Mode remains a separate future concept and must not be implemented in Phase 8B.

## 3. Widget Mode Product Goals

Widget Mode should be a low-interruption task surface that can sit on the desktop without feeling like a full application window.

Primary goals:

- Low visual disturbance.
- Quick view of unfinished tasks.
- Quick task creation.
- Quick task completion.
- One-click return to Normal Mode.
- Act as a lightweight desktop task sticker.
- Avoid taking responsibility for full task management.

Widget Mode explicitly does not provide:

- Attachment management.
- Image preview.
- Screenshot Editor.
- App Binding management.
- Start Task.
- Full task detail editing.
- Complex filters.
- AI.
- MCP.
- Edge auto-hide.
- System tray integration.
- Global shortcuts.

## 4. Visual And Window Form Design

The target form is:

- The window itself should visually be the capsule/card.
- It should no longer be a large app background containing a centered capsule/card.
- Use a frameless transparent floating widget window where feasible.
- The outer window background should be transparent.
- Render only the `WidgetCard`.
- Avoid a system title bar or full minimize/maximize title-bar treatment.
- The card itself should be draggable.
- The actual window size should tightly fit the widget content.

Recommended first-version size:

- Collapsed/compact width: `320px` to `380px`.
- Height: `360px` to `520px`, controlled by content and task count.
- Do not allow the current `700px+` normal-window-like background in Widget Mode.

Non-goals:

- Do not embed into the real Windows desktop WorkerW/Progman layer.
- Do not use Windows desktop hacks.
- The first version is a transparent frameless floating window, not a true desktop-shell integration.
- Always-on-top should be treated as a later optional preference, not forced by default.

## 5. Widget Mode Content Boundary

The first Widget Mode version should include:

- `ToFinal` or `Today` identity.
- Unfinished task count.
- Quick-add task input.
- Add button.
- First 3 to 5 unfinished tasks.
- Completion checkbox for each visible task.
- Expand/Open Normal Mode button.
- Exit Widget Mode or close button.
- Existing theme and language preferences should continue to apply.

The first Widget Mode version should not include:

- Task note editing.
- Priority editing.
- Tag editing.
- Attachments.
- Screenshots.
- Lightbox.
- App Binding.
- Start Task.
- Settings panel.
- Search.
- Multi-column task list.
- AI actions.

This boundary keeps the widget focused on quick capture and quick completion.

## 6. Tauri Window Strategy

Three implementation strategies should be considered before Phase 8B.

| Option | Description |
| --- | --- |
| A | Reuse the current main window and change size/properties when switching to Widget Mode. |
| B | Use separate Tauri windows for Normal Mode and Widget Mode. |
| C | Render Widget Mode as a different visual layout inside the current window without changing real window properties. |

Comparison:

| Dimension | A. Reuse main window | B. Separate widget window | C. Layout-only switch |
| --- | --- | --- | --- |
| Implementation complexity | Medium | Medium to high | Low |
| Tauri v2 feasibility | Needs capability audit | Good if configured explicitly | High |
| Window state management | Medium complexity | Higher complexity, clearer separation | Low complexity |
| Mode switch stability | Depends on runtime property support | Stable if window lifecycle is well managed | Stable |
| Transparent window support | Must confirm runtime changes | Can configure widget window upfront | Does not solve outer window issue |
| Frameless support | Must confirm runtime changes | Can configure widget window upfront | Does not solve title/window chrome |
| Position persistence | Manage one window with mode-specific state | Manage two window states | Mostly cosmetic |
| Future Edge Dock extension | Possible but constrained | Better separation for future expansion | Weak |
| Risk to Normal Mode | Medium | Lower if isolated | Low, but product goal not met |

Recommendation:

- Phase 8B should first audit the current Tauri window capabilities and configuration.
- If runtime switching of size, transparency, and decorations is stable, Option A can be used first to reduce implementation surface.
- If runtime switching of `decorations` or `transparent` is not stable, use Option B with a separate widget window.
- Option C is not recommended as the final Phase 8B direction because it keeps the main product problem: Widget Mode would still be a layout inside a normal window.

The implementation decision must be made after checking the current Tauri v2 APIs, permissions, and app window configuration.

## 7. Mode Switch Design

### Normal Mode To Widget Mode

Expected flow:

1. User clicks Enter Widget Mode.
2. Save the current Normal Mode window state.
3. Resize the app to widget dimensions.
4. Hide the normal app background and render only `WidgetCard`.
5. Remove or hide system window decorations when supported.
6. Move the window to the previous Widget Mode position, or to a default safe area such as top-right or bottom-right.
7. Keep current tasks, theme, and language state intact.

### Widget Mode To Normal Mode

Expected flow:

1. User clicks Expand/Open Normal Mode.
2. Restore the previous Normal Mode size and position.
3. Restore the full `AppShell`.
4. Preserve task state.
5. Continue using the same task store and save queue.

### Failure Handling

Phase 8B should handle:

- Mode switch failure.
- Window resize failure.
- Transparent window unsupported.
- Decorations cannot be changed at runtime.
- Saved widget position outside the visible display area.
- Multi-monitor changes.
- DPI scaling changes.

Restart recommendation:

- Restart should default to Normal Mode.
- If the last exit happened in Widget Mode, the app may remember the last widget position, but should not automatically relaunch into Widget Mode in the first implementation.
- Reasoning: Normal Mode is safer for recovery if transparent/frameless behavior fails.

## 8. Position And Size Persistence

State worth preserving:

- Widget `x` and `y`.
- Widget `width` and `height`.
- Normal Mode `x` and `y`.
- Normal Mode `width` and `height`.
- Last mode, for future use.

Persistence options:

| Option | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| `localStorage` | No dependency, no schema change, easy failure handling. | Renderer-owned, not ideal for all window state. | Recommended first. |
| Tauri window state plugin | Purpose-built for window state. | Adds dependency/plugin surface. | Defer. |
| SQLite settings table | Durable and centralized. | Requires schema change and mixes UI settings with task data. | Avoid for Phase 8B. |

Recommended first key:

```text
tofinal.window.v1
```

Rules:

- Store this separately from `tofinal.preferences.v1`.
- Do not modify SQLite.
- Do not add dependencies.
- Window-state persistence failure must not block app startup.
- Clamp restored positions to visible screen bounds.
- If a saved position is off-screen, move the widget back to a safe visible area.
- If monitor layout or DPI changes, clamp size and position again.

## 9. Relationship With Preferences

Widget Mode should reuse existing preferences.

Rules:

- The theme preference applies to Widget Mode.
- The language preference applies to Widget Mode.
- Widget Mode must not introduce a separate theme setting.
- Widget Mode must not introduce a separate language setting.
- Widget Mode should render using the existing `resolvedTheme`.
- Widget Mode should render using the current language.

Coverage required:

- Dark mode widget readability.
- Light mode widget readability.
- English and Chinese strings fit inside the narrow widget.
- Buttons do not clip at compact width.
- System theme changes still update Widget Mode when theme is set to `system`.

## 10. Relationship With Task Data

Widget Mode should read and write through the existing task model.

Rules:

- Read from the existing `taskStore`.
- Write to the existing `taskStore`.
- Do not add task schema fields.
- Do not add a widget-specific task table.
- Quick-add tasks should become normal tasks.
- Checking a task complete should reuse existing task completion logic.
- Task saving should still go through the existing save queue.
- Do not bypass the SQLite repository.

The Widget Mode UI is a different interaction surface, not a separate data model.

## 11. Edge Dock Mode Is Deferred

Edge Dock Mode should be documented as a future mode and excluded from Phase 8B.

Possible future Edge Dock behavior:

- Attach to the top or side of the screen.
- Collapse into a small visible tag.
- Show unfinished task count on the tag.
- Expand when clicked.
- Collapse when clicking outside or pressing a close/collapse button.
- Consider hover-to-expand later, after click behavior is stable.

Phase 8B must not implement these behaviors.

## 12. Technical Risks

Phase 8B should explicitly validate these risks:

- Tauri transparent window support on Windows.
- Whether window `decorations` can be changed safely at runtime.
- Frameless drag region behavior.
- Window dragging inside a custom React card.
- Runtime window resize reliability.
- Click-through behavior around transparent background regions.
- Always-on-top interrupting normal user work.
- Multi-monitor position restore.
- DPI scaling and logical/physical size conversion.
- Windows taskbar overlap and safe visible areas.
- Whether screenshot hiding/minimizing logic is affected.
- Whether theme and language remain complete in Widget Mode.

Risk mitigation:

- Keep Normal Mode as the reliable fallback.
- Avoid automatic relaunch into Widget Mode at first.
- Store window state defensively.
- Treat transparent/frameless behavior as an audited capability, not an assumption.

## 13. Phase 8B Implementation Plan

Recommended implementation order:

1. Audit current Tauri window configuration and existing mode-switching code.
2. Choose Option A or Option B after confirming runtime window capability.
3. Extract a focused `WidgetCard` component.
4. Refactor Desktop Pin Mode styles to remove the outer large background.
5. Set Widget Mode dimensions.
6. Attempt transparent/frameless behavior.
7. Implement custom drag behavior for the widget card.
8. Save and restore widget position through `localStorage`.
9. Ensure quick-add and complete-task flows reuse existing task logic.
10. Verify return to Normal Mode.
11. Run regression tests for Screenshot Editor, attachments, preferences, app binding, and Start Task.
12. Perform manual visual acceptance on Windows.

Implementation guardrails:

- Do not change SQLite schema.
- Do not add dependencies unless a later phase explicitly approves them.
- Do not implement Edge Dock Mode.
- Do not implement tray or global shortcuts.
- Do not introduce AI or MCP.

## 14. Test Plan

Phase 8B should include at least these checks:

- Widget Mode renders only `WidgetCard`.
- Widget Mode does not show the Normal Mode three-column layout.
- Quick-add creates a task.
- Checking a task completes it.
- Unfinished task count is correct.
- Expand/Open returns to Normal Mode.
- Theme switching updates Widget Mode styles.
- Language switching updates Widget Mode text.
- Narrow width does not clip labels, buttons, or task rows.
- Task save queue still works.
- Screenshot Editor still works after returning to Normal Mode.
- Image attachments still work after returning to Normal Mode.
- App Binding and Start Task still work after returning to Normal Mode.
- Preferences still load and save.
- Restored widget position is clamped into visible screen bounds.
- Restart opens safely in Normal Mode.

Automated verification target:

```text
npm test
npm run build
cargo check
```

Manual verification target:

```text
npm run tauri dev
```

## 15. Phase 8B Acceptance Criteria

Phase 8B is acceptable only if:

- `npm test` passes.
- `npm run build` passes.
- `cargo check` passes.
- `npm run tauri dev` starts successfully.
- Widget Mode no longer displays the outer normal large window background.
- The window visually appears as one capsule/card widget.
- Widget Mode can quick-add tasks.
- Widget Mode can complete tasks.
- The unfinished task count is correct.
- The user can return to Normal Mode with one action.
- Normal Mode is not broken.
- Light, Dark, and System theme behavior remains correct.
- Chinese and English language switching remains correct.
- Screenshot Editor remains correct.
- Image attachments remain correct.
- Task App Binding and Start Task remain correct.
- SQLite schema does not change.
- No unexpected Git files or generated artifacts are introduced.

## 16. Follow-Up Roadmap

These items should be listed for later design or implementation, but not implemented in Phase 8B:

- Edge Dock Mode design.
- Edge Dock auto-hide tag.
- Always-on-top preference.
- Widget opacity preference.
- Widget compact/expanded size preference.
- Widget task limit setting.
- Task reminder badges.
- Tray integration.
- Global shortcut integration.
- MCP integration.
- AI integration.

## Summary

Phase 8A redefines Desktop Pin Mode as Widget Mode. The new direction is a lightweight transparent/frameless desktop task card that supports quick viewing, quick adding, quick completion, and one-click return to Normal Mode. It should reuse existing tasks, preferences, theme, language, and persistence logic while avoiding new schema, dependencies, tray behavior, shortcuts, Edge Dock behavior, AI, or MCP.

The main technical decision for Phase 8B is whether runtime window transformation is reliable enough to reuse the main Tauri window. If not, a separate Widget Mode window is the recommended fallback. The design priority is to make Widget Mode feel like the actual window surface, not like a normal app window containing a decorative card.
