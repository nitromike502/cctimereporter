---
phase: 31-mcp-server
plan: "02"
subsystem: api
tags: [mcp, nodejs, fastify, sqlite, mcp-sdk, stdio]

# Dependency graph
requires:
  - phase: 31-01
    provides: MCP server factory, 4 query tools, StdioServerTransport wiring
  - phase: 28-01
    provides: runImport / ImportConflictError in src/services/import.js
  - phase: 29-01
    provides: claimLock / releaseLock / isProcessAlive in src/services/coordination.js
provides:
  - trigger_import MCP tool — runs import pipeline, handles conflict errors gracefully
  - start_server MCP tool — starts inline Fastify with port fallback or returns existing URL
  - stop_server MCP tool — terminates any running cctimereporter server (own or external)
  - server_status MCP tool — reports running state from DB lock with URL and PID
  - cleanupMcpServer — releases server lock and closes inline Fastify on MCP exit
  - All 8 MCP tools registered; complete agent workflow now possible
affects: [v0.8.0-release, npm-publish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP action tools use isError response format for business errors (not thrown exceptions)"
    - "Module-level _fastifyInstance tracks inline Fastify started by MCP process"
    - "cleanupMcpServer exported for stdin.close and process.exit handlers in server.js"

key-files:
  created:
    - src/mcp/tools/action.js
  modified:
    - src/mcp/server.js

key-decisions:
  - "Direct static import of action.js (not conditional dynamic) — Plan 02 completes Plan 01's try/catch scaffold"
  - "stop_server sends SIGTERM to external processes then releases lock after 300ms delay"
  - "start_server uses port fallback loop matching CLI serve behavior (ports 3847-3856)"
  - "cleanupMcpServer uses _fastifyInstance.server.close() synchronously (not await fastify.close()) for exit handler compat"

patterns-established:
  - "Action tool error pattern: catch ImportConflictError, return isError response; re-throw unexpected errors"
  - "Server lock pattern: check DB lock + isProcessAlive before start/stop decisions"

# Metrics
duration: 10min
completed: 2026-03-28
---

# Phase 31 Plan 02: MCP Action Tools Summary

**4 action tools added completing all 8 MCP tools — agents can now trigger imports, manage web server lifecycle (start/stop/status), with exit cleanup releasing server locks**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-28T20:15:00Z
- **Completed:** 2026-03-28T20:25:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/mcp/tools/action.js` with all 4 action tools and `cleanupMcpServer` export
- Updated `src/mcp/server.js` to statically import and call `registerActionTools`, with exit cleanup
- Verified all 8 tools appear in MCP tools/list response
- MCP server is feature-complete; full agent workflow possible (check dates, query, import, start/stop server)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement 4 action tool registrations** - `0d8b69a` (feat)
2. **Task 2: Wire action tools into server.js and add exit cleanup** - `22849cf` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/mcp/tools/action.js` — 4 action tools: trigger_import, start_server, stop_server, server_status; cleanupMcpServer export
- `src/mcp/server.js` — Static import of registerActionTools/cleanupMcpServer; exit handlers call cleanupMcpServer

## Decisions Made

- Direct static import of `action.js` replaced the try/catch conditional dynamic import from Plan 01 — Plan 02 completes the scaffold, so graceful-miss fallback no longer needed
- `stop_server` sends SIGTERM then waits 300ms before releasing lock — allows graceful shutdown without needing to confirm the process is dead
- `start_server` matches CLI port fallback loop (3847-3856) for consistency across all server start paths
- `cleanupMcpServer` uses `_fastifyInstance.server.close()` synchronously rather than `await fastify.close()` — `process.on('exit')` handlers cannot be async

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 31 is complete. All 8 MCP tools are functional.

v0.8.0 is ready for release:
- Service layer extracted (Phase 28)
- Coordination locks + DB schema v6 (Phase 29)
- CLI subcommands (Phase 30)
- MCP server with 8 tools (Phase 31)

Next step: bump to v0.8.0, update CHANGELOG.md, build frontend, tag, push, and npm publish.

---
*Phase: 31-mcp-server*
*Completed: 2026-03-28*
