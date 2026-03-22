# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day
**Current focus:** v0.7.0 Fork Visualization — Phase 22: Schema and Import

## Current Position

Phase: 22 of 25 (Schema and Import)
Plan: 1 of TBD in current phase
Status: In progress
Last activity: 2026-03-22 — Completed 22-01-PLAN.md (schema v7 + fork_branch_id)

Progress: [█░░░░░░░░░░░░░░░░░░░] ~5% (v0.7.0: 1 plan complete)
Overall:  Phases 1-21 complete (v1.0 through v0.6.0 shipped)

## Performance Metrics

**v0.6.0 Velocity:**
- Total plans completed: 4
- Phases: 3 (19, 20, 21)
- Timeline: 1 day (2026-03-19)

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Fork data model (from research + 22-01 execution):
- `is_fork_branch` boolean exists on messages; `fork_branch_id` TEXT added in schema v7 (22-01 complete)
- Branch ID = first child UUID of secondary branch (stable, immutable UUID from JSONL)
- Primary branch messages have NULL fork_branch_id; only secondary branches get IDs
- Fork bars use overlay approach: positioned in lower half of existing row; no lane height changes needed
- `GanttChart.vue` requires no changes (overlay avoids the mirrored height-computation pitfall)
- Fork segments computed at API query time (follows "import raw, derive at query time" philosophy)
- Only real forks rendered (gated on `real_fork_count > 0`); progress forks excluded
- Working time policy for fork messages: must be decided and documented in Phase 23
- Existing messages get NULL fork_branch_id until re-imported (normal, expected)

### Pending Todos

None.

### Blockers/Concerns

- Working time policy: must decide whether `is_fork_branch=1` messages are included or excluded from `computeWorkingTime()` before Phase 23 ships. Decision must be documented as a code comment.
- Fork bar click events must route through `GanttChart.onBarSelect` drag-pan guard to avoid accidental selection during panning (Phase 25).

## Session Continuity

Last session: 2026-03-22T02:58:29Z
Stopped at: Completed 22-01-PLAN.md (schema v7 + fork_branch_id import pipeline)
Resume file: None
