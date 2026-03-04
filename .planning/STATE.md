# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day
**Current focus:** v0.2.0 — Phase 11 (Bug Fixes)

## Current Position

Phase: 11 (Bug Fixes) — in progress
Plan: 3/? in phase 11
Status: In progress
Last activity: 2026-03-04 — Completed 11-03-PLAN.md (ticket false positive filtering)

Progress: [████████████████████] v0.2.0 complete + Phase 11 in progress

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (v0.2.0)
- Average duration: 1.9 min
- Total execution time: 15 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 7 — Rolling Import and Onboarding | 3/3 | 6 min | 2 min |
| 8 — Session Context | 2/2 | 6 min | 3 min |
| 9 — Day Summary | 1/1 | 2 min | 2 min |
| 10 — Theming and Tour | 2/2 | 1 min | 0.5 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- Roadmap: 4 phases (7-10), grouped by coupling — import/onboarding, session context, day summary, theming+tour
- 07-01: getImportedFileInfo includes 'skipped_old' status for instant re-skip on subsequent import runs
- 07-01: peekFirstTimestamp is synchronous — appropriate as a skip-gate, not hot async code
- 07-01: updateImportLog params default to null for full backward compatibility
- 07-02: maxAgeDays defaults to 30 in importAll(); route passes undefined when not in body (importAll uses default)
- 07-02: Peek-and-skip records firstTs as both first/last_message_at — sufficient for re-skip
- 07-02: totalSessions uses COUNT(*) prepared at registration time, same pattern as sessionStmt/messageStmt
- 07-03: Welcome v-else-if ordered before empty-date v-else-if (totalSessions===0 implies projects.length===0)
- 07-03: Empty-date state has no AppButton — returning users need nav hint, not import CTA
- 08-01: sessions-index.json is INSIDE transcriptDir (not parent dir) — RESEARCH.md corrected old assumption
- 08-01: firstPrompt truncated to 200 chars in JSONL extraction (matches sessions-index.json observed range)
- 08-01: customTitle from sessions-index.json also merged; column already existed, no migration needed
- 08-01: "No prompt" sentinel filtered at both reader and merge point (defense in depth)
- 08-02: Summary row placed first in detail grid — highest-value context leads
- 08-02: summaryText returns '' (not em-dash) when session is null — avoids stray dash in no-selection state
- 09-01: DaySummary receives timelineData.projects (unfiltered), not visibleProjects — day totals accurate regardless of Gantt filter state
- 09-01: Null ticket/branch rows sorted to bottom, displayed as (untracked)
- 09-01: groupBy Map-based helper shared between ticketRows and branchRows computeds
- 10-01: Dark mode uses [data-theme='dark'] on documentElement, not @media query — enables user toggle
- 10-01: useTheme singleton at module level — all consumers share identical reactive ref
- 10-01: FOWT prevention uses var (not const/let) in inline IIFE for broadest compat
- 10-01: localStorage key is 'cctimereporter:theme' — namespaced to avoid collisions
- 10-01: AppDatePicker drops matchMedia entirely — delegates to useTheme composable
- 10-02: Tour only fires when data.projects.length > 0 — prevents tour on welcome/empty-date states
- 10-02: onDestroyed callback marks tour seen after full completion or early dismiss
- 10-02: driver-overrides.css imported after driver.css — guarantees override specificity
- 10-02: TOUR_KEY = 'cctimereporter:tourSeen' follows existing namespaced localStorage key pattern
- 10-02: nextTick() await before drive() ensures Gantt chart is rendered before driver.js queries selectors
- 11-01: SYNTHETIC_MSG_RE placed at module level in parser.js — regex guard is single-line addition to firstPrompt capture block
- 11-01: isWorktreeProject computed in importAll() where project object is available, passed via options to importFile()
- 11-01: isTeamSubagent rename clarifies Pattern B vs Pattern C subagent detection semantics
- 11-02: width: 1% + white-space: nowrap is the CSS shrink-to-fit table column trick — name column gets all remaining space
- 11-02: projectDisplayName tagged at allSessions flatMap — single source of truth, no duplication in each computed
- 11-02: projects pre-computed as sorted comma-joined string in row object — simple template, deterministic display
- 11-03: TICKET_PATTERN upgraded to /\b[A-Z]{2,8}-\d{1,6}\b/gi — word boundaries + 6-digit cap
- 11-03: STORY, BUG, TASK, EPIC deliberately NOT in denylist (legitimate ticket prefixes)
- 11-03: MIN_TICKET_SCORE = 15 — single mention (10 pts) fails, two mentions (20 pts) or branch match (110+ pts) passes

### Roadmap Evolution

- Phase 11 added: Bug fixes for session summaries, subagent filtering, day summary table, and ticket false positives

### Pending Todos

Execute remaining Phase 11 bug fix plans.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-04T21:51:07Z
Stopped at: Completed 11-03-PLAN.md (ticket false positive filtering)
Resume file: None
