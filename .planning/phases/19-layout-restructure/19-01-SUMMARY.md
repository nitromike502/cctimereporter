---
phase: 19-layout-restructure
plan: 01
status: complete
started: 2026-03-19
completed: 2026-03-19
---

## What Was Built

Restructured GanttChart.vue from a single-flow layout (labels inline with bars) to a two-column flex layout enabling horizontal zoom scrolling.

### Deliverables

| Artifact | Description |
|----------|-------------|
| `src/client/components/GanttChart.vue` | Two-column layout: pinned `.gantt-labels` (140px) + scrollable `.gantt-scroll-area` |

### Key Changes

- **DOM restructure:** Labels extracted into `.gantt-labels` column; time axis, grid overlay, and swimlanes moved into `.gantt-scroll-area > .gantt-canvas`
- **Removed `overflow: hidden`** from `.gantt-chart` — unblocks horizontal scrolling for Phase 20
- **Removed `margin-left: 140px`** from `.time-axis` and `left: 140px` from `.grid-overlay` — no longer needed inside scroll canvas
- **Height synchronization:** `computeSubRowCount()` replicates GanttSwimlane's greedy overlap algorithm to compute matching label row heights
- **12a label fix:** Added `padding-left: 14px` with `margin-left: -14px` on scroll area to prevent first tick label clipping while keeping grid aligned

### Commits

| Hash | Message |
|------|---------|
| `7ded9d2` | feat(19-01): restructure GanttChart.vue DOM and styles |
| `9f8c7d8` | fix(19-01): prevent 12a tick label clipping at left edge |

### Deviations

- **12a tick clipping:** The first tick label ("12a") at `left: 0%` with `translateX(-50%)` was clipped by the scroll area edge. Fixed with padding + negative margin. This was a pre-existing issue made more visible by the restructure.

### Verification

- Build succeeds (`npm run build`)
- Human visual regression check: approved
- `.gantt-chart` class preserved on outermost element (driver.js tour compatible)
- `overflow: hidden` removed
- `.gantt-scroll-area` has `overflow-x: auto`
