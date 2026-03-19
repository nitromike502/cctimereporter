# Feature Landscape: Gantt Chart Zoom and Pan

**Domain:** Timeline/Gantt UI — horizontal scroll zoom anchored to cursor position
**Researched:** 2026-03-18
**Confidence:** HIGH (cross-referenced against dhtmlxGantt docs, video editor forums, UX case studies, and direct codebase analysis)

---

## Context: What Zoom Means Here

The existing Gantt chart positions bars using percentage-based CSS (`left: X%`, `width: Y%`) within `.lane-bars`, which is `flex: 1`. A 24-hour day fills 100% of available width.

The user-proposed approach: wrap the chart in a scrollable container, widen the inner element proportionally to the zoom level (e.g., 2x zoom = 200% width), keep percentage-based bars — they scale automatically as absolute pixel widths grow. This is a proven, low-complexity approach for this use case. The lane label column (140px fixed) must remain sticky and NOT zoom.

The primary motivation: short sessions (5–30 min) are ~0.3–2% of the day width. At full-day scale, they collapse to a few pixels, become hard to distinguish from adjacent bars, and are difficult to click. Zoom fixes this without changing the data model.

---

## Table Stakes

Features that must exist for zoom to feel right. Missing any of these will make the feature feel broken or frustrating.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Scroll wheel zooms the chart** | Universal expectation from any zoomable timeline (video editors, project management tools, map UIs). Users will try this first. If it doesn't work, they'll assume zoom isn't implemented. | Low | Wheel event handler on chart container |
| **Zoom anchored to cursor position** | Without cursor anchoring, the chart jumps — visible content shifts unpredictably on each zoom step. Users lose their place. This is the single most important UX correctness property of zoom. Industry standard: DaVinci Resolve, Premiere, Final Cut, dhtmlxGantt all anchor to cursor. | Medium | Requires calculating cursor-relative scroll offset after scale change |
| **Time axis scales with content** | The 24h tick marks must widen proportionally with the bars. If bars grow but the axis stays fixed, the tick labels no longer align with the bars they label. Currently both share `margin-left: 140px` and percentage positioning, so they will scale together naturally — but this must be verified. | Low | Shared container width drives both |
| **Horizontal scrollbar appears when zoomed** | After zooming past 1x, the chart overflows its container. A scrollbar (or touch drag) is required to reach off-screen content. Without it, content beyond the viewport is inaccessible. | Low | `overflow-x: auto` on scroll container |
| **Lane labels stay fixed (do not zoom)** | The 140px project name column must not widen with zoom. It must stay in the left gutter as a sticky reference while the bar area scrolls. If labels zoom too, they visually detach from the bars and push content further right. | Low | Labels outside the scaled container, or `position: sticky` |
| **+/- buttons for manual zoom control** | Touch devices and users with no scroll wheel need an alternative. Standard control for any zoomable view. Keyboard and mouse-only users also expect a visible affordance. | Low | Shared zoom state, button click handlers |
| **Zoom resets on date navigation** | When the user navigates to a different day, zoom should reset to 1x and scroll to the start. Carrying zoom state across dates is disorienting — the new day's content appears at the same scroll offset as the previous day, potentially showing an empty or irrelevant section. | Low | Watch `date` prop in parent, reset zoom state |
| **Minimum bar clickability at all zoom levels** | Bars already have a `min-width: 4px` CSS rule. At high zoom, short sessions become wide enough to click easily. At 1x (no zoom), the existing minimum must still apply. This must not regress. | Low | Existing `Math.max(widthPct, 0.03)` logic is unchanged |
| **Zoom range 1x–4x** | Per stated requirements. 1x = current full-day view. 4x = bars are 4x wider in pixels, showing a ~6-hour window at a time. This matches typical Gantt tool zoom ranges (dhtmlxGantt: minutes to years; Asana: day/week/month). A 4x ceiling is appropriate for a 24h tool. | Low | Clamp zoom value in wheel handler |

---

## Differentiators

Features that improve the zoom experience above the baseline. Not required for zoom to work, but raise quality meaningfully.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Zoom level display (e.g., "2x")** | Lets users know their current zoom level without guessing. Especially useful if they've zoomed in multiple times and want to return to a known state. Low cost, high orientation value. | Low | Reactive display of zoom state in toolbar |
| **"Reset zoom" button or click on zoom display** | One-click return to 1x. The user workflow: zoom in, find the session, detail panel opens, then want to see the full day again. Navigating date resets but that's awkward if staying on the same day. | Low | Set zoom to 1, reset scrollLeft to 0 |
| **Smooth zoom animation** | CSS `transition` on the container width produces a brief smooth scale animation that helps users track where their content is moving. Video editors universally use smooth zoom. Adds to perceived quality. | Low | `transition: width 100ms ease` or similar |
| **Pinch-to-zoom on trackpad/touch** | MacBook trackpads emit pinch events (`WheelEvent` with `ctrlKey: true` and fractional `deltaY`). Many users will attempt this. Treating `ctrlKey + wheel` as zoom (common pattern: Figma, Google Maps, browser native) instead of scroll makes trackpad zoom work without extra effort. | Low | Check `event.ctrlKey` in wheel handler; already close to the same code path |
| **Scroll position preserved when zooming with buttons** | When using +/- buttons (not mouse wheel), the visible center of the chart should stay centered, not jump to position 0. Requires calculating the midpoint of the visible area and re-centering after zoom. | Medium | More complex than cursor-anchored zoom; requires tracking scrollLeft and containerWidth |
| **Current time indicator at 1x** | A thin vertical line marking the current time of day (now). At 1x the chart is dense and a "you are here" marker helps orientation. At zoom, it can serve as a reference point to scroll toward. Note: this app shows past days, so for today it's useful, for past dates it's irrelevant (would be at 100% / end of day). | Medium | New feature, not strictly zoom-related — flag as separate concern |

---

## Anti-Features

Things to deliberately NOT build. Common mistakes in zoomable Gantt implementations.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Zoom that changes the time granularity (day → hour → minute views)** | Project management Gantt tools (Jira, Asana, ClickUp) change which time unit is shown when zooming: year → quarter → month → week → day. This app shows a single 24h day — there is no granularity change needed. Adding level-switching logic would be over-engineering for a single-day view with fixed 2h tick marks. | Keep 24h view fixed; zoom is purely a visual magnification of the same data |
| **Discrete zoom levels (snapping to 1x, 2x, 3x, 4x)** | Snapping feels mechanical. Users who want 1.5x to see a 16h window will be frustrated that the tool jumps to 2x. Snapping is common in tools that change time unit (need clean boundaries), but not appropriate for continuous magnification. | Use a continuous multiplier clamped to [1, 4]; step size per wheel tick: 0.2 or 0.25 |
| **Zoom persisting across sessions (localStorage)** | Storing zoom state across page reloads or date changes adds a hidden variable. New users and returning users will see different initial states without understanding why. Already the requirement is to reset on date navigation — persisting to storage undermines this. | Keep zoom in component state only; reset on any navigation |
| **Zooming the lane label column** | The 140px project name column has nothing to gain from zooming — the text doesn't become more legible and it takes space away from bars. Zooming it also causes label text to visually separate from its bar row if widths change differently. | Exclude the label column from the scaled container |
| **Replacing scroll with drag-to-pan as primary interaction** | Video editing timelines use drag-to-pan because they need precision scrubbing. In a Gantt chart, drag is used for task resizing/moving. This app has neither — but click-on-bar opens the detail panel. A drag-to-pan interaction conflicts with click-to-select. Users would trigger pan when they meant to click a bar. | Use native scrollbar and/or shift+scroll for horizontal pan; do not intercept click/drag |
| **Zoom controlling vertical height of rows** | Some Gantt tools let users change row height with zoom. This app's row height (44px min) is set for readability and click targets. Changing it adds complexity and saves no vertical space the user needs. | Keep row height fixed; only horizontal zoom |
| **Fractional pixel rendering at high zoom** | At 4x zoom with percentage bars, a 5-minute session (0.35% of day) becomes 1.4% × 4 = 5.6% of the zoomed width. On a 1200px chart area this is ~67px — reasonable. At lower zoom it may still be sub-pixel. The existing `min-width: 4px` / `Math.max(widthPct, 0.03)` handles this. Do not add additional minimum-width logic specific to zoom — it would cause bars to jump position as the minimum kicks in or out. | Trust the existing minimum; the CSS `min-width: 4px` does the right thing |
| **Ctrl+scroll as zoom (intercepting browser zoom)** | Some tools use Ctrl+wheel for their custom zoom, which conflicts with the browser's native page zoom (also Ctrl+wheel). This breaks accessibility and surprises users who want to zoom the whole page. | Use plain scroll wheel for timeline zoom (no modifier), or trackpad pinch (`ctrlKey: true` on `WheelEvent` from MacOS trackpad, which is distinct from Ctrl held manually) |

---

## Feature Dependencies

```
Zoom state (zoomLevel: 1–4, reactive ref in GanttChart or TimelinePage)
  ├── Wheel event handler → updates zoomLevel → adjusts scrollLeft to anchor cursor
  ├── +/- buttons → update zoomLevel (no cursor anchoring needed, use center)
  ├── Date navigation watch → resets zoomLevel to 1, scrollLeft to 0
  └── Container width = `${zoomLevel * 100}%` applied to inner chart element
        ├── Time axis ticks: already percentage-positioned, scale automatically
        ├── GanttBar: already percentage-positioned, scale automatically
        └── Grid overlay: already percentage-positioned, scales automatically

Lane label column (140px, fixed)
  └── Must live OUTSIDE the scaled container, or be position: sticky
```

No changes required to:
- `GanttBar.vue` (percentage positioning scales naturally)
- `GanttSwimlane.vue` (no absolute positioning of its own)
- Server API (zoom is purely client-side)
- Database schema

---

## Implementation Note: Cursor-Anchored Zoom Math

The hardest part of zoom. When the user scrolls over the chart at cursor position `mouseX` (relative to the scroll container):

```
// Before zoom:
contentXUnderCursor = scrollLeft + mouseX
fractionOfContent = contentXUnderCursor / (containerWidth * oldZoom)

// After zoom:
newContentWidth = containerWidth * newZoom
newScrollLeft = (fractionOfContent * newContentWidth) - mouseX
scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
```

The bars use percentage positions relative to the inner (scaled) container. The cursor fraction into the content is scale-invariant: `mouseX` in viewport coords plus `scrollLeft` gives the absolute position in the zoomed content, divided by zoomed width gives the fraction, which is preserved after re-zoom.

This math is uniform (all elements scale the same way) because the fixed-width lane label column is outside the scaled container. Mixing fixed-width and scaled elements in the same container would break this calculation, which is one more reason to keep labels outside.

**Confidence:** MEDIUM — the formula is derived from first principles and corroborated by the implementation blog post. Should be validated in a prototype before committing to it.

---

## MVP Recommendation

For this milestone, prioritize:

1. **Scroll wheel zoom with cursor anchoring** — the core interaction. Without cursor anchoring, zoom is disorienting and will feel broken.
2. **+/- buttons** — required for non-scroll-wheel users; low effort.
3. **Time axis scales with content** — verify tick labels align to bars at all zoom levels.
4. **Lane labels stay fixed** — structural decision that must be made first; affects how the container is structured.
5. **Zoom resets on date navigation** — one watch statement, prevents confusing state.

Defer to post-MVP:
- **Zoom level display** — useful but not blocking
- **Reset zoom button** — date navigation resets it anyway; same-day reset is edge case
- **Smooth animation** — polish, not correctness
- **Current time indicator** — separate feature unrelated to zoom mechanics

---

## Sources

- [Zoom and Scroll in a Gantt Chart — AIMMS How-To](https://how-to.aimms.com/Articles/279/279-gantt-chart-scroll.html) — MEDIUM confidence (vendor docs, not directly verified)
- [dhtmlxGantt 6.2 zoom and mouse wheel](https://dhtmlx.com/blog/dhtmlxgantt-6-2-minor-update-boosting-gantt-chart-performance-zooming-mouse-wheel-much/) — MEDIUM confidence (primary Gantt library blog post)
- [Implementing a timeline with scrolling and zooming](https://thomas.preissler.me/blog/2022/01/10/implementing-a-timeline-with-scrolling-and-zooming-or-how-i-failed-at-elementary-school-math) — MEDIUM confidence (practitioner blog with implementation detail)
- [Designing Timeline: Lessons Learned — Asana Design](https://medium.com/asana-design/designing-timeline-lessons-learned-from-our-journey-beyond-gantt-charts-645e80177aaa) — MEDIUM confidence (design case study from production tool)
- [Shortcut to Zoom Timeline — Screen Studio](https://hub.screen.studio/p/shortcut-to-zoom-timeline-cmd-scroll-pinch-to-zoom-cmd) — MEDIUM confidence (real-world interaction pattern in shipping product)
- Direct codebase analysis: `GanttChart.vue`, `GanttBar.vue`, `GanttSwimlane.vue` — HIGH confidence
