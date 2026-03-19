---
phase: quick-001
plan: 001
subsystem: ui
tags: [vue, sse, progress, import, schema-migration, elapsed-time]

# Dependency graph
requires: []
provides:
  - Discovery phase progress events in import pipeline (onProgress with phase='discovering')
  - Schema migration flag in timeline API response (schemaMigrated)
  - Re-import notification banner in TimelinePage
  - Elapsed time displayed alongside working time in SessionDetailPanel
affects: [quick tasks, future import UX work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "onProgress callback with phase field for multi-phase progress reporting"
    - "schemaMigrated flag propagated from db/index.js -> server/index.js -> timeline route -> frontend"

key-files:
  created: []
  modified:
    - src/importer/index.js
    - src/db/index.js
    - src/server/index.js
    - bin/cli.js
    - src/server/routes/timeline.js
    - src/client/pages/TimelinePage.vue
    - src/client/components/SessionDetailPanel.vue

key-decisions:
  - "Discovery progress events emitted before and during the for-loop, not just after"
  - "schemaMigrated propagated as server startup option (not per-request state)"
  - "elapsedTimeMs computed server-side from clamped start/end, naturally handles overnight sessions"
  - "Re-import banner auto-dismisses on successful import (schemaMigrated set to false in 'complete' handler)"

patterns-established:
  - "onProgress.phase discriminator: 'discovering' / 'discovered' / 'importing' / 'complete'"
  - "Server options propagation pattern: cli.js -> createServer -> route registration"

# Metrics
duration: pre-existing
completed: 2026-03-18
---

# Quick Task 001: Import Progress and Re-import Notification Summary

**Discovery phase progress text during import, schema-migration re-import banner, and elapsed time in session detail panel**

## Performance

- **Duration:** Pre-existing (all task commits were already present when plan was executed)
- **Completed:** 2026-03-18
- **Tasks:** 3/3 verified
- **Files modified:** 7

## Accomplishments

- Import pipeline emits `onProgress` events with `phase='discovering'` and project counts during the first-pass discovery loop, replacing a silent spinner with live "Discovering sessions... (N of M projects)" text
- Timeline API now returns `schemaMigrated: boolean` so the frontend can display a re-import notification banner when the app was updated and a migration ran
- Session detail panel shows elapsed wall-clock time alongside working time ("Working: 45m / 1h 20m elapsed"), using `elapsedTimeMs` computed server-side from clamped session start/end

## Task Commits

1. **Task 1: Add discovery phase progress events and schema migration tracking** - `e70f6b7` (feat)
2. **Task 2: Show discovery status and re-import notification in frontend** - `7be12a0` (feat)
3. **Task 3: Show elapsed time in session detail panel** - `22c069c` (feat)

## Files Created/Modified

- `src/importer/index.js` - Added `onProgress` calls with `phase='discovering'` before and during discovery loop; `phase='discovered'` summary event after loop
- `src/db/index.js` - `openDatabase()` now returns `{ db, migrated }` tuple; `migrated = true` set in all migration branches
- `bin/cli.js` - Destructures `{ db, migrated }` from `openDatabase()`, passes `migrated` to `createServer()`
- `src/server/index.js` - `createServer(db, options)` accepts `migrated` option, passes to `timelineRoute`
- `src/server/routes/timeline.js` - Receives `migrated` via opts, returns `schemaMigrated: migrated` in response; computes `elapsedTimeMs` per session
- `src/client/pages/TimelinePage.vue` - Discovery phase status text in progress overlay; `schemaMigrated` ref from API; dismissible re-import banner with "Re-import Now" and "Dismiss" buttons
- `src/client/components/SessionDetailPanel.vue` - `elapsedTimeLabel` computed from `session.elapsedTimeMs`; shown as muted text after working time

## Decisions Made

- Discovery progress events emitted at the start of the loop (before first project) and after each project completes, giving O(projects) granularity
- `schemaMigrated` is a server-startup property (set once at open), not recalculated per request — correct because migration only happens at startup
- `elapsedTimeMs` computed from clamped start/end timestamps (not raw `first_message_at`/`last_message_at`), so overnight sessions correctly show only the day's portion
- Re-import banner auto-dismisses after a successful import by setting `schemaMigrated.value = false` in the `complete` SSE event handler

## Deviations from Plan

None - all changes were already implemented prior to execution. Plan was verified against existing code.

## Issues Encountered

None - build passed, database verification passed, all three task commits confirmed present.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three UX improvements are live in the built frontend (`dist/`)
- Ready for v0.6.0 Phase 20-22 parallel execution (session splitting work)
- No blockers introduced

---
*Phase: quick-001*
*Completed: 2026-03-18*
