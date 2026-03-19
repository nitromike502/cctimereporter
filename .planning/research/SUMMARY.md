# Project Research Summary

**Project:** CC Time Reporter v0.6.0 — Gantt Chart Zoom/Pan
**Domain:** Zoomable timeline UI — horizontal scroll zoom on a CSS percentage-based Gantt chart
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

This milestone adds horizontal zoom and pan to the existing Gantt chart in CC Time Reporter. The chart currently renders session bars using CSS percentage positions (`left: X%`, `width: Y%`) relative to a flex container. Research confirms the correct zoom approach is a layout-reflow model: widen the inner canvas element proportionally to the zoom level (e.g., `width: 200%` at 2x), wrap it in a scrollable container with `overflow-x: auto`, and let the browser handle pan via the native scrollbar. All panzoom libraries evaluated use `transform: scale()`, which is a visual-only zoom that does not affect child percentage widths — this model is fundamentally incompatible with this chart and must be avoided. Zero new npm dependencies are required.

The implementation requires one non-trivial structural refactor before any zoom logic can be written: separating the fixed 140px label column from the scrollable canvas area. Currently the time axis and lane bars share the same parent element, aligned by a `margin-left: 140px` hack. A scroll container cannot cover only the bar area while leaving the label pinned unless the two are explicitly separated into parallel layout regions. This structural change is the critical-path prerequisite — everything else is additive. The refactor must preserve the `.gantt-chart` CSS class on the outermost element (targeted by the driver.js tour) and remove `overflow: hidden` from `.gantt-chart` (which currently blocks all child scrolling).

The main implementation risk is cursor-anchored zoom math, which requires correctly converting between three coordinate spaces (client X, viewport X, canvas X). The formula is well-understood but has a known failure mode: using raw `event.clientX` instead of `event.clientX - rect.left` produces zoom that drifts toward the page's left edge. A secondary risk is `scrollLeft` assignment timing — it must be deferred to `nextTick()` after the zoom state change, or the browser silently clamps it to the pre-zoom scroll maximum. Both risks have clear, validated prevention strategies documented in PITFALLS.md.

## Key Findings

### Recommended Stack

No new dependencies. The user-proposed width-expansion approach requires only Vue 3 reactivity (already installed), native CSS (`width: calc(var(--zoom-level) * 100%)`), native DOM events (`addEventListener('wheel', handler, { passive: false })`), and approximately 5 lines of scroll math. Every panzoom library evaluated (panzoom, vue-zoomable, vue-panzoom) uses CSS `transform: scale()` — a visual-only zoom that does not cause child percentage widths to reflow, making each library fundamentally incompatible with the bar positioning model.

**Core technologies:**
- Vue 3 reactivity (`ref`, `watch`, `nextTick`): zoom state management — already installed, no addition needed
- Native CSS `width: calc()` with CSS custom property: canvas scaling — correct model for percentage-based child layout
- `addEventListener` with `{ passive: false }`: wheel event capture — required to call `preventDefault()` and block vertical page scroll during zoom
- `getBoundingClientRect()` + `scrollLeft` math: cursor-anchored zoom — approximately 5 lines, no library

### Expected Features

Research clearly distinguishes what users will expect on day one, what raises quality meaningfully, and what to explicitly avoid.

**Must have (table stakes):**
- Scroll wheel zoom with cursor anchoring — users will try this first; without cursor anchoring the chart jumps and feels broken
- Time axis scales with content — tick labels must remain aligned with bars at all zoom levels (automatic once both are inside the shared canvas)
- Horizontal scrollbar appears when zoomed — content beyond 1x is unreachable without it
- Lane labels stay fixed and do not zoom — labels must live in a pinned column outside the scaled canvas
- +/- buttons for manual zoom control — required for touch and non-scroll-wheel users
- Zoom resets on date navigation — carrying zoom state across date changes is disorienting
- Zoom range 1x–4x — per stated requirements; appropriate for a 24h single-day view

**Should have (differentiators):**
- Zoom level indicator (e.g., "2x") — orientation aid at very low cost
- Reset zoom button — same-day reset without navigating away
- Smooth zoom animation — `transition: width 100ms ease` on the canvas
- Trackpad pinch support — `ctrlKey: true` on `WheelEvent` from macOS trackpad, nearly free to add alongside the wheel handler

**Defer (v2+):**
- Current time indicator — separate feature, unrelated to zoom mechanics
- Adaptive tick density — useful at high zoom but not blocking; fixed 2h ticks remain intelligible at 4x

### Architecture Approach

The structural change creates two parallel layout regions inside `.gantt-chart`: a pinned `.gantt-labels` column (140px, `flex-shrink: 0`, scrolls vertically with page but not horizontally) and a `.gantt-scroll-area` (`flex: 1`, `overflow-x: auto`) containing the `.gantt-canvas` (`width: zoomLevel * 100%`). The canvas holds both the time axis and all swimlane rows so they scroll together. The three hardcoded `140px` values in GanttChart.vue (margin-left on `.time-axis`, left on `.grid-overlay`, width on `.lane-label`) must all be removed as part of this refactor. `GanttBar.vue` and `GanttSwimlane.vue` require zero changes.

**Major components:**
1. `GanttChart.vue` (modified heavily): layout restructure, `zoomLevel` prop, canvas width binding, label height sync per swimlane, scroll reset on date change
2. `TimelinePage.vue` (modified): owns `zoomLevel` ref with localStorage persistence, passes prop to GanttChart, wires toolbar event
3. `TimelineToolbar.vue` (modified): adds +/- zoom control UI, emits `@update:zoom`
4. `GanttSwimlane.vue` / `GanttBar.vue` (no change): percentage positioning scales automatically with canvas width

**Height synchronization note:** Label column per-row divs must match each swimlane's computed height (`subRows.length * 36 + 8`). GanttChart has access to sessions arrays and can replicate this calculation without adding emit/prop complexity.

### Critical Pitfalls

1. **Time axis and bar area desync** — if only `.lanes-container` is wrapped in a scroll container while `.time-axis` remains a sibling, they scroll independently. Every bar ends up under the wrong time label. Fix: a single `.gantt-scroll-area` must wrap both the time axis row and all swimlane rows.

2. **`overflow: hidden` on `.gantt-chart` blocks all child scrolling** — any `overflow-x: auto` on a child is clipped by the parent's `overflow: hidden`. Fix: remove `overflow: hidden` from `.gantt-chart` before adding any scroll container; move overflow containment to `.gantt-scroll-area`.

3. **Cursor-anchor uses wrong coordinate space** — using raw `event.clientX` instead of `event.clientX - rect.left` produces zoom that drifts toward the page's left edge. Fix: always subtract `viewport.getBoundingClientRect().left`.

4. **`scrollLeft` assigned before DOM updates** — setting `scrollLeft` synchronously after updating zoom state silently clamps to the pre-zoom scroll maximum. Fix: assign inside `await nextTick()` after changing `zoom.value`.

5. **`transform: scale` zooms the label column** — any approach applying CSS transform to the chart element scales the 140px label column with bars, breaking alignment at every zoom level. Fix: use canvas width expansion only; never apply transform-scale to any container that includes the label column.

## Implications for Roadmap

Research strongly suggests a 3-phase build order: structural prerequisite, core zoom mechanic, then polish. The structural refactor must complete and visually verify at 1x before any zoom state or event handling is written. Mixing the two adds debugging complexity with no benefit.

### Phase 1: Structural Refactor (layout prerequisite)

**Rationale:** The current layout cannot support horizontal scroll without breaking time axis alignment. This must be correct before any zoom logic is added. It is a pure layout change with no visible effect at zoom level 1 — verifiable by confirming the chart renders identically to the current version before proceeding to Phase 2.

**Delivers:** A chart container that supports horizontal scroll; the correct DOM structure for zoom to operate on.

**Key tasks:**
- Introduce `.gantt-labels` (pinned, 140px) and `.gantt-scroll-area` (scrollable, flex: 1) as parallel layout regions
- Move `.lane-label` elements out of individual lane rows into the pinned column
- Remove three hardcoded `140px` offsets from `.time-axis` (margin-left) and `.grid-overlay` (left)
- Remove `overflow: hidden` from `.gantt-chart`; add `overflow-x: auto` to `.gantt-scroll-area`
- Sync label row heights with swimlane heights (GanttChart computes sub-row counts)
- Preserve `.gantt-chart` class on outermost element (driver.js tour target — see Pitfall 11)

**Avoids pitfalls:** Time axis desync (pitfall 1), overflow:hidden block (pitfall 3), label column scaling (pitfall 5).

**Research flag:** Standard Vue flex layout restructure — no additional research needed. Validate by visual comparison with current rendering at zoom 1.

### Phase 2: Core Zoom Mechanic

**Rationale:** Once the DOM structure is verified correct, zoom is purely additive: wire the `zoomLevel` prop, apply canvas width, add the wheel handler, and add +/- buttons. State lives in TimelinePage (not GanttChart) to survive data refreshes.

**Delivers:** Functional zoom from 1x–4x, scroll wheel with cursor anchoring, +/- buttons, zoom state in TimelinePage with localStorage persistence, zoom reset on date navigation.

**Key tasks:**
- Add `zoomLevel` prop to GanttChart; apply `width: ${zoomLevel * 100}%` to `.gantt-canvas`
- Add `zoomLevel` ref in TimelinePage; pass as prop to GanttChart (not local to GanttChart)
- Register wheel listener with `{ passive: false }` (not `@wheel` in template)
- Implement cursor-anchored zoom: `newScrollLeft = (oldScrollLeft + cursorViewportX) * (newZoom / oldZoom) - cursorViewportX`
- Assign `scrollLeft` inside `nextTick()` after zoom state change
- Gate zoom on `ctrlKey` (pinch gesture) vs. raw scroll to avoid trackpad horizontal pan conflict
- Add guard in bar click handler against accidental click-after-zoom gesture
- Add +/- buttons to TimelineToolbar; emit `@update:zoom`

**Avoids pitfalls:** Wrong coordinate space (pitfall 2), passive wheel listener (pitfall 8), scrollLeft timing (pitfall 9), zoom state reset on data refresh (pitfall 10), trackpad ambiguity (pitfall 12).

**Research flag:** Cursor-anchor math should be validated in a working prototype before treating Phase 2 as complete. FEATURES.md rates the formula MEDIUM confidence (derived from first principles, corroborated by one practitioner blog). Failure mode is immediately visible: zoom in near the right edge; content under the cursor must stay anchored.

### Phase 3: Polish and Discoverability

**Rationale:** Non-blocking improvements that raise quality and address edge cases identified in research. All are additive and independent of Phase 2 correctness.

**Delivers:** Zoom level indicator, reset zoom affordance, smooth animation, adaptive tick density at high zoom, right-edge padding for continuation arrows.

**Key tasks:**
- Display current zoom level (e.g., "2x") in toolbar
- Add reset zoom affordance (button or clickable display)
- Add `transition: width 100ms ease` to `.gantt-canvas`
- Make `timeAxisTicks` reactive to zoom level (every 2h at 1x, 1h at 2x, 30min at 4x)
- Add `padding-right: 16px` to canvas for continuation icon breathing room at the right edge

**Avoids pitfalls:** Tick density sparseness (pitfall 7), continuation icon clipping (pitfall 13).

**Research flag:** Tick density logic is purely additive inside GanttChart — no research needed. Animation is a one-liner CSS addition.

### Phase Ordering Rationale

- Phase 1 must come first: the DOM structure is a prerequisite for scroll; implementing zoom before the structural refactor means unwinding the refactor around zoom logic already in place.
- Phase 2 depends on Phase 1 being verified correct at 1x (chart renders identically to today) before zoom state is added.
- Phase 3 is fully independent of Phase 2 correctness — polish items can be deferred or pulled forward without risk.
- No backend changes at any phase — zoom is entirely client-side. No API, no schema, no server code is touched.

### Research Flags

Phases needing attention during execution:

- **Phase 2 (cursor-anchor math):** Validate the scroll formula with an interactive prototype before marking complete. Test by zooming in near the right edge of a day with many sessions — verify the content under the cursor stays visually anchored.

Phases with standard patterns (no additional research needed):

- **Phase 1 (layout refactor):** Standard Vue flex layout restructure with known constraints. Verify visually at 1x before proceeding.
- **Phase 3 (polish):** Each item is a small additive change with no integration risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries evaluated directly from source; MDN docs confirm layout model; zero-dependency conclusion is solid |
| Features | HIGH | Based on direct codebase analysis plus cross-reference with dhtmlxGantt docs, Asana design case study, and real shipping products |
| Architecture | HIGH | Based on direct reading of all four component files; three hardcoded 140px values identified and verified |
| Pitfalls | HIGH | All pitfalls derived from direct source inspection, not inference; specific failure modes and line-level evidence documented |

**Overall confidence:** HIGH

### Gaps to Address

- **Cursor-anchor math validation:** The scroll formula is logically correct and derived from first principles, but should be tested with an interactive prototype at Phase 2 start. Failure mode is obvious and immediately visible — no hidden failure risk.

- **TimelineToolbar internal structure:** ARCHITECTURE.md notes TimelineToolbar was not directly read during research. The assumption is it follows the same emit pattern as the idle threshold control. Confirm before writing zoom control UI.

- **Label height synchronization drift:** GanttChart must replicate swimlane sub-row count logic to compute label heights. If swimlane height calculation changes in a future milestone, these two locations can drift. Consider extracting to a shared utility or emitting `laneHeight` from GanttSwimlane.

- **Minimum bar size at high zoom:** At 4x, the existing `min-width: 4px` and `Math.max(widthPct, 0.03)` may still leave very short sessions hard to click. Accepted for this milestone; revisit if user feedback identifies it as a blocker.

## Sources

### Primary (HIGH confidence)
- Direct source analysis: `GanttChart.vue`, `GanttBar.vue`, `GanttSwimlane.vue`, `TimelinePage.vue` — architecture, layout model, hardcoded values
- MDN: [Element: wheel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event) — passive listeners, deltaY, preventDefault behavior
- MDN: [CSS zoom property](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom) — zoom vs transform:scale layout behavior
- GitHub: [timmywil/panzoom](https://github.com/timmywil/panzoom) v4.6.1 — confirmed transform-based, not scroll-based
- GitHub: [ehassaan/vue-zoomable](https://github.com/ehassaan/vue-zoomable) v1.2.8 — confirmed transform-based

### Secondary (MEDIUM confidence)
- [dhtmlxGantt 6.2 zoom and mouse wheel](https://dhtmlx.com/blog/dhtmlxgantt-6-2-minor-update-boosting-gantt-chart-performance-zooming-mouse-wheel-much/) — Gantt zoom UX conventions
- [Implementing a timeline with scrolling and zooming](https://thomas.preissler.me/blog/2022/01/10/implementing-a-timeline-with-scrolling-and-zooming-or-how-i-failed-at-elementary-school-math) — cursor-anchor formula corroboration
- [Asana Design: Designing Timeline](https://medium.com/asana-design/designing-timeline-lessons-learned-from-our-journey-beyond-gantt-charts-645e80177aaa) — zoom UX case study from production tool
- [Screen Studio: zoom shortcut](https://hub.screen.studio/p/shortcut-to-zoom-timeline-cmd-scroll-pinch-to-zoom-cmd) — trackpad pinch interaction pattern in shipping product
- modern-css.com: [CSS zoom vs transform: scale()](https://modern-css.com/scaling-elements-without-transform-hacks/) — layout footprint difference

### Tertiary (MEDIUM confidence, not independently verified)
- [AIMMS: Zoom and Scroll in a Gantt Chart](https://how-to.aimms.com/Articles/279/279-gantt-chart-scroll.html) — vendor how-to on Gantt scroll patterns

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
