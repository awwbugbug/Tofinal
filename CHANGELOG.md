# Changelog

All notable changes to ToFinal are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-11

Time scheduling: give a task a start time and an optional duration, and let the app remind you.

### Added
- Start time and duration per task, edited through iOS-style drum wheel pickers (drag with inertia, mouse-wheel detents, spring snapping) in a popover under a new time control in the detail panel.
- Wall-clock reminders while the app runs: a bright chime when a task's time arrives and a softer bell when its allocated duration runs out, each with an in-app toast whose View action jumps to the task. Reminders missed while the app was closed are summarized silently on launch.
- Native Windows toast notifications for reminders; clicking one refocuses the app, jumps to the task (expanding its stack if collapsed), and highlights it with a soft breathing glow that fades on click.
- A live card time badge: the start time before it arrives, a countdown ring with the remaining allocation while active, and an urgent ring once time runs out.
- A reminder-sound toggle in Preferences.

### Changed
- Card indicators (priority, time, date, stack count) now stack in one centered column on the card's right side with even spacing.
- Popovers keep an identical gap to their trigger whether they open downward or flip upward.

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

[0.3.0]: https://github.com/awwbugbug/Tofinal/releases/tag/v0.3.0
[0.2.0]: https://github.com/awwbugbug/Tofinal/releases/tag/v0.2.0
