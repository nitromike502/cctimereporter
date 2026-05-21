# Changelog

All notable changes to CC Time Reporter are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.2.0] - 2026-05-20

Working Time and Agent Time are now distinct concepts surfaced across the entire stack. Working Time keeps its historical "filled gantt-bar" meaning but now spans the whole team of agents (main + inline sidechains + background subagents + teammate sessions). Agent Time is new: the strict union of real per-turn intervals — no idle-threshold padding — telling you exactly how much wall-clock time agents spent producing output for a session.

### Added

- **Schema v11:** `messages.duration_ms` column. Auto-migration from v10.
- **Importer:** captures Claude Code's per-turn `durationMs` from `system/turn_duration` messages. Coverage limited to sessions whose JSONLs are still on disk; pre-existing sessions without source files show Agent Time as `—`.
- **`sumIntervalUnion(intervals, windowStart, windowEnd)`** helper in `timeline-utils.js` for overlap-aware interval merging.
- **Two new fields** on every session record: `agentTimeMs` (strict per-turn union, day-clamped to the displayed window) and a matching `agentTime` formatted string.
- **Session detail panel** shows Agent Time as a dedicated row, with tooltips explaining the difference from Working Time. Cache Hit and Cache rows collapsed into a single "Cache" row to keep the field count at 12.
- **Day summary panel:** total Agent Time appears beside total Working Time; the By Project, By Ticket, and By Branch tables each get an Agent Time column.
- **CLI:** `summary` and `sessions` subcommands include `agentTime` / `agentTimeMs` per session, per-ticket group, and at the day total.
- **MCP:** `get_day_summary` and `get_sessions` tools include the new fields. Additive only.

### Changed

- **`workingTimeMs` semantics:** now reflects threshold-padded activity across the parent session AND any team-member subagents (heuristically linked by same project + overlapping time window), matching what the gantt bar visually fills. Previously parent-only. Existing API consumers continue to receive the same field name and shape but with broader coverage.
- **Gantt idle gaps** are computed from the merged (parent + teammate) timestamp set so the bar's filled portion now reflects subagent activity that was previously rendered as idle.
- **Session detail panel layout:** Tokens and Working Time swap positions; Agent Time and Cache swap positions. End layout (4×3 column-major): identity in col 1, context+cache in col 2, time-related in col 3.

### Fixed

- **Importer skips `~/.claude/projects/-tmp/`** — Claude Code's scratch directory for cwd-less invocations (e.g. /remember, /compact skill processes). These sessions had no recoverable project context and previously appeared as standalone `-tmp` bars on the gantt.

## [1.1.0] - 2026-05-09

Token usage tracking and visualization. Token counts and cache hit rates flow from JSONL transcripts through schema v10 into every consumer surface — session detail, day summary, CLI, MCP, and a new `/tokens` chart page with double-click bucket drill-down.

### Added

- **Schema v10:** 7 new token columns on `messages` table (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`, `model`). Auto-migration from v9 with automatic 30-day re-import backfill.
- **Token aggregation service:** `createTokensService(db)` factory with `getDayTokens` / `getSessionTokens`. Sidechain (`is_sidechain=0`) and fork (`is_fork_branch=0`) exclusion on aggregates. JS-computed cache hit rate (`cache_read / (cache_read + input) × 100`).
- **`GET /api/tokens?date=YYYY-MM-DD`** endpoint returning per-session and day-total aggregates with cache hit rate.
- **Session detail panel** shows input/output token breakdown, cache hit rate, and cache read/created totals.
- **Day summary panel** shows total tokens for the selected date.
- **CLI:** `summary` includes top-level `tokens` object; `sessions` includes per-session `tokens` field. Additive only — no breaking changes to existing JSON shape.
- **MCP:** `get_day_summary` and `get_sessions` tools include `tokens`. Additive only — existing consumers ignore new fields without error.
- **`/tokens` page** with chart.js + vue-chartjs. Session Totals stacked bar chart (input + output per session) and Per Message line chart with time-of-day x-axis and configurable bucket interval. Project-level visibility checkboxes. Custom HTML legend. Dark-mode reactive chart options.
- **Per Message bucket drill-down:** Double-click a bucket on the Per Message chart to open `SessionMessagesModal` in time-range mode (`?from=ISO&to=ISO`) with inline output token counts on assistant message headers.
- **Page navigation** moved into `TimelineToolbar` (Timeline | Tokens, centered). Date persists across page navigation via query param.

### Changed

- App.vue nav bar removed in favor of toolbar-integrated nav.
- Project color collision dedup is now assignment-based (`src/client/utils/project-colors.js`) and resets on date change.

## [1.0.0] - 2026-04-07

First stable release. Promotes v0.8.3 as the stable v1.0.0 — marks feature completeness of the core platform: JSONL import pipeline, Gantt timeline UI, CLI subcommands, MCP server, and multi-instance coordination.

## [0.8.3] - 2026-04-03

### Fixed

- **MCP missing session name:** The `get_day_summary` MCP tool now includes `customTitle` (the session name from `/rename`) in session data. Previously only `userLabel` (UI-set name) was returned.

## [0.8.2] - 2026-03-30

### Fixed

- **Empty fork sessions visible:** Fork sub-bars with messages but zero working time (all gaps exceeded idle threshold) are now filtered out of the timeline. Changed `computeForkSegments` from `.filter().map()` to `.flatMap()` with early-exit on `workingTimeMs === 0`.
- **Fork sessions bleeding past midnight:** Overnight fork segments now clip to their last in-day message timestamp instead of stretching to day boundary (23:59:59). Consistent with how main sessions already handle overnight clamping.

## [0.8.1] - 2026-04-01

### Fixed

- **Schema migration banner stuck after reimport:** The "reimport needed" banner now properly clears after a successful import. Server-side `migrated` flag is reset on import completion (was stuck as a closure boolean). Frontend dismissal persists in localStorage keyed to schema version, surviving page refreshes.
- **Schema version exposed in API:** `/api/timeline` response now includes `schemaVersion` for frontend cache-keying.

## [0.8.0] - 2026-03-27

### Added

- **Service layer (Phase 28):** Business logic extracted from Fastify route handlers into `src/services/` (timeline, sessions, import) and shared utilities in `src/utils/timeline-utils.js`. Route handlers are now thin HTTP-only wrappers. Services are reused by the web server, CLI, and MCP layers.
- **Multi-instance coordination (Phase 29):** DB-based process locks prevent concurrent imports and detect existing server instances. Schema v9 adds a `process_locks` table. Stale locks from crashed processes are reclaimed automatically via PID liveness checks. SQLite `busy_timeout` set to 5000ms for safe concurrent access.
- **CLI subcommands (Phase 30):** Commander-based dispatch in `bin/cli.js` with three subcommands: `summary` (day summary JSON), `sessions` (session list JSON), and `import` (trigger import). All output JSON to stdout for scripting. `--pretty` flag for human-readable output. `--date`, `--idle`, `--days`, and `--all` options. CLI commands start in ~70ms by deferring Fastify imports.
- **MCP server (Phase 31):** stdio MCP server via `--mcp` flag for programmatic data access from AI assistants. 8 tools: `get_day_summary`, `get_sessions`, `get_session_messages`, `get_dates` (query tools), plus `trigger_import`, `start_server`, `stop_server`, `server_status` (action tools). Uses `@modelcontextprotocol/sdk` with Zod schema validation.

### Fixed

- **CLI date validation:** The `summary` and `sessions` subcommands now validate the `--date` argument against `YYYY-MM-DD` format. Invalid dates return `{ "error": "Invalid date format. Use YYYY-MM-DD." }` on stdout and exit code 1.
- **CLI default date uses local time:** The `summary` and `sessions` subcommands now default to the local calendar date instead of UTC, preventing off-by-one errors for users in negative UTC offsets.
- **SQLite experimental warning suppressed:** `process.removeAllListeners('warning')` runs before any imports in `bin/cli.js`, preventing the `node:sqlite` experimental feature warning from appearing on stderr.
- **Import progress phase names:** CLI import progress now correctly matches the phase names `'discovering'` and `'importing'` emitted by the import pipeline (previously mismatched as `'discovery'` and `'import'`).

### Changed

- **Schema v9:** Adds `process_locks` table for multi-instance coordination. Auto-migrates from any previous schema version.
- **bin/cli.js:** Refactored from monolithic entry point to Commander-based dispatch. `serve` is the default command (preserving `npx cctimereporter` behavior).
- **Route handlers thinned:** All API route handlers now delegate to service functions, containing only HTTP concern logic (status codes, SSE framing, request parsing).

### Dependencies

- Added `commander` (^14.0.3) for CLI argument parsing
- Added `@modelcontextprotocol/sdk` (^1.28.0) for MCP server protocol
- Added `zod` (^4.3.6) for MCP tool input schema validation

## [0.7.0] - 2026-03-24

### Added

- **Fork visualization:** Session forks display as 50%-height sub-bars beneath their parent session bar in the Gantt chart. Each fork bar starts at the fork point timestamp and shows working time, elapsed time, and message count.
- **Fork bar interaction:** Click a fork bar to see its details in the session detail panel. A "view" link opens the messages modal filtered to that fork branch's messages.
- **Show/hide fork toggle:** Button below the chart toggles fork sub-row visibility, persisted to localStorage.
- **Stored messages:** User and assistant message text is now stored in the database during import (truncated to 1000 chars, XML tags stripped). Enables faster message display without re-reading JSONL files.
- **Messages modal from DB:** Messages modal now reads from the database instead of JSONL files. Supports fork branch filtering when viewing fork messages.

### Changed

- **Fork detection:** Progress forks (internal Claude Code bookkeeping) are now correctly filtered out. Only real user-initiated forks are displayed.
- **Schema v8:** Two new columns on the messages table: `fork_branch_id` (TEXT) and `content` (TEXT). Auto-migrates from any previous schema version.

### Fixed

- **Fork segment day boundary clamping:** Fork segments from other days no longer appear with invalid time ranges.
- **Detail panel consistency:** Clicking a fork shows the same 9-field layout as sessions, with fork-specific overrides for timing and messages.

## [0.6.0] - 2026-03-19

### Added

- **Gantt chart zoom:** Zoom the timeline 1x–4x using scroll wheel (cursor-anchored) or +/- buttons below the chart. Short sessions become easier to distinguish and click at higher zoom levels.
- **Click-drag pan:** When zoomed in, click and drag to pan the chart horizontally. Grab/grabbing cursor indicates panning is available.
- **Adaptive time axis ticks:** Time axis shows denser tick marks at higher zoom levels — 2-hour intervals at 1x, 1-hour at 2x, 30-minute at 3x, 15-minute at 4x.
- **Smooth button zoom:** Clicking +/- buttons produces a smooth 150ms CSS transition. Scroll-wheel zoom remains instant for responsive cursor anchoring.
- **Zoom level indicator:** Zoom controls show the current level with an "x" suffix (e.g. "2.5x").

### Changed

- **Branch display:** Default branches (main, master, develop, etc.) are now stored in the database instead of null. The session detail panel always shows the actual branch. Gantt bar labels still skip default branches in the display fallback chain.
- **Chart layout:** GanttChart restructured to two-column layout with pinned project labels and a separately scrollable canvas area.

### Fixed

- **NumberStepper decimal support:** Fixed `parseInt` to `parseFloat` in NumberStepper input handling, enabling decimal step values (0.25 for zoom).
- **Tick label clipping:** First time axis label ("12a") no longer clips at the left edge of the chart.

## [0.5.1] - 2026-03-18

### Added

- **Import discovery progress:** Import now shows "Discovering sessions... (N of M projects)" during the discovery phase instead of a silent spinner.
- **Re-import notification:** A dismissible banner appears after schema migration informing users a re-import is recommended. Includes a one-click "Re-import Now" button.
- **Elapsed time in session detail:** Session detail panel shows total elapsed time alongside working time, so users can see how much wall-clock time a session spanned.

### Fixed

- **Import dropdown text wrapping:** Import options dropdown menu no longer wraps text on narrow viewports.

## [0.5.0] - 2026-03-12

### Added

- **Incremental import with 2-day default window:** Import button now defaults to a 2-day rolling window (`maxAgeDays=2`), dramatically reducing import time for daily use. Split-button dropdown offers "Import Recent" (2 days) and "Full Import" (30 days).
- **Agent file rolling window skip:** Agent files now use the same 3-tier skip logic (size, window, old-peek) as session files. Previously only had size-based skip, causing hundreds of agent files to be re-processed on every import.
- **Import debug logging:** Configurable logging to `~/.cctimereporter/import.log` with timing, per-project skip breakdowns, and slow file warnings. Off by default, toggled via `npx cctimereporter --debug-import on|off`.
- **Config system:** New `~/.cctimereporter/config.json` for application settings. Currently supports `importLog.enabled` and `importLog.clearOnStart`.
- **Session editing (Phase 17):** Schema v6 migration adding `user_label` and `user_ticket` columns to sessions. New `PATCH /api/sessions/:id` endpoint for updating user-editable fields. Edit modal UI accessible from the detail panel. User edits persist across re-imports. Includes a copiable CLI command to resume the session in Claude Code.
- **Expanded ticket detection pipeline (Phase 18):** Three new ticket detection sources: git commit messages (100pt base + 10/additional commit), MCP tool call inputs (100pt base + 10/additional call), and session summary/title text (25pt flat). Total detection sources now at 6.
- **Messages modal improvements:** XML cleaning for user messages (task notifications, bash input/output, local command output, skill expansion tags stripped). Expandable message cards with fade gradient and Show more/less toggle replace scroll-within-scroll. Message count increased from 5+5 to 10+10.

### Changed

- **Progress overlay shows skip count:** Import progress now displays "(X skipped)" alongside the file counter.
- **Agent import logs timestamps:** Successfully imported agent files now record `first_message_at` and `last_message_at` in the import log, enabling rolling window skip on subsequent imports.
- **NaN guard on maxAgeDays:** Both GET and POST import routes validate the `maxAgeDays` parameter to prevent crashes from invalid input.

## [0.3.1] - 2026-03-05

### Fixed

- **npm packaging:** Added missing `src/utils` to published files list, fixing `ERR_MODULE_NOT_FOUND` for `parse-command-xml.js`.

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
