# Phase 35: Tokens Chart Page - Research

**Researched:** 2026-04-07
**Domain:** Vue 3 chart rendering with chart.js + vue-chartjs, page/route scaffolding, session detail reuse
**Confidence:** HIGH

## Summary

Phase 35 adds a `/tokens` route to the existing Vue 3 SPA showing a line chart of token usage per session. The page mirrors the TimelinePage structure exactly: same toolbar pattern, same session detail panel component, same color palette, same dark/light theme system. The chart renders one line per session (and an aggregate "All Sessions" line) using chart.js 4.5.1 + vue-chartjs 5.3.3 — both are locked decisions.

The standard approach is to register chart.js modules globally once (Title, Tooltip, Legend, LineElement, CategoryScale, LinearScale, PointElement), then use the `<Line>` component from vue-chartjs in a wrapper component. The x-axis uses a numeric message index (0-based position), not timestamps, eliminating any need for the chartjs-adapter-date-fns dependency. Dark mode requires reading CSS variables at chart initialization time via `getComputedStyle()` and re-initializing when theme changes, since chart.js does not natively support CSS custom properties.

The backend for this phase is provided by Phase 33 (token service + GET /api/tokens endpoint). This phase is purely frontend: route registration, page scaffold, chart component, and legend interaction. The `SessionDetailPanel` component is reused as-is — clicking a session line emits the same session object that GanttBar click emits on the timeline page.

**Primary recommendation:** Build one `TokenChart.vue` wrapper component that receives prepared `chartData` and `chartOptions` from `TokensPage.vue`, handles click events via chart.js `onClick` option callback, and exposes the chart ref for theme-change re-initialization. Keep all session state and API fetching in `TokensPage.vue` following the existing TimelinePage pattern.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chart.js | 4.5.1 | Canvas-based charting engine | Locked decision; already the ecosystem standard for Vue 3 |
| vue-chartjs | 5.3.3 | Vue 3 wrapper for chart.js | Locked decision; peer requires chart.js ^4.1.1 |

### Project Infrastructure (no new deps)
| Component | Location | Purpose |
|-----------|----------|---------|
| `SessionDetailPanel.vue` | `src/client/components/` | Reused as-is for session detail on click |
| `TimelineToolbar.vue` | `src/client/components/` | Reused as-is for date navigation |
| `useTheme.js` | `src/client/composables/` | `isDark` ref + `toggle` for chart theme sync |
| `tokens.css` | `src/client/styles/` | Design tokens (CSS custom properties) |
| `vue-router` | devDep | Route registration for `/tokens` |

**Installation:**
```bash
npm install --save-dev chart.js@4.5.1 vue-chartjs@5.3.3
```

Note: Both go in `devDependencies` — they are bundled by Vite, not runtime npm deps.

## Architecture Patterns

### Recommended File Structure
```
src/client/
├── pages/
│   ├── TimelinePage.vue       # existing — model for TokensPage
│   └── TokensPage.vue         # NEW — mirrors TimelinePage structure
├── components/
│   └── TokenChart.vue         # NEW — vue-chartjs Line wrapper
└── router/index.js            # updated — add /tokens route
```

### Pattern 1: Chart.js Module Registration (one-time global)
**What:** Register all required chart.js plugins once in the component file (or a shared setup), not per-instance.
**When to use:** Always — vue-chartjs requires explicit registration before any chart renders.
**Example:**
```javascript
// Source: https://vue-chartjs.org/guide/
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
} from 'chart.js'

ChartJS.register(
  Title, Tooltip, Legend,
  LineElement, CategoryScale, LinearScale, PointElement
)
```
This registration is idempotent — calling `ChartJS.register()` multiple times with the same plugins is safe.

### Pattern 2: TokenChart.vue Component Structure
**What:** Thin wrapper around `<Line>` from vue-chartjs that exposes a ref for the chart instance.
**When to use:** Whenever the parent needs to call chart.js methods (hide/show dataset, get clicked element).

```vue
<!-- Source: https://vue-chartjs.org/guide/#access-to-chart-instance -->
<template>
  <div class="token-chart-container">
    <Line ref="chartRef" :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Line } from 'vue-chartjs'
// ... registration above

const chartRef = ref(null)

// Access chart.js instance:
// chartRef.value.chart  →  the Chart instance
</script>
```

The chart instance is at `chartRef.value.chart` (the `.chart` property of the vue-chartjs component ref).

### Pattern 3: Click-to-Select Session
**What:** Use chart.js `onClick` option callback — receives `(event, activeElements, chart)`. `activeElements[0].datasetIndex` identifies which session line was clicked.
**When to use:** For clicking session lines to open SessionDetailPanel.

```javascript
// Source: https://www.chartjs.org/docs/latest/configuration/interactions.html
const chartOptions = computed(() => ({
  onClick: (event, activeElements) => {
    if (activeElements.length === 0) return
    const datasetIndex = activeElements[0].datasetIndex
    // Map datasetIndex back to session object
    const session = sessions.value[datasetIndex]
    if (session) emit('select', session)
  },
  // ...
}))
```

Note: The aggregate "All Sessions" line must be excluded from click selection (it doesn't map to a real session). Assign it a sentinel datasetIndex or check by label.

### Pattern 4: Dataset Visibility Toggle (Legend)
**What:** Override `legend.onClick` in chart options OR implement a custom HTML legend outside the chart. The built-in legend click already toggles visibility (`ci.hide(index)` / `ci.show(index)`).
**When to use:** Per-session show/hide is a required feature.

The decision is to use a custom HTML legend rendered in Vue (not chart.js built-in legend), so that:
- Legend entries can scroll when they overflow
- Visibility state can be tracked as a Vue ref (reactive, drives chart `hidden` property)

```javascript
// Tracking hidden state in Vue:
const hiddenSessions = ref(new Set())

function toggleSession(sessionIndex) {
  const set = new Set(hiddenSessions.value)
  if (set.has(sessionIndex)) {
    set.delete(sessionIndex)
  } else {
    set.add(sessionIndex)
  }
  hiddenSessions.value = set
  // Chart datasets have `hidden` property — re-computed in chartData
}
```

Two approaches for dataset visibility:
1. **Reactive `hidden` property in dataset:** Set `dataset.hidden = true/false` and update `chartData` ref. Chart.js re-renders on data change via vue-chartjs watchers. (Simpler, recommended.)
2. **Imperative `chart.hide(index)` / `chart.show(index)`:** Requires accessing `chartRef.value.chart` directly. More complex but avoids full data recomputation.

Recommendation: Use the reactive `hidden` property — cleaner with vue-chartjs.

### Pattern 5: Dark Mode for chart.js
**What:** chart.js does NOT natively read CSS custom properties. Colors must be resolved at render time via `getComputedStyle(document.documentElement)`.
**When to use:** Every time the chart initializes and every time the theme changes.

```javascript
// Source: Chart.js docs + useTheme composable pattern in project
import { useTheme } from '../composables/useTheme.js'
const { isDark } = useTheme()

function getToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const chartOptions = computed(() => {
  // Re-computed when isDark changes, forcing chart to re-render with correct colors
  const _ = isDark.value // dependency tracking
  return {
    plugins: {
      legend: { display: false }, // use custom HTML legend instead
      tooltip: {
        backgroundColor: getToken('--color-bg-secondary'),
        titleColor: getToken('--color-heading'),
        bodyColor: getToken('--color-body-text'),
        borderColor: getToken('--color-border'),
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: { color: getToken('--color-muted') },
        grid: { color: getToken('--color-border') },
      },
      y: {
        ticks: { color: getToken('--color-muted') },
        grid: { color: getToken('--color-border') },
      },
    },
    // ...
  }
})
```

When `chartOptions` is a computed that depends on `isDark.value`, vue-chartjs re-renders the chart automatically when theme toggles.

### Pattern 6: Responsive Sizing
**What:** Wrap the `<Line>` in a `position: relative` div with a fixed height. Set `responsive: true, maintainAspectRatio: false` on chart options.
**When to use:** Always for charts inside flex/grid layouts.

```javascript
// Source: https://www.chartjs.org/docs/latest/configuration/responsive.html
options: {
  responsive: true,
  maintainAspectRatio: false,
}
```

```css
.token-chart-container {
  position: relative;
  height: 400px; /* or use a CSS variable for flexibility */
  width: 100%;
}
```

### Pattern 7: X-axis — Numeric Message Index
**What:** X-axis labels are `[0, 1, 2, ..., N]` (message position), not timestamps. This avoids `chartjs-adapter-date-fns`.
**When to use:** This is the locked decision — no time-based adapter needed.

```javascript
// Each session's token series:
// x = message index within session (0-based assistant message position)
// y = token count (cumulative or per-message depending on toggle)

const labels = Array.from({ length: maxMessages }, (_, i) => i)

const datasets = sessions.value.map((session, idx) => ({
  label: resolveSessionLabel(session),
  data: buildTokenSeries(session, viewMode.value), // 'cumulative' | 'per-message'
  borderColor: projectColor(session._projectPath),
  backgroundColor: 'transparent',
  borderWidth: 2,
  pointRadius: 2,
  tension: 0,
  hidden: hiddenSessions.value.has(idx),
}))
```

### Pattern 8: Aggregate "All Sessions" Line
**What:** A synthetic dataset summing all visible session tokens at each message index. Rendered thicker (borderWidth: 3) with a different dash pattern (`borderDash: [4, 4]`) to distinguish it.
**When to use:** Always present alongside per-session lines.

```javascript
// Aggregate line — excluded from click-to-select (check label or use a sentinel flag)
const aggregateDataset = {
  label: 'All Sessions',
  data: computeAggregate(sessionDatasets),
  borderColor: getToken('--color-muted'),
  borderWidth: 3,
  borderDash: [4, 4],
  pointRadius: 0,
  tension: 0,
}
```

### Pattern 9: Page Navigation (Header Tab)
**What:** The app currently has no persistent nav header — `App.vue` is just `<RouterView />`. To add a "Timeline | Tokens" tab bar, a persistent nav must be added to `App.vue` or a new layout wrapper.
**When to use:** Required by CHART-01 (persistent header navigation).

The minimal approach: Add a `<nav>` to `App.vue` with `<RouterLink>` entries, styled using the same CSS token system as the toolbar.

```vue
<!-- App.vue — add persistent nav -->
<template>
  <nav class="app-nav">
    <RouterLink to="/timeline">Timeline</RouterLink>
    <RouterLink to="/tokens">Tokens</RouterLink>
  </nav>
  <RouterView />
</template>
```

### Anti-Patterns to Avoid
- **Using chart.js built-in legend for session visibility:** Built-in legend doesn't scroll and can't be styled with design tokens easily. Use a custom HTML legend.
- **Reading CSS variables inside chart options without a computed:** If options are static objects, theme changes won't update chart colors. Always use `computed()` that depends on `isDark.value`.
- **Calling `new Chart()` directly:** vue-chartjs handles instance lifecycle. Never construct a Chart directly — always use the `<Line>` component.
- **Guessing the module list for `ChartJS.register()`:** Missing `PointElement` causes blank charts. The minimum required set for line charts: `CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend`.
- **Putting chart.js registration in `main.js`:** Registration should live in the component file or a dedicated chart-setup module, not the app entry point. This keeps it tree-shakeable.
- **Setting `hidden: false` in dataset to show — omit hidden or set to false:** The default is `false` (visible), so only set `hidden: true` for hidden sessions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line chart rendering | Custom canvas drawing | `vue-chartjs` `<Line>` component | Handles resize, animation, tooltips, destroy/mount lifecycle |
| Chart instance access | Polling or event-based lookup | `chartRef.value.chart` via template ref | Documented pattern, synchronous after mount |
| Dataset visibility toggle | Direct DOM manipulation | Reactive `hidden` property in chartData | vue-chartjs watches data changes and updates chart |
| Theme-aware colors | Re-creating chart on theme toggle | `computed()` depending on `isDark.value` | vue-chartjs re-renders on options change |
| Session color assignment | New color system | Existing `projectColor()` from TimelinePage | Same djb2 hash → COLOR_PALETTE, already tested |

**Key insight:** vue-chartjs manages the chart.js instance lifecycle (create on mount, destroy on unmount, update on props change). Never bypass it.

## Common Pitfalls

### Pitfall 1: Chart Not Responsive / Fixed Width
**What goes wrong:** Chart renders at a fixed pixel width and doesn't resize with the window.
**Why it happens:** The `<canvas>` parent doesn't have `position: relative`, or `maintainAspectRatio` is `true` (default).
**How to avoid:** Wrap `<Line>` in `position: relative` container with explicit height. Set `responsive: true, maintainAspectRatio: false`.
**Warning signs:** Chart overflows its container or stays 300px wide regardless of viewport.

### Pitfall 2: Missing Chart.js Plugin Registration
**What goes wrong:** Chart renders blank or throws "CategoryScale is not registered" error.
**Why it happens:** chart.js 4.x is tree-shakeable — no plugins are auto-registered.
**How to avoid:** Always call `ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)` before any `<Line>` renders.
**Warning signs:** Blank chart canvas, console error mentioning unregistered scale or element.

### Pitfall 3: Dark Mode Colors Don't Update on Theme Toggle
**What goes wrong:** Chart retains light-mode (or dark-mode) colors after the user toggles the theme.
**Why it happens:** `chartOptions` is a static object defined once, not reactive to `isDark`.
**How to avoid:** Make `chartOptions` a `computed()` that reads `isDark.value` as a dependency, even if just to trigger re-computation.
**Warning signs:** Toggling the sun/moon icon in the toolbar doesn't update chart axis/grid colors.

### Pitfall 4: onClick Fires for Aggregate Line
**What goes wrong:** Clicking the "All Sessions" aggregate line triggers session detail panel with wrong session.
**Why it happens:** The `onClick` callback uses `datasetIndex` without excluding the aggregate dataset.
**How to avoid:** Place the aggregate dataset at a known index (e.g., always first or last), and guard with `if (datasetIndex === AGGREGATE_INDEX) return`.
**Warning signs:** Clicking the aggregate line shows undefined or wrong session in the detail panel.

### Pitfall 5: X-Axis Range Mismatch Across Sessions
**What goes wrong:** Sessions with different message counts produce misaligned x-axes.
**Why it happens:** Each session has `N` data points but the global x-axis needs `max(N)` labels.
**How to avoid:** Compute `maxMessages = max(session.assistantMessages.length)` across all sessions and use that as the shared label array `[0, 1, ..., maxMessages-1]`. Sessions with fewer messages get `null` (or `undefined`) for points beyond their length — chart.js skips null data points.
**Warning signs:** Short sessions show a flat line at 0 instead of stopping early; or x-axis truncates for long sessions.

### Pitfall 6: Token Data Missing (NULL) for Sessions Not Yet Re-Imported
**What goes wrong:** Sessions show as zero-token lines rather than being omitted.
**Why it happens:** Phase 32 added token columns; sessions imported before that migration have NULL tokens until re-import.
**How to avoid:** Filter sessions where `SUM(input_tokens) IS NULL` at the API layer (Phase 33 concern), or show them as zero with a visual indicator. This is a data state issue, not a chart bug — handle gracefully in the UI.
**Warning signs:** Many sessions show flat-zero lines after first migration.

### Pitfall 7: App Navigation Breaks SPA Routing
**What goes wrong:** Adding a `<nav>` to `App.vue` causes the nav to disappear on direct `/tokens` URL navigation.
**Why it happens:** Usually not a problem with Vue Router's `createWebHistory` (the server serves `index.html` for all paths via the existing `setNotFoundHandler`). However, if static assets path is wrong, it can break.
**How to avoid:** The existing Fastify `setNotFoundHandler` already serves `index.html` for all non-API routes. No server changes needed for the new `/tokens` route.
**Warning signs:** Direct browser navigation to `/tokens` shows a blank page or 404.

## Code Examples

### Complete Chart.js Registration (one-time)
```javascript
// Source: https://vue-chartjs.org/guide/
import {
  Chart as ChartJS,
  Title, Tooltip, Legend,
  LineElement, CategoryScale, LinearScale, PointElement,
} from 'chart.js'

ChartJS.register(
  Title, Tooltip, Legend,
  LineElement, CategoryScale, LinearScale, PointElement
)
```

### Session Label Resolution (Legend)
```javascript
// Mirror TimelinePage's label priority: userLabel > customTitle > session ID short
function resolveSessionLabel(session) {
  if (session.userLabel) return session.userLabel
  if (session.customTitle) return session.customTitle
  return session.sessionId.slice(0, 8) + '...'
}
```

### Token Series Building (Cumulative vs Per-Message)
```javascript
// Source: project token data shape from Phase 33
function buildTokenSeries(session, mode) {
  const messages = session.tokenMessages // array of { tokenCount } per assistant message
  if (mode === 'cumulative') {
    let running = 0
    return messages.map(m => {
      running += m.tokenCount
      return running
    })
  }
  return messages.map(m => m.tokenCount)
}
```

### onClick Handler (session line click)
```javascript
// Source: https://www.chartjs.org/docs/latest/configuration/interactions.html
const AGGREGATE_DATASET_INDEX = 0 // aggregate always at index 0

const chartOptions = computed(() => ({
  onClick: (event, activeElements) => {
    if (!activeElements.length) return
    const { datasetIndex } = activeElements[0]
    if (datasetIndex === AGGREGATE_DATASET_INDEX) return // ignore aggregate
    const sessionIdx = datasetIndex - 1 // offset by 1 if aggregate is first
    const session = sessionsForDate.value[sessionIdx]
    if (session) selectedSession.value = session
  },
  // ...
}))
```

### Accessing Chart.js Instance via Ref
```javascript
// Source: https://vue-chartjs.org/guide/#access-to-chart-instance
const chartRef = ref(null)

// In a handler or watcher:
function updateChartColors() {
  if (!chartRef.value) return
  const chart = chartRef.value.chart
  // chart.update() if needed for imperative changes
}
```

### Project Color Extraction (reuse from TimelinePage)
```javascript
// Source: src/client/pages/TimelinePage.vue (lines 432-440)
const COLOR_PALETTE = [
  '#4e9af1', '#f4a523', '#2ebd6b', '#e05c5c', '#a87fe0',
  '#00c4bc', '#f06292', '#8bc34a', '#ff8f00', '#78909c',
]

function projectColor(projectPath) {
  let hash = 5381
  for (const char of projectPath) hash = (hash * 33) ^ char.charCodeAt(0)
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
}
```

This function should be extracted to a shared utility or duplicated in `TokensPage.vue`. The session's `projectPath` comes from the API response.

### App.vue Navigation Header
```vue
<!-- Add persistent nav to App.vue -->
<template>
  <nav class="app-nav">
    <RouterLink to="/timeline" class="nav-link">Timeline</RouterLink>
    <RouterLink to="/tokens" class="nav-link">Tokens</RouterLink>
  </nav>
  <RouterView />
</template>

<style>
.app-nav {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}
.nav-link {
  font-size: var(--font-size-sm);
  color: var(--color-link);
  text-decoration: none;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
}
.nav-link.router-link-active {
  background: var(--color-bg);
  color: var(--color-heading);
  font-weight: 600;
}
</style>
```

### Segmented Control (Cumulative / Per Message Toggle)
No existing segmented control component exists in the project. Build inline in `TokensPage.vue` using two `AppButton` components or raw styled buttons:

```vue
<div class="view-toggle">
  <button
    class="toggle-btn"
    :class="{ active: viewMode === 'cumulative' }"
    @click="viewMode = 'cumulative'"
  >Cumulative</button>
  <button
    class="toggle-btn"
    :class="{ active: viewMode === 'per-message' }"
    @click="viewMode = 'per-message'"
  >Per Message</button>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chart.js global registration | Tree-shaken module registration | chart.js v3+ | Must explicitly import and register each scale/element |
| Options API vue-chartjs | Composition API `<script setup>` | vue-chartjs v5 | `ref()` for chart instance access instead of `this.$refs` |
| Date-based x-axis (time scale) | Numeric message index | Locked decision | No `chartjs-adapter-date-fns` needed |
| No token data in DB | Per-message token columns (v10) | Phase 32 | Enables chart data source |

**Deprecated/outdated:**
- `this.$refs.chart.chart` (Options API): Use `const chartRef = ref(null)` + `chartRef.value.chart` in `<script setup>`.
- `chart.getElementsAtEventForMode()` via canvas listener: Use `onClick` option callback instead (receives `activeElements` directly).

## Open Questions

1. **API response shape from Phase 33 (GET /api/tokens)**
   - What we know: Phase 33 adds a token service and API endpoint; the query returns per-session token data for a date
   - What's unclear: Exact field names (e.g., `assistantMessages` vs `tokenMessages`, whether per-message token arrays are returned or only session-level totals)
   - Recommendation: Plan 35-02 must read the Phase 33 PLAN.md or SUMMARY.md to know the exact API shape. If Phase 33 only returns session totals (not per-message arrays), the chart will need a separate API call or Phase 33 must be extended to return per-message token arrays. The chart requires per-message data for both "cumulative" and "per-message" views.

2. **Token data for sessions without re-import (NULL values)**
   - What we know: Sessions imported before Phase 32 will have NULL token columns until re-imported
   - What's unclear: Whether the API filters these out or returns them with null tokens
   - Recommendation: The page should handle sessions with no token data gracefully — either omit them from the chart or show a "no token data" empty state. This is a UX decision for the planner.

3. **`projectColor()` function location**
   - What we know: The function currently lives inline in `TimelinePage.vue`
   - What's unclear: Whether to extract it to a shared utility or duplicate it in `TokensPage.vue`
   - Recommendation: Extract to `src/client/utils/project-colors.js` so both pages use the same function. This is a small refactor but prevents divergence.

## Sources

### Primary (HIGH confidence)
- `src/client/pages/TimelinePage.vue` — Full file read, lines 432-440 (color system), 333-356 (session selection pattern), 139-190 (state management pattern)
- `src/client/components/TimelineToolbar.vue` — Full file read (toolbar structure to mirror)
- `src/client/components/SessionDetailPanel.vue` — Full file read (props interface: `session`, `fork`, `projectName`)
- `src/client/router/index.js` — Full file read (route registration pattern)
- `src/client/App.vue` — Full file read (currently just `<RouterView />`, needs nav added)
- `src/client/composables/useTheme.js` — Full file read (`isDark` ref pattern)
- `src/client/styles/tokens.css` — Full file read (all CSS custom properties)
- `src/db/schema.js` — Full file read (confirms token columns: `input_tokens`, `output_tokens`, etc. on messages table)
- `package.json` — Confirmed devDependencies, chart.js and vue-chartjs not yet installed
- npm registry (via Bash) — `chart.js@4.5.1`, `vue-chartjs@5.3.3` confirmed current; vue-chartjs peer: `chart.js: ^4.1.1, vue: ^3.0.0-0`
- `https://www.chartjs.org/docs/latest/configuration/responsive.html` — `responsive: true, maintainAspectRatio: false` pattern
- `https://www.chartjs.org/docs/latest/configuration/interactions.html` — `onClick(event, activeElements, chart)` callback with `activeElements[0].datasetIndex`
- `https://www.chartjs.org/docs/latest/charts/line.html` — `borderColor`, `borderDash`, `tension`, `pointRadius`, `hidden` dataset properties
- `https://www.chartjs.org/docs/latest/configuration/tooltip.html` — `callbacks.label(context)` for custom tooltips
- `https://www.chartjs.org/docs/latest/configuration/legend.html` — `legend.display: false` to hide built-in legend; `onClick` override pattern
- `https://vue-chartjs.org/guide/` — `ChartJS.register()` pattern, `<Line>` props (`:data`, `:options`), chart instance access at `chartRef.value.chart`
- `https://vue-chartjs.org/guide/#access-to-chart-instance` — Template ref pattern `ref="chartRef"` → `chartRef.value.chart`

### Secondary (MEDIUM confidence)
- WebSearch "vue-chartjs 5 chart.js 4 Vue 3 line chart example 2025" — confirmed vue-chartjs 5.3.3 is current, peer dep is chart.js ^4.1.1
- WebSearch "chart.js dark mode CSS variables theme switching 2025" — confirmed chart.js does not natively support CSS variables; must use `getComputedStyle()` at render time

### Tertiary (LOW confidence)
- Phase 33 API shape: Unknown at research time — depends on Phase 33 planning (which has not been executed yet)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm registry; vue-chartjs peer dep verified
- Architecture: HIGH — directly observed from existing codebase files; chart.js API verified from official docs
- Pitfalls: HIGH — derived from official chart.js docs + direct inspection of project's theme/color system
- Phase 33 API shape: LOW — Phase 33 is not yet planned; open question documented above

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (chart.js 4.x is stable; vue-chartjs 5.x is stable)
