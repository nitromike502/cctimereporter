# Phase 3: Server and CLI - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

`npx cctimereporter` starts a local Fastify server, opens the browser to the timeline page, and exposes API routes for timeline data, project listing, and import triggering. The UI itself (components, Gantt visualization) belongs to Phases 4 and 5 — this phase delivers the server, CLI entry point, and API endpoints only.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All areas below are at Claude's discretion — user requested best-practices defaults with future extensibility in mind.

**CLI invocation & output:**
- Minimal startup output: server URL and "press Ctrl+C to stop"
- No flags in v1 beyond what's needed (port override if desired)
- Clean shutdown message on SIGINT/SIGTERM
- Verbose/quiet modes deferred until needed

**API response shape:**
- `GET /api/timeline?date=YYYY-MM-DD` — sessions grouped by project, each session includes: id, start/end timestamps, working time, ticket, branch, message count, fork info
- `GET /api/projects` — flat list of project objects with path and display name
- `POST /api/import` — returns import result summary
- JSON responses follow consistent envelope or direct-data pattern (Claude decides)
- No pagination for v1 (single-day timeline is bounded data)

**Import trigger behavior:**
- Synchronous for v1 — import completes before response returns (import is fast enough for local use)
- If import is already running, return 409 Conflict or queue — Claude decides
- Response includes counts: sessions imported, skipped, errors

**Server lifecycle:**
- Auto-open browser on startup (no opt-out flag needed for v1)
- Port selection: try default port, increment if occupied
- Graceful shutdown on SIGINT/SIGTERM — close server, close database connection
- No daemon mode — runs in foreground, user Ctrl+C to stop

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User emphasized best practices and forward-thinking design.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-server-and-cli*
*Context gathered: 2026-02-26*
