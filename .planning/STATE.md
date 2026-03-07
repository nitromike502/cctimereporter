# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-07)

**Core value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day
**Current focus:** v0.4.0 Session Intelligence — Phase 18 complete, ready for Phase 19

## Current Position

Phase: 18 of 19 (Ticket Detection Pipeline)
Plan: 2 of 2 in phase 18
Status: Phase complete
Last activity: 2026-03-07 — Completed 18-02-PLAN.md

Progress: [████████████████████] 100% Phase 18 (2/2 plans)
Overall:  [████████████████░░░░] 80% v0.4.0 (4/5 plans)

## Performance Metrics

**v0.3.0 Velocity:**
- Total plans completed: 4
- Phases: 4 (12-15)

**v0.4.0 Velocity:**
- Total plans completed: 4
- Phases complete: 2 (17, 18)

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.
All v0.2.0 decisions archived in .planning/milestones/v0.2.0-ROADMAP.md.

v0.4.0 decisions:
- Query-time worktree grouping (not import-time) — keeps raw data clean
- Import raw, derive at query time — user preference for future architecture
- tool_use_count identified as dead data (computed but never used)
- New user_label column separate from import-managed custom_title — prevents import clobber
- INSERT ON CONFLICT DO UPDATE with COALESCE replaces INSERT OR REPLACE — protects user edits
- User ticket override stored on sessions table, not tickets table — tickets table gets wiped on re-import
- ON CONFLICT DO UPDATE omits user_label/user_ticket from SET clause (not COALESCE) — simpler, same effect
- Empty strings normalized to null in PATCH endpoint for clean storage
- nameReadOnly when Claude Code named session AND user hasn't set custom name
- Optimistic update mutates timelineData in-place to avoid full refetch and scroll reset
- Git commit scoring: 100pt base + 10pt additional (same weight as branch detection)
- MCP server prefix matching uses startsWith for flexibility (github matches github_issues, etc.)
- Intentional parallel parsing in detection vs scoring — detection populates tickets table, scoring determines primary_ticket
- Summary/title scoring: 25pts flat (no accumulation) — low weight since summary is generated text
- scoreTickets() relocated after session-index merge for correct data flow

### Roadmap Evolution

- v1.0 shipped 2026-03-01 (Phases 1-6)
- v0.2.0 shipped 2026-03-04 (Phases 7-11)
- v0.3.0 shipped 2026-03-05 (Phases 12-16)
- v0.4.0 roadmap created 2026-03-07 (Phases 17-19)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-07
Stopped at: Completed 18-02-PLAN.md (summary/title ticket detection — Phase 18 complete)
Resume file: None
