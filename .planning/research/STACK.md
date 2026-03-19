# Technology Stack: Gantt Zoom/Pan

**Project:** CC Time Reporter — zoom/pan milestone
**Researched:** 2026-03-18
**Confidence:** HIGH

## Recommendation: No New Dependencies

The user's stated approach — widen the chart container, `overflow-x: auto` on the wrapper, percentage-based bars scale naturally — is implementable entirely with vanilla JS and Vue 3 reactivity. No library is needed. The reasoning is below.

---

## Why Not a Panzoom Library

Three candidates were evaluated:

| Library | Zoom Mechanism | Pan Mechanism | Verdict |
|---------|---------------|---------------|---------|
| `@panzoom/panzoom` v4.6.1 | CSS `transform: scale()` | CSS `translate()` | Wrong model |
| `vue-zoomable` v1.2.8 | CSS `transform: scale()` | CSS `translate()` | Wrong model |
| `vue-panzoom` (wraps anvaka/panzoom) | CSS `transform: scale()` | CSS `translate()` | Wrong model |

All three use `transform: scale()` + `translate()` on a fixed-size element. That model is correct for maps, image viewers, and canvas-based diagrams.

It is wrong for this Gantt chart.

**Why transform-scale is wrong here:**

The bars in `GanttBar.vue` are positioned with `left: barLeft + '%'` and `width: barWidth + '%'`. These percentages resolve against the `.lane-bars` container's computed width. If zoom applies `transform: scale(2)` to the container, the element's layout box does not change — the browser renders it twice as large visually, but `offsetWidth` is unchanged, `getBoundingClientRect()` reports scaled values, and scroll-based pan produces jerky behavior. Pointer click coordinates require un-scaling before hit-testing.

**Why the width-expansion approach is correct here:**

Set `.gantt-chart { width: calc(100% * var(--zoom-level)); }` on the chart container inside a `overflow-x: auto` scroll wrapper. At zoom level 2, the chart is 200% of the viewport width. Percentage bars resolve against a wider container — bars get physically wider in proportion. No coordinate un-scaling needed. Click events work normally. The browser's native scroll handles pan. The `140px` lane label column stays fixed via `flex-shrink: 0` (already set).

This is a layout-reflow zoom, not a visual-only zoom. It is the correct primitive for a scrollable Gantt timeline. Source: MDN documentation confirms `zoom` and width-expansion cause layout recalculation, while `transform: scale()` is visual-only and does not affect child percentage widths. (Confidence: HIGH — MDN official docs)

---

## Stack Additions Required

### None (zero new npm dependencies)

| Capability | Implementation | Source |
|------------|---------------|--------|
| Zoom level state | `ref(1)` in Vue composable | Vue 3 reactivity (already installed) |
| Container width scaling | CSS custom property `--zoom-level`, `width: calc(100% * var(--zoom-level))` | Native CSS |
| Scroll wrapper | `overflow-x: auto` on existing parent div | Native CSS |
| Wheel event zoom | `addEventListener('wheel', handler, { passive: false })` + `event.preventDefault()` | Native DOM |
| Cursor-anchor math | `scrollLeft` adjustment after zoom, calculated from `event.clientX` and `getBoundingClientRect()` | Native DOM |
| +/- buttons | Existing `AppButton` component | Already installed |
| Zoom range clamping | `Math.min(Math.max(1, zoom), 4)` | Plain JS |

---

## Integration Points with Existing Stack

### GanttChart.vue — primary change surface

The `.gantt-chart` element currently has `width: 100%; overflow: hidden`. This becomes the scroll wrapper's inner element. The scroll wrapper (new div, or promoted to `TimelinePage.vue`) gets `overflow-x: auto`.

The 140px `.lane-label` column (`flex-shrink: 0`, already set) will scroll with the chart unless sticky positioning is added. Whether to make labels sticky is a roadmap decision, not a stack decision.

### TimelinePage.vue — zoom state owner

Zoom level lives here or in a dedicated `useGanttZoom` composable. It is passed as a prop to `GanttChart`. The wheel event listener attaches to the scroll wrapper ref.

### CSS custom property approach

```css
/* On .gantt-chart */
width: calc(100% * var(--zoom-level, 1));
```

Driven by inline style binding:
```vue
<div class="gantt-chart" :style="{ '--zoom-level': zoomLevel }">
```

This means zero changes to `GanttBar.vue` or `GanttSwimlane.vue`. Their percentage positioning just works.

### Wheel event — passive: false required

To prevent the page from scrolling vertically while zooming:
```js
scrollWrapperRef.value.addEventListener('wheel', onWheel, { passive: false })
```

`passive: false` carries a small perf cost but is unavoidable when calling `event.preventDefault()`. The chart is not rendering 60fps canvas animation, so this is acceptable. (Confidence: HIGH — MDN official docs)

### Cursor-anchor scroll adjustment

When zoom level changes from `oldZoom` to `newZoom` via wheel event:
1. Record `cursorOffsetInContainer = event.clientX - scrollWrapper.getBoundingClientRect().left + scrollWrapper.scrollLeft`
2. The same point in the new zoom: `cursorOffsetInContainer * (newZoom / oldZoom)`
3. New `scrollLeft = newPoint - (event.clientX - scrollWrapper.getBoundingClientRect().left)`

This is ~5 lines of arithmetic. No library needed. (Confidence: HIGH — standard scroll math, verified against MDN getBoundingClientRect docs)

---

## Alternatives Considered and Rejected

| Option | Why Rejected |
|--------|-------------|
| `@panzoom/panzoom` v4.6.1 | Uses CSS transform — breaks percentage-based child layout |
| `vue-zoomable` v1.2.8 | Same transform model, adds 1 dependency for no gain |
| CSS `zoom` property | Nonstandard behavior across browsers; MDN marks it as having inconsistent cross-browser support for non-integer values |
| `transform-origin` trick with scale | Requires coordinate un-scaling for all click events; fragile |

---

## What NOT to Add

- **No panzoom library** — transform-scale model is wrong for percentage-layout Gantt
- **No touch/gesture library** — mobile is not a stated target; if added later, native `pointermove` events suffice
- **No virtualization library** — row count is small (one row per project, typically <20); virtualization is premature
- **No canvas/SVG rewrite** — the current CSS positioning system works correctly at any zoom level once width is dynamic

---

## Sources

- MDN: [Element: wheel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event) — passive listeners, deltaY, preventDefault behavior (HIGH confidence)
- MDN: [CSS zoom property](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom) — zoom vs transform: scale layout behavior (HIGH confidence)
- modern-css.com: [CSS zoom vs transform: scale()](https://modern-css.com/scaling-elements-without-transform-hacks/) — layout footprint difference (MEDIUM confidence)
- GitHub: [ehassaan/vue-zoomable](https://github.com/ehassaan/vue-zoomable) v1.2.8 — confirmed transform-based, not scroll-based (HIGH confidence, source read directly)
- GitHub: [timmywil/panzoom](https://github.com/timmywil/panzoom) v4.6.1 — confirmed transform-based, focal-point zoom (HIGH confidence, source read directly)
