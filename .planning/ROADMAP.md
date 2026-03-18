# Roadmap: CC Time Reporter

## Milestones

- SHIPPED **v1.0 MVP** — Phases 1-6 (shipped 2026-03-01)
- SHIPPED **v0.2.0 UX and Insights** — Phases 7-11 (shipped 2026-03-04)
- SHIPPED **v0.3.0 Session Polish** — Phases 12-16 (shipped 2026-03-05)
- SHIPPED **v0.4.0 Session Intelligence** — Phases 17-18 (shipped 2026-03-08)
- SHIPPED **v0.5.0 Import Performance** — Ad-hoc (shipped 2026-03-12, no GSD phases)
- **v0.6.0 Session Splitting** — Phases 19-22 (in progress)

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

### v0.6.0 Session Splitting (Phases 19-22)

**Milestone Goal:** Sessions containing `/clear` commands are split into segments, each displayed as a separate Gantt bar with independent ticket, branch, and working time. Users see a clear picture of context switches within a working day.

#### Phase 19: Schema, Import, and API Contract

**Goal**: The database records slash commands found in session messages, existing data migrates automatically, and the segment-aware API response shape is defined so backend and frontend work can proceed in parallel.
**Depends on**: Phase 18 (v0.6.0 starting point)
**Requirements**: SCHM-01, SCHM-02, SCHM-03
**Success Criteria** (what must be TRUE):
  1. After upgrade, the messages table has a `command` column without any manual intervention
  2. The importer populates `command = 'clear'` for messages that contain a `/clear` user turn
  3. Other slash commands (e.g. `/rename`) are also stored in `command` when present in a user message
  4. Sessions imported before the upgrade have `command = NULL` on all messages until re-imported
  5. API contract for segment-aware timeline response is defined and documented (response shape, segment fields, ID format)

Plans:
- [ ] 19-01: Schema migration v6→v7, JSONL parser command detection, and API contract definition

#### Phase 20: Segment Derivation (backend)

**Goal**: The timeline API returns segment-aware session data — sessions with `/clear` boundaries produce multiple independent segments, each with their own ticket, branch, and working time.
**Depends on**: Phase 19
**Parallel with**: Phases 21, 22 (frontend phases code against API contract)
**Requirements**: SEGM-01, SEGM-02, SEGM-03, SEGM-04, SEGM-05
**Success Criteria** (what must be TRUE):
  1. A session with two `/clear` commands returns three segments from the timeline API
  2. Each segment's ticket reflects only the messages within that segment's boundaries
  3. Each segment's working time excludes the `/clear` message itself and idle gaps spanning /clear boundaries
  4. A session with no `/clear` messages returns as a single entry, identical to pre-v0.6.0 behavior
  5. Segment IDs use `session-id:N` format and existing PATCH/messages endpoints resolve them correctly

Plans:
- [ ] 20-01: Timeline route segment derivation with independent scoring and working time
- [ ] 20-02: Endpoint ID resolution for segment IDs (PATCH, messages routes)

#### Phase 21: Gantt Segments (frontend)

**Goal**: Segments from the same session appear as distinct Gantt bars in the correct project row, with a visual indicator that they belong to the same parent session.
**Depends on**: Phase 19 (API contract)
**Parallel with**: Phases 20, 22
**Requirements**: GANT-01, GANT-02, GANT-03
**Success Criteria** (what must be TRUE):
  1. A session with three segments renders three separate Gantt bars rather than one
  2. Each bar is labeled with the `session-id:N` suffix so segments are individually identifiable
  3. Bars from the same parent session have a shared visual grouping cue (e.g. connecting line, shared color band, or bracket)
  4. Segments from different sessions do not share grouping cues

Plans:
- [ ] 21-01: GanttBar and GanttRow segment rendering with grouping cue

#### Phase 22: Detail, Summary, and Notifications (frontend)

**Goal**: Clicking a segment bar shows that segment's specific data in the detail panel; day summary totals reflect per-segment working time; the messages modal labels context switches; and a one-time notification tells the user to re-import after upgrade.
**Depends on**: Phase 19 (API contract)
**Parallel with**: Phases 20, 21
**Requirements**: DETL-01, DETL-02, SUMM-01, MSGS-01, NOTF-01
**Success Criteria** (what must be TRUE):
  1. Clicking segment 2 of 3 shows that segment's ticket, branch, working time, and messages — not the full session's data
  2. The detail panel displays "segment 2 of 3" (or equivalent) when the selected bar belongs to a multi-segment session
  3. The day summary working time matches the sum of all segment working times for that day
  4. The messages modal shows `/clear` entries labeled "context switch" at the point they occurred
  5. On first load after schema migration, a notification informs the user that re-import is needed to see segments

Plans:
- [ ] 22-01: Detail panel segment view and day summary totals
- [ ] 22-02: Messages modal context switch label and re-import notification

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
| 19. Schema and Import | v0.6.0 | 0/1 | Not started | - |
| 20. Segment Derivation | v0.6.0 | 0/TBD | Not started | - |
| 21. Gantt Segments | v0.6.0 | 0/TBD | Not started | - |
| 22. Detail, Summary, and Notifications | v0.6.0 | 0/TBD | Not started | - |
