---
phase: 12-tour-enhancements
plan: 01
status: complete
commit: feat(12-01): add filter and day summary tour steps
---

## What Was Done

Refactored `startTourIfNew()` in `src/client/pages/TimelinePage.vue` to build a dynamic `steps` array instead of passing steps inline to `driver()`.

### Changes

1. **Extracted steps to a variable** — The 4 existing tour steps (datepicker, import, gantt chart, session detail) are now in a `const steps = [...]` array.

2. **Added conditional filter-bar step** — When `colorizedProjects.value.length > 1`, a step targeting `.filter-bar` is pushed with title "Filter by Project". This is gated because the element uses `v-if` and won't exist in the DOM with a single project.

3. **Added day-summary step** — Always pushed last, targeting `.day-summary` with title "Day Totals".

4. **Passed steps variable to driver()** — `driver({ showProgress: true, onDestroyed: ..., steps })`.

### Tour Step Order

1. Navigate by Date (`.datepicker-wrapper`)
2. Import Sessions (`.import-group`)
3. Session Timeline (`.gantt-chart`)
4. Session Details (`.session-detail-panel`)
5. Filter by Project (`.filter-bar`) — *only when multiple projects*
6. Day Totals (`.day-summary`)

### Verification

- `npm run build` passes clean
- TOUR_KEY unchanged — existing users won't re-see the tour (intentional)
