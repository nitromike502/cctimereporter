# Phase 12: Tour Enhancements - Research

**Researched:** 2026-03-04
**Domain:** driver.js guided tour — adding steps to an existing tour in a Vue 3 app
**Confidence:** HIGH

## Summary

Phase 12 is a focused enhancement to the existing driver.js tour implemented in Phase 10-02. The tour currently has 4 steps targeting the date picker, import button, Gantt chart, and session detail panel. Two new steps must be added: one for the project filter checkboxes (`.filter-bar`) and one for the day summary totals section (`.day-summary`).

The implementation is purely additive. No new dependencies are required. The task is inserting two new step objects into the `steps` array inside `startTourIfNew()` in `TimelinePage.vue`. The key technical consideration is that `.filter-bar` has a conditional render (`v-if="colorizedProjects.length > 1"`) — it only exists in the DOM when there are more than one project. The driver.js codebase was directly inspected (v1.4.0 installed at `node_modules/driver.js/dist/driver.js.mjs`) and confirmed that when `document.querySelector()` returns null, driver.js falls back to a centered dummy element (rather than skipping the step or throwing). This means a filter-bar step will show the popover centered in the viewport when only one project is present.

The correct remediation for the conditional filter bar is to gate the filter-bar step conditionally: include it only when `colorizedProjects.length > 1`. This can be done by building the `steps` array dynamically in `startTourIfNew()` before passing it to `driver()`.

**Primary recommendation:** Add two new steps to the existing `startTourIfNew()` function using a dynamically-built `steps` array. Gate the filter-bar step on `colorizedProjects.value.length > 1` so it is only included when the element is actually in the DOM.

## Standard Stack

### Core (no changes needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| driver.js | 1.4.0 (already installed) | Multi-step guided tour | Already in use; adding steps requires no new deps |

### No New Dependencies

This phase requires no new `npm install` commands. The entire implementation is modifying `TimelinePage.vue` to insert step objects into the existing `steps` array.

## Architecture Patterns

### Relevant Project Structure

```
src/client/
├── pages/
│   └── TimelinePage.vue        # startTourIfNew() lives here — ONLY FILE MODIFIED
└── components/
    ├── DaySummary.vue           # root class: .day-summary (always rendered)
    └── (filter-bar is inline in TimelinePage, class: .filter-bar, conditional)
```

### Pattern: Extend Existing Tour Steps Array

**What:** The existing `startTourIfNew()` function in `TimelinePage.vue` has a hardcoded `steps` array. To add steps, insert new step objects at the appropriate position in that array.

**Step ordering logic:** The new steps belong after the existing content steps. Logical reading order follows visual top-to-bottom layout:
1. `.datepicker-wrapper` — toolbar (existing step 1)
2. `.import-group` — toolbar (existing step 2)
3. `.gantt-chart` — main area (existing step 3)
4. `.session-detail-panel` — main area (existing step 4)
5. `.filter-bar` — below session detail (NEW step 5, conditional)
6. `.day-summary` — bottom of page (NEW step 6)

**Visual layout in DOM (TimelinePage.vue template):**
```
<SessionDetailPanel>   <!-- .session-detail-panel -->
<div class="filter-bar" v-if="colorizedProjects.length > 1">  <!-- conditional -->
<GanttLegend>
<GanttChart>           <!-- .gantt-chart -->
<DaySummary>           <!-- .day-summary -->
```

Note: The Gantt chart sits between the filter bar and day summary in DOM order. The tour step ordering does not need to match exact DOM order — logical grouping matters more.

### Pattern: Conditional Step Inclusion for Conditionally-Rendered Elements

**What:** Build the `steps` array dynamically before passing it to `driver()`. Gate conditional steps using the same condition as the `v-if` that controls the element's DOM presence.

**Why needed:** `.filter-bar` uses `v-if="colorizedProjects.length > 1"`. When only one project is present, `.filter-bar` is absent from the DOM. Driver.js does NOT skip steps for missing elements — confirmed by reading the driver.js v1.4.0 source (`driver.js.mjs` line 158-160): when `document.querySelector(selector)` returns null, driver.js substitutes a centered dummy element and shows the popover in the center of the viewport. This would look broken for a tour step that claims to highlight the filter bar.

**Example (build steps array dynamically):**

```javascript
function startTourIfNew() {
  // Base steps that are always present in the DOM when tour runs
  const steps = [
    {
      element: '.datepicker-wrapper',
      popover: {
        title: 'Navigate by Date',
        description: 'Pick any date to view your Claude Code sessions for that day.',
        side: 'bottom',
      },
    },
    {
      element: '.import-group',
      popover: {
        title: 'Import Sessions',
        description: 'Click Import to scan your Claude Code transcripts and load them into the timeline.',
        side: 'left',
      },
    },
    {
      element: '.gantt-chart',
      popover: {
        title: 'Session Timeline',
        description: 'Each bar represents a coding session. Sessions are grouped by project. Click any bar to see details.',
        side: 'top',
      },
    },
    {
      element: '.session-detail-panel',
      popover: {
        title: 'Session Details',
        description: 'When you click a session bar, its ticket, branch, working time, and first prompt appear here.',
        side: 'top',
      },
    },
  ]

  // Conditionally include filter-bar step (only when > 1 project exists in DOM)
  if (colorizedProjects.value.length > 1) {
    steps.push({
      element: '.filter-bar',
      popover: {
        title: 'Filter by Project',
        description: 'Use these checkboxes to show or hide individual projects in the timeline.',
        side: 'bottom',
      },
    })
  }

  // Day summary is always rendered when tour is eligible (data.projects.length > 0)
  steps.push({
    element: '.day-summary',
    popover: {
      title: 'Day Totals',
      description: 'See total working time for the day, broken down by project, ticket, and branch.',
      side: 'top',
    },
  })

  const tourDriver = driver({
    showProgress: true,
    onDestroyed: () => {
      localStorage.setItem(TOUR_KEY, 'true')
    },
    steps,
  })
  tourDriver.drive()
}
```

### Anti-Patterns to Avoid

- **Hardcoded steps array with `.filter-bar` step always included:** When `colorizedProjects.length === 1`, `.filter-bar` is absent from the DOM. Driver.js will show the popover floating in the viewport center with no highlighted element — confusing and looks broken.
- **Placing the `.day-summary` step before the Gantt step:** Out-of-order tour steps that don't match visual flow confuse users. Keep steps in logical top-to-bottom order.
- **Resetting `TOUR_KEY` to re-trigger tour for all users:** This phase adds new steps; existing users who already saw the tour will not see the new steps. This is acceptable — do not reset `TOUR_KEY`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step inclusion/exclusion logic | Custom tour state machine | Dynamic `steps` array built before `driver()` call | driver.js already handles all tour sequencing, navigation, and teardown |

**Key insight:** The only work needed is constructing the right `steps` array before calling `driver()`. Driver.js handles everything else.

## Common Pitfalls

### Pitfall 1: Filter Bar Missing from DOM Breaks the Step

**What goes wrong:** If `.filter-bar` is included as a hardcoded step but only one project is present, driver.js centers the popover with no element highlighted.

**Why it happens:** `.filter-bar` has `v-if="colorizedProjects.length > 1"` in TimelinePage.vue (line 49). With 0 or 1 project, the element is not in the DOM.

**How to avoid:** Wrap the filter-bar step in `if (colorizedProjects.value.length > 1) { steps.push(...) }`. The `colorizedProjects` computed ref is already accessible in `startTourIfNew()` because it's defined at the same `<script setup>` scope level.

**Warning signs:** Tour popover appears in the center of the viewport with no highlighted element; progress shows "5 of 6" but nothing is highlighted.

### Pitfall 2: Scroll Target Missing for Day Summary

**What goes wrong:** The `.day-summary` element is at the bottom of the page and may be off-screen when the tour step activates. Driver.js handles scroll-to-element automatically, but if the element is inside an overflow container that clips scroll, driver.js may not scroll correctly.

**Why it happens:** `.timeline-content` has `overflow: auto` (TimelinePage.vue line 318). Driver.js uses `scrollIntoView` which should work inside scroll containers, but it depends on the element being within the scroll container's logical flow.

**How to avoid:** Test manually. Driver.js v1.4.0 uses `scrollIntoView` with smooth scroll behavior (if `smoothScroll: true` in config) or `element.scrollIntoView()` directly. The default should work with `overflow: auto` containers.

**Warning signs:** Tour step for day summary shows popover but the highlighted element is not visible in the viewport.

### Pitfall 3: `colorizedProjects` is a Computed Ref — Must Use `.value`

**What goes wrong:** Accessing `colorizedProjects.length` (forgetting `.value`) returns `undefined` in the `<script setup>` context.

**Why it happens:** `colorizedProjects` is a Vue `computed()` ref; its value is accessed via `colorizedProjects.value`.

**How to avoid:** Use `colorizedProjects.value.length > 1` in the condition.

**Warning signs:** Filter bar step never appears even when multiple projects are visible.

### Pitfall 4: Tour Not Re-Triggered for New Steps After First Visit

**What goes wrong:** Users who already completed the Phase 10-02 tour (and have `cctimereporter:tourSeen` in localStorage) will not see the new steps.

**Why it happens:** The tour guard `if (localStorage.getItem(TOUR_KEY)) return` prevents re-triggering.

**How to avoid:** This is intentional and acceptable behavior. The phase description does not require re-triggering for existing users. Do not reset `TOUR_KEY` — that would force all users to repeat the full tour.

**Warning signs:** N/A — this is expected. If the requirement changes, bump `TOUR_KEY` to `'cctimereporter:tourSeen:v2'`.

## Code Examples

### Complete Updated `startTourIfNew()` Function

Source: Verified against driver.js v1.4.0 TypeScript definitions at `node_modules/driver.js/dist/driver.js.d.ts` and existing implementation at `src/client/pages/TimelinePage.vue`.

```javascript
// In src/client/pages/TimelinePage.vue <script setup>
// colorizedProjects is already defined as a computed ref in the same scope

function startTourIfNew() {
  const steps = [
    {
      element: '.datepicker-wrapper',
      popover: {
        title: 'Navigate by Date',
        description: 'Pick any date to view your Claude Code sessions for that day.',
        side: 'bottom',
      },
    },
    {
      element: '.import-group',
      popover: {
        title: 'Import Sessions',
        description: 'Click Import to scan your Claude Code transcripts and load them into the timeline.',
        side: 'left',
      },
    },
    {
      element: '.gantt-chart',
      popover: {
        title: 'Session Timeline',
        description: 'Each bar represents a coding session. Sessions are grouped by project. Click any bar to see details.',
        side: 'top',
      },
    },
    {
      element: '.session-detail-panel',
      popover: {
        title: 'Session Details',
        description: 'When you click a session bar, its ticket, branch, working time, and first prompt appear here.',
        side: 'top',
      },
    },
  ]

  // Filter bar only renders when more than one project exists
  if (colorizedProjects.value.length > 1) {
    steps.push({
      element: '.filter-bar',
      popover: {
        title: 'Filter by Project',
        description: 'Use these checkboxes to show or hide individual projects in the timeline.',
        side: 'bottom',
      },
    })
  }

  // Day summary is always present when tour is eligible (data.projects.length > 0)
  steps.push({
    element: '.day-summary',
    popover: {
      title: 'Day Totals',
      description: 'See total working time for the day, broken down by project, ticket, and branch.',
      side: 'top',
    },
  })

  const tourDriver = driver({
    showProgress: true,
    onDestroyed: () => {
      localStorage.setItem(TOUR_KEY, 'true')
    },
    steps,
  })
  tourDriver.drive()
}
```

### Driver.js Element Resolution (from source, HIGH confidence)

```javascript
// From node_modules/driver.js/dist/driver.js.mjs line 158-160
// When element selector finds nothing, driver.js creates a centered dummy element
function j(e) {
  const { element: o } = e;
  let t = typeof o == "function" ? o() : typeof o == "string" ? document.querySelector(o) : o;
  t || (t = ye()), be(t, e);  // ye() = createDummyElement() — centered invisible element
}
```

This means missing element = popover appears in viewport center, NOT skipped.

### CSS Selectors for New Steps (verified in source code)

| Selector | File | Condition |
|----------|------|-----------|
| `.filter-bar` | `src/client/pages/TimelinePage.vue` line 49 | Only rendered when `colorizedProjects.length > 1` |
| `.day-summary` | `src/client/components/DaySummary.vue` line 2 | Always rendered when tour is eligible |

## State of the Art

This phase uses the same stack established in Phase 10-02. No changes to library versions or patterns.

| Aspect | Current Approach | Notes |
|--------|-----------------|-------|
| Tour library | driver.js v1.4.0 | Unchanged — no version bump needed |
| Tour trigger | `data.projects.length > 0 && !localStorage.getItem(TOUR_KEY)` | Unchanged |
| Tour persistence | `onDestroyed` sets `TOUR_KEY` | Unchanged |
| New step addition | Dynamic steps array construction | Pattern introduced in this phase |

## Open Questions

1. **Popover position for `.day-summary` when it scrolls off screen**
   - What we know: `.timeline-content` has `overflow: auto`; driver.js uses `scrollIntoView` internally
   - What's unclear: Whether driver.js scroll targets work correctly inside the `overflow: auto` container
   - Recommendation: Trust driver.js default behavior (it handles scroll-to-element); manually test during implementation. If it doesn't scroll correctly, set `smoothScroll: true` in global config.

2. **Popover side for `.filter-bar`**
   - What we know: The filter bar sits below the session detail panel, above the legend and Gantt chart. It has padding but is relatively compact.
   - What's unclear: Whether `side: 'bottom'` shows the popover below the filter bar (pointing at it from above) or above it — `side` in driver.js means the side of the popover relative to the element.
   - Recommendation: Use `side: 'bottom'` — popover will appear below the filter bar. This pushes it toward the Gantt chart area which has space. If it looks awkward, `side: 'top'` is the alternative.

## Sources

### Primary (HIGH confidence)

- `node_modules/driver.js/dist/driver.js.d.ts` — Full TypeScript API: `DriveStep`, `Config`, `Popover`, all callback signatures, `Driver` interface. Confirmed `steps` is `DriveStep[]`, `element` is `string | Element | (() => Element)`.
- `node_modules/driver.js/dist/driver.js.mjs` lines 156-165 — Confirmed element resolution behavior: missing element falls back to centered dummy, does NOT skip step.
- `src/client/pages/TimelinePage.vue` — Confirmed existing `startTourIfNew()` implementation, `colorizedProjects` computed ref scope, `TOUR_KEY` constant, tour trigger location.
- `src/client/components/DaySummary.vue` — Confirmed root element class `.day-summary`, always rendered when parent mounts.
- `src/client/pages/TimelinePage.vue` line 49 — Confirmed `.filter-bar` has `v-if="colorizedProjects.length > 1"`.

### Secondary (MEDIUM confidence)

- Phase 10-02 SUMMARY.md — Confirmed `onDestroyed` (not `onDestroyStarted`) callback used; `nextTick()` before `drive()` pattern.
- Phase 10-02 PLAN.md — Confirmed driver.css and driver-overrides.css import order, CSS custom property approach.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, existing driver.js already installed and documented
- Architecture: HIGH — driver.js element resolution confirmed from source code; conditional step pattern is straightforward JS
- Pitfalls: HIGH — filter-bar conditional render confirmed from source; driver.js dummy-element fallback confirmed from source

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (driver.js v1.4.0 locked in package.json; no version bump expected for this phase)
