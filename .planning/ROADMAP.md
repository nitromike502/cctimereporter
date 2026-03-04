# Roadmap: CC Time Reporter

## Milestones

- SHIPPED **v1.0 MVP** — Phases 1-6 (shipped 2026-03-01)
- IN PROGRESS **v0.2.0 UX and Insights** — Phases 7-11

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

### v0.2.0 UX and Insights (In Progress)

**Milestone Goal:** First-time users are welcomed and oriented; returning users see richer session context and a day summary that answers "how much did I actually work?"

- [x] **Phase 7: Rolling Import and Onboarding** — Fast, bounded import with a welcoming first-run experience (completed 2026-03-03)
- [x] **Phase 8: Session Context** — Sessions show AI-generated or prompt-derived summaries in the detail panel (completed 2026-03-04)
- [x] **Phase 9: Day Summary** — Below-Gantt panel breaks down working time by project, ticket, and branch (completed 2026-03-04)
- [x] **Phase 10: Theming and Tour** — Light/dark toggle and a first-visit guided tour complete the UX (completed 2026-03-04)
- [x] **Phase 11: Bug Fixes** — Fix session summaries, subagent filtering, day summary table, and ticket false positives (completed 2026-03-04)

## Phase Details

### Phase 7: Rolling Import and Onboarding

**Goal:** Import is fast by default and first-time users understand what to do

**Depends on:** Phase 6 (v1.0 complete)

**Requirements:** IMP-01, IMP-02, IMP-03, IMP-04

**Success Criteria** (what must be TRUE):
  1. Running import on a project with 90 days of transcripts only processes the last 30 days of files without prompting
  2. Running import a second time skips already-processed files instantly without re-reading them
  3. A user who has never imported sees a distinct welcome screen that explains the tool and has a clear call to action to import — not the same empty-date view returning users see
  4. During a first import, the UI shows progressive feedback (not a frozen spinner) so the user knows work is happening

**Plans:** 3 plans

Plans:
- [x] 07-01: Schema migration and import_log caching
- [x] 07-02: Rolling 30-day import window with peek-and-skip
- [x] 07-03: Welcome state detection and onboarding UI

### Phase 8: Session Context

**Goal:** Every session in the Gantt chart carries a human-readable summary that explains what was worked on

**Depends on:** Phase 7

**Requirements:** CTX-01, CTX-02, CTX-03

**Success Criteria** (what must be TRUE):
  1. Clicking a session bar for a project that has sessions-index.json shows the AI-generated summary in the SessionDetailPanel
  2. Clicking a session bar for a project without sessions-index.json shows the first user message from that session as the summary
  3. Sessions that have neither an AI summary nor a first message show a graceful fallback (no blank panel, no error)

**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md — Schema migration, session-index reader, parser firstPrompt, and import pipeline integration
- [x] 08-02-PLAN.md — Timeline API first_prompt field and SessionDetailPanel summary row

### Phase 9: Day Summary

**Goal:** Below the Gantt chart, users can see a breakdown of exactly how their working time was spent that day

**Depends on:** Phase 7

**Requirements:** SUM-01, SUM-02, SUM-03, SUM-04

**Success Criteria** (what must be TRUE):
  1. A total working time figure is visible below the Gantt chart for the selected day
  2. A per-project table shows each project worked on, its session count, and its working time — sorted by working time descending
  3. A per-ticket table shows each ticket touched that day with session count and working time, with unticket sessions grouped separately
  4. A per-branch table shows each branch worked on that day with session count and working time

**Plans:** 1 plan

Plans:
- [x] 09-01: DaySummary component with total and tabbed breakdowns

### Phase 10: Theming and Tour

**Goal:** The app respects the user's light/dark preference and new users are guided to key features on their first visit

**Depends on:** Phase 9

**Requirements:** UIX-01, UIX-02

**Success Criteria** (what must be TRUE):
  1. A toggle in the toolbar switches between light and dark mode and the preference persists across page reloads
  2. Opening the app with a fresh localStorage triggers a tour that highlights the date picker, import button, Gantt chart, and session detail panel in sequence
  3. The tour can be dismissed at any step and does not reappear on subsequent visits
  4. Light and dark modes both render all UI elements legibly with no missing color assignments

**Plans:** 2 plans

Plans:
- [x] 10-01: CSS custom property design tokens and light/dark toggle
- [x] 10-02: First-visit tour integration

### Phase 11: Bug Fixes

**Goal:** Fix data quality and UI issues discovered during v0.2.0 user testing

**Depends on:** Phase 10

**Requirements:** BUG-01 through BUG-05 (see `.planning/phases/11-bug-fixes/BUGS.md`)

**Success Criteria** (what must be TRUE):
  1. Clicking a session with no AI summary shows the first user message as the summary fallback
  2. Subagent sessions (e.g. `-tmp-pr-review-*`) do not appear as separate timeline rows; their working time counts toward the parent session
  3. Day Summary table columns are properly aligned in all three tabs
  4. Ticket and Branch tabs in Day Summary show the associated project name
  5. Known false-positive ticket patterns (CLAUDE-*, OPUS-*, VERSION-*) are filtered from ticket detection

**Plans:** 3 plans

Plans:
- [x] 11-01: Parser firstPrompt filter and worktree subagent detection
- [x] 11-02: DaySummary column alignment and project column
- [x] 11-03: Ticket false positive filtering

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
