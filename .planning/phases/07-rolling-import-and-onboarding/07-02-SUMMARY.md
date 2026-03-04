---
phase: 07-rolling-import-and-onboarding
plan: 02
subsystem: importer
tags: [sqlite, rolling-window, import, timeline-api, performance]

requires:
  - phase: 07-rolling-import-and-onboarding/07-01
    provides: schema v4 (import_log timestamps), getImportedFileInfo, peekFirstTimestamp, updateImportLog with timestamp params

provides:
  - Rolling 30-day import window in importAll() with 3-tier skip chain
  - maxAgeDays option in importAll() (default 30), passed from import route request body
  - New files older than cutoff are peeked (8KB) and recorded as skipped_old for instant re-skip
  - importFile success path records firstMessageAt/lastMessageAt in import_log for cache-based re-skip
  - totalSessions count in timeline API response for welcome-state detection

affects:
  - 07-03-PLAN.md (frontend welcome state uses totalSessions)
  - Any future import performance work

tech-stack:
  added: []
  patterns:
    - "3-tier skip chain: size unchanged (instant) → cached timestamp old (instant) → peek-and-skip (8KB read, then cache)"
    - "Import log as skip cache: both 'ok' and 'skipped_old' records prevent re-processing"
    - "Prepared statements registered once at route registration, called inside handlers"

key-files:
  created: []
  modified:
    - src/importer/index.js
    - src/server/routes/import.js
    - src/server/routes/timeline.js

key-decisions:
  - "maxAgeDays defaults to 30 in importAll(); import route passes it from request body (undefined = use default)"
  - "Skip 3 (peek-and-skip) records firstTs as both first_message_at and last_message_at in skipped_old rows — sufficient for re-skip, avoids full parse"
  - "totalSessionsStmt prepared at registration time alongside existing sessionStmt/messageStmt (same pattern)"

patterns-established:
  - "Rolling window cutoff: new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString() for lexicographic ISO comparison"
  - "Skip chain: each tier uses continue to fall through to toImport.push(file)"

duration: 2min
completed: 2026-03-04
---

# Phase 7 Plan 02: Rolling Import Window and Timeline totalSessions Summary

**3-tier rolling-window skip chain in importAll() with 30-day default and totalSessions count in timeline API**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T03:34:04Z
- **Completed:** 2026-03-04T03:35:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Rolling 30-day window default in importAll() — new imports skip files with all messages older than 30 days without full parsing
- 3-tier skip chain: size unchanged (instant) → cached lastMessageAt before cutoff (instant) → peek-first-8KB for new files (records skipped_old for next-run instant re-skip)
- importFile success path now stores firstMessageAt/lastMessageAt in import_log, enabling tier-2 cache-based re-skip on subsequent runs
- Import route reads maxAgeDays from request body and passes to importAll (undefined = use default of 30)
- Timeline API includes totalSessions (COUNT(*) from sessions) for frontend welcome-state detection in plan 03

## Task Commits

1. **Task 1: Rolling window filter logic in importAll() and import route** - `334bf9e` (feat)
2. **Task 2: Add totalSessions to timeline API response** - `814fad9` (feat)

**Plan metadata:** (included in this docs commit)

## Files Created/Modified

- `src/importer/index.js` - Added maxAgeDays option, cutoffDate computation, 3-tier skip chain, peekFirstTimestamp import, timestamp args to updateImportLog
- `src/server/routes/import.js` - Reads maxAgeDays from request body, passes to importAll
- `src/server/routes/timeline.js` - Adds totalSessionsStmt prepared statement and totalSessions in response

## Decisions Made

- maxAgeDays defaults to 30 in importAll(); when import route sends undefined (no body field), importAll uses its own default — no need for route to supply a fallback
- Peek-and-skip (Skip 3) records firstTs as both first_message_at and last_message_at in the skipped_old row — avoids a second full parse, sufficient for re-skip decisions
- totalSessionsStmt follows existing pattern of preparing statements at registration time outside the handler

## Deviations from Plan

None - plan executed exactly as written. All functions from 07-01 (getImportedFileInfo, peekFirstTimestamp, updateImportLog with timestamp params) were already in place.

## Issues Encountered

None - the 07-01 schema and db-writer work meant all required functions existed. Execution was straightforward wiring.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Rolling import window live: fast re-imports by default, instant re-skip for known-old files
- totalSessions in timeline API response enables plan 03 welcome screen detection (totalSessions === 0)
- No blockers for 07-03

---
*Phase: 07-rolling-import-and-onboarding*
*Completed: 2026-03-04*
