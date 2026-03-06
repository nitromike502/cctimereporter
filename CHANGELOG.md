# Changelog

All notable changes to CC Time Reporter are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-03-05

### Added

- **Import progress indicator (SSE streaming):** New `GET /api/import/progress` endpoint streams Server-Sent Events during import, reporting `{ phase, processed, total, currentFile }` progress data. The toolbar now displays a determinate progress bar with file counts during import instead of an indeterminate spinner.
- **Session messages modal:** New `GET /api/sessions/:id/messages` endpoint returns the first messages of a session (up to 10 user/assistant messages, stopping at the first tool_use block). The session detail panel includes a "view" link that opens a modal showing the conversation start.
- **Session custom titles:** The timeline API now returns `customTitle` from session index data. Session bars and the detail panel display user-assigned session names when available.
- **Slash command XML parser:** New `src/utils/parse-command-xml.js` utility parses Claude Code's `<command-name>`, `<command-args>`, and `<command-message>` XML tags into human-readable text (e.g., `/gsd:execute-phase 7`). Used when rendering session summaries.
- **Tour enhancements:** Added guided tour steps for the project filter checkboxes and the day summary panel.

### Changed

- **Session detail panel redesign:** Replaced the two-column layout with a three-column inline grid showing session identity, context (project/ticket/branch), and timing information. Added "Session Name" as the first field.
- **Import pipeline progress callback:** `importAll()` now accepts an `onProgress` callback option. A two-pass architecture (discovery then import) provides accurate total file counts upfront for determinate progress reporting.
- **Subagent detection improvement:** Fixed detection of worktree-based subagent projects for renamed sessions and team subagents. The importer now correctly identifies `-tmp-` and `.claude/worktrees/` path patterns.

### Fixed

- **Ticket false positive filtering:** Expanded `TICKET_PREFIX_DENYLIST` and refined the `TICKET_PATTERN` regex to reduce false positive ticket detections. Added `MIN_TICKET_SCORE` threshold to `scoreTickets()`.
- **DaySummary column alignment:** Added `white-space: nowrap` and `width: 1%` to right-aligned columns. Added a "Project" column to the Ticket and Branch tabs in the day summary.
- **Parser subagent detection:** Corrected team subagent detection for sessions that were renamed after creation, preventing them from being incorrectly classified as subagents.

## [0.2.0] - 2026-02-28

*Initial tagged release with core timeline functionality.*

## [0.1.0] - 2026-02-15

*First published release.*
