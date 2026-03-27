---
phase: 28-service-layer
plan: 01
subsystem: api
tags: [service-layer, refactor, sqlite, fastify, mcp, cli]

# Dependency graph
requires:
  - phase: 27-messages-modal
    provides: routes with business logic to extract (timeline, messages, sessions, import)
provides:
  - src/utils/timeline-utils.js — pure utility functions for working time and display name computation
  - src/services/timeline.js — createTimelineService factory with getTimelineUI and getTimelineReport
  - src/services/sessions.js — createSessionsService factory with getMessages and updateSession
  - src/services/import.js — runImport with module-level concurrency guard and ImportConflictError
affects:
  - 29-coordination-locks (import service will add coordination-safe locking in this phase)
  - 30-cli-subcommands (CLI will call service layer directly, no HTTP required)
  - 31-mcp-server (MCP will call service layer directly, no HTTP required)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory pattern for DB-bound services: createXxxService(db) returns object with methods"
    - "Null-returns-map-to-404: service returns null for not-found, route maps null to HTTP 404"
    - "Module-level concurrency guard: _importState = null | { pid, startTime } in import service"
    - "Shared private helper: _querySessions() called by both getTimelineUI and getTimelineReport"

key-files:
  created:
    - src/utils/timeline-utils.js
    - src/services/timeline.js
    - src/services/sessions.js
    - src/services/import.js
  modified:
    - src/server/routes/timeline.js
    - src/server/routes/messages.js
    - src/server/routes/sessions.js
    - src/server/routes/import.js
    - package.json

key-decisions:
  - "Factory pattern (not singleton): createTimelineService(db) called at plugin registration; DB handle bound in closure"
  - "Dynamic IN clause fork queries remain inside getTimelineUI() using db.prepare() at call time — variable placeholder count prevents pre-preparation"
  - "Import service uses module-level state (not factory) because concurrency guard is process-wide, not DB-bound"
  - "getTimelineReport groups by userTicket ?? ticket (user override preferred over detected ticket)"
  - "schemaMigrated stays in route file (HTTP concern, not business logic)"
  - "ImportConflictError has conflict: true in SSE error event to allow client to distinguish from other errors"

patterns-established:
  - "Service layer callable without Fastify: import service module → call with db → get plain JS object"
  - "Route files contain ONLY: param parsing, status code mapping, SSE headers/streaming setup"
  - "Business logic location: src/services/ for domain logic, src/utils/ for pure utility functions"

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 28 Plan 01: Service Layer Summary

**Extracted business logic from 4 Fastify routes into 3 service modules and 1 utility module, making timeline queries, session updates, and import callable from CLI/MCP without starting a web server**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T18:11:09Z
- **Completed:** 2026-03-26T18:14:18Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Created `src/utils/timeline-utils.js` with 4 pure utility functions (computeWorkingTime, computeIdleGaps, getDisplayName, getWorktreeParentPath) extracted from the timeline route
- Created `src/services/timeline.js` with createTimelineService factory returning getTimelineUI (UI projection identical to route) and getTimelineReport (ticket-grouped totals for CLI/MCP)
- Created `src/services/sessions.js` with createSessionsService factory covering message retrieval and session field updates
- Created `src/services/import.js` with runImport, ImportConflictError class, and module-level concurrency guard
- Thinned all 4 route files to HTTP-only concerns (param parsing, status codes, SSE headers)
- Added `src/services` to package.json files array so services are included in npm publish

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared utilities and timeline service** - `3b37b78` (feat)
2. **Task 2: Create sessions and import services** - `46c2490` (feat)
3. **Task 3: Refactor routes to thin HTTP wrappers and update package.json** - `496072d` (refactor)

**Plan metadata:** (see docs commit below)

## Files Created/Modified

- `src/utils/timeline-utils.js` — Pure utility functions: computeWorkingTime, computeIdleGaps, getDisplayName, getWorktreeParentPath, BUILD_DIR_NAMES
- `src/services/timeline.js` — createTimelineService(db): getTimelineUI (UI projection), getTimelineReport (ticket-grouped for CLI/MCP), shared _querySessions helper
- `src/services/sessions.js` — createSessionsService(db): getMessages (head/tail truncation, fork branch modes), updateSession (null normalization)
- `src/services/import.js` — runImport with ImportConflictError (PID + human-readable elapsed), _resetImportState for test teardown
- `src/server/routes/timeline.js` — Now 44 lines: parse date/threshold, call svc.getTimelineUI, spread + add schemaMigrated
- `src/server/routes/messages.js` — Now 38 lines: extract params, call svc.getMessages, map null → 404
- `src/server/routes/sessions.js` — Now 37 lines: extract params, call svc.updateSession, map null → 404
- `src/server/routes/import.js` — Now 64 lines: POST delegates to runImport, SSE GET wires onProgress to sendEvent
- `package.json` — Added src/services to files array

## Decisions Made

- Used factory pattern for timeline and sessions services so the DB handle is bound in the closure at plugin registration time, not passed per-call
- Kept dynamic IN clause fork queries (variable placeholder count) inside getTimelineUI() at call time — pre-preparation not possible without knowing session count
- Import service is NOT a factory because the concurrency guard is process-wide (module-level), not per-DB-connection
- getTimelineReport uses `userTicket ?? ticket` as grouping key — user override preferred
- SSE import route sends `conflict: true` on ImportConflictError so client can distinguish from generic errors

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Service layer is complete and independently importable (verified via `node -e "import(...)"`)
- All existing API routes produce identical responses (regression-tested against live server)
- `npm pack --dry-run` confirms src/services files in package
- Phase 29 (Coordination Locks) can add DB-based locking to the import service
- Phase 30 (CLI Subcommands) can call createTimelineService(db).getTimelineReport() and runImport(db) directly
- Phase 31 (MCP Server) can use same service layer via stdio transport

---
*Phase: 28-service-layer*
*Completed: 2026-03-26*
