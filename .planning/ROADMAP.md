# Roadmap: CC Time Reporter

## Milestones

- SHIPPED **v1.0 MVP** — Phases 1-6 (shipped 2026-03-01)
- SHIPPED **v0.2.0 UX and Insights** — Phases 7-11 (shipped 2026-03-04)
- SHIPPED **v0.3.0 Session Polish** — Phases 12-16 (shipped 2026-03-05)
- SHIPPED **v0.4.0 Session Intelligence** — Phases 17-18 (shipped 2026-03-08)
- SHIPPED **v0.5.0 Import Performance** — Ad-hoc (shipped 2026-03-12, no GSD phases)
- **v0.6.0 Gantt Chart Zoom** — Phases 19-21 (in progress)

---

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-01</summary>

- [x] Phase 1: Foundation (1/1 plans) — completed 2026-02-25
- [x] Phase 2: Import Pipeline (3/3 plans) — completed 2026-02-26
- [x] Phase 3: Server and CLI (2/2 plans) — completed 2026-02-26
- [x] Phase 4: Component Library (3/3 plans) — completed 2026-02-27
- [x] Phase 5: Timeline UI (3/3 plans) — completed 2026-02-28
- [x] Phase 6: Timeline Polish (2/2 plans) — completed 2026-02-28

See: `.planning/milestones/v1-ROADMAP.md` for full details.

</details>

<details>
<summary>v0.2.0 UX and Insights (Phases 7-11) — SHIPPED 2026-03-04</summary>

- [x] Phase 7: Rolling Import and Onboarding (3/3 plans) — completed 2026-03-03
- [x] Phase 8: Session Context (2/2 plans) — completed 2026-03-04
- [x] Phase 9: Day Summary (1/1 plans) — completed 2026-03-04
- [x] Phase 10: Theming and Tour (2/2 plans) — completed 2026-03-04
- [x] Phase 11: Bug Fixes (3/3 plans) — completed 2026-03-04

See: `.planning/milestones/v0.2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>v0.3.0 Session Polish (Phases 12-16) — SHIPPED 2026-03-05</summary>

- [x] Phase 12: Tour Enhancements (1/1 plans) — completed 2026-03-04
- [x] Phase 13: Summary Parser (1/1 plans) — completed 2026-03-04
- [x] Phase 14: Session Message Modal (1/1 plans) — completed 2026-03-04
- [x] Phase 15: Session Naming (1/1 plans) — completed 2026-03-05
- [x] Phase 16: Import Progress Indicator (2/2 plans) — completed 2026-03-05

</details>

<details>
<summary>v0.4.0 Session Intelligence (Phases 17-18) — SHIPPED 2026-03-08</summary>

- [x] Phase 17: Session Editing (2/2 plans) — completed 2026-03-07
- [x] Phase 18: Ticket Detection Pipeline (2/2 plans) — completed 2026-03-07

See: `.planning/milestones/v0.4.0-ROADMAP.md` for full details.

</details>

### v0.6.0 Gantt Chart Zoom (Phases 19-21)

**Milestone Goal:** Users can zoom into the Gantt timeline to inspect short sessions and focus on specific time ranges, with scroll-wheel and button controls. Zoom operates 1x–4x with cursor anchoring, resets on date navigation, and does not regress any existing interactions.

#### Phase 19: Layout Restructure

**Goal**: The chart container correctly separates the pinned label column from the scrollable canvas area, enabling horizontal scroll without breaking time axis alignment.
**Depends on**: Phase 18 (v0.6.0 starting point)
**Requirements**: LYOT-01, LYOT-02, LYOT-03
**Success Criteria** (what must be TRUE):
  1. Project name labels stay fixed on the left while the timeline canvas scrolls horizontally at any zoom level
  2. Time axis tick labels remain aligned with session bars at all horizontal scroll positions
  3. The chart at 1x zoom is visually indistinguishable from the pre-refactor layout (no regression)
  4. The horizontal scrollbar appears inside the chart area and does not affect the pinned label column

Plans:
- [ ] 19-01: GanttChart layout restructure — pinned labels column, scrollable canvas, remove overflow:hidden

#### Phase 20: Core Zoom Mechanic

**Goal**: Users can zoom the Gantt chart from 1x to 4x using the scroll wheel or +/- buttons, with the content under the cursor staying anchored during wheel zoom, and zoom resetting to 1x on date navigation.
**Depends on**: Phase 19 (scrollable canvas structure required)
**Requirements**: ZOOM-01, ZOOM-02, ZOOM-03, ZOOM-04, ZOOM-05, INTR-01, INTR-02
**Success Criteria** (what must be TRUE):
  1. Scrolling the wheel over the chart zooms in or out without any modifier key; the content under the cursor stays visually anchored
  2. +/- buttons in the toolbar change zoom level in discrete steps within the 1x–4x range
  3. Navigating to a different date resets zoom to 1x
  4. Clicking a session bar after zooming and scrolling opens the correct session's detail panel
  5. The session detail panel, messages modal, and edit modal open and function normally at any zoom level

Plans:
- [ ] 20-01: Zoom state in TimelinePage, zoomLevel prop, canvas width binding, wheel handler with cursor-anchor math
- [ ] 20-02: Toolbar +/- zoom buttons, zoom reset on date navigation, bar click guard

#### Phase 21: Zoom Polish

**Goal**: The zoom experience is refined with a level indicator, smooth animation, and adaptive time axis tick density that remains readable at high zoom.
**Depends on**: Phase 20 (zoom mechanic must be correct before adding polish)
**Requirements**: ZPOL-01, ZPOL-02, ZPOL-03
**Success Criteria** (what must be TRUE):
  1. The current zoom level is displayed in the toolbar (e.g., "2.5x") and updates as zoom changes
  2. Zooming in or out produces a smooth visual transition rather than a snap
  3. Time axis tick spacing increases at higher zoom levels so labels remain legible and non-overlapping (e.g., 15-minute intervals at 4x)

Plans:
- [ ] 21-01: Zoom indicator, CSS transition on canvas width, adaptive tick density

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 1/1 | Complete | 2026-02-25 |
| 2. Import Pipeline | v1.0 | 3/3 | Complete | 2026-02-26 |
| 3. Server and CLI | v1.0 | 2/2 | Complete | 2026-02-26 |
| 4. Component Library | v1.0 | 3/3 | Complete | 2026-02-27 |
| 5. Timeline UI | v1.0 | 3/3 | Complete | 2026-02-28 |
| 6. Timeline Polish | v1.0 | 2/2 | Complete | 2026-02-28 |
| 7. Rolling Import and Onboarding | v0.2.0 | 3/3 | Complete | 2026-03-03 |
| 8. Session Context | v0.2.0 | 2/2 | Complete | 2026-03-04 |
| 9. Day Summary | v0.2.0 | 1/1 | Complete | 2026-03-04 |
| 10. Theming and Tour | v0.2.0 | 2/2 | Complete | 2026-03-04 |
| 11. Bug Fixes | v0.2.0 | 3/3 | Complete | 2026-03-04 |
| 12. Tour Enhancements | v0.3.0 | 1/1 | Complete | 2026-03-04 |
| 13. Summary Parser | v0.3.0 | 1/1 | Complete | 2026-03-04 |
| 14. Session Message Modal | v0.3.0 | 1/1 | Complete | 2026-03-04 |
| 15. Session Naming | v0.3.0 | 1/1 | Complete | 2026-03-05 |
| 16. Import Progress Indicator | v0.3.0 | 2/2 | Complete | 2026-03-05 |
| 17. Session Editing | v0.4.0 | 2/2 | Complete | 2026-03-07 |
| 18. Ticket Detection Pipeline | v0.4.0 | 2/2 | Complete | 2026-03-07 |
| 19. Layout Restructure | v0.6.0 | 0/1 | Not started | - |
| 20. Core Zoom Mechanic | v0.6.0 | 0/2 | Not started | - |
| 21. Zoom Polish | v0.6.0 | 0/1 | Not started | - |
