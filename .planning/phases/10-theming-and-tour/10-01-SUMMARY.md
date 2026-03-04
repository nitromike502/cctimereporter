---
phase: 10-theming-and-tour
plan: 01
subsystem: ui
tags: [vue, css, tokens, dark-mode, theming, composable, localStorage]

# Dependency graph
requires:
  - phase: 04-component-library
    provides: Design tokens (tokens.css) and AppDatePicker component
  - phase: 05-timeline-ui
    provides: TimelineToolbar component
provides:
  - User-controlled light/dark mode toggle in toolbar
  - useTheme composable with module-level singleton state
  - FOWT-prevention inline script in index.html
  - data-theme attribute pattern replacing @media dark mode
affects: [10-02-tour]

# Tech tracking
tech-stack:
  added: []
  patterns: [data-theme attribute pattern for theming, module-level Vue composable singleton]

key-files:
  created:
    - src/client/composables/useTheme.js
  modified:
    - src/client/styles/tokens.css
    - src/client/index.html
    - src/client/components/TimelineToolbar.vue
    - src/client/components/AppDatePicker.vue

key-decisions:
  - "10-01: Dark mode uses [data-theme='dark'] on documentElement, not @media query — enables user toggle"
  - "10-01: useTheme singleton at module level — all consumers share identical reactive ref"
  - "10-01: FOWT prevention uses var (not const/let) in inline IIFE for broadest compat"
  - "10-01: localStorage key is 'cctimereporter:theme' — namespaced to avoid collisions"
  - "10-01: AppDatePicker drops matchMedia entirely — delegates to useTheme composable"

patterns-established:
  - "Theme singleton: module-level ref + watch in composable, all components share state via import"
  - "FOWT prevention: inline script before closing </head> reads localStorage then matchMedia"

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 10 Plan 01: Theming Infrastructure Summary

**data-theme attribute toggle replacing @media dark mode — useTheme composable with localStorage persistence and FOWT-prevention inline script wiring AppDatePicker and toolbar toggle**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-04T20:53:59Z
- **Completed:** 2026-03-04T20:55:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Restructured tokens.css from @media-based dark mode to [data-theme="dark"] attribute selector
- Created useTheme.js composable with module-level singleton isDark ref, localStorage persistence, and toggle function
- Added FOWT-prevention inline script to index.html that reads localStorage then falls back to prefers-color-scheme
- Added theme toggle button (sun/moon SVGs) as first item in toolbar right-group
- Replaced AppDatePicker matchMedia detection with shared useTheme composable

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure tokens.css and create useTheme composable** - `cc444e6` (feat)
2. **Task 2: Add theme toggle to toolbar and fix AppDatePicker** - `5ffa762` (feat)

**Plan metadata:** (included in this docs commit)

## Files Created/Modified
- `src/client/composables/useTheme.js` - Module-level singleton isDark ref, watch syncing to DOM/localStorage, exported useTheme() with toggle
- `src/client/styles/tokens.css` - @media block replaced with [data-theme="dark"] selector
- `src/client/index.html` - FOWT-prevention inline IIFE added to <head> before first paint
- `src/client/components/TimelineToolbar.vue` - theme-toggle button added as first right-group child, useTheme wired
- `src/client/components/AppDatePicker.vue` - matchMedia/onMounted/onUnmounted removed, useTheme composable wired

## Decisions Made
- data-theme on documentElement (not body) — consistent with how CSS custom properties cascade, matches common practice
- Module-level singleton in useTheme.js — Vue's reactivity system makes this clean; all toolbar/picker consumers share same isDark ref without prop drilling
- IIFE with var in inline script — avoids global scope pollution while maintaining broadest browser compat for a pre-module context
- localStorage key namespaced as 'cctimereporter:theme' — avoids collisions with other apps on same origin

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Theme toggle fully functional: tokens respond to data-theme attribute, toggle in toolbar, AppDatePicker synced
- Ready for Phase 10 Plan 02 (tour/onboarding feature)
- No blockers

---
*Phase: 10-theming-and-tour*
*Completed: 2026-03-04*
