---
phase: 29-multi-instance-coordination
plan: 01
subsystem: database
tags: [sqlite, process-locks, coordination, import, concurrency]

# Dependency graph
requires:
  - phase: 28-service-layer
    provides: import service with ImportConflictError and runImport()
provides:
  - process_locks table (schema v9) for DB-based cross-process coordination
  - coordination service with claimLock/releaseLock/isProcessAlive/formatLockElapsed
  - DB-backed import locking alongside in-memory guard
affects: [30-cli-interface, 31-mcp-server, 29-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DB-based lock claim with stale PID reclaim via process.kill(pid, 0)"
    - "UNIQUE constraint as race guard — re-SELECT winner on insert conflict"
    - "Two-layer concurrency: DB lock (cross-process) + in-memory guard (same-process fast-path)"

key-files:
  created:
    - src/services/coordination.js
    - .planning/phases/29-multi-instance-coordination/29-01-SUMMARY.md
  modified:
    - src/db/schema.js
    - src/db/index.js
    - src/services/import.js
    - src/server/routes/import.js

key-decisions:
  - "busy_timeout = 5000ms set on every DB open before SCHEMA_DDL so DDL itself benefits"
  - "UNIQUE constraint race handling: re-SELECT winner rather than retry loop"
  - "ImportConflictError handles both string (DB datetime) and epoch number (in-memory) startedAt"
  - "409 POST response uses err.message directly — detailed message flows through automatically"

patterns-established:
  - "claimLock/releaseLock pattern: claim before work, release in finally"
  - "stale lock reclaim: DELETE WHERE lock_name = ? AND pid = ? guards TOCTOU"

# Metrics
duration: 8min
completed: 2026-03-28
---

# Phase 29 Plan 01: Multi-Instance Coordination Summary

**SQLite process_locks table (schema v9) with cross-process import locking, stale PID reclaim, and actionable conflict error messages**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-28T02:08:00Z
- **Completed:** 2026-03-28T02:16:03Z
- **Tasks:** 3
- **Files modified:** 5 (2 db, 2 services, 1 route)

## Accomplishments

- Schema v9 with process_locks table and MIGRATION_V8_TO_V9 — all migration paths (v1→v9) updated
- Coordination service: claimLock with live/stale/race handling, releaseLock with PID guard, isProcessAlive via kill(0), formatLockElapsed for UTC datetime strings
- Import service upgraded from single in-memory guard to two-layer locking: DB claim first (cross-process), in-memory fast-path second (same-process double calls)
- ImportConflictError redesigned with 3-arg constructor (pid, source, startedAt) supporting both DB string and epoch number timestamps
- 409 POST response now carries full detailed error message including PID, source, elapsed, and actionable hint

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration v8->v9 and busy_timeout** - `e994e02` (feat)
2. **Task 2: Coordination service** - `120a567` (feat)
3. **Task 3: Wire import service to DB lock** - `070f157` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/db/schema.js` - SCHEMA_VERSION 9, process_locks table in DDL and MIGRATION_V8_TO_V9
- `src/db/index.js` - migrateV8toV9(), v8 branch, all chains extended, busy_timeout PRAGMA
- `src/services/coordination.js` - New: claimLock, releaseLock, isProcessAlive, formatLockElapsed
- `src/services/import.js` - DB lock integration, 3-arg ImportConflictError, source in _importState
- `src/server/routes/import.js` - 409 uses err.message (detailed message)

## Decisions Made

- busy_timeout placed before SCHEMA_DDL so the DDL execution itself benefits from the timeout
- UNIQUE constraint race: re-SELECT winner on conflict rather than retry loop (simpler, correct)
- ImportConflictError handles two startedAt formats: string (from DB) and number (epoch ms from in-memory guard) — both needed since the two-layer guard can throw from either path
- 409 response body uses err.message directly — no duplication, richer message flows automatically

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- PRAGMA busy_timeout returns column named `timeout` (not `busy_timeout`) in node:sqlite — verification command in the plan used wrong field name. Implementation is correct; noted for future PRAGMA reads.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (server ownership lock) can now build on claimLock/releaseLock from coordination.js
- process_locks table has `port` column ready for server ownership tracking
- All existing migration paths include v9 — existing databases will auto-migrate cleanly

---
*Phase: 29-multi-instance-coordination*
*Completed: 2026-03-28*
