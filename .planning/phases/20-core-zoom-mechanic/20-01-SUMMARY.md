---
phase: 20-core-zoom-mechanic
plan: 01
subsystem: ui
tags: [vue, gantt, zoom, scroll, wheel, cursor-anchor, canvas]

# Dependency graph
requires:
  - phase: 19-layout-restructure
    provides: pinned labels + scrollable canvas with overflow-x:auto
provides:
  - zoomLevel ref in TimelinePage, passed as prop to GanttChart and TimelineToolbar
  - Wheel zoom handler in GanttChart (1x-4x, ZOOM_STEP=0.25)
  - Cursor-anchor scroll math with nextTick repositioning
  - Canvas width bound to zoomLevel * 100%
affects:
  - 20-02 (zoom controls in toolbar, zoom reset on date change)
  - 21 (zoom polish / UI)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wheel listener via addEventListener with passive:false (allows preventDefault)"
    - "Cursor-anchor scroll formula: scrollLeft = (oldScrollLeft + cursorX) * ratio - cursorX"
    - "nextTick for scrollLeft adjustment after reactive state change"
    - "Zoom state lives in page component (TimelinePage), GanttChart is pure consumer"

key-files:
  created: []
  modified:
    - src/client/pages/TimelinePage.vue
    - src/client/components/GanttChart.vue
    - src/client/components/NumberStepper.vue

key-decisions:
  - "Zoom state managed in TimelinePage (not GanttChart) — GanttChart emits update:zoomLevel upward"
  - "passive:false wheel listener via addEventListener, not Vue template @wheel (which is passive by default)"
  - "Canvas width = zoomLevel * 100% as inline style; CSS rule width:100% removed"
  - "deltaX vs deltaY check ensures trackpad horizontal pan is not intercepted"

patterns-established:
  - "Cursor-anchor zoom: (oldScrollLeft + cursorViewportX) * (newZoom / oldZoom) - cursorViewportX"
  - "Zoom constants: ZOOM_MIN=1, ZOOM_MAX=4, ZOOM_STEP=0.25"

# Metrics
duration: 9min
completed: 2026-03-19
---

# Phase 20 Plan 01: Core Zoom Mechanic Summary

**Wheel zoom on Gantt chart with cursor-anchor scroll math — canvas scales from 1x to 4x, content under cursor stays pinned during zoom**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-19T22:08:21Z
- **Completed:** 2026-03-19T22:17:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `zoomLevel` ref (initialized to 1) in TimelinePage, wired to both GanttChart and TimelineToolbar as prop + emit
- GanttChart canvas width now scales dynamically: `.gantt-canvas { width: zoomLevel * 100% }` via inline style
- Wheel zoom handler with cursor-anchor math: scroll repositions after each zoom step so the chart point under cursor stays stationary
- Wheel listener attached with `{ passive: false }` to allow `event.preventDefault()` — prevents page scroll during zoom
- `deltaX > deltaY` guard ensures trackpad horizontal pan passes through uninterrupted
- `scrollLeft` reset on date prop change (zoom reset to come in Plan 02)

## Task Commits

1. **Task 1: Add zoomLevel state to TimelinePage and pass as prop** - `b092f47` (feat)
2. **Task 2: GanttChart zoom — canvas width binding and wheel handler** - `bc18af7` (feat)

## Files Created/Modified

- `src/client/pages/TimelinePage.vue` - Added `zoomLevel` ref, wired `:zoom-level` to GanttChart and TimelineToolbar with `@update:zoom-level` handlers
- `src/client/components/GanttChart.vue` - Added zoomLevel prop, scrollAreaEl ref, onWheel handler, passive:false wheel listener, canvas width binding, date-change watcher
- `src/client/components/NumberStepper.vue` - Bug fix: parseInt -> parseFloat in onInput and onBlur

## Decisions Made

- Zoom state lives in TimelinePage, not GanttChart. GanttChart emits `update:zoomLevel` upward. This matches the pattern established for `idleThreshold` and keeps GanttChart as a pure display component.
- Used `addEventListener` with `{ passive: false }` instead of Vue `@wheel` template binding — Vue's template wheel listeners are passive by default and cannot call `preventDefault()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed NumberStepper.onInput and onBlur using parseInt instead of parseFloat**

- **Found during:** Pre-execution review (noted in execution objective)
- **Issue:** `parseInt` truncates decimal values, breaking any NumberStepper used with a decimal step (e.g., zoom step of 0.25)
- **Fix:** Replaced `parseInt(e.target.value, 10)` with `parseFloat(e.target.value)` in both `onInput` and `onBlur`
- **Files modified:** `src/client/components/NumberStepper.vue`
- **Verification:** Build passes; component correctly handles decimal input values
- **Committed in:** `bc18af7` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Bug fix necessary for correctness when NumberStepper is used with zoom step (0.25). No scope creep.

## Issues Encountered

None — plan executed cleanly. Build succeeded after both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core zoom mechanic complete and working: wheel zoom 1x-4x, cursor-anchor, horizontal scrollbar appears when zoomed
- Plan 02 can add zoom controls to TimelineToolbar (buttons/display) and zoom reset on date navigation
- TimelineToolbar already receives `:zoom-level` prop and `@update:zoom-level` event from Task 1 — Plan 02 just needs to consume them

---
*Phase: 20-core-zoom-mechanic*
*Completed: 2026-03-19*
