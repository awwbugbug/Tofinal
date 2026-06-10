# ToFinal Technical Debt

## Known Issues

- `taskStore` imports the concrete `localTaskRepository` singleton directly. This is sufficient for v0.2 but will need an async-friendly injection or factory before SQLite commands are introduced.
- `TaskRepository` is currently synchronous because localStorage is synchronous. SQLite via Tauri commands will likely require async load/save methods.
- `Today` is still a default task collection, not a real date-based view.
- Task ordering is simple insertion order, with Desktop Pin Mode only sorting pinned open tasks first.
- Normal Mode column widths are session-only and are not persisted.
- Visual styles are mostly tokenized, but a few component-level `color-mix(...)`, shadow, and status-color classes remain inline for local visual states.
- App version in `package.json` and `tauri.conf.json` is still `0.1.0`; product baseline can be named v0.2 in docs/tagging even if package version has not yet been bumped.
- There is no formal import/export, backup, or recovery flow for localStorage data.

## Current Risks

- localStorage can be cleared by WebView/runtime policy, user action, or app data reset; data durability is not strong enough for long-term use.
- A future async repository may require store action changes. Treat SQLite as a persistence migration, not a drop-in one-line replacement.
- More UI preferences in Zustand could blur business state and ephemeral state if not separated.
- Advanced desktop features will expand Tauri permissions and increase platform-specific failure modes.
- Screenshot, image, and file attachment features require explicit file storage policy before implementation.

## Must Fix Before SQLite

- Decide whether repository APIs become async:
  - recommended: `loadSnapshot(): Promise<TaskSnapshot>` and `saveSnapshot(snapshot): Promise<void>` behind a hydration state.
- Define SQLite schema and migration versioning for `Task`.
- Add explicit error handling for failed reads/writes instead of silent best-effort only.
- Add migration from localStorage snapshot to SQLite if existing v0.2 data should be preserved.
- Add tests for repository failure behavior and startup hydration.

## Must Fix Before Screenshot Or Image Upload

- Define local file storage root and path strategy.
- Define attachment metadata schema separate from `Task`.
- Add file size/type validation.
- Add cleanup rules for deleted tasks and orphaned files.
- Add Tauri permissions/plugins only for the exact file APIs required.
- Avoid storing binary data in localStorage.

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
- File attachments before SQLite and file storage policy.
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
