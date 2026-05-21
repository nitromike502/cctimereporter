---
phase: quick-005
plan: 005
type: execute
wave: 1
---

# Plan 005: Working Time (merged) + Agent Time (strict)

## Context

A session's "agent activity" needs to be reported correctly when subagents and teammates run in parallel with the main agent. Two distinct numbers express different things, and both should be visible in SessionDetailPanel.

## Locked terminology

| Term | Definition | Computation |
|---|---|---|
| **Gantt time** (visual) | The shaded bar in the gantt — represents working time on the timeline. Idle gaps shorter than the threshold are filled in as part of the bar. | Driven by `idleGaps` derived from merged timestamps. |
| **Working Time** (number) | The numeric value of the gantt bar's shaded area. Threshold-padded union of activity across the main agent and all subagents (inline, background, teammates). | `computeWorkingTime(mergedTimestamps, thresholdMs)` |
| **Agent Time** | Total elapsed time during which any agent was actively producing output. No threshold padding. Strictly **≤ elapsed time**. | `sumIntervalUnion(turnIntervals across parent + teammates, clampedStart, clampedEnd)` where each turn contributes `[timestamp − durationMs, timestamp]`. |
| **Elapsed time** | Wall-clock span of the displayed session window (`clampedEnd − clampedStart`). | Unchanged. |

Key relationships:
- Gantt time ≡ Working Time (different views of the same number)
- Agent Time ≤ Elapsed Time (always)
- Agent Time may be ≤ or ≥ Working Time depending on data (turn durations vs. message-gap heuristic)

## Data: `turn_duration` messages

Claude Code emits `system / turn_duration` messages after every agent turn with `durationMs`. Each is a real, authoritative measurement of one turn's wall-clock duration. We persist `durationMs` so Agent Time can be computed from real intervals instead of a timestamp heuristic.

Coverage caveat: 70% of sessions in this DB have `turn_duration` rows; of those, only sessions whose source JSONLs still exist on disk get backfilled. Sessions without data show Agent Time as `—`.

## Changes

### Schema v11 (`src/db/schema.js`, `src/db/index.js`)
- Add `messages.duration_ms INTEGER`.
- Migration `MIGRATION_V10_TO_V11`, plumbed through all version branches.

### Importer (`src/importer/parser.js`, `src/importer/index.js`, `src/importer/db-writer.js`)
- Parser: capture `msg.durationMs` on `system/turn_duration` messages.
- index.js: include `duration_ms` in both the main message mapping and the Pattern A subagent loop.
- db-writer: add `duration_ms` to INSERT and `ON CONFLICT DO UPDATE`.
- Force re-import (`force: true`) on existing JSONLs to backfill.

### Service (`src/services/timeline.js`, `src/utils/timeline-utils.js`)
- Add `sumIntervalUnion(intervals, windowStart, windowEnd)` helper in `timeline-utils.js` — sorts by start, sweeps & merges overlapping intervals, sums.
- Add two prepared statements: `sessionTurnIntervalsStmt` (per-session turn rows) and `teamTurnIntervalsStmt` (teammate turn rows linked by project + time overlap).
- Rewrite `_querySessions()` per-session computation:
  - `workingTimeMs` = `computeWorkingTime(mergedTimestamps, thresholdMs)` (was parent-only — now merged)
  - `idleGaps` = `computeIdleGaps(mergedTimestamps, thresholdMs)` (gantt-visible)
  - `agentTimeMs` = `sumIntervalUnion(turnIntervals, clampedStart, clampedEnd)`, or `null` if no turn data
- Remove `agentWorkingTimeMs` (replaced by the new pair).

### UI (`src/client/components/SessionDetailPanel.vue`)
- Working Time row gets a clarifying tooltip but is otherwise unchanged.
- New Agent Time row directly below — shows formatted duration or `—` when null. Hidden in fork view.
- Drop the inline "/ X w/ teammates" badge (no longer needed; Agent Time is its own row).

## Trade-offs

- **Teammate linkage** remains heuristic (same project + overlapping range). Could over-attribute for two parents running teammates in the same project simultaneously.
- **Agent Time coverage** limited by source data on disk — sessions whose JSONLs have been deleted show `—`. This is honest; we don't fabricate.
- **Backwards data**: existing sessions get backfilled when their JSONLs still exist (~10% of total sessions in the current DB). New sessions get data automatically.

## Tasks

1. Schema v11 migration + DDL update
2. Importer: persist durationMs from turn_duration messages
3. Re-import (force) to backfill
4. Service: add sumIntervalUnion; rework workingTimeMs / agentTimeMs / idleGaps in `_querySessions`
5. UI: Working Time tooltip + new Agent Time row
6. Verify end-to-end via API + UI

## Files touched

- `src/db/schema.js`, `src/db/index.js`
- `src/importer/parser.js`, `src/importer/index.js`, `src/importer/db-writer.js`
- `src/utils/timeline-utils.js`
- `src/services/timeline.js`
- `src/client/components/SessionDetailPanel.vue`
