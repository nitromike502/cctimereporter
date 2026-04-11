---
phase: 36-tokens-chart-message-drill-down
plan: 02
subsystem: ui
tags: [vue, chart.js, vue-chartjs, modal, tokens, drill-down, dblclick]

# Dependency graph
requires:
  - phase: 36-01
    provides: GET /api/sessions/:id/messages?from=ISO&to=ISO with outputTokens and isBucketView flag
  - phase: 35
    provides: TokensPage.vue, TokenChart.vue, SessionMessagesModal.vue foundation
provides:
  - Double-click drill-down on Per Message line chart opens SessionMessagesModal in time-range mode
  - Modal title shows "Session · Start–End · NNK tokens" context for the clicked bucket
  - Token counts on assistant message headers in bucket view
  - In-place modal content swap when double-clicking different chart points
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getElementsAtEventForMode on native dblclick for chart drill-down — avoids Chart.js onDblClick limitation"
    - "timelineBucketState computed exposes bucketStarts/bucketMap for click handler access"
    - "isBucketView flag guards token display so non-bucket modal opens are completely unchanged"
    - "URLSearchParams for conditional query param building in fetch URL"

key-files:
  created: []
  modified:
    - src/client/pages/TokensPage.vue
    - src/client/components/SessionMessagesModal.vue

key-decisions:
  - "Native dblclick event on chart wrapper div + getElementsAtEventForMode — Chart.js has no native onDblClick option"
  - "timelineBucketState refactor exposes bucketStarts without recalculating — single source of truth for chart and handler"
  - "bucketModalLabel computed formats title string — keeps template clean, reactive to all bucket state refs"
  - "isBucketView flag (from API) guards token display rather than checking prop existence — API drives the display mode"

patterns-established:
  - "Bucket drill-down: dblclick on chart wrapper → getElementsAtEventForMode → resolve session + timestamps → open modal"

# Metrics
duration: 2min
completed: 2026-04-11
---

# Phase 36 Plan 02: Tokens Chart Message Drill-Down Summary

**Double-click on Per Message line chart points opens SessionMessagesModal in time-range mode with bucket title and per-message token counts on assistant messages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-11T02:51:50Z
- **Completed:** 2026-04-11T02:54:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `@dblclick` handler on chart wrapper div using `getElementsAtEventForMode` to resolve clicked bucket and session
- Refactored `timelineChartData` to use `timelineBucketState` computed, exposing `bucketStarts` and `bucketMap` for the handler
- `minuteOfDayToISO` converts local minute-of-day back to ISO timestamp for API params
- `bucketModalLabel` computed builds "Session · Start–End · NNK tokens" title string
- `SessionMessagesModal` extended with `fromTimestamp`, `toTimestamp`, `bucketLabel` props
- Watch array includes time-range props for in-place content swap without close/reopen
- Fetch URL uses `URLSearchParams` to conditionally append `from`/`to` params
- `isBucketView` flag parsed from API response guards token count display on assistant messages
- Non-bucket modal opens (Messages button, TimelinePage) completely unchanged

## Task Commits

Both tasks committed together as a single atomic feature commit:

1. **Tasks 1+2: Double-click drill-down + modal time-range mode** - `dfb0d66` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `src/client/pages/TokensPage.vue` - tokenChartRef, timelineBucketState, onChartDblClick, minuteOfDayToISO, formatBucketTokens, bucketModalFrom/To/SessionName/TokenTotal refs, bucketModalLabel computed, updated SessionMessagesModal usage, reset on non-bucket opens and date nav
- `src/client/components/SessionMessagesModal.vue` - fromTimestamp/toTimestamp/bucketLabel props, isBucketView ref, formatTokenCount helper, expanded watch array, URLSearchParams fetch, conditional title template, token count spans on all three message layouts

## Decisions Made
- `getElementsAtEventForMode` on native `dblclick` event rather than Chart.js onClick duplication — Chart.js has no built-in double-click option; native event + mode detection is the recommended pattern
- `timelineBucketState` refactor as separate computed — makes `bucketStarts` accessible to click handler without recalculation; `timelineChartData` destructures from it
- `isBucketView` flag from API response guards token display — the API is authoritative about whether token data was fetched; avoids false-positive display if props are somehow set without a bucket fetch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 36 drill-down feature complete end-to-end
- Double-click interaction pattern established and working
- No blockers for future phases

---
*Phase: 36-tokens-chart-message-drill-down*
*Completed: 2026-04-11*
