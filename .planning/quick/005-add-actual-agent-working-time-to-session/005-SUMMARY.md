# Quick Task 005 — Summary

**Status:** Shipped
**Scope grew** from "add a single metric" into a schema-migration-level change as the terminology was refined.

## What changed

Two distinct session-level metrics now reported in SessionDetailPanel:

- **Working Time** = threshold-padded union of activity across the main agent and all subagents (inline, background, teammates). Matches the filled-in gantt bar.
- **Agent Time** = strict union of per-turn activity intervals across the same set of agents. No threshold padding. Always ≤ elapsed time.

The gantt bar's filled segments now reflect merged (parent + teammates) activity instead of parent-only.

## Terminology lock

| Term | Meaning |
|---|---|
| Gantt time | Visual shaded bar on the gantt — same data as Working Time |
| Working Time | Numeric, gantt-matching: merged activity + threshold padding |
| Agent Time | Strict: union of real per-turn intervals, no padding |
| Elapsed | Wall-clock displayed window |

Invariants:
- Gantt time ≡ Working Time
- Agent Time ≤ Elapsed (always)
- Working Time ≤ Elapsed (typical, since threshold padding can't extend beyond the displayed window)

## Files modified

| File | Change |
|---|---|
| `src/db/schema.js` | SCHEMA_VERSION → 11; added `messages.duration_ms`; new `MIGRATION_V10_TO_V11` |
| `src/db/index.js` | Plumbed `migrateV10toV11` through all version branches; added v10 entry point |
| `src/importer/parser.js` | Capture `durationMs` on `system/turn_duration` messages |
| `src/importer/index.js` | Map `durationMs → duration_ms` in main + Pattern A subagent loops |
| `src/importer/db-writer.js` | Persist `duration_ms` (INSERT + ON CONFLICT) |
| `src/utils/timeline-utils.js` | New `sumIntervalUnion(intervals, windowStart, windowEnd)` helper |
| `src/services/timeline.js` | Added 2 prepared statements; reworked `_querySessions` to produce Working Time (merged+threshold), Agent Time (strict intervals), and merged-timestamp-driven `idleGaps` |
| `src/client/components/SessionDetailPanel.vue` | New Agent Time row; Working Time tooltip; removed inline "w/ teammates" badge |

## Verification

- Re-imported all available JSONLs (force) → `duration_ms` backfilled for 11 sessions whose source files still exist on disk (~10% of DB). Sessions whose JSONLs were deleted show Agent Time as `—`.
- Sample session `043345b3` (duke-energy-docs, 2026-05-09):
  - Working Time: 37.6 min
  - Agent Time: 20.8 min
  - Elapsed: 40.8 min
  - All invariants hold.
- Sample session `cc93923c` (cctimereporter, 2026-05-09):
  - Working Time: 50.6 min
  - Agent Time: 26.8 min
  - Elapsed: 50.6 min
- 8 sessions previously showing teammate-induced deltas now have Working Time visually matching gantt (idle gaps shrink when teammates filled them).
- API endpoint `/api/timeline?date=…` returns both `workingTimeMs` and `agentTimeMs` (null when no turn_duration data).

## Trade-offs / known limits

- **Teammate linkage** uses a heuristic (same project + overlapping time range). Could over-attribute when two parent sessions ran teammates in the same project concurrently. Acceptable for v1.
- **Agent Time coverage** depends on source JSONLs being present at re-import time. Older sessions whose JSONLs were deleted retain their pre-feature rows without `duration_ms`. We honestly display `—` rather than fabricate.
- **Backward-compat for callers** of `workingTimeMs`: the field's semantics changed from "parent-only" to "merged+threshold". The CLI/MCP report endpoints still reduce `workingTimeMs` for totals; they now reflect merged values. No double counting because team-member subagent sessions are still excluded from the displayed-sessions list.

## Tech debt logged

- Explicit parent↔team-subagent linkage (capture team relationships during import) would replace the heuristic.
- `agentTimeMs` could be exposed via the CLI/MCP report endpoints (currently UI-only).
- Coverage of Agent Time for older sessions can only improve as new sessions accumulate or if JSONLs are restored.
