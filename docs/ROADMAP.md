# ToFinal Roadmap

## Phase 3: SQLite Replaces localStorage

Goal: Move durable task persistence from localStorage to a local SQLite database.

Scope:
- Add SQLite storage through Tauri-side persistence.
- Preserve the current `Task` capabilities.
- Migrate existing localStorage snapshot if present.
- Keep UI behavior unchanged.

Not allowed:
- Cloud sync, accounts, AI, screenshots, voice, image upload, tray, global shortcuts.

Acceptance:
- App starts with SQLite-backed tasks.
- Existing localStorage data can be migrated or safely ignored by an explicit policy.
- Task CRUD, filters, search, pinned, and Desktop Pin Mode still pass tests.
- Repository tests cover read/write/migration/failure paths.

## Phase 4: Image Attachments And Local File Management

Goal: Attach local image/files to tasks using local-first storage.

Scope:
- Define attachment metadata.
- Copy or reference files according to a documented policy.
- Show attachments in task detail.

Not allowed:
- Cloud upload, AI image processing, screenshot capture, OCR.

Acceptance:
- Attachments survive app restart.
- Deleted tasks clean up or detach files according to policy.
- Oversized/unsupported files are rejected gracefully.

## Phase 5: Screenshot Capture And Screenshot Tasks

Goal: Capture screenshots locally and create tasks from them.

Scope:
- Add screenshot capture through an explicit Tauri capability/plugin.
- Store screenshots as local attachments.
- Create or enrich tasks from screenshot metadata.

Not allowed:
- AI analysis, cloud upload, account sync.

Acceptance:
- Screenshot permission behavior is documented.
- Screenshots are saved locally and linked to tasks.
- Failure states are visible and do not crash the app.

## Phase 6: Voice Input

Goal: Add local voice-based task entry.

Scope:
- Capture or transcribe voice only if a local or explicitly approved engine is chosen.
- Convert dictated text into task titles/notes.

Not allowed:
- Cloud transcription by default, accounts, AI assistants.

Acceptance:
- Voice input can be disabled without affecting core tasks.
- Permission and device failures are handled.
- Text result can be edited before saving.

## Phase 7: System Tray And Global Shortcuts

Goal: Improve desktop utility behavior with tray access and shortcuts.

Scope:
- Add tray menu for show/hide and quit.
- Add global shortcuts for quick add or pin mode only after conflict handling is designed.

Not allowed:
- Background polling, cloud sync, reminder scheduling.

Acceptance:
- App lifecycle is predictable when hidden/minimized.
- Shortcut registration failure is handled.
- Tray/global shortcut permissions are minimal.

## Phase 8: Packaging And Installer

Goal: Build a reliable installable desktop app for personal use.

Scope:
- Produce Windows installer/bundle through Tauri.
- Verify icons, app metadata, versioning, and upgrade path.
- Document install, update, and backup behavior.

Not allowed:
- New product features in the packaging phase.

Acceptance:
- Installer can install and launch ToFinal.
- Existing local data survives app update according to documented storage policy.
- Version tag and release notes match the shipped baseline.
