# Phase 9: Day Summary - Research

**Researched:** 2026-03-04
**Domain:** Vue 3 computed aggregation, Reka UI Tabs, summary table layout
**Confidence:** HIGH

## Summary

Phase 9 adds a DaySummary panel below the Gantt chart showing total working time and per-project, per-ticket, and per-branch breakdowns. The good news: all data needed to compute the summaries already exists in the `/api/timeline` response — no new API endpoints, no schema changes, and no new backend work is required.

The timeline API currently returns `projects[]`, each with `sessions[]`. Each session already carries `workingTimeMs`, `ticket`, `branch`, `sessionId`, and project-level `displayName`. All four summary requirements (total time, per-project, per-ticket, per-branch) can be computed purely as computed properties in Vue from `timelineData.value`.

Reka UI (already installed at v2.8.2) includes a full `Tabs` primitive: `TabsRoot`, `TabsList`, `TabsTrigger`, `TabsContent`. This provides accessible keyboard-navigable tabs for the three breakdown views (project, ticket, branch) — no new npm installs needed.

**Primary recommendation:** Build a single `DaySummary.vue` component that accepts the `projects` array as a prop and computes aggregations internally. Integrate it into `TimelinePage.vue` after the `GanttChart` block. No backend changes are needed.

## Standard Stack

### Core (already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vue 3 computed | 3.5.29 | Aggregate session data into summary tables | Built-in reactive aggregation |
| reka-ui Tabs | 2.8.2 | Accessible tab switching for 3 breakdown views | Already installed, WAI-ARIA tabs out of box |

### No New Dependencies

All tooling required for Phase 9 is already present:
- Reka UI Tabs (TabsRoot, TabsList, TabsTrigger, TabsContent) — confirmed present in `node_modules/reka-ui/dist/Tabs/`
- Design tokens (tokens.css) — already loaded globally
- Vue 3 `computed` — built-in

**Installation:** None required.

## Architecture Patterns

### Recommended Project Structure

No new directories. One new file:

```
src/client/components/
├── DaySummary.vue          # NEW: total + tabbed breakdowns
├── SessionDetailPanel.vue  # Existing
├── GanttChart.vue          # Existing
└── ...
```

### Pattern 1: Pure Computed Aggregation

**What:** `DaySummary.vue` receives `projects` (the same array already passed to `GanttChart`) and derives all summary data via computed properties. No API calls, no watchers, no store.

**Why:** The timeline API response already contains everything needed. Sessions have `workingTimeMs`, `ticket` (nullable), `branch` (nullable), `sessionId`. Projects have `displayName` and `projectId`.

**Data flow:**

```
TimelinePage.vue
  visibleProjects → GanttChart (existing)
  timelineData.projects → DaySummary (new)  ← use ALL projects, not just visible
```

**Note on filtering:** The DaySummary should aggregate from ALL projects in `timelineData.projects`, not from `visibleProjects`. The filter bar hides rows from the Gantt but the day's total working time should be complete. This is a deliberate UX decision — document it in the component.

### Pattern 2: Aggregation Functions

All aggregations follow the same shape: flatten all sessions across all projects, then group and sum.

**Total working time (SUM-01):**
```javascript
const totalWorkingMs = computed(() => {
  return props.projects.flatMap(p => p.sessions)
    .reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0)
})
```

**Per-project (SUM-02):**
```javascript
const projectRows = computed(() => {
  return props.projects
    .map(p => ({
      displayName: p.displayName,
      sessionCount: p.sessions.length,
      workingTimeMs: p.sessions.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0),
    }))
    .sort((a, b) => b.workingTimeMs - a.workingTimeMs)
})
```

**Per-ticket (SUM-03):**
```javascript
const ticketRows = computed(() => {
  const map = new Map()  // ticket key → { sessionCount, workingTimeMs }
  for (const session of props.projects.flatMap(p => p.sessions)) {
    const key = session.ticket || null  // null = unticket group
    if (!map.has(key)) map.set(key, { ticket: key, sessionCount: 0, workingTimeMs: 0 })
    const row = map.get(key)
    row.sessionCount++
    row.workingTimeMs += session.workingTimeMs ?? 0
  }
  // Sort: ticketed entries by workingTimeMs desc, then null group last
  const rows = [...map.values()]
  return [
    ...rows.filter(r => r.ticket !== null).sort((a, b) => b.workingTimeMs - a.workingTimeMs),
    ...rows.filter(r => r.ticket === null),
  ]
})
```

**Per-branch (SUM-04):**
```javascript
const branchRows = computed(() => {
  const map = new Map()
  for (const session of props.projects.flatMap(p => p.sessions)) {
    const key = session.branch || null
    if (!map.has(key)) map.set(key, { branch: key, sessionCount: 0, workingTimeMs: 0 })
    const row = map.get(key)
    row.sessionCount++
    row.workingTimeMs += session.workingTimeMs ?? 0
  }
  const rows = [...map.values()]
  return [
    ...rows.filter(r => r.branch !== null).sort((a, b) => b.workingTimeMs - a.workingTimeMs),
    ...rows.filter(r => r.branch === null),
  ]
})
```

### Pattern 3: Reka UI Tabs for Breakdowns

**What:** TabsRoot wraps three tabs (Project, Ticket, Branch). TabsList holds the triggers. TabsContent renders a table for each active tab.

**Verified exports from reka-ui v2.8.2:**
- `TabsRoot` — root with `defaultValue` and `v-model`
- `TabsList` — tab strip container
- `TabsTrigger` — individual tab button (requires `value` prop)
- `TabsContent` — panel content (requires `value` prop matching a trigger)
- `TabsIndicator` — optional sliding underline indicator

**TabsTrigger behavior (verified from source):**
- Adds `data-state="active"` when selected, `data-state="inactive"` otherwise
- Sets `role="tab"`, `aria-selected`
- Handles keyboard navigation (arrow keys) via `RovingFocusItem` internally

**Usage pattern:**
```vue
<TabsRoot default-value="project">
  <TabsList>
    <TabsTrigger value="project">By Project</TabsTrigger>
    <TabsTrigger value="ticket">By Ticket</TabsTrigger>
    <TabsTrigger value="branch">By Branch</TabsTrigger>
  </TabsList>
  <TabsContent value="project">
    <!-- project table -->
  </TabsContent>
  <TabsContent value="ticket">
    <!-- ticket table -->
  </TabsContent>
  <TabsContent value="branch">
    <!-- branch table -->
  </TabsContent>
</TabsRoot>
```

**Note:** `TabsContent` has `unmountOnHide: true` by default — inactive panels are unmounted from DOM. For this use case (small static tables) that's fine.

### Pattern 4: Working Time Formatting

**What:** Format milliseconds as human-readable strings. No library needed — a small util function.

**Pattern used in SessionDetailPanel.vue (already verified):**
```javascript
const minutes = Math.round(session.workingTimeMs / 60000)
return `${minutes} min`
```

**For DaySummary, extend to handle hours:**
```javascript
function formatWorkingTime(ms) {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
```

This function should live inside `DaySummary.vue` (not a shared utility) to keep the component self-contained.

### Pattern 5: Integration in TimelinePage.vue

**Where to place:** After `<GanttChart>` and before the closing `</div>` of `.timeline-content`, inside the `v-else-if="timelineData"` block.

```vue
<!-- In timeline-content block, after GanttChart: -->
<DaySummary :projects="timelineData.projects" />
```

**Why `timelineData.projects` not `visibleProjects`:** The summary shows the full day's activity. Hiding a project from the Gantt (for visual clarity) shouldn't hide it from the time accounting. This mirrors the intent of SUM-01: "total working time figure for the day."

### Anti-Patterns to Avoid

- **Don't make a new API endpoint:** All data is already in the `/api/timeline` response. A separate `/api/summary` endpoint would add backend complexity for zero benefit.
- **Don't flatten inside the template:** Aggregation logic belongs in `computed()`, not in `v-for` expressions.
- **Don't use `v-if` on individual tab panels:** Use `TabsContent` from Reka UI which handles visibility correctly with ARIA.
- **Don't share formatWorkingTime as a global util yet:** Keep it local in `DaySummary.vue` unless Phase 10 needs it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible tabs | Custom div-based tab UI | Reka UI TabsRoot/TabsList/TabsTrigger/TabsContent | Keyboard nav, ARIA roles, data-state managed automatically |
| Working time aggregation | Separate DB query or new API | Vue computed from existing projects prop | All data already in timeline response |

**Key insight:** The timeline API was designed to return full session data per project. That data model directly enables all four SUM requirements without any backend changes.

## Common Pitfalls

### Pitfall 1: Using visibleProjects Instead of All Projects

**What goes wrong:** Wiring `DaySummary` to `visibleProjects` (the filtered set) means unchecking a project from the filter bar would subtract its time from the day total — confusing and incorrect.

**Why it happens:** `visibleProjects` is already available as a computed in `TimelinePage.vue`, making it the "obvious" prop to pass.

**How to avoid:** Pass `timelineData.projects` (unfiltered) to `DaySummary`.

**Warning signs:** Total working time changes when toggling project visibility filters.

### Pitfall 2: Null Ticket/Branch Grouping

**What goes wrong:** Sessions with `ticket: null` or `branch: null` must be grouped as a single "(no ticket)" or "(no branch)" row. If null keys are spread across multiple map entries, each session becomes its own row.

**Why it happens:** `Map` keys are identity-compared — `null === null` so this works correctly with a null key. But if the code uses `session.ticket || 'no-ticket'` as the key, it conflates null with empty string.

**How to avoid:** Use `session.ticket || null` to normalize, then handle the null key as the fallback group explicitly. Display as "(untracked)" or "—".

**Warning signs:** Many rows showing "—" instead of one grouped row.

### Pitfall 3: TabsTrigger data-state Styling

**What goes wrong:** TabsTrigger renders with `data-state="active"` but if you only add hover styles and no `[data-state="active"]` styles, there's no visual indicator which tab is selected.

**How to avoid:** Add explicit CSS for `[data-state="active"]` on `.tab-trigger` in the component styles. Pattern from `AppCheckbox.vue`:
```css
.tab-trigger[data-state="active"] {
  color: var(--color-primary);
  border-bottom: 2px solid var(--color-primary);
}
```

**Warning signs:** All tabs look identical; no visual selection state.

### Pitfall 4: Empty State When No Sessions Have Tickets or Branches

**What goes wrong:** Some days may have only untracked sessions (ticket = null, branch = null). The per-ticket and per-branch tables would show only a "(untracked)" row, which is still useful but should not look broken.

**How to avoid:** Always render the table even with only the null-key group. No special empty state needed.

### Pitfall 5: Floating Point Accumulation in workingTimeMs

**What goes wrong:** Summing many integer millisecond values via `reduce` with initial value `0` is safe in JS (integers up to 2^53). No precision issue for typical session durations.

**Why it matters:** Confirmed not a risk — mention only to prevent unnecessary worry.

### Pitfall 6: Component Registration in TimelinePage.vue

**What goes wrong:** Forgetting to import `DaySummary.vue` in `TimelinePage.vue` after creating the file.

**How to avoid:** Add `import DaySummary from '../components/DaySummary.vue'` in the `<script setup>` block.

## Code Examples

Verified patterns from source inspection:

### Full DaySummary.vue skeleton
```vue
<template>
  <div class="day-summary">
    <div class="summary-total">
      Total working time: <strong>{{ formatWorkingTime(totalWorkingMs) }}</strong>
    </div>

    <TabsRoot default-value="project">
      <TabsList class="tabs-list">
        <TabsTrigger value="project" class="tab-trigger">By Project</TabsTrigger>
        <TabsTrigger value="ticket" class="tab-trigger">By Ticket</TabsTrigger>
        <TabsTrigger value="branch" class="tab-trigger">By Branch</TabsTrigger>
      </TabsList>

      <TabsContent value="project" class="tab-content">
        <table class="summary-table">
          <thead>
            <tr><th>Project</th><th>Sessions</th><th>Working Time</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in projectRows" :key="row.displayName">
              <td>{{ row.displayName }}</td>
              <td>{{ row.sessionCount }}</td>
              <td>{{ formatWorkingTime(row.workingTimeMs) }}</td>
            </tr>
          </tbody>
        </table>
      </TabsContent>

      <TabsContent value="ticket" class="tab-content">
        <table class="summary-table">
          <thead>
            <tr><th>Ticket</th><th>Sessions</th><th>Working Time</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in ticketRows" :key="row.ticket ?? '__none__'">
              <td>{{ row.ticket ?? '(untracked)' }}</td>
              <td>{{ row.sessionCount }}</td>
              <td>{{ formatWorkingTime(row.workingTimeMs) }}</td>
            </tr>
          </tbody>
        </table>
      </TabsContent>

      <TabsContent value="branch" class="tab-content">
        <table class="summary-table">
          <thead>
            <tr><th>Branch</th><th>Sessions</th><th>Working Time</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in branchRows" :key="row.branch ?? '__none__'">
              <td>{{ row.branch ?? '(untracked)' }}</td>
              <td>{{ row.sessionCount }}</td>
              <td>{{ formatWorkingTime(row.workingTimeMs) }}</td>
            </tr>
          </tbody>
        </table>
      </TabsContent>
    </TabsRoot>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'

const props = defineProps({
  projects: { type: Array, required: true },
})

const allSessions = computed(() => props.projects.flatMap(p => p.sessions))

const totalWorkingMs = computed(() =>
  allSessions.value.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0)
)

const projectRows = computed(() =>
  props.projects
    .map(p => ({
      displayName: p.displayName,
      sessionCount: p.sessions.length,
      workingTimeMs: p.sessions.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0),
    }))
    .sort((a, b) => b.workingTimeMs - a.workingTimeMs)
)

function groupBy(sessions, keyFn) {
  const map = new Map()
  for (const s of sessions) {
    const key = keyFn(s)
    if (!map.has(key)) map.set(key, { key, sessionCount: 0, workingTimeMs: 0 })
    const row = map.get(key)
    row.sessionCount++
    row.workingTimeMs += s.workingTimeMs ?? 0
  }
  return map
}

const ticketRows = computed(() => {
  const map = groupBy(allSessions.value, s => s.ticket || null)
  const rows = [...map.values()]
  return [
    ...rows.filter(r => r.key !== null)
           .sort((a, b) => b.workingTimeMs - a.workingTimeMs)
           .map(r => ({ ticket: r.key, sessionCount: r.sessionCount, workingTimeMs: r.workingTimeMs })),
    ...rows.filter(r => r.key === null)
           .map(r => ({ ticket: null, sessionCount: r.sessionCount, workingTimeMs: r.workingTimeMs })),
  ]
})

const branchRows = computed(() => {
  const map = groupBy(allSessions.value, s => s.branch || null)
  const rows = [...map.values()]
  return [
    ...rows.filter(r => r.key !== null)
           .sort((a, b) => b.workingTimeMs - a.workingTimeMs)
           .map(r => ({ branch: r.key, sessionCount: r.sessionCount, workingTimeMs: r.workingTimeMs })),
    ...rows.filter(r => r.key === null)
           .map(r => ({ branch: null, sessionCount: r.sessionCount, workingTimeMs: r.workingTimeMs })),
  ]
})

function formatWorkingTime(ms) {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
</script>
```

### Tab trigger active state CSS (design-token-consistent)
```css
.tabs-list {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--spacing-sm);
}

.tab-trigger {
  padding: var(--spacing-xs) var(--spacing-md);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  color: var(--color-muted);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.tab-trigger[data-state="active"] {
  color: var(--color-heading);
  border-bottom-color: var(--color-primary);
}

.tab-trigger:hover:not([data-state="active"]) {
  color: var(--color-body-text);
}
```

### TimelinePage.vue integration (minimal diff)
```vue
<!-- After GanttChart in the timeline-content block: -->
<DaySummary :projects="timelineData.projects" />
```

```javascript
// Add to script setup imports:
import DaySummary from '../components/DaySummary.vue'
```

## What Already Exists (No Changes Needed)

| Item | Status | Evidence |
|------|--------|---------|
| `workingTimeMs` per session in API response | EXISTS | `timeline.js` line 150, 178 |
| `ticket` per session in API response | EXISTS | `timeline.js` line 179 (`ticket: row.primary_ticket`) |
| `branch` per session in API response | EXISTS | `timeline.js` line 180 (`branch: row.working_branch`) |
| `displayName` per project in API response | EXISTS | `timeline.js` line 187 |
| `timelineData.projects` in TimelinePage | EXISTS | `TimelinePage.vue` line 94 (`timelineData = ref(null)`) |
| Reka UI Tabs primitives | EXISTS | `node_modules/reka-ui/dist/Tabs/` confirmed |
| Design tokens | EXISTS | `src/client/styles/tokens.css` |

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| No summary panel | DaySummary computed from existing API data | Zero backend work needed — all data already in flight |
| No tabs in codebase | Reka UI Tabs (already installed) | No new library, just use existing primitive |

## Open Questions

1. **Should DaySummary respect the project visibility filter?**
   - What we know: The filter bar lets users hide projects from the Gantt chart
   - What's unclear: Should hiding a project also hide it from the day summary?
   - Recommendation: No — pass unfiltered `timelineData.projects`. The summary is about the full day's time accounting. A user hiding a project from the Gantt for visual clarity shouldn't lose its time from the total. If desired, a note "(N projects hidden)" could be added later.

2. **Should DaySummary be shown when only one project exists?**
   - What we know: The project breakdown would be a single row — same as the total
   - What's unclear: Is showing a one-row table useful?
   - Recommendation: Always show it. The ticket and branch breakdowns remain useful even when there's one project. No conditional rendering needed.

3. **Should the selected tab persist across date navigation?**
   - What we know: `TimelinePage.vue` doesn't currently persist UI state for sub-panels across date changes (except idleThreshold in localStorage)
   - Recommendation: Don't persist tab selection. `default-value="project"` on TabsRoot is fine. Adding localStorage for tab choice adds complexity with minimal benefit.

## Sources

### Primary (HIGH confidence)

- Direct source audit: `/home/claude/cctimereporter/src/server/routes/timeline.js` — confirmed all session fields in API response
- Direct source audit: `/home/claude/cctimereporter/src/client/pages/TimelinePage.vue` — confirmed `timelineData.projects` access pattern, `visibleProjects` computed, integration point
- Direct source audit: `/home/claude/cctimereporter/src/client/components/SessionDetailPanel.vue` — confirmed existing `workingTimeMs` formatting pattern
- Direct source audit: `node_modules/reka-ui/dist/Tabs/TabsRoot.js` — confirmed TabsRoot props: `defaultValue`, `modelValue`, `orientation`, `activationMode`, `unmountOnHide`
- Direct source audit: `node_modules/reka-ui/dist/Tabs/TabsTrigger.js` — confirmed `value` prop, `data-state` attribute, keyboard nav via RovingFocusItem
- Direct source audit: `node_modules/reka-ui/dist/Tabs/TabsContent.js` — confirmed `value` prop, `unmountOnHide` default true, `data-state` attribute
- Direct source audit: `node_modules/reka-ui/dist/index.js` — confirmed TabsRoot, TabsList, TabsTrigger, TabsContent, TabsIndicator all exported

### Secondary (MEDIUM confidence)
- AppCheckbox.vue pattern for `data-state` CSS styling — verified by inspection

## Metadata

**Confidence breakdown:**
- Standard stack (no new packages): HIGH — all dependencies confirmed present
- Architecture (computed aggregation): HIGH — data fields verified in API response, no assumptions
- Reka UI Tabs API: HIGH — source-verified from installed node_modules
- Integration point in TimelinePage: HIGH — code read directly
- CSS approach for tabs: MEDIUM — pattern is standard, not runtime-tested yet
- Null-grouping behavior: HIGH — JavaScript Map null-key behavior is well-specified

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain — no external dependencies or fast-moving libraries)
