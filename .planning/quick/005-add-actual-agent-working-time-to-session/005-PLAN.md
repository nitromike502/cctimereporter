---
phase: quick-005
plan: 005
type: execute
wave: 1
---

# Plan 005: Session Agent Working Time

## Context

Display, in SessionDetailPanel, how much **actual agent time** a session consumed for the selected day. "Agent time" = union of active intervals across the parent session and all subagents that worked on its behalf (inline foreground sidechains, background subagents, team-member subagents), counted **once** when they overlap.

Day-scoped (clamped to selected day) so the value reconciles with the rest of the timeline UI.

## What the data tells us

| Subagent type | Already in parent's `allTimestamps`? |
|---|---|
| Inline foreground sidechain (Task tool) | Yes — same JSONL file |
| Background subagent (`subagents/agent-*.jsonl`) | Yes — importer merges into parent session_id at `src/importer/index.js:636` |
| Team-member subagent (separate session, `is_subagent=1`, `team_name` set) | **No** — filtered out at `src/services/timeline.js:105` |

Explicit parent↔team-subagent linkage is unreliable in the DB: 0 of 144 sessions have `has_subagents=1` set; parents typically don't carry `team_name`. We use a heuristic: same `project_id` + overlapping message-time-range.

## Approach

Service-layer change only. No schema migration, no importer change.

Reuse `computeWorkingTime()` from `src/utils/timeline-utils.js` — when given a merged, sorted timestamp array across parent + linked team subagents, it naturally yields the union of active intervals (close timestamps = no gap = counted).

## Changes

### 1. `src/services/timeline.js`

In `createTimelineService()`:

- Add a prepared statement that fetches team-subagent message timestamps overlapping a parent session, same project:

```sql
SELECT m.timestamp
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
WHERE s.project_id = ?
  AND s.is_subagent = 1
  AND s.first_message_at <= ?
  AND s.last_message_at  >= ?
  AND m.type IN ('user', 'assistant')
  AND m.timestamp IS NOT NULL
```

In `_querySessions()`, per session:

- After loading `allTimestamps` (line 209), query team-subagent timestamps using parent's `project_id`, `first_message_at`, `last_message_at`.
- Merge into a new sorted array, day-clamp.
- Compute `agentWorkingTimeMs = computeWorkingTime(clampedMerged, thresholdMs)`.
- Add `agentWorkingTimeMs` to the session object.
- Keep existing `workingTimeMs` (parent-only).

### 2. `src/client/components/SessionDetailPanel.vue`

- Compute `agentWorkingTimeLabel` formatted via the existing duration formatter used for `workingTimeMs`.
- Display below the existing Working Time row as a new field: **"Agent Working Time"** with tooltip noting it includes subagents.
- Fork view: hide (fork view is fork-scoped).

### 3. `src/server/routes/timeline.js`

No change if it passes through what `_querySessions` returns. Verify the field flows through.

## Trade-offs

- **Heuristic linkage** may over-attribute when two parent sessions ran teammates in the same project simultaneously. Acceptable for v1.
- **`turn_duration` data unused** — 70% of sessions have rows but `durationMs` value not persisted (schema gap). Deferred.
- **Day-clamping**: team-subagent messages on a different day than parent's selected day don't contribute. Correct per "day-scoped" decision.

## Tasks

1. Service: add team-subagent query + merge logic in `src/services/timeline.js._querySessions()`. Output `agentWorkingTimeMs`.
2. UI: display `agentWorkingTimeMs` in `src/client/components/SessionDetailPanel.vue`.
3. Smoke test: session with `team_name='v030-session-polish'` (2026-03-05) — expect agentWorkingTimeMs > workingTimeMs.

## Files to modify

- `src/services/timeline.js`
- `src/client/components/SessionDetailPanel.vue`
