# Roadmap: CC Time Reporter

## Milestones

- SHIPPED **v1.0 MVP** — Phases 1-6 (shipped 2026-03-01)
- SHIPPED **v0.2.0 UX and Insights** — Phases 7-11 (shipped 2026-03-04)
- SHIPPED **v0.3.0 Session Polish** — Phases 12-16 (shipped 2026-03-05)
- SHIPPED **v0.4.0 Session Intelligence** — Phases 17-18 (shipped 2026-03-08)
- SHIPPED **v0.5.0 Import Performance** — Ad-hoc (shipped 2026-03-12, no GSD phases)
- SHIPPED **v0.6.0 Gantt Chart Zoom** — Phases 19-21 (shipped 2026-03-19)
- IN PROGRESS **v0.7.0 Fork Visualization** — Phases 22-25

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

<details>
<summary>v0.6.0 Gantt Chart Zoom (Phases 19-21) — SHIPPED 2026-03-19</summary>

- [x] Phase 19: Layout Restructure (1/1 plans) — completed 2026-03-19
- [x] Phase 20: Core Zoom Mechanic (2/2 plans) — completed 2026-03-19
- [x] Phase 21: Zoom Polish (1/1 plans) — completed 2026-03-19

See: `.planning/milestones/v0.6.0-ROADMAP.md` for full details.

</details>

---

### v0.7.0 Fork Visualization (In Progress)

**Milestone Goal:** Display fork branches as 50%-height sub-bars beneath their parent session bar in the Gantt chart, each starting at the fork point timestamp. Requires a schema migration to assign stable per-branch IDs to fork messages, a new API shape for fork segments, a new frontend component, and click-through interaction to the detail panel.

- [ ] **Phase 22: Schema and Import** — Migrate schema to v7 with fork_branch_id; populate at import
- [ ] **Phase 23: Backend Fork Segments** — Timeline API returns fork segment data per session
- [ ] **Phase 24: Gantt Fork Bar Rendering** — GanttForkBar.vue component integrated into swimlanes
- [ ] **Phase 25: Interaction and Detail Panel** — Fork bar clicks and show/hide toggle with detail view

#### Phase 22: Schema and Import
**Goal**: Every fork-branch message in the database has a stable, unique fork branch ID that identifies which distinct branch it belongs to
**Depends on**: Nothing (schema first)
**Requirements**: SCHM-01, SCHM-02, SCHM-03
**Success Criteria** (what must be TRUE):
  1. The messages table has a `fork_branch_id` column after a fresh install or auto-migration from schema v6
  2. Re-importing existing sessions populates `fork_branch_id` on all fork-branch messages without losing user edits (user_label, user_ticket)
  3. Sessions with multiple distinct fork branches have different `fork_branch_id` values per branch (not all the same ID)
  4. Sessions without forks have NULL `fork_branch_id` on all their messages
**Plans**: TBD

Plans:
- [ ] 22-01: Schema v7 migration and fork-detector assignment

#### Phase 23: Backend Fork Segments
**Goal**: The timeline API returns computed fork segment data for sessions that have real forks, usable directly by frontend components without further processing
**Depends on**: Phase 22
**Requirements**: FSEG-01, FSEG-02, FSEG-03
**Success Criteria** (what must be TRUE):
  1. `GET /api/timeline` response includes a `forkSegments` array on each session object (empty array for sessions with no real forks)
  2. Each fork segment object contains start time, end time, and fork branch ID
  3. Sessions with `real_fork_count = 0` skip the fork query entirely (no DB overhead for the common case)
  4. Fork segment timestamps are clamped to day boundaries (consistent with idle gap clamping)
**Plans**: TBD

Plans:
- [ ] 23-01: computeForkSegments helper and timeline route integration

#### Phase 24: Gantt Fork Bar Rendering
**Goal**: Fork branches are visible as 50%-height sub-bars beneath their parent session bar in the Gantt chart, without affecting the height or alignment of any existing row
**Depends on**: Phase 23
**Requirements**: GANT-01, GANT-02, GANT-03, GANT-04
**Success Criteria** (what must be TRUE):
  1. Sessions with real forks show one or more sub-bars rendered at 50% the height of the main bar, positioned in the lower half of the same row
  2. Each fork sub-bar's left edge aligns with the fork's start timestamp on the timeline axis (consistent with main bar positioning)
  3. Fork sub-bars are visually distinct from the main bar — lighter color or reduced opacity — so the hierarchy is immediately apparent
  4. Sessions without forks render identically to before this phase; no layout shifts or empty space appears
  5. The GanttForkBar component is listed on the /components preview page
**Plans**: TBD

Plans:
- [ ] 24-01: GanttForkBar.vue component and GanttSwimlane integration

#### Phase 25: Interaction and Detail Panel
**Goal**: Users can click fork bars to inspect fork details and toggle fork sub-row visibility, with their preference persisted across sessions
**Depends on**: Phase 24
**Requirements**: INTR-01, INTR-02, DETL-01
**Success Criteria** (what must be TRUE):
  1. Clicking a fork sub-bar opens the detail panel; the panel shows the fork branch ID, time range (start and end), and message count for that branch
  2. Panning the chart at zoom > 1x does not accidentally trigger fork bar selection (drag guard respected)
  3. A show/hide toggle controls fork sub-row visibility; toggling hides all fork bars without affecting main bars or row heights
  4. The show/hide preference persists across page reloads (localStorage)
**Plans**: TBD

Plans:
- [ ] 25-01: Fork bar click routing and detail panel fork view
- [ ] 25-02: Show/hide toggle with localStorage persistence

---

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
| 19. Layout Restructure | v0.6.0 | 1/1 | Complete | 2026-03-19 |
| 20. Core Zoom Mechanic | v0.6.0 | 2/2 | Complete | 2026-03-19 |
| 21. Zoom Polish | v0.6.0 | 1/1 | Complete | 2026-03-19 |
| 22. Schema and Import | v0.7.0 | 0/TBD | Not started | - |
| 23. Backend Fork Segments | v0.7.0 | 0/TBD | Not started | - |
| 24. Gantt Fork Bar Rendering | v0.7.0 | 0/TBD | Not started | - |
| 25. Interaction and Detail Panel | v0.7.0 | 0/TBD | Not started | - |
