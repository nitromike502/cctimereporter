# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day
**Current focus:** v0.6.0 Session Splitting — Phase 19: Schema and Import

## Current Position

Phase: 19 of 22 (Schema and Import)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-17 — Roadmap created for v0.6.0

Progress: [░░░░░░░░░░░░░░░░░░░░] 0% (v0.6.0: 0/4 phases complete)
Overall:  Phases 1-18 complete (v1.0 through v0.5.0 shipped)

## Performance Metrics

**v0.4.0 Velocity:**
- Total plans completed: 4
- Phases: 2 (17, 18)
- Timeline: 3 days (2026-03-06 → 2026-03-08)

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Key decisions affecting v0.6.0:
- /clear is the ONLY split signal (Claude Code resets session name on /clear as of 2026-03-15)
- "Import raw, derive at query time" — segments derived in timeline route, not at import
- Segment IDs use `session-id:N` suffix format
- INSERT OR IGNORE on messages means existing rows need re-import to get command column
- Overnight clipping happens before segment splitting (clip first, then split)
- /clear message itself excluded from both adjacent segments (no double-counting)

### Pending Todos

None.

### Blockers/Concerns

- Segment IDs (session-id:N) break existing PATCH /api/sessions/:id and GET /api/sessions/:id/messages endpoints — Phase 20 must include ID resolution before Phase 21 frontend work begins.

## Session Continuity

Last session: 2026-03-17
Stopped at: Roadmap created for v0.6.0 (Phases 19-22), ready to plan Phase 19
Resume file: None
