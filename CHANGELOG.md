# Changelog

All notable changes to ToFinal are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-09

First public release — a local-first, offline desktop task manager.

### Tasks & organization
- Task stacks: group related tasks into iOS-notification-style stacks; drag to reorder, merge, and split; single/double-click to expand.
- Priorities (normal / important / urgent) and planned dates via a segmented control (None / Today / Tomorrow / pick-a-date) with a self-drawn calendar.
- Markdown task notes with an expandable read-only preview.

### Views & modes
- Normal window mode and a compact, always-on-top Desktop Pin mode.
- Today view with an overdue section, a progress ring, and completed-today; browse any date through the calendar; All / Important / Pinned filters.

### Attachments & app binding
- Image attachments via OS drag-and-drop, clipboard paste, or file picker, with lightbox preview.
- Full-screen and region screenshot capture with a built-in editor.
- Bind an app (`.exe` or `.lnk`) to a task and launch it in one click.

### Data & safety
- Local SQLite persistence with an automatic backup on each launch (last 7 kept).
- Export to JSON or Markdown.
- Trash with an undo toast; trashed tasks auto-purge after 30 days.

### Look & feel
- Light / dark / system themes, a glass UI, keyboard shortcuts, completion celebrations, and Simplified Chinese / English localization.

### Security
- Strict Content-Security-Policy (local sources only).
- Filesystem access scoped to the app's own data folder; bound apps are launched without a shell and validated by path and type.

[0.2.0]: https://github.com/awwbugbug/Tofinal/releases/tag/v0.2.0
