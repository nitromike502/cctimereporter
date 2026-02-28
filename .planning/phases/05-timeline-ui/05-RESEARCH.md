# Phase 5: Timeline UI - Research

**Researched:** 2026-02-27
**Domain:** Vue 3 custom Gantt chart, date navigation, import UX
**Confidence:** HIGH (architecture), MEDIUM (HyVueGantt spike conclusion), HIGH (custom CSS approach)

---

## Summary

Phase 5 builds the primary user-facing screen: an interactive Gantt timeline showing Claude Code sessions on a 24h time-of-day axis. The server API is already fully implemented (`GET /api/timeline`, `GET /api/projects`, `POST /api/import`). The client needs a `TimelinePage.vue` that is currently a stub.

**Critical spike result:** HyVueGantt (v5.0.1) does **not** natively support multiple visual segments within a single bar. Its `GGanttBar` renders one bar element, one optional progress overlay, and one optional planned bar — there is no sub-segment API. The `bar-label` slot allows custom content inside the label area but does not split the bar's visual fill into segments. Using HyVueGantt would require hacking its internals or abandoning the idle-gap segment requirement. The prior decision document listed this as a spike needed at Phase 5 start; the spike result is: **skip HyVueGantt, build a custom CSS Gantt**.

**Primary recommendation:** Build a lightweight custom Gantt using CSS `position: absolute` with percentage-based `left` and `width` computed from a 24h time range. Each bar renders as a flex container of inline `<span>` segments (solid for active, faded/transparent for idle gaps). This approach is ~50 lines of logic, fully controlled, matches the idle-gap requirement exactly, and integrates naturally with Vue 3 reactivity.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vue 3 | ^3.5.29 (already installed) | Reactivity, components | Already in project |
| vue-router | ^5.0.3 (already installed) | Route query params, URL sync | Already in project |
| reka-ui | ^2.8.2 (already installed) | AppTooltip, AppCheckbox, AppProgressBar | Already in project |
| @vuepic/vue-datepicker | ^12.1.0 (already installed) | AppDatePicker for date jump | Already in project |

### No New Dependencies Required

All component primitives (AppButton, AppDatePicker, AppCheckbox, AppProgressBar, AppTooltip) are already built in Phase 4. No new npm packages needed for Phase 5. The Gantt is pure CSS + Vue computed properties.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom CSS Gantt | HyVueGantt v5.0.1 | HyVueGantt lacks sub-segment API — idle gaps require segments inside bars |
| Custom CSS Gantt | D3.js custom SVG | D3 adds ~85KB dependency and requires SVG coordinate math; CSS % approach achieves same result with zero deps |
| AppDatePicker | Plain `<input type="date">` | AppDatePicker already built, consistent styling |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Component Structure
```
src/client/pages/TimelinePage.vue      # Main page — data fetching, layout, state
src/client/components/
  GanttChart.vue                        # Timeline canvas: axis + swim lanes
  GanttSwimlane.vue                     # One project's row group (label + bars)
  GanttBar.vue                          # One session bar with idle-gap segments
  GanttLegend.vue                       # Floating color → project name legend
  TimelineToolbar.vue                   # Date nav + Import button + progress
```

### Pattern 1: Time-to-Percentage Conversion

All bar positioning uses a 24h time range. Convert any timestamp to a percentage of the day:

```javascript
// Source: custom — no library needed
const DAY_START = (dateStr) => new Date(`${dateStr}T00:00:00`)
const DAY_END   = (dateStr) => new Date(`${dateStr}T23:59:59.999`)

function timeToPercent(timestamp, dateStr) {
  const start = DAY_START(dateStr).getTime()
  const end   = DAY_END(dateStr).getTime()
  const t     = new Date(timestamp).getTime()
  return Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100))
}
```

Bar CSS: `left: ${startPct}%`, `width: ${endPct - startPct}%`, on a `position: relative` container.

### Pattern 2: Idle-Gap Segment Rendering

The API provides `startTime`, `endTime`, and `workingTimeMs` per session — but NOT the individual message timestamps. To render idle-gap segments, the API must return message timestamps (or the segment spans). Two approaches:

**Option A (preferred):** Extend `/api/timeline` to include `idleGaps: [{start, end}]` per session — computed server-side from message timestamps the same way `workingTimeMs` is computed. Client receives gap spans and renders them as faded overlay `<span>` elements within the bar.

**Option B:** Client receives raw message timestamps and computes gaps itself. Increases payload size but keeps server simple.

Option A is cleaner. The `timeline.js` route already fetches all message timestamps to compute `workingTimeMs` — it can cheaply include gap spans in the response.

```javascript
// Gap segment inside a bar — rendered as faded overlay
// segments: [{type: 'active'|'idle', startPct, widthPct}]
```

### Pattern 3: Overlapping Sessions (Sub-Rows)

Same-project sessions that overlap in wall-clock time must stack vertically within the swim lane. Detection: sort sessions by `startTime`, then check for overlap with previous session's `endTime`. Build sub-row groups in a computed property:

```javascript
function assignSubRows(sessions) {
  const rows = []
  for (const session of sessions.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))) {
    const rowIdx = rows.findIndex(row =>
      row.length === 0 || new Date(row.at(-1).endTime) <= new Date(session.startTime)
    )
    if (rowIdx === -1) rows.push([session])
    else rows[rowIdx].push(session)
  }
  return rows
}
```

Each sub-row renders at a different vertical offset within the swim lane. Swim lane height = `subRowCount * BAR_ROW_HEIGHT + padding`.

### Pattern 4: Date Navigation with URL Sync

Use `useRoute` / `useRouter` from vue-router. The URL format is `/timeline?date=YYYY-MM-DD`.

```javascript
// Source: https://router.vuejs.org/guide/advanced/composition-api
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()

// Read current date from URL (default to today)
const today = () => new Date().toISOString().slice(0, 10)
const selectedDate = computed(() => route.query.date ?? today())

// Navigate — use router.push (creates history entry so back button works)
function navigateToDate(date) {
  router.push({ query: { date } })
}

// Watch URL changes to re-fetch data
watch(() => route.query.date, fetchTimeline)
```

Use `router.push` (not `router.replace`) so browser back/forward work naturally.

### Pattern 5: Project Color Assignment

Hash the project path string to a stable index into a curated palette. A simple djb2-style hash with modulo gives consistent, deterministic color assignment:

```javascript
// Curated palette of visually distinct colors (10 colors)
const COLOR_PALETTE = [
  '#4e9af1', // blue
  '#f4a523', // orange
  '#2ebd6b', // green
  '#e05c5c', // red
  '#a87fe0', // purple
  '#00c4bc', // teal
  '#f06292', // pink
  '#8bc34a', // lime
  '#ff8f00', // amber
  '#78909c', // slate
]

function projectColor(projectPath) {
  let hash = 5381
  for (const char of projectPath) hash = (hash * 33) ^ char.charCodeAt(0)
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
}
```

10 colors is sufficient — in practice a user is unlikely to have more than 10 active projects in a day. If they do, colors will repeat but swim lane separation keeps projects visually distinct.

### Pattern 6: Import UX

The import endpoint (`POST /api/import`) is synchronous — it blocks until all files are processed. Since import can take seconds with many files, the UI should show:

1. `AppButton` with `loading` prop while awaiting the fetch response
2. `AppProgressBar` with `indeterminate` prop appearing below the toolbar during import
3. On 409 Conflict: show "Import already running" message (no second trigger)
4. On success: call `fetchTimeline()` to reload data automatically

```javascript
async function triggerImport() {
  if (importRunning.value) return
  importRunning.value = true
  try {
    const res = await fetch('/api/import', { method: 'POST' })
    if (res.status === 409) { /* already running */ return }
    const data = await res.json()
    await fetchTimeline()  // auto-refresh
  } finally {
    importRunning.value = false
  }
}
```

### Pattern 7: Project Filter Persistence

Store filter state as a `Map<projectId, boolean>` in a `ref`. Initialize all projects as visible when data first loads. When projects change date-to-date, preserve existing visibility for known projects; add new projects as visible.

```javascript
const projectVisibility = ref(new Map())  // projectId → boolean

function initVisibility(projects) {
  for (const p of projects) {
    if (!projectVisibility.value.has(p.projectId)) {
      projectVisibility.value.set(p.projectId, true)  // default visible
    }
  }
}
// Computed: filtered projects for render
const visibleProjects = computed(() =>
  timelineData.value?.projects.filter(p => projectVisibility.value.get(p.projectId) !== false)
)
```

Note: CONTEXT.md specifies filter persists across date changes but resets on page reload — the `ref` (not `localStorage`) satisfies this.

### Pattern 8: Session Bar Label Fallback Chain

```javascript
function sessionLabel(session) {
  if (session.ticket) return session.ticket
  if (session.branch) return session.branch
  // First 5 words of initial prompt — not currently in API response
  // API needs to expose session summary or initialPrompt snippet
  return session.sessionId.slice(0, 8)  // fallback until API extended
}
```

**Important:** The current `/api/timeline` response does NOT include the initial prompt text. To implement the "first 5 words" fallback, the API must be extended to include either `summary` (already in the sessions table as `custom_title` / `summary` columns) or `initialPrompt`. The `sessions` table has `summary` and `custom_title` columns from Phase 2. Exposing `summary` in the timeline response covers the fallback chain naturally.

### Anti-Patterns to Avoid
- **Using HyVueGantt for this use case:** It cannot render sub-segments within bars. Do not attempt to use it.
- **Using D3.js:** Zero-dependency custom CSS is simpler and sufficient for this static bar rendering use case.
- **Absolute pixel widths:** Always use percentage-based positioning relative to the 24h day. Resize-safe.
- **router.replace for date navigation:** Use `router.push` — `replace` breaks the browser back button.
- **Fetching all message timestamps client-side:** The server should compute and return idle gap spans; shipping all timestamps to the client creates unnecessary payload.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible checkbox | Custom `<div>` toggle | `AppCheckbox` (already built) | Keyboard/screen reader support from reka-ui |
| Date picker | Custom calendar | `AppDatePicker` (already built) | Complex calendar state already handled |
| Progress bar | `<div>` with width style | `AppProgressBar` (already built) | Indeterminate animation included |
| Tooltips | CSS `:hover` `::after` | `AppTooltip` (already built) | Accessible, Reka UI portaling |
| Button loading state | Custom spinner | `AppButton` with `loading` prop (already built) | Consistent design system |

**Key insight:** Phase 4 specifically built the component library so Phase 5 could assemble UI from parts. Use every component that fits rather than writing custom HTML.

---

## Common Pitfalls

### Pitfall 1: Viewport Auto-Scroll to Active Range

**What goes wrong:** The time axis covers 00:00–23:59, but most sessions are clustered during working hours. Rendering the full 24h axis with tiny bars is unusable.

**Why it happens:** The context decision says "viewport auto-scrolls/zooms to the active range." This is not automatic with a static CSS layout.

**How to avoid:** On data load, compute the earliest `startTime` and latest `endTime` across all sessions. Scroll the chart container so the active range is centered. Use `scrollIntoView` or set `scrollLeft` on the chart container after data renders. Add 30-minute padding on each side of the active range.

**Warning signs:** Timeline renders with all bars crammed into a tiny visible strip in the middle.

### Pitfall 2: Session Spanning Midnight

**What goes wrong:** A session that starts at 23:50 and ends at 00:10 the next day has `first_message_at` and `last_message_at` on different dates. The API query uses `DATE(first_message_at) <= ? AND DATE(last_message_at) >= ?` — so such sessions do appear in both days' responses. When rendering for the "later" date, the bar `left` position would be negative (start is yesterday).

**Why it happens:** `timeToPercent` with yesterday's start time returns a negative percentage.

**How to avoid:** Clamp `timeToPercent` output to `[0, 100]`. If `startPct < 0`, the bar started "before" this day's viewport — render from the left edge. This is already in the formula above (`Math.max(0, ...)`).

### Pitfall 3: API Does Not Return Idle Gap Spans or Session Summary

**What goes wrong:** The current `/api/timeline` response provides `workingTimeMs` but NOT the individual idle gap segments, and does NOT include `summary` or initial prompt text for the label fallback chain.

**Why it happens:** Phase 3 built the API for Phase 5 to extend, but did not pre-build every field.

**How to avoid:** Phase 5 MUST extend `src/server/routes/timeline.js` to:
1. Add `idleGaps: [{start: ISO8601, end: ISO8601}]` to each session object — computed from message timestamps (already fetched for `workingTimeMs`, just add gap detection)
2. Add `summary` field from `sessions.summary` or `sessions.custom_title` column

### Pitfall 4: Filter State Losing Entries on Date Change

**What goes wrong:** Each date change fetches new projects. If the filter map is cleared and rebuilt, previously set visibility is lost.

**Why it happens:** Naive implementation clears and rebuilds the visibility map on each fetch.

**How to avoid:** Use `initVisibility` pattern from Pattern 7 — only set entries that are not already in the map. Existing entries survive date changes.

### Pitfall 5: HyVueGantt Precision Mode Mismatch

**What goes wrong:** HyVueGantt uses `precision: 'day'` or `precision: 'hour'` — neither maps cleanly to sub-hour time-of-day Gantt with minute-level precision.

**Why it happens:** The library is designed for project management (multi-day tasks), not time-of-day session tracking (sessions measured in hours/minutes).

**How to avoid:** Do not use HyVueGantt. The custom CSS approach uses raw timestamps and has no precision concept — it handles any time range.

### Pitfall 6: Tooltip on Narrow Bars

**What goes wrong:** Short sessions produce very narrow bars (a few pixels). The bar label is clipped. The tooltip trigger area is too small to hover reliably.

**Why it happens:** CSS `overflow: hidden` + `text-overflow: ellipsis` clips label. The bar `<div>` may be 2px wide.

**How to avoid:** Set a `min-width` on bars (e.g., 4px) so they are always hoverable. Wrap the entire bar (not just the label) in `<AppTooltip>`. The full-width trigger area makes hover reliable regardless of bar width.

---

## Code Examples

Verified patterns from official sources and the existing codebase:

### Timeline API Response Shape (existing)
```javascript
// GET /api/timeline?date=2026-02-27
// Source: src/server/routes/timeline.js
{
  date: "2026-02-27",
  projects: [
    {
      projectId: 1,
      projectPath: "/home/user/.claude/projects/my-project",
      displayName: "my-project",
      sessions: [
        {
          sessionId: "abc123...",
          startTime: "2026-02-27T09:00:00.000Z",
          endTime: "2026-02-27T11:30:00.000Z",
          workingTimeMs: 4200000,
          ticket: "AILASUP-42",
          branch: "meckert-AILASUP-42",
          messageCount: 84,
          userMessageCount: 12,
          forkCount: 0,
          realForkCount: 0,
        }
      ]
    }
  ]
}
```

### Extended API Response Shape (Phase 5 must add)
```javascript
// Additions needed in src/server/routes/timeline.js:
sessions: [{
  // ... existing fields ...
  summary: "Implement authentication middleware",  // from sessions.summary
  idleGaps: [                                       // computed from message timestamps
    { start: "2026-02-27T09:45:00.000Z", end: "2026-02-27T10:10:00.000Z" }
  ]
}]
```

### Vue Router Date Navigation
```javascript
// Source: https://router.vuejs.org/guide/advanced/composition-api
import { useRoute, useRouter } from 'vue-router'
import { computed, watch } from 'vue'

const route = useRoute()
const router = useRouter()

const selectedDate = computed(() => {
  return route.query.date ?? new Date().toISOString().slice(0, 10)
})

function goToDate(dateStr) {
  router.push({ path: '/timeline', query: { date: dateStr } })
}

function prevDay() {
  const d = new Date(selectedDate.value + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  goToDate(d.toISOString().slice(0, 10))
}

function nextDay() {
  const d = new Date(selectedDate.value + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  goToDate(d.toISOString().slice(0, 10))
}

function today() { goToDate(new Date().toISOString().slice(0, 10)) }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  goToDate(d.toISOString().slice(0, 10))
}

watch(() => route.query.date, () => fetchTimeline())
```

### Bar Segment Computation
```javascript
// Compute segments for a single session bar
// segments: Array<{type: 'active'|'idle', leftPct: number, widthPct: number}>
function computeBarSegments(session, dateStr) {
  const dayStartMs = new Date(dateStr + 'T00:00:00').getTime()
  const dayDurationMs = 24 * 60 * 60 * 1000

  const toPct = (isoStr) =>
    Math.max(0, Math.min(100,
      (new Date(isoStr).getTime() - dayStartMs) / dayDurationMs * 100
    ))

  const startPct = toPct(session.startTime)
  const endPct   = toPct(session.endTime)

  if (!session.idleGaps || session.idleGaps.length === 0) {
    return [{ type: 'active', leftPct: startPct, widthPct: endPct - startPct }]
  }

  const segments = []
  let cursor = session.startTime

  for (const gap of session.idleGaps) {
    const activePct = toPct(cursor)
    const gapStartPct = toPct(gap.start)
    if (gapStartPct > activePct) {
      segments.push({ type: 'active', leftPct: activePct, widthPct: gapStartPct - activePct })
    }
    const gapEndPct = toPct(gap.end)
    segments.push({ type: 'idle', leftPct: gapStartPct, widthPct: gapEndPct - gapStartPct })
    cursor = gap.end
  }

  // Final active segment after last gap
  const finalPct = toPct(cursor)
  if (endPct > finalPct) {
    segments.push({ type: 'active', leftPct: finalPct, widthPct: endPct - finalPct })
  }

  return segments
}
```

### GanttBar Vue Template Sketch
```vue
<!-- GanttBar.vue — approximate -->
<template>
  <AppTooltip :content="tooltipContent" side="top">
    <div class="gantt-bar" :style="{ left: leftPct + '%', width: widthPct + '%' }">
      <span
        v-for="(seg, i) in segments"
        :key="i"
        class="bar-segment"
        :class="seg.type"
        :style="{ left: (seg.leftPct - leftPct) / widthPct * 100 + '%', width: seg.widthPct / widthPct * 100 + '%' }"
      />
      <span class="bar-label">{{ label }}</span>
    </div>
  </AppTooltip>
</template>
```

### Gap Detection for API Extension
```javascript
// In src/server/routes/timeline.js — extend computeWorkingTime pattern
function computeIdleGaps(timestamps) {
  if (timestamps.length < 2) return []
  const IDLE_THRESHOLD_MS = 10 * 60 * 1000
  const gaps = []
  for (let i = 1; i < timestamps.length; i++) {
    const gap = new Date(timestamps[i]) - new Date(timestamps[i - 1])
    if (gap > IDLE_THRESHOLD_MS) {
      gaps.push({ start: timestamps[i - 1], end: timestamps[i] })
    }
  }
  return gaps
}
```

### Import Trigger Pattern
```javascript
// In TimelinePage.vue or TimelineToolbar.vue
const importRunning = ref(false)
const importError = ref(null)

async function triggerImport() {
  if (importRunning.value) return
  importRunning.value = true
  importError.value = null
  try {
    const res = await fetch('/api/import', { method: 'POST' })
    if (res.status === 409) {
      importError.value = 'Import already running'
      return
    }
    if (!res.ok) {
      importError.value = 'Import failed'
      return
    }
    await fetchTimeline()  // auto-refresh data
  } catch (e) {
    importError.value = e.message
  } finally {
    importRunning.value = false
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `this.$router` / `this.$route` | `useRoute()` / `useRouter()` composables | Vue Router 4+ | Composition API first; use composables |
| Event bus for cross-component state | Props / emits + composables | Vue 3 | Simpler, more explicit |
| External Gantt library | Custom CSS % positioning | This phase | HyVueGantt lacks sub-segment API |

**Deprecated/outdated:**
- `hy-vue-gantt` for this use case: Does not support multiple segments within a bar. Skip it.
- `vue-ganttastic` (predecessor): Fewer features, same segment limitation.

---

## Open Questions

1. **Viewport auto-zoom exact implementation**
   - What we know: Sessions typically cluster 08:00–18:00; 24h axis needs scroll/zoom to be usable
   - What's unclear: Whether to implement as CSS `transform: scaleX` (zoom), or `scrollLeft` positioning to center active range, or a computed narrower time range
   - Recommendation: Use `scrollLeft` after render to center the active range. Keep full 24h axis. This is simpler than zoom and consistent with the "full 24h but auto-scroll" decision.

2. **Idle gap span inclusion in API — payload size**
   - What we know: Typical session has 50–200 messages; idle gap count is small (3–15 gaps)
   - What's unclear: Whether returning all message timestamps vs just gap spans is better
   - Recommendation: Return gap spans only (not raw timestamps). Much smaller payload, same rendering capability.

3. **Tooltip content for sessions with no ticket/branch/summary**
   - What we know: `session.ticket` and `session.branch` may both be null; `summary` column exists in DB but not in API response yet
   - What's unclear: How populated the `summary` column is in real data
   - Recommendation: Add `summary` to the API response (it's already in the SELECT target table). If all three are null, show `sessionId.slice(0, 8)` as label fallback.

4. **AppDatePicker vs simple prev/next buttons for date navigation**
   - What we know: Context specifies mouse/touch only navigation, prev/next day, Today/Yesterday shortcuts, URL update
   - What's unclear: Whether the AppDatePicker should be the primary date selector (calendar popup) or just prev/next buttons suffice
   - Recommendation: Use `AppDatePicker` as the "jump to date" control alongside prev/next buttons and Today/Yesterday shortcuts. This covers all navigation modes.

---

## Sources

### Primary (HIGH confidence)
- `/home/claude/cctimereporter/src/server/routes/timeline.js` — API response shape confirmed by code inspection
- `/home/claude/cctimereporter/src/server/routes/import.js` — Import endpoint confirmed synchronous, 409 on conflict
- `/home/claude/cctimereporter/src/client/components/*.vue` — Existing component APIs confirmed by code inspection
- `https://router.vuejs.org/guide/advanced/composition-api` — `useRoute`/`useRouter` composition API confirmed
- `https://raw.githubusercontent.com/Xeyos88/HyVueGantt/main/src/components/GGanttBar.vue` — Confirmed: no native sub-segment API in HyVueGantt

### Secondary (MEDIUM confidence)
- `https://raw.githubusercontent.com/Xeyos88/HyVueGantt/main/package.json` — HyVueGantt version confirmed as 5.0.1
- `https://raw.githubusercontent.com/Xeyos88/HyVueGantt/main/src/components/GGanttRow.vue` — Slot API and bar rendering confirmed
- `https://www.xjavascript.com/blog/create-a-hexadecimal-colour-based-on-a-string-with-javascript/` — djb2 hash for color assignment pattern

### Tertiary (LOW confidence)
- WebSearch results confirming no other Vue 3 Gantt library supports idle gap sub-segments natively

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed and code-inspected
- Architecture: HIGH — custom CSS Gantt pattern is well understood; API shape verified by code
- HyVueGantt spike: HIGH — source code confirmed no sub-segment API
- Pitfalls: HIGH — all stem from direct code inspection of existing API and decisions
- Color palette: MEDIUM — djb2 pattern is standard, specific palette colors are discretionary

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable libraries, no fast-moving deps)
