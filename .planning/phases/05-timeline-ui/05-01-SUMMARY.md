---
phase: 05-timeline-ui
plan: 01
subsystem: api, ui
tags: [vue, fastify, timeline, idle-gaps, toolbar, datepicker]

# Dependency graph
requires:
  - phase: 04-component-library
    provides: AppButton, AppDatePicker, AppProgressBar components consumed by TimelineToolbar
  - phase: 03-server-and-cli
    provides: timeline route (timeline.js) extended in this plan

provides:
  - Extended GET /api/timeline response with idleGaps array and summary per session
  - TimelineToolbar.vue component with date navigation, import trigger, and progress feedback

affects:
  - 05-02 (Gantt chart will consume idleGaps from API to render faded segments)
  - 05-03 (Timeline page wires TimelineToolbar into page layout)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "computeIdleGaps reuses same timestamps array already fetched for computeWorkingTime — no extra DB query"
    - "TimelineToolbar emits events only (navigate, import) — parent owns routing and data fetching"
    - "DST-safe date arithmetic via noon-anchored Date construction (dateStr + T12:00:00)"

key-files:
  created:
    - src/client/components/TimelineToolbar.vue
  modified:
    - src/server/routes/timeline.js

key-decisions:
  - "computeIdleGaps gaps use same IDLE_THRESHOLD_MS (10 min) as computeWorkingTime — single source of truth for threshold"
  - "idleGaps entries are { start, end } ISO strings — same format as session timestamps for consistency"
  - "TimelineToolbar receives date as prop and emits navigate — toolbar has no router dependency"
  - "pickerDate computed from props.date (noon-anchored) to avoid timezone display drift"

patterns-established:
  - "Toolbar pattern: parent-owned state, child emits — toolbar never directly mutates date or triggers fetches"
  - "Gap computation pattern: same timestamps array reused for both workingTime and idleGaps"

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 5 Plan 1: Timeline API Extensions + TimelineToolbar Summary

**Timeline API extended with idleGaps [{start,end}] and session summary per session; TimelineToolbar built with prev/next/today/yesterday nav, DatePicker jump-to-date, and import button with indeterminate progress bar**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T16:13:09Z
- **Completed:** 2026-02-28T16:15:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended `GET /api/timeline` to include `idleGaps: [{start, end}]` per session — same timestamps array reused, no extra DB query
- Added `summary` field to each session object (from `sessions.summary` column)
- Built `TimelineToolbar.vue` consuming all three Phase 4 components (AppButton, AppDatePicker, AppProgressBar)
- Verified `computeIdleGaps` correctly detects 3 gaps on real data (2026-02-27)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend timeline API with idleGaps and summary fields** - `16ea1d4` (feat)
2. **Task 2: Build TimelineToolbar component** - `e4cd3aa` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/server/routes/timeline.js` - Added `computeIdleGaps()` function, added `s.summary` to SQL SELECT, added both fields to session response object
- `src/client/components/TimelineToolbar.vue` - New toolbar component with full date navigation, DatePicker, import button, and indeterminate progress bar

## Decisions Made
- `computeIdleGaps` uses the same `IDLE_THRESHOLD_MS` constant as `computeWorkingTime` — single source of truth, no separate config
- Gap entries are `{ start, end }` ISO timestamp strings matching the format of other session timestamps
- TimelineToolbar emits `navigate(dateStr)` and `import()` only — it has no router imports or fetch calls; parent page owns data flow
- DatePicker `pickerDate` is a computed (not ref) derived from `props.date` with noon-anchoring — prevents timezone-driven display drift

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Shell interpolation of `!` in bash `-e` strings caused test script failures — resolved by writing a separate `.mjs` verification script. No code changes required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `idleGaps` data is now available for Phase 5 Plan 2 (Gantt chart) to render faded segments over idle periods
- `TimelineToolbar` is ready to be wired into the timeline page in Phase 5 Plan 3
- `summary` field is available for session label fallback chain in the Gantt row labels

---
*Phase: 05-timeline-ui*
*Completed: 2026-02-28*
