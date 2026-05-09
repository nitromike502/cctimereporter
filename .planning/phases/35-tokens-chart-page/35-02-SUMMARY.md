---
phase: 35-tokens-chart-page
plan: "02"
subsystem: ui
tags: [vue, chart.js, vue-chartjs, tokens-page, dark-mode]

# Dependency graph
requires:
  - phase: 35-tokens-chart-page
    plan: "01"
    provides: TokensPage scaffold, chart.js + vue-chartjs installed, shared projectColor
  - phase: 33-service-api-token-queries
    provides: /api/tokens endpoint with per-session token aggregates
provides:
  - TokenChart.vue — vue-chartjs Line wrapper with chart.js registration and click handler
  - Full TokensPage interactive chart: per-session lines, aggregate line, cumulative/per-message toggle
  - Per-message timestamp data on /api/tokens response (tokenMessages arrays)
  - Stacked bar chart for Session Totals view (input + output per session)
  - Time-of-day x-axis with configurable bucket interval and 0-fill for idle gaps
  - Page nav (Timeline | Tokens) integrated into TimelineToolbar (replaces App.vue nav)
  - Project-checkbox visibility toggle (matches timeline pattern)
  - GanttLegend on tokens page for project color reference
  - Project color collision dedup via assignment-based logic in project-colors.js
  - Date persists across Timeline/Tokens page navigation via query param
affects: [36-tokens-chart-message-drill-down]

# Tech tracking
tech-stack:
  patterns:
    - vue-chartjs Line component with reactive chartOptions for theme switching
    - Custom HTML legend driving session/project visibility (not chart.js native legend)
    - Parallel fetch (timeline + tokens) for project metadata enrichment
    - Bucket-based time-series aggregation with 0-fill for continuous lines

key-files:
  created:
    - src/client/components/TokenChart.vue
  modified:
    - src/client/pages/TokensPage.vue
    - src/client/components/TimelineToolbar.vue
    - src/client/components/TokenChart.vue (rework)
    - src/client/pages/TimelinePage.vue
    - src/client/utils/project-colors.js
    - src/services/tokens.js
    - src/client/App.vue

key-decisions:
  - "Per-message data shipped on /api/tokens response (tokenMessages arrays) — avoids second round-trip for chart data"
  - "Custom HTML legend (not chart.js native) — needed for project-grouped visibility toggle and session detail click handling"
  - "Time-of-day x-axis with configurable bucket interval — better UX than message-index axis for spotting time-correlated spikes"
  - "0-fill for idle gaps in per-message line chart — keeps lines continuous and readable across breaks"
  - "Page nav moved into TimelineToolbar (centered) — eliminates App.vue nav bar, single toolbar across both pages"
  - "Project checkboxes (not session checkboxes) — matches timeline UX, simpler for users with many sessions"
  - "Assignment-based color dedup in project-colors.js — fixes collisions when many projects share palette slots"
  - "resetProjectColors() on date change — prevents color carryover between dates"
  - "Date query param persists across Timeline ↔ Tokens nav — preserves user context"

patterns-established:
  - "Stacked bar (input + output) for total-per-session view — clearer than separate bars"
  - "Time-bucketed line series with 0-fill for continuous rendering across idle gaps"
  - "TimelineToolbar as shared toolbar across timeline and tokens pages"

# Metrics
completed: 2026-04-10
---

# Phase 35 Plan 02: Token Usage Line Chart Implementation

**Backfilled summary** — this summary was reconstructed from commits `edf0284` and `dba4fc2` after the milestone was found to be missing it. The plan was executed and shipped, but the SUMMARY.md write step was skipped at the time.

## Accomplishments

Plan 35-02 was delivered across two commits:

### Initial implementation (`edf0284`, 2026-04-08)
- Extended tokens service with per-message query — `getDayTokens` now returns `tokenMessages` arrays per session
- Created `TokenChart.vue` — thin vue-chartjs `Line` wrapper with chart.js registration
- Implemented full `TokensPage.vue`: chart, cumulative/per-message toggle, custom HTML legend, session detail on click, dark-mode reactive `chartOptions`, responsive layout
- Fetched timeline data in parallel with tokens to enrich sessions with project metadata
- Legend items toggle session visibility; aggregate "All Sessions" line updates reactively

### Rework / polish (`dba4fc2`, 2026-04-10)
- Session Totals view: stacked bar chart (input + output per session)
- Per Message view: line chart with time-of-day x-axis, configurable bucket interval, continuous lines with 0-fill across idle gaps
- Added message timestamps to `/api/tokens` response
- Moved page nav (Timeline | Tokens) into TimelineToolbar (centered); removed separate `App.vue` nav bar
- Switched from session checkboxes to project checkboxes (matches timeline UX)
- Added GanttLegend to tokens page (matches timeline)
- Fixed project color collisions with assignment-based dedup in `project-colors.js`
- Added `resetProjectColors()` on date change to prevent carryover
- Date persists across page navigation via query param

## Files Created/Modified

Created:
- `src/client/components/TokenChart.vue` — vue-chartjs Line wrapper

Modified:
- `src/client/pages/TokensPage.vue` (~540 lines net)
- `src/client/components/TimelineToolbar.vue` — page nav integration
- `src/client/pages/TimelinePage.vue` — toolbar nav adoption
- `src/client/utils/project-colors.js` — assignment-based dedup, `resetProjectColors()`
- `src/services/tokens.js` — per-message query and timestamps in response
- `src/client/App.vue` — removed standalone nav bar

## Task Commits

1. `edf0284` — feat(35-02): implement token usage line chart with per-session lines and aggregate
2. `dba4fc2` — feat(35): rework tokens page charts and shared UI

## Decisions Made

See `key-decisions` in frontmatter. Key items:
- Per-message data shipped inline on `/api/tokens` (no second round-trip)
- Custom HTML legend over chart.js native (project-grouped visibility + click-to-detail)
- Time-of-day x-axis with bucket interval + 0-fill (better UX than message-index)
- TimelineToolbar shared across pages; App.vue nav removed
- Project (not session) checkboxes for visibility toggle

## Deviations from Plan

The plan as written specified per-session checkboxes and a message-index x-axis. Implementation evolved during the rework commit to project checkboxes and time-of-day x-axis with bucket intervals — a better UX match with the timeline page and a stronger foundation for Phase 36's drill-down feature.

## Issues Encountered

Initial implementation had project color collisions and color carryover across dates; both fixed in the rework commit (`dba4fc2`).

## User Setup Required

None.

## Next Phase Readiness

- Per Message line chart with time-buckets is the foundation for Phase 36 drill-down (double-click bucket → messages modal)
- `tokenMessages` with timestamps on `/api/tokens` is consumed by Phase 36's bucket-to-timestamp resolution
- TokenChart.vue chart ref exposure enables Phase 36's `getElementsAtEventForMode` drill-down handler

## Backfill Note

This summary was written on 2026-05-09 after the gap was discovered during `/gsd:progress`. Phase 36 was already complete and verified at that point, providing functional confirmation that 35-02 shipped correctly.

---
*Phase: 35-tokens-chart-page*
*Completed: 2026-04-10 (summary backfilled 2026-05-09)*
