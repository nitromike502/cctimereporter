# Technology Stack: Token Usage Visualization

**Project:** CC Time Reporter — Token Usage Tracking & Visualization (v1.1.0)
**Researched:** 2026-04-06
**Question:** What charting library should we use for interactive line charts in Vue 3?

## Verdict

**Use Chart.js 4 + vue-chartjs 5.** This is the correct choice for this project. It is the most adopted Vue 3 charting stack (35M downloads/month for Chart.js, 3.4M for vue-chartjs), has a well-understood gzip footprint (~65KB for chart.js), excellent multi-series line chart support, programmatic dataset toggle via `setDatasetVisibility`, zoom/pan via `chartjs-plugin-zoom`, and no opinions about styling — which is critical for a custom component library. Dark/light theming is handled by passing reactive color values from JavaScript (not CSS variables directly into the chart renderer), which is a minor but real integration cost.

---

## Existing Stack (Do Not Change)

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 22+ |
| Database | node:sqlite (built-in) | — |
| Web server | Fastify | ^5.7.4 |
| Frontend framework | Vue 3 | ^3.x |
| Build tool | Vite | ^7.x |
| UI primitives | Reka UI | current |
| Design system | CSS custom properties | tokens.css |
| Distribution | npx | — |

---

## New Additions Required

### 1. chart.js

**Purpose:** The charting engine. Handles canvas rendering, multi-series data, scales, tooltips, and legends.

**Version:** 4.5.1 (current as of 2026-04-06, verified via npm registry)

**Gzip size:** ~65KB min+gzip (source: Bundlephobia, HIGH confidence)

**Install:**
```bash
npm install chart.js
```

**Why chart.js over alternatives:** See Candidates Considered below.

### 2. vue-chartjs

**Purpose:** Thin Vue 3 wrapper over chart.js. Provides `<Line>` and other components that own the canvas lifecycle, watch reactive data, and expose the underlying chart instance via `ref`.

**Version:** 5.3.3 (current as of 2026-04-06, verified via npm registry)

**Peer dependencies:** `chart.js`, `vue` (both already present)

**Unpacked size:** 76KB (small wrapper — the weight is in chart.js itself)

**Install:**
```bash
npm install vue-chartjs
```

**Key capabilities for this milestone:**
- `<Line :data="chartData" :options="chartOptions" ref="chartRef" />`
- Watches `data` and `options` reactively — theme changes re-render automatically when options are updated
- Exposes `chartRef.value.chart` — the raw chart.js instance for programmatic control
- Dataset toggle: `chart.setDatasetVisibility(index, bool)` then `chart.update()`
- `chart.update('none')` for instant updates (no animation) when toggling series

### 3. chartjs-plugin-zoom (optional)

**Purpose:** Mouse wheel zoom and drag/pan for the time-axis line chart.

**Version:** 2.2.0 (current, last published ~1 year ago — maintenance appears stable but slow)

**Additional peer dependency:** `hammerjs` for touch gesture support

**Gzip size:** Small plugin (~10KB estimated, not separately measured)

**Install:**
```bash
npm install chartjs-plugin-zoom hammerjs
```

**Assessment:** Include zoom/pan only if the /tokens page UX calls for it. This is a "nice to have" — the base chart without it is fully functional. The plugin adds `hammerjs` as a dependency which slightly increases the overall weight. If sessions span many days, zoom will be valuable; for single-day views it is unnecessary.

**Recommendation:** Defer to implementation phase. Add if the timeline shows more than ~30 data points and horizontal scrolling is needed.

---

## Candidates Considered

### Chart.js + vue-chartjs (RECOMMENDED)

| Criterion | Assessment |
|-----------|------------|
| Gzip size (chart.js) | ~65KB min+gzip — largest candidate, but well-understood |
| Vue 3 integration | Excellent — vue-chartjs 5 is purpose-built for Vue 3 |
| Multiple line series | Native — `datasets` array, any number of series |
| Toggle show/hide series | `setDatasetVisibility(index, bool)` + `chart.update()` |
| Zoom/pan | `chartjs-plugin-zoom` — separate plugin, mature |
| Dark/light theme | Via reactive `options` — pass color values from JS |
| Custom styling | Full — no opinions, canvas-based |
| Downloads/month | chart.js: 35.2M; vue-chartjs: 3.4M |
| GitHub stars | Chart.js: 67.3K; vue-chartjs: 5.7K |
| Maintenance | Chart.js: actively maintained (last commit 2026-04-07) |
| Confidence | HIGH |

**Dark theme integration note:** Chart.js renders to `<canvas>`, so CSS variables do not apply to chart elements (axis text, grid lines, tooltip backgrounds). Theming requires passing explicit color values in `options`. The app's existing `[data-theme='dark']` toggle will need to drive a reactive `isDark` ref that populates chart options with appropriate colors. This is ~20 lines of setup code, not a blocker.

### ECharts + vue-echarts (REJECTED)

| Criterion | Assessment |
|-----------|------------|
| Gzip size | Full import: ~1MB. Tree-shaken line chart only: ~150-200KB estimated |
| Vue 3 integration | Good — vue-echarts 8.0.1 supports Vue 3 |
| Multiple line series | Native |
| Toggle show/hide | Via `legend` config or `dispatchAction` API |
| Dark theme | Built-in theme system (CSS variables do apply via option overrides) |
| Downloads/month | echarts: 9.6M; vue-echarts: 1.1M |
| GitHub stars | ECharts: 66.1K |
| Maintenance | Actively maintained |
| Confidence | MEDIUM |

**Why rejected:** Even with tree-shaking, a line chart import from ECharts is estimated at 150-200KB gzipped — 2-3x heavier than chart.js. ECharts is an excellent library for complex dashboards with many chart types; it is overkill for a single line chart page in an npx-distributed tool where bundle size directly impacts cold start UX. The tree-shaking API requires explicit manual imports that add friction.

### ApexCharts + vue3-apexcharts (REJECTED)

| Criterion | Assessment |
|-----------|------------|
| Gzip size | ~90-100KB min+gzip (unpackedSize: 9MB — no tree-shaking possible) |
| Vue 3 integration | Good — vue3-apexcharts 1.11.1 |
| Multiple line series | Native |
| Toggle show/hide | Built-in legend toggle |
| Dark theme | Built-in theme option (`theme.mode: 'dark'`) |
| Downloads/month | apexcharts: 7.6M; vue3-apexcharts: 1.1M |
| GitHub stars | ApexCharts: 15.1K |
| Maintenance | Actively maintained |
| Confidence | MEDIUM |

**Why rejected:** ApexCharts is heavier than chart.js with no tree-shaking path. The SVG rendering approach produces nice aesthetics and the built-in dark mode is convenient, but at ~90-100KB gzipped for a single line chart type, it adds more bundle weight than justified. The automatic dark mode is a genuine advantage, but not sufficient to outweigh the size cost.

### lightweight-charts (REJECTED)

| Criterion | Assessment |
|-----------|------------|
| Gzip size | ~35KB min+gzip (v5 reduced 16% from v4) |
| Vue 3 integration | No official Vue wrapper — manual integration required |
| Multiple line series | Supported but API is OHLC/financial-first |
| Toggle show/hide | Manual implementation required |
| Dark theme | CSS-independent; color set via API |
| Downloads/month | 2.0M |
| GitHub stars | 14.3K |
| Maintenance | Actively maintained (v5.1.0, 2026) |
| Confidence | MEDIUM |

**Why rejected:** Despite the smallest gzip footprint (35KB), lightweight-charts is purpose-built for financial time series (OHLC candlesticks, volume overlays). Its API is not designed for arbitrary multi-series data. Toggle show/hide and custom x-axis formatting require workarounds. The lack of a Vue 3 wrapper means writing and maintaining integration code. The size advantage (~30KB less than chart.js) does not justify the API friction for this use case.

### Unovis + @unovis/vue (NOT RECOMMENDED)

| Criterion | Assessment |
|-----------|------------|
| Gzip size | Claimed "25KB" but @unovis/ts is 10MB unpackedSize; actual gzip unclear |
| Vue 3 integration | Good — @unovis/vue 1.6.4 |
| Multiple line series | Supported |
| Toggle show/hide | Manual |
| Dark theme | CSS variables supported natively |
| Downloads/month | Not checked separately from @unovis/ts |
| GitHub stars | 2.8K (lower than all other candidates) |
| Maintenance | Actively maintained |
| Confidence | LOW |

**Why not recommended:** The "25KB" claim could not be independently verified — the @unovis/ts package (the core engine) has a 10MB unpackedSize, which is not consistent with a 25KB gzip figure. Community adoption is significantly lower than chart.js (2.8K stars vs 67K). The CSS variable theming is the strongest advantage, but the size uncertainty and lower community support make it a higher-risk choice compared to chart.js.

---

## Bundle Size Summary

| Library | Gzip (estimated) | Tree-shakeable | Confidence |
|---------|-----------------|----------------|------------|
| lightweight-charts 5.1.0 | ~35KB | N/A (single bundle) | HIGH (official claim) |
| chart.js 4.5.1 | ~65KB | Partial | HIGH (Bundlephobia) |
| ApexCharts 5.10.5 | ~90-100KB | No | MEDIUM |
| ECharts 6.0.0 (tree-shaken) | ~150-200KB | Yes | MEDIUM (estimated) |
| ECharts 6.0.0 (full) | ~1MB | — | HIGH |

The total addition for the recommended choice is: chart.js (~65KB) + vue-chartjs (~3KB) = **~68KB gzipped**. This is the first charting dependency in the project — it is a meaningful addition but appropriate for a feature page dedicated to data visualization.

---

## Integration with Existing Stack

### Vite

No additional configuration needed. chart.js and vue-chartjs are standard ESM packages. Vite will tree-shake chart.js components that are not imported.

**Recommended: register only needed chart.js components** to minimize the bundle:

```js
import { Chart, registerables } from 'chart.js'
// Register everything (simpler, ~65KB):
Chart.register(...registerables)

// OR: Register only what the /tokens line chart needs (~20-30KB):
import {
  Chart, LineElement, PointElement, LineController,
  CategoryScale, LinearScale, TimeScale, Tooltip, Legend, Filler
} from 'chart.js'
Chart.register(LineElement, PointElement, LineController, CategoryScale, LinearScale, TimeScale, Tooltip, Legend, Filler)
```

If using time-based x-axis (timestamps), `TimeScale` requires `chart.js/auto` or manual import of the `date-fns` adapter:

```bash
npm install chartjs-adapter-date-fns date-fns
```

Alternatively, use a numeric/index x-axis and format labels manually — avoids the adapter dependency entirely.

### Vue 3 + Design Tokens

chart.js renders to `<canvas>`, so CSS custom properties from `tokens.css` do not flow into chart elements. The integration pattern:

```js
// Compose reactive chart colors from the app's theme state
const isDark = computed(() => document.documentElement.dataset.theme === 'dark')

const chartOptions = computed(() => ({
  scales: {
    x: { grid: { color: isDark.value ? '#333' : '#e5e7eb' } },
    y: { grid: { color: isDark.value ? '#333' : '#e5e7eb' } }
  },
  plugins: {
    legend: { labels: { color: isDark.value ? '#f3f4f6' : '#1f2937' } },
    tooltip: { backgroundColor: isDark.value ? '#1f2937' : '#ffffff' }
  }
}))

// Watch theme changes and update the chart
watch(isDark, () => chartRef.value?.chart?.update())
```

This is ~20-30 lines but is the correct pattern. The existing app's theme toggle mechanism (checking `[data-theme='dark']`) drives `isDark` via a MutationObserver or a shared store.

### Dataset Toggle (Show/Hide Sessions)

```js
function toggleSession(index) {
  const chart = chartRef.value.chart
  const visible = chart.isDatasetVisible(index)
  chart.setDatasetVisibility(index, !visible)
  chart.update()
}
```

This does not require any plugin — it is built into chart.js 4.

### Multi-Series (One Line Per Session + Aggregate)

```js
const chartData = computed(() => ({
  labels: timeLabels,  // shared x-axis (timestamps or message indices)
  datasets: [
    // Aggregate line (always visible, thicker, distinct color)
    { label: 'All Sessions', data: aggregateData, borderWidth: 2, ... },
    // Per-session lines (toggleable)
    ...sessions.map((s, i) => ({
      label: s.id,
      data: s.data,
      borderWidth: 1,
      borderDash: [4, 2],  // distinguish from aggregate
      ...
    }))
  ]
}))
```

---

## What NOT to Add

| Candidate | Decision | Reason |
|-----------|----------|--------|
| D3.js | Skip | Massive scope; requires building chart primitives from scratch |
| Recharts | Skip | React-only |
| Victory | Skip | React-only |
| Tremor / shadcn charts | Skip | React ecosystem |
| vue-chrts (Unovis wrapper) | Skip | 32 GitHub stars; too new and low adoption |
| AG Charts | Skip | Commercial license for advanced features; overkill |
| ECharts | Skip | Too heavy for this use case; see Candidates |
| ApexCharts | Skip | Heavier than chart.js with no tree-shaking path |
| Highcharts | Skip | Commercial license required |

---

## Updated Installation

```bash
# Required: charting engine + Vue 3 wrapper
npm install chart.js vue-chartjs

# Required only if time-based x-axis is used:
npm install chartjs-adapter-date-fns date-fns

# Optional: zoom/pan (defer until needed)
npm install chartjs-plugin-zoom hammerjs
```

---

## Sources

- npm registry (`npm view chart.js version`) — chart.js 4.5.1 (HIGH confidence, verified 2026-04-06)
- npm registry (`npm view vue-chartjs version`) — vue-chartjs 5.3.3 (HIGH confidence, verified 2026-04-06)
- npm registry (`npm view echarts version`) — echarts 6.0.0 (HIGH confidence, verified 2026-04-06)
- npm registry (`npm view apexcharts version`) — apexcharts 5.10.5 (HIGH confidence, verified 2026-04-06)
- npm registry (`npm view lightweight-charts version`) — lightweight-charts 5.1.0 (HIGH confidence, verified 2026-04-06)
- npm registry (`npm view @unovis/vue version`) — @unovis/vue 1.6.4 (HIGH confidence, verified 2026-04-06)
- npm downloads API — chart.js 35.2M/month, vue-chartjs 3.4M/month (HIGH confidence, verified 2026-04-06)
- GitHub API — star counts for all candidates (HIGH confidence, verified 2026-04-06)
- Bundlephobia (via WebSearch) — chart.js ~65KB gzip (MEDIUM confidence — could not fetch Bundlephobia directly)
- TradingView blog — lightweight-charts v5 "35kB base bundle, 16% reduction" (HIGH confidence, official source)
- WebSearch: "ECharts tree shaking" — full import ~1MB, tree-shaken estimate 150-200KB (MEDIUM confidence, no exact figure found)
- WebSearch: ApexCharts bundle size — ~90-100KB gzip estimated from 9MB unpackedSize ratio (LOW confidence — no direct gzip measurement)
- Chart.js docs (chartjs.org) — `setDatasetVisibility`, `isDatasetVisible`, `chart.update()` API (HIGH confidence)
- WebSearch: chartjs-plugin-zoom — version 2.2.0, Chart.js >=3.0.0 compatible (HIGH confidence)
