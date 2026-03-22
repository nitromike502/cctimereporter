---
phase: 23-backend-fork-segments
plan: "01"
subsystem: api
tags: [sqlite, timeline, forks, gantt, node-sqlite]

# Dependency graph
requires:
  - phase: 22-schema-and-import
    provides: fork_branch_id column on messages table, real_fork_count on sessions

provides:
  - forkSegments array on every session object in GET /api/timeline response
  - computeForkSegments() helper with day-boundary clamping
  - Batch fork-segment query gated on real_fork_count > 0

affects:
  - 24-frontend-fork-bars (consumes forkSegments to render fork bars)
  - 25-fork-interaction (consumes forkBranchId from segments for click routing)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic IN-clause construction for node:sqlite (prepared statements don't support array binding)"
    - "Gate expensive queries on count columns (real_fork_count > 0) to skip for common case"
    - "Pre-loop batch query pattern: collect IDs before loop, batch query, Map lookup inside loop"

key-files:
  created: []
  modified:
    - src/server/routes/timeline.js

key-decisions:
  - "Fork messages included in working time — parallel exploration counts as work"
  - "Fork query is dynamic (IN with runtime placeholders) not a pre-compiled prepared statement"
  - "forkSegments positioned after idleGaps in session object for logical API ordering"

patterns-established:
  - "Batch query before session loop, group results into Map, O(1) lookup per session"
  - "day-boundary clamping via string comparison (ISO8601 sorts lexicographically)"

# Metrics
duration: 8min
completed: 2026-03-22
---

# Phase 23 Plan 01: Backend Fork Segments Summary

**Timeline API returns clamped fork segment data per session via batch query gated on real_fork_count > 0**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-22T03:00:33Z
- **Completed:** 2026-03-22T03:08:01Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `computeForkSegments()` helper that clamps fork segment timestamps to day boundaries
- Integrated batch fork query into timeline route handler (single query for all forked sessions per request)
- Every session object in the API response now has a `forkSegments` array (empty for no-fork sessions)
- Fork query skipped entirely when no sessions on the day have `real_fork_count > 0`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add computeForkSegments() and integrate into timeline route** - `3e2d5b4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/server/routes/timeline.js` - Added `computeForkSegments()` function, pre-loop batch fork query, and `forkSegments` field on session objects

## Decisions Made

- **Working time policy:** Fork branch messages are included in working time. Rationale: a fork represents parallel exploration within the same work session — the user is actively working even when taking a detour branch. Documented with a comment in the code.
- **Dynamic IN clause:** `node:sqlite` prepared statements don't support array binding for IN clauses. The fork query is constructed dynamically at request time using interpolated placeholders. This is safe because session IDs come from a prior DB query (not user input).
- **No pre-compiled fork statement:** Unlike `sessionStmt` and `messageStmt`, the fork query cannot be prepared at plugin registration time because its IN clause length varies. Constructed per-request only when needed (gated on `sessionIdsWithForks.length > 0`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `forkSegments` data is now available in the API response for all sessions
- Each segment has `{ forkBranchId, startTime, endTime, messageCount }` as specified
- Frontend (Phase 24) can consume this directly to render fork bars in the Gantt chart
- No blockers for Phase 24

---
*Phase: 23-backend-fork-segments*
*Completed: 2026-03-22*
