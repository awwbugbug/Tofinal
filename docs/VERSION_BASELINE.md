# ToFinal Version Baseline

## Recommended Baseline Name

`v0.2-local-task-baseline`

This baseline represents the local-first task app before SQLite and advanced desktop integrations.

## Implemented Capabilities

- Tauri v2 desktop app with React, TypeScript, Vite, Tailwind CSS, Zustand, lucide-react, and local shadcn-style UI primitives.
- Custom title bar with drag, minimize, maximize/restore, and close controls.
- Normal Window Mode with Sidebar, TaskList, DetailPanel.
- Desktop Pin Mode with QuickInput and compact open task list.
- Session-only three-column resizing in Normal Mode with min/max limits and resize reclamping.
- Task add, edit, delete, complete/reopen.
- Priority: `normal`, `important`, `urgent`.
- Tags with trimming and deduplication.
- Pinned tasks and Pinned filter.
- Today, All Tasks, Important, and Pinned filters.
- Title/note search combined with current filter.
- Custom delete confirmation dialog.
- localStorage persistence through repository/storage boundary.
- Seed data and fallback when stored data is invalid.
- Legacy migration for missing `pinned`.

## Not Implemented

- SQLite.
- Screenshot capture.
- Voice input.
- Image/file upload or attachments.
- AI.
- Accounts/login.
- Cloud sync.
- Calendar/reminders.
- System tray.
- Global shortcuts.
- WorkerW/Progman desktop embedding.
- Installer/release packaging hardening.

## Current Verification

Latest Phase 2.7 verification:

- `npm test`: passed, 3 test files, 24 tests.
- `npm run build`: passed, TypeScript and Vite production build completed.
- `cargo check`: passed in `src-tauri`.
- `npm run tauri dev`: Vite started on `localhost:1420` and Tauri launched `target\debug\tofinal.exe`; validation processes were stopped intentionally after startup verification.

The current automated suite covers task CRUD, filtering/search, localStorage persistence/migration, Desktop Pin state sharing, custom titlebar rendering, and Normal Mode column resizing.

## Manual Acceptance Before Phase 3

- Start app with `npm run tauri dev`.
- Confirm Normal Window Mode opens with three panels.
- Add a task with button and Enter.
- Edit title, note, priority, tags, and pinned; save changes.
- Delete a task through the custom confirmation dialog.
- Toggle task completion and verify counts update.
- Use Today, All Tasks, Important, and Pinned filters.
- Search by title and note.
- Switch to Desktop Pin Mode and back without losing state.
- Resize left and right panels; maximize and restore window; verify panels stay usable.
- Restart app and confirm localStorage-backed tasks remain.
- Confirm no SQLite, screenshot, voice, image upload, AI, account, cloud sync, tray, or global shortcut features are present.

## Git Commit And Tag Recommendation

- Recommended commit message: `chore: freeze v0.2 local task baseline`
- Recommended tag: `v0.2-local-task-baseline`
- Tag after all verification commands pass and after manual acceptance is complete.
