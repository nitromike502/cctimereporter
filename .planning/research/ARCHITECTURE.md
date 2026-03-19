# Architecture: Gantt Chart Zoom/Pan Integration

**Project:** CC Time Reporter — Gantt zoom/pan milestone
**Researched:** 2026-03-18
**Confidence:** HIGH (based on direct source reading of all four component files)

---

## Current Architecture (read from source)

### Component Hierarchy

```
TimelinePage.vue
  GanttChart.vue            — time axis + swimlane rows; width: 100%; overflow: hidden
    GanttSwimlane.vue       — per-project row; stacks bars in sub-rows (px vertical offsets)
      GanttBar.vue          — single session bar; left/width as CSS percentages
```

### How Bar Positioning Works (GanttBar.vue)

```javascript
barLeft  = (startTime - dayStart) / dayMs * 100   // CSS left: N%
barWidth = (endTime - startTime)  / dayMs * 100   // CSS width: N%
```

These percentages are relative to `.lane-bars` — the `flex: 1` div inside each `.lane-row` in GanttChart. The time axis ticks use the same system: `tick.pct = (h / 24) * 100`. Grid lines use `left: tick.pct + '%'` inside `.grid-overlay`.

**The critical property:** because everything is percentage-based relative to the bar area container, widening that container scales all bars and ticks automatically. Zero changes required in GanttBar or GanttSwimlane.

### What Does NOT Scale Automatically

The 140px label column is hardcoded in three places in GanttChart.vue:
- `.time-axis` — `margin-left: 140px` (offsets the header to align with the bar area)
- `.grid-overlay` — `left: 140px` (offsets the grid to skip the label column)
- `.lane-label` — `width: 140px; flex-shrink: 0`

This column is a fixed sidebar and must stay outside the horizontal scroll area.

### GanttSwimlane Vertical Layout

Sub-row stacking uses `BAR_ROW_HEIGHT = 36` and positions bars with `top: rowIdx * 36px`. This is vertical only — unaffected by horizontal zoom.

---

## Zoom/Pan Integration Design

### Core Mechanism

Widen the horizontal bar area by a zoom factor. Wrap it in a scroll container. The 140px label column stays fixed outside the scroll area.

At `zoomLevel = 2`, the canvas renders at `200%` of the scroll container's width. All percentage-based bars and ticks remain correct — they are still percentages of their (now wider) container.

### Required Structural Change in GanttChart

The current layout places label and bars inside the same flex row inside `.gantt-chart`. The time axis uses `margin-left: 140px` to fake alignment with the bars. The grid overlay uses `left: 140px` for the same reason.

This layout cannot scroll horizontally without also scrolling the labels. It must be restructured to separate the fixed label column from the scrollable canvas column.

**Before (current structure):**
```
.gantt-chart (width: 100%, overflow: hidden)
  .time-axis (margin-left: 140px — pixel hack for alignment)
  .lanes-container
    .grid-overlay (left: 140px — pixel hack)
    .lane-row (display: flex)
      .lane-label (width: 140px, flex-shrink: 0)
      .lane-bars (flex: 1)
        GanttSwimlane
```

**After (zoom-ready structure):**
```
.gantt-chart (display: flex)
  .gantt-labels (width: 140px, flex-shrink: 0)
    .gantt-label-header (height matching time-axis)
    .gantt-label-row × N (one per project, height synced with swimlane)
  .gantt-scroll-area (flex: 1, overflow-x: auto)
    .gantt-canvas (width: zoomLevel * 100%)
      .time-axis (full canvas width)
      .grid-overlay (full canvas width, no offset needed)
      .swimlane-row × N
        GanttSwimlane
```

The labels column scrolls vertically with the page but not horizontally. The canvas scrolls horizontally inside `.gantt-scroll-area`.

**Height synchronization:** The label rows and swimlane rows must have matching heights. Currently GanttSwimlane computes its height as `subRows.length * BAR_ROW_HEIGHT + 8`. The label column divs must match. The cleanest approach: expose `laneHeight` upward from GanttSwimlane to GanttChart via an emit or by GanttChart computing it directly (since it has access to the sessions array and can replicate the sub-row count logic). Replicating the logic in GanttChart is simpler and avoids prop/event complexity — GanttChart already knows the sessions arrays for each project.

### State: Where Zoom Lives

**TimelinePage.vue owns zoomLevel.** This follows the existing pattern for `idleThreshold`:

- Owned at the page level
- Persisted to localStorage
- Passed down as a prop to GanttChart
- Mutated via a toolbar event

```javascript
// In TimelinePage.vue
const ZOOM_KEY = 'cctimereporter:zoomLevel'
const zoomLevel = ref(parseFloat(localStorage.getItem(ZOOM_KEY)) || 1)

function setZoomLevel(val) {
  zoomLevel.value = val
  localStorage.setItem(ZOOM_KEY, String(val))
}
```

`zoomLevel` flows: `TimelinePage → GanttChart (prop) → applied to .gantt-canvas width`

### Applying Zoom in GanttChart

GanttChart receives a `zoomLevel` prop (Number, default 1). The canvas div uses an inline style:

```javascript
const canvasStyle = computed(() => ({ width: `${props.zoomLevel * 100}%` }))
```

Applied as `:style="canvasStyle"` on `.gantt-canvas`. No changes in GanttSwimlane or GanttBar — the percentage math is unchanged.

### Tick Density

At 1x zoom: 13 ticks across 24h (every 2h). At 4x zoom: the canvas is 4x wider, so those ticks are spaced 4x further apart — this is correct and improves readability of time positions.

Optional enhancement (not needed for MVP): add denser ticks at higher zoom levels. The `timeAxisTicks` computed in GanttChart can gate on `zoomLevel` to add hourly marks at 2x or 30-minute marks at 4x. This is purely additive and does not affect the structural change.

### Zoom Controls

**Add to TimelineToolbar** — same component that hosts the idle threshold control. TimelinePage passes `zoomLevel` down and handles `@update:zoom` back up. Keeps GanttChart as a pure rendering component.

Discrete steps are preferable to a continuous slider: 1x, 1.5x, 2x, 3x, 4x. A simple button group (+/-) or segmented control works. The exact UI is a detail of the toolbar implementation.

### Scroll Position on Date Change

When the user navigates to a different date, the horizontal scroll position of `.gantt-scroll-area` should reset to 0. Two approaches:

1. GanttChart watches its `date` prop and resets its own scroll via a template ref on `.gantt-scroll-area`.
2. TimelinePage holds a ref to GanttChart and calls an exposed `resetScroll()` method.

Option 1 is simpler — GanttChart is already aware of `date` (passed to swimlanes). A `watch(props.date, () => { scrollArea.value.scrollLeft = 0 })` inside GanttChart handles it without adding surface area to the component boundary.

---

## Component Change Summary

| Component | Change | What |
|-----------|--------|------|
| `GanttChart.vue` | **Modified** | Structural refactor — separate label column from scrollable canvas; add `zoomLevel` prop; apply canvas width; sync label row heights with swimlane heights; watch `date` to reset scroll |
| `TimelinePage.vue` | **Modified** | Add `zoomLevel` ref, localStorage persistence, `setZoomLevel()` function; pass `zoomLevel` prop to GanttChart; wire zoom event from toolbar |
| `TimelineToolbar.vue` | **Modified** | Add zoom control UI; emit `@update:zoom` event |
| `GanttSwimlane.vue` | **No change** | Vertical stacking unaffected |
| `GanttBar.vue` | **No change** | Percentage-based positioning scales naturally |

No new components required for the core feature.

---

## Build Order

Step 1 is the riskiest (layout restructure) and must be done first. Steps 2-4 are additive.

**Step 1 — Restructure GanttChart layout**
Separate the label column from the scrollable canvas. Add an inner `.gantt-canvas` div with `width: 100%` (no zoom yet). Validate that the chart renders identically to the current version at default width — this is a pure layout refactor with no visible change.

Key tasks in this step:
- Remove `margin-left: 140px` from `.time-axis`
- Remove `left: 140px` from `.grid-overlay`
- Move `.lane-label` divs into a parallel `.gantt-labels` column
- Sync label row heights with swimlane heights (compute sub-row counts in GanttChart)
- Set `overflow-x: auto` on `.gantt-scroll-area`

**Step 2 — Wire zoomLevel prop**
Add `zoomLevel` prop to GanttChart. Apply `width: ${zoomLevel * 100}%` to `.gantt-canvas`. Test at 2x: bars and ticks should scale correctly, scroll should appear.

**Step 3 — Add zoom state to TimelinePage**
Add `zoomLevel` ref with localStorage persistence. Pass to GanttChart. Add `setZoomLevel()` handler.

**Step 4 — Add zoom controls to TimelineToolbar**
Add +/- or step control for zoom. Emit `@update:zoom`. Wire in TimelinePage.

**Step 5 (optional) — Scroll reset on date change**
Watch `date` prop in GanttChart, reset `scrollLeft` to 0 on change.

**Step 6 (optional) — Adaptive tick density**
In `timeAxisTicks`, add more marks when `zoomLevel >= 2`.

---

## Integration Points with Existing Code

**The `.gantt-chart` CSS class** is referenced by the guided tour in TimelinePage.vue:
```javascript
{ element: '.gantt-chart', popover: { title: 'Session Timeline', ... } }
```
The outer container must keep this class name after the restructure.

**`overflow: hidden` on `.gantt-chart`** currently prevents any scroll. This must become `overflow: visible` (or be removed) on the outer container, with `overflow-x: auto` moved to the inner `.gantt-scroll-area`.

**`padding-right: 10px` on `.gantt-chart`** currently adds breathing room. After restructure, this should apply to the scroll area or canvas, not the outer flex container.

---

## Key Risks

**Height sync between label column and swimlane rows.** The swimlane height is computed from `subRows.value.length * BAR_ROW_HEIGHT + 8`. If the label divs do not match exactly, the label column will misalign vertically as the user scrolls. GanttChart must compute or receive the same height values for each project row.

**Horizontal scroll discoverability.** Users need to understand the chart can scroll. At 1x zoom there is no scrollbar. A visible scrollbar only appears when zoomed. Consider a subtle affordance (e.g., dim zoom indicator showing current level, or a scroll shadow at the right edge).

**Firefox vs Chrome scrollbar behavior.** Custom scrollbar styling (`overflow-x: auto`) renders differently across browsers. Use `scrollbar-width: thin` (CSS) for Firefox; WebKit-prefixed styles for Chrome. Not a blocker, but affects polish.

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Bar percentage scaling | HIGH | Verified in GanttBar.vue source — pure math, no layout assumptions |
| Structural change required | HIGH | GanttChart.vue source read directly; three hardcoded 140px values identified |
| State placement | HIGH | Matches existing idleThreshold pattern exactly |
| Height sync complexity | MEDIUM | Requires GanttChart to replicate sub-row count logic or receive it from swimlanes |
| Toolbar zoom control | MEDIUM | TimelineToolbar not read; assuming same emit pattern as threshold control |
| Scroll reset on date change | MEDIUM | Standard Vue pattern; no unusual constraints identified |
