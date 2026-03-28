---
phase: 29-multi-instance-coordination
plan: 02
subsystem: infra
tags: [sqlite, coordination, process-locks, cli, fastify]

# Dependency graph
requires:
  - phase: 29-01
    provides: claimLock/releaseLock/isProcessAlive in coordination service, process_locks schema table
provides:
  - Server ownership lock claimed after fastify.listen() in bin/cli.js
  - Conflict detection: second instance detects live lock, prints URL with PID, exits code 0
  - Graceful release: SIGINT/SIGTERM handler calls releaseLock before closing server
  - Stale lock reclaim: crashed server's lock auto-claimed by next startup via isProcessAlive check
affects: [30-mcp-server, 31-packaging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claim lock AFTER listen() — port is bound first, then DB lock determines who runs"
    - "Second instance binds a port then immediately releases it on conflict detection"
    - "releaseLock is synchronous (DatabaseSync) — runs reliably in async signal handlers"

key-files:
  created: []
  modified:
    - bin/cli.js

key-decisions:
  - "Lock claimed AFTER listen() succeeds — port bind determines port, lock determines ownership"
  - "Port-fallback loop preserved — handles non-cctimereporter EADDRINUSE conflicts independently"
  - "exit(0) on conflict — second instance is not an error condition"

patterns-established:
  - "Server coordination: listen first, lock check second, exit clean on conflict"

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 29 Plan 02: Server Ownership Coordination Summary

**DB-based server lock in bin/cli.js prevents duplicate cctimereporter instances — second startup detects live lock, prints existing server URL with PID, and exits cleanly**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-28T02:17:38Z
- **Completed:** 2026-03-28T02:22:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Server claims `process_locks` 'server' row after `fastify.listen()` succeeds
- Second instance prints `Server already running at http://127.0.0.1:PORT (PID XXXX)` and exits code 0
- SIGINT/SIGTERM releases lock before `fastify.close()` ensuring clean DB state
- Stale locks from crashed processes automatically reclaimed by `isProcessAlive` check in `claimLock`

## Task Commits

Each task was committed atomically:

1. **Task 1: Server lock claim after listen()** - `0bc796e` (feat)

**Plan metadata:** _(pending)_

## Files Created/Modified
- `bin/cli.js` - Added claimLock/releaseLock import, lock claim after listen(), conflict exit path, lock release in signal handlers

## Decisions Made
- Lock is claimed AFTER `fastify.listen()` succeeds — the port-binding order is: bind port, then check DB lock. If claim fails, close fastify and exit. This ordering keeps the port-fallback loop intact for non-cctimereporter port conflicts.
- Port-fallback loop preserved — it handles the case where port 3847 is held by a non-cctimereporter process. The DB lock handles cctimereporter-vs-cctimereporter conflicts. Both mechanisms are needed.
- `process.exit(0)` on conflict — a second instance detecting a running server is not an error.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 29 complete: coordination service + import DB lock (29-01) + server ownership (29-02)
- Ready for Phase 30 (MCP server) and Phase 31 (packaging/release)
- No blockers

---
*Phase: 29-multi-instance-coordination*
*Completed: 2026-03-28*
