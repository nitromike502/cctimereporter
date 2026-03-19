# Pitfalls: Adding Scroll-Wheel Zoom and Cursor-Anchored Pan to the Gantt Chart

**Domain:** Zoom/pan on an existing CSS percentage-based Gantt chart (Vue 3)
**Researched:** 2026-03-18
**Confidence:** HIGH — based on direct inspection of GanttChart.vue, GanttSwimlane.vue, GanttBar.vue, TimelinePage.vue

---

## Critical Pitfalls

### Pitfall 1: The Time Axis and the Bar Area Are Separate DOM Elements — They Will Desync

**What goes wrong:** `GanttChart.vue` renders the time axis in `.time-axis` and the bars in `.lanes-container` as separate sibling `<div>` elements. They stay in sync today because both span 100% of the parent width with `margin-left: 140px` offsetting for labels.

When you widen the content area for zoom (e.g. setting an inner container to `width: 400%`), you must widen BOTH the time axis region AND the bars region by the same amount, and scroll them together. If you wrap only `.lanes-container` in a scrollable container, the `.time-axis` above it will not scroll and will immediately fall out of alignment.

**Why it happens:** The current layout relies on them both being 100% of the same parent. There is no shared scrollable ancestor that covers just the chart area (excluding the 140px label column).

**Concrete failure mode:** User zooms to 2x. The bar area scrolls horizontally to show 9a–3p. The time axis header still shows 12a–12a (the full 24-hour range, unscrolled). Every bar is now under the wrong time label.

**Prevention:** Before any zoom logic, establish a single scrollable viewport that wraps BOTH the time axis bar area (right of the 140px label column) and all swimlane bar areas. The 140px label column must remain pinned (not scrollable). The zoom/scroll container must be a single shared element.

**Recommended structure:**
```
.gantt-chart
  .label-column (140px, pinned, no scroll)
  .chart-viewport (overflow-x: auto, flex: 1)
    .chart-canvas (width: zoom * 100%)
      .time-axis-row (full width of .chart-canvas)
      .lanes-rows (full width of .chart-canvas)
```

**Warning signs:** After implementing zoom, tick marks are at the wrong time positions relative to bars. Scrubbing the scroll bar shows axis and bars moving independently.

**Phase:** Must be the first structural change. Everything else depends on this containment model being correct.

---

### Pitfall 2: Cursor-Anchored Zoom Requires Converting Between Three Coordinate Spaces

**What goes wrong:** When the user scrolls the wheel at cursor position X, the zoom must preserve what time is under the cursor. This requires three coordinate conversions that are easy to conflate:

1. **Client X** (position in viewport, includes page scroll offset)
2. **Viewport X** (position within `.chart-viewport`, relative to its left edge)
3. **Canvas X** (position within `.chart-canvas`, which is wider than the viewport at zoom > 1)

The formula for cursor-anchored zoom is:
```
newScrollLeft = (oldScrollLeft + cursorViewportX) * (newZoom / oldZoom) - cursorViewportX
```

If you use `event.clientX` directly without subtracting the viewport's `getBoundingClientRect().left`, the anchor point will be wrong whenever the chart is not at x=0 in the window (i.e., always — the page has padding, the sidebar, etc.).

**Why it happens:** `wheel` event gives `clientX` (viewport-relative). The `.chart-viewport` element has a `left` offset from the page edge. Confusing these produces an anchor that drifts toward the left edge of the page.

**Prevention:**
```javascript
function onWheel(event) {
  event.preventDefault()
  const viewport = event.currentTarget
  const rect = viewport.getBoundingClientRect()
  const cursorViewportX = event.clientX - rect.left  // position within viewport

  const oldZoom = zoom.value
  const newZoom = clamp(oldZoom * (event.deltaY < 0 ? 1.25 : 0.8), 1, 4)

  const oldScrollLeft = viewport.scrollLeft
  const newScrollLeft = (oldScrollLeft + cursorViewportX) * (newZoom / oldZoom) - cursorViewportX

  zoom.value = newZoom
  nextTick(() => { viewport.scrollLeft = newScrollLeft })
}
```

**Warning signs:** Zooming in near the right edge of the chart causes the view to jump to the far left instead of staying anchored. Zooming works correctly only near x=0.

**Phase:** Core zoom implementation.

---

### Pitfall 3: `overflow: hidden` on `.gantt-chart` Blocks All Horizontal Scrolling

**What goes wrong:** `GanttChart.vue` line 97 sets `.gantt-chart { overflow: hidden }`. This was intentional — it prevents bars near midnight from causing page-level horizontal scroll. But it also prevents any child element from being scrolled via JavaScript or the scrollbar.

If you add `overflow-x: auto` to a child `.chart-viewport` inside `.gantt-chart`, that child's scrollbar will never appear because the parent clips it.

**Why it happens:** `overflow: hidden` on a parent clips the overflow of ALL descendants, including those with their own `overflow: auto`.

**Prevention:** Remove `overflow: hidden` from `.gantt-chart` and replace it with `overflow: visible` (or remove the property entirely). Move overflow containment to the new `.chart-viewport` element that you introduce for zoom/scroll. The `padding-right: 10px` on `.gantt-chart` may also need to move to avoid adding to the scrollable width.

**Warning signs:** `viewport.scrollLeft = X` has no effect. The horizontal scrollbar never appears even when canvas is wider than viewport. `console.log(viewport.scrollLeft)` always returns 0.

**Phase:** Structural refactor before implementing scroll.

---

### Pitfall 4: Bar Clicks Will Fire After Scroll-End Drag — Swallowing Intentional Clicks

**What goes wrong:** When a user pans by click-dragging (if you add drag-to-pan), releasing the mouse fires a `click` event on whatever bar is under the cursor. This inadvertently selects a session the user was just trying to scroll past.

Even without drag-to-pan, scroll-wheel zoom events can cause the browser to fire a `click` if the cursor is stationary (some browser/trackpad combinations emit synthetic clicks after scroll momentum stops on a bar element).

**Why it happens:** `GanttBar.vue` uses `@click="emit('select', session)"` directly on the bar `<div>`. There is no guard against click-after-drag or click-after-zoom.

**Prevention:**
- Track whether a drag or zoom gesture just occurred (`isDragging` flag or timestamp-based guard)
- In the click handler, suppress the event if a drag just ended: `if (justDragged) return`
- Use a `pointerup` + distance threshold to distinguish tap from drag: only emit `select` if pointer moved < 5px
- If not implementing drag-to-pan (scrollbar-only), still suppress click if `deltaY !== 0` was received in the last 100ms

**Warning signs:** Clicking a bar works fine. But after using scroll-wheel zoom near a bar, the bar unexpectedly becomes selected.

**Phase:** Zoom implementation (even without drag-to-pan, guard is needed).

---

### Pitfall 5: The 140px Label Column Must NOT Scale With Zoom

**What goes wrong:** The label column is currently `width: 140px; flex-shrink: 0` inside `.lane-row`. The grid overlay is positioned at `left: 140px` in the lanes container. The time axis has `margin-left: 140px`.

If you apply zoom by scaling a wrapper element (e.g., `transform: scaleX(zoomLevel)` on `.gantt-chart` or on `.lanes-container`), the label column scales too, breaking the 140px alignment with the time axis offset. At 2x zoom the label column becomes 280px wide on screen while the time axis still starts at 140px.

**Why it happens:** CSS `transform: scale` scales the entire element including all children. It is a common shortcut for zoom that breaks fixed-width subcomponents.

**Prevention:** Do NOT use `transform: scale` for zoom. Instead, widen only the scrollable canvas via `width: calc(zoom * 100%)`. The label column sits outside the scrollable canvas and is never scaled. This approach keeps the label at exactly 140px at all zoom levels.

**Warning signs:** At 2x zoom, project name labels appear wider/larger than normal. The label text clips or the border between label and bar area is at the wrong position.

**Phase:** Architecture decision — must be made before any CSS is written for zoom.

---

## Moderate Pitfalls

### Pitfall 6: `timeToPercent()` Percentages Are Correct at All Zoom Levels — No Change Needed, But the Min-Width Override Is Not

**What goes wrong:** `GanttBar.vue` computes `barLeft` and `barWidth` as percentages of the 24-hour day. These percentages remain correct at any zoom level — a bar at 50% (noon) is still at 50% of the canvas width regardless of zoom. This part requires no changes.

However, `barWidth` has a minimum of `0.03%` to keep tiny sessions clickable. At 1x zoom on a typical 1200px chart area, `0.03%` is ~0.36px — barely visible. At 4x zoom the canvas is 4800px wide, so `0.03%` is ~1.44px — still too small to click.

Separately, the CSS `min-width: 4px` on `.gantt-bar` is a fixed pixel value. At high zoom it should probably be larger to remain useful, or you may want a minimum in time (e.g., 5 minutes minimum display width regardless of zoom).

**Prevention:** Consider converting the minimum width to a time-based minimum (e.g., always display at least 5 minutes worth of the current zoom level). Or accept the current behavior and note that very short sessions remain hard to click even at 4x.

**Warning signs:** At 4x zoom, 1-minute sessions are still 1–2px wide and nearly impossible to click.

**Phase:** Polish / UX tuning phase.

---

### Pitfall 7: Grid Lines and Tick Marks Use Percentage Positions — They Will Space Out Correctly, But the Density May Look Wrong

**What goes wrong:** Both `timeAxisTicks` and the `grid-overlay` lines use `left: tick.pct + '%'`. These percentages remain correct — at 4x zoom the 6am mark is still at 25% of the (now 4x wider) canvas. The grid lines will be further apart in pixels, which is actually desirable.

However, the tick density is fixed at every 2 hours (13 ticks). At 4x zoom on a 1200px viewport, ticks are ~200px apart — very sparse. The chart shows only a few hours at a time in the viewport, but all 13 ticks are spaced across the full 4800px canvas.

**What this means:** At 4x zoom users will see only 2–3 tick labels in their viewport at once, and may not realize they can scroll to see more. The density that feels right at 1x feels wrong at 4x.

**Prevention:** Either accept this (tick density decreasing at higher zoom is consistent with map/chart conventions) or make tick density reactive to zoom level:
- 1x: tick every 2 hours (current, 13 ticks)
- 2x: tick every 1 hour (25 ticks)
- 4x: tick every 30 minutes (49 ticks)

This requires making `timeAxisTicks` accept a `zoom` prop in `GanttChart.vue`.

**Warning signs:** At 4x zoom, the visible portion of the chart shows no tick labels, making it impossible to know what time range is on screen.

**Phase:** Zoom implementation — decide tick density strategy at the start.

---

### Pitfall 8: `wheel` Event Without `passive: false` Cannot Call `preventDefault()`

**What goes wrong:** Modern browsers register `wheel` event listeners as `passive: true` by default for performance. A passive listener cannot call `event.preventDefault()`. Without `preventDefault()`, the page scrolls vertically while the user tries to zoom the chart horizontally, producing a disorienting double-scroll effect.

In Vue 3, `@wheel.prevent` on a template element applies `preventDefault()` but Vue registers wheel listeners as passive by default, so `.prevent` may be silently ignored depending on browser/Vue version.

**Prevention:** Register the wheel listener manually with `{ passive: false }`:
```javascript
onMounted(() => {
  viewportEl.value.addEventListener('wheel', onWheel, { passive: false })
})
onUnmounted(() => {
  viewportEl.value.removeEventListener('wheel', onWheel)
})
```
Do not use `@wheel` in the template for the zoom handler.

**Warning signs:** Console warning: "Unable to preventDefault inside passive event listener invocation." Page scrolls vertically while attempting to zoom.

**Phase:** Core zoom implementation.

---

### Pitfall 9: `scrollLeft` Assignment After Zoom Must Wait for DOM Update

**What goes wrong:** When zoom changes, `zoom.value = newZoom` triggers a Vue reactive update that widens the canvas (e.g., `width: 400%` becomes the new computed style). The `scrollLeft` assignment must happen after the canvas is actually wider in the DOM — otherwise, the browser clamps `scrollLeft` to the old maximum scroll position.

If you write `viewport.scrollLeft = newScrollLeft` synchronously in the same event handler as the zoom state change, the DOM hasn't updated yet and the assignment is silently clamped.

**Prevention:** Assign `scrollLeft` inside `nextTick()` after updating `zoom.value`. Alternatively use a `watch` on `zoom` with `{ flush: 'post' }`:
```javascript
zoom.value = newZoom
await nextTick()
viewport.scrollLeft = newScrollLeft
```

**Warning signs:** Cursor-anchored zoom appears to work near the left edge but "snaps back" toward the left when zooming while scrolled to the right. The canvas is wider but the scroll position was clamped.

**Phase:** Core zoom implementation.

---

### Pitfall 10: Zoom State Must Not Reset on Date Navigation or Data Refresh

**What goes wrong:** `TimelinePage.vue` re-renders `<GanttChart>` when `selectedDate` changes (via `fetchTimeline()`) and when import completes. If `zoom` is stored as local state inside `GanttChart.vue`, it resets to 1x every time the parent rerenders the component.

This can happen subtly: the user zooms to 3x, navigates to the previous day, and is back at 1x. Mild annoyance. More disruptively: the user zooms during import (import runs in background), import completes, `fetchTimeline()` runs, and the chart re-renders at 1x mid-session.

**Prevention:** Store `zoom` in `TimelinePage.vue` (or a composable) and pass it as a prop to `GanttChart`. This way zoom survives data refreshes without resetting.

**Warning signs:** Zoom level resets to 1x when navigating between dates. Zoom resets mid-import when the completion event triggers a timeline refresh.

**Phase:** State design before implementation begins.

---

### Pitfall 11: The driver.js Tour Targets `.gantt-chart` by CSS Selector — Zoom Must Not Change This Class

**What goes wrong:** `TimelinePage.vue` line 200 uses `element: '.gantt-chart'` as a driver.js tour step target. If the zoom refactor renames or restructures `.gantt-chart` (e.g., introduces a `.gantt-chart-wrapper` outer element), the tour step will silently fail to highlight the correct element.

**Prevention:** Keep the `.gantt-chart` class on the outermost element of the component regardless of what inner elements are added for zoom/scroll. If you introduce a new outer wrapper, apply `.gantt-chart` to that wrapper, not to a child.

**Warning signs:** The guided tour highlights the wrong element (or nothing) when reaching the "Session Timeline" tour step.

**Phase:** Structural refactor.

---

## Minor Pitfalls

### Pitfall 12: Trackpad Two-Finger Scroll vs. Pinch-to-Zoom Conflict

**What goes wrong:** On macOS, a two-finger swipe on a trackpad fires `wheel` events with `deltaX` (horizontal scroll) and `deltaY` (vertical scroll). A two-finger pinch fires `wheel` events with `ctrlKey: true` and `deltaY` representing zoom delta. If you use `wheel` events for both zoom (scroll-wheel) and pan (two-finger horizontal), a two-finger horizontal swipe on macOS will trigger the zoom handler.

**Prevention:** Gate zoom on `event.ctrlKey` (pinch) OR `event.shiftKey` (scroll-wheel convention), not on raw `deltaY`. Let unmodified `wheel` events with `deltaX` scroll the chart horizontally natively (the browser handles this via `overflow-x: auto`). Only intercept and `preventDefault()` when the event is a zoom gesture:
```javascript
if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
  return  // let browser handle horizontal pan natively
}
```

**Warning signs:** Two-finger horizontal swipe on macOS zooms instead of panning. Vertical page scroll triggers chart zoom when cursor is over the chart.

**Phase:** Core zoom implementation — decide gesture model up front.

---

### Pitfall 13: Continuation Icons (Prev/Next Day Arrows) Are Positioned Outside Bar Bounds

**What goes wrong:** `GanttBar.vue` renders `.continuation-icon.prev` at `left: -14px` and `.continuation-icon.next` at `right: -14px` with `overflow: visible` on `.gantt-bar`. These icons extend outside the bar's bounding box. The bar's parent `.lane-bars` has `position: relative` and `flex: 1`.

At the rightmost visible edge of the chart viewport (when zoomed and scrolled), the "continues into next day" arrow (`right: -14px`) will be clipped by the viewport's `overflow: hidden`. This was acceptable before zoom because bars near midnight were just truncated by the chart's `overflow: hidden`. With a scrollable canvas, bars that continue into the next day now scroll into view and their right-side arrow may be clipped by the viewport edge.

**Prevention:** This is a low-priority cosmetic issue. Accept the clipping, or add `padding-right: 16px` to the scrollable canvas to give the rightmost arrow room.

**Warning signs:** Bars that run to midnight show a clipped right-arrow icon when scrolled to the far right of the chart.

**Phase:** Polish.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Structural refactor | `overflow: hidden` on `.gantt-chart` blocks child scroll | Remove it before adding any scroll container |
| Structural refactor | Time axis desync from bar area | Single shared scrollable canvas for both; label column pinned outside |
| Architecture | Transform-scale scaling the label column | Use canvas width expansion, not CSS transform scale |
| State design | Zoom resets on date nav / import complete | Store zoom in TimelinePage, pass as prop |
| Core zoom | `wheel` passive listener can't `preventDefault()` | Register manually with `{ passive: false }` |
| Core zoom | `scrollLeft` clamped before DOM update | Assign inside `nextTick()` after zoom state change |
| Core zoom | Wrong coordinate space for cursor anchor | Use `clientX - rect.left`, not raw `clientX` |
| Core zoom | Trackpad swipe vs pinch ambiguity | Gate zoom on `ctrlKey`; let `deltaX` scroll natively |
| Bar interaction | Click fires after zoom gesture | Guard `@click` with recent-gesture timestamp check |
| Tour integration | `.gantt-chart` selector breaks if outer element renamed | Preserve `.gantt-chart` on outermost element of component |
| UX tuning | Tick density too sparse at high zoom | Make tick interval reactive to zoom level |

---

*Research completed: 2026-03-18*
*Scope: pitfalls specific to adding scroll-wheel zoom and cursor-anchored pan to the existing GanttChart.vue in cctimereporter v0.5.1*
