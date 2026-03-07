# Roadmap: CC Time Reporter

## Milestones

- SHIPPED **v1.0 MVP** — Phases 1-6 (shipped 2026-03-01)
- SHIPPED **v0.2.0 UX and Insights** — Phases 7-11 (shipped 2026-03-04)
- SHIPPED **v0.3.0 Session Polish** — Phases 12-16 (shipped 2026-03-05)
- **v0.4.0 Session Intelligence** — Phases 17-19 (in progress)

## Current Milestone: v0.4.0 Session Intelligence

**Goal:** Make sessions more identifiable and actionable — users can name sessions from the UI and get better automatic ticket detection.

### Phase 17: Session Editing

**Goal:** Users can edit session names and ticket IDs from the UI, and edits persist across re-imports
**Depends on:** Phase 16
**Requirements:** NAME-01, NAME-02, NAME-03, NAME-04, TICK-03
**Success Criteria** (what must be TRUE):
  1. User can click a session name in the detail panel, type a new name, and save it with Enter or blur
  2. User can click the ticket field in the detail panel and type a ticket ID to override the auto-detected primary ticket
  3. After running a full re-import, all user-set session names and ticket overrides are still present (not overwritten)
  4. A session with a user-set name shows that name on the Gantt bar and in the detail panel, regardless of ticket or branch data
  5. User can clear a custom name or ticket to revert to the automatic fallback
**Plans:** TBD

Plans:
- [ ] 17-01: TBD

### Phase 18: Ticket Detection Pipeline

**Goal:** Import automatically discovers tickets from additional sources in transcripts — git commits, session summaries, and MCP tool calls
**Depends on:** Phase 17 (upsert protection pattern must be in place before adding import complexity)
**Requirements:** TICK-01, TICK-02, TICK-05
**Success Criteria** (what must be TRUE):
  1. After re-import, sessions that only have ticket references in git commit messages (not in branch name or slash commands) show the correct ticket as primary
  2. After re-import, sessions that only have ticket references in their summary/title text show the correct ticket as primary
  3. After re-import, sessions containing MCP tool calls to Atlassian/Linear/GitHub that reference tickets show those tickets in scoring
  4. New detection sources do not produce false positives for common patterns already in the denylist (e.g., UTF-8, OPUS-4)
**Plans:** TBD

Plans:
- [ ] 18-01: TBD

### Phase 19: Ticket Links

**Goal:** Ticket IDs in the UI become clickable links to the user's external issue tracker
**Depends on:** Phase 17 (ticket display exists), Phase 18 (more tickets available to link)
**Requirements:** TICK-04
**Success Criteria** (what must be TRUE):
  1. User can configure a ticket link URL template (e.g., `https://jira.example.com/browse/{ticket}`)
  2. When a template is configured, all ticket IDs in the timeline UI are rendered as clickable links
  3. Template configuration persists across sessions (stored in localStorage or DB settings)
**Plans:** TBD

Plans:
- [ ] 19-01: TBD

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
| 17. Session Editing | v0.4.0 | 0/? | Not started | - |
| 18. Ticket Detection Pipeline | v0.4.0 | 0/? | Not started | - |
| 19. Ticket Links | v0.4.0 | 0/? | Not started | - |
