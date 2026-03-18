# Feature Landscape: Session Splitting at /clear and /rename Boundaries

**Domain:** Developer time-tracking CLI with Gantt-style web UI
**Researched:** 2026-03-15
**Confidence:** HIGH (based on direct codebase analysis; no external sources needed for this feature-scoped research)

---

## Context: What Session Splitting Means Here

A "session" is a single `.jsonl` file under `~/.claude/projects/`. One JSONL file can span multiple logical work contexts if the user hit `/clear` (wipes context, new task begins) or `/rename` (signals a deliberate mid-session context switch). Currently the entire file is one Gantt bar with one ticket, one branch, and aggregated working time. Splitting means deriving virtual sub-units called **segments** from boundary markers stored in the messages table, at query time, without changing the import model.

The splitting rules are already decided:
- `/clear` always creates a segment boundary
- `/rename` creates a boundary only when mid-segment (not within first 3 user messages of segment, not when immediately followed by `/clear` within 3 user messages)
- Segments are identified as `session-id:N` (1-based index)
- Each segment gets independent ticket scoring, branch detection, and working time
- Configurable coalescing threshold (default 3 user messages) via CLI arg

---

## Table Stakes

Features that must exist for session splitting to be useful. Without these, the feature is incomplete or broken.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Segment boundary detection query** | Core of the feature. Must derive segment start/end message UUIDs from `/clear` and `/rename` markers in messages table. | Medium | `command` column on messages (must exist first) |
| **`command` column on messages** | Stores slash command name (e.g., `clear`, `rename`) on the triggering user message. General-purpose, not split-specific. Required for boundary detection at query time. | Low (schema + parser change) | DB migration to v7 |
| **Per-segment ticket scoring** | Each segment scored independently using existing `scoreTickets()` logic over its message slice. Without this, splitting adds no ticket intelligence value. | Medium | Segment boundary detection |
| **Per-segment branch detection** | Each segment gets its own working branch derived from `gitBranch` on messages within the segment. | Low | Segment boundary detection |
| **Per-segment working time** | `computeWorkingTime()` runs over each segment's timestamps independently. Day summary totals must aggregate per-segment, not per-session. | Low | Segment boundary detection |
| **Segment Gantt bars** | Each segment rendered as a distinct bar in the same project swimlane. Session ID displayed as `abc123:1`, `abc123:2`, etc. Existing GanttBar and GanttSwimlane work without modification if API returns segments as session-shaped objects. | Low (if API shapes data correctly) | Per-segment API response shape |
| **Segment in detail panel** | SessionDetailPanel shows segment-level ticket, branch, working time, and a segment indicator (e.g. "segment 2 of 3"). User can tell they're viewing a segment, not a full session. | Low | API response shape |
| **Sessions without boundaries unchanged** | Sessions with no `/clear` or `/rename` markers must behave identically to today. Zero regressions for the common case. | Low (gated by boundary detection result being empty) | Boundary detection |
| **Day summary uses segment working time** | DaySummary.vue aggregates workingTimeMs across all sessions. If segments are returned as session-shaped objects in the API response, existing aggregation logic works without change. Ticket and branch breakdown also naturally use per-segment values. | Low (if API shapes correctly) | Per-segment API response shape |

---

## Differentiators

Features that make splitting genuinely useful rather than merely correct. Not required for the feature to work, but raise its value significantly.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Segment label from /rename title** | When `/rename` created the boundary, use the rename title as the segment's display label (like `customTitle` is used for whole sessions). Gives free, user-authored segment names for renamed context switches. | Low | `custom-title` entries in JSONL already parsed; need to correlate with segment start |
| **Visual split indicator on bar** | A thin divider line at each segment boundary within a parent bar (when hovering or always), so users can see where context switches occurred within long sessions that would otherwise span the same time slot. Alternative: just show separate bars with a visual grouping cue. | Medium | Requires GanttBar changes; may conflict with idle-gap rendering |
| **Segment count badge on original session** | If a user navigates to a day where a long session lives, a subtle badge ("3 segments") gives orientation before drilling in. Low effort. | Low | Frontend only |
| **Configurable threshold via existing UI** | The coalescing threshold (currently CLI only) exposed in the toolbar/settings alongside the existing idle threshold control. | Low | Needs a config endpoint or localStorage; consistent with existing pattern |
| **`/clear` and `/rename` shown in messages modal** | SessionMessagesModal already shows first messages. Showing slash command messages with a "context switch" label would give users a way to confirm where splits occurred. | Low | `command` column makes this free |

---

## Anti-Features

Things to deliberately NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Persisting segments to the database** | Segments are derived at query time from boundary markers. Persisting them would duplicate data, require re-import on rule changes, and create a separate sync problem. The entire point of the query-time approach is avoiding this. | Derive at query time from `command` column markers |
| **User-editable per-segment ticket or label** | PATCH /api/sessions/:id exists for whole-session edits. Extending it to segments requires a new key scheme and UI complexity. Segments can inherit session-level overrides or be auto-scored. | Defer to a later milestone; whole-session `user_ticket` and `user_label` still apply as fallbacks |
| **Segment splitting in the import pipeline** | Import already handles fork detection, subagent classification, and branch detection. Adding splitting logic there couples boundary rules to import, making rule changes require re-import. | Keep splitting entirely server-side at query time |
| **Retroactive re-import to populate command column** | The `command` column will be NULL for messages imported before this milestone. A forced re-import is the correct fix, not a migration that tries to reconstruct slash commands from raw JSONL in-place. | Document that re-import is needed; let incremental import (already built) handle it naturally |
| **Splitting at every context change (branch switches, cwd changes)** | Over-splitting produces noise. `/clear` and `/rename` are explicit user signals. Branch or cwd changes mid-session are common within a single task and should not split. | Stick to explicit slash command boundaries |
| **Visual overlap row management changes for segments** | GanttSwimlane already handles overlapping bars with a greedy sub-row algorithm. Segments from the same session will be sequential (non-overlapping) so they fit in the same row naturally. No algorithm changes needed. | Trust the existing layout algorithm |
| **Segment-level fork detection** | Fork detection runs over the full JSONL parentUuid tree. Applying it per-segment is complex and adds little value — forks within a segment are uncommon. | Use session-level fork metadata as-is; display it on the first segment or suppress it |

---

## Feature Dependencies

```
DB schema v7 (add command column to messages)
  └── Parser update (extract slash command name into command field)
        └── Segment boundary detection function (server-side, query time)
              ├── Per-segment ticket scoring
              ├── Per-segment branch detection
              ├── Per-segment working time
              └── API: timeline route returns segments as session-shaped objects
                    ├── GanttBar renders segments (sessionId: "abc:1")
                    ├── SessionDetailPanel shows segment indicator
                    └── DaySummary aggregates segment working time (no change needed)
```

Segment label from /rename title is parallel work that can be done alongside boundary detection — it uses the already-parsed `customTitle` / `agent-name` entries from the JSONL.

---

## MVP Recommendation

For this milestone, prioritize:

1. **`command` column** — DB migration v7, parser extracts `clear` / `rename` into command field. Foundation for everything.
2. **Segment boundary detection** — server-side function that takes a session's messages and returns segment ranges. Implement the coalescing rules: /clear always splits; /rename splits when mid-segment by the configurable threshold.
3. **Per-segment data** — ticket scoring, branch detection, working time per segment. Reuse existing `scoreTickets()`, `determineWorkingBranch()`, `computeWorkingTime()` over message slices.
4. **API response shape** — timeline route returns segments as session-shaped objects with `sessionId: "uuid:N"`, `segmentIndex`, `segmentTotal`. GanttBar and DaySummary need no changes if the shape is right.
5. **Detail panel segment indicator** — show "segment 2 of 3" in SessionDetailPanel. Low effort, high orientation value.

Defer to post-MVP:
- **Visual split indicator on bar** — adds complexity to GanttBar's segment rendering, which already handles idle gaps. Do after core splitting works.
- **Threshold in UI** — CLI arg is sufficient for v0.6.0. UI config can follow.
- **Segment-level user editing** — full feature, separate milestone concern.

---

## Existing Code the Feature Touches

| Layer | File | Change Type |
|-------|------|-------------|
| Schema | `src/db/schema.js` | Add v7 migration: `ALTER TABLE messages ADD COLUMN command TEXT` |
| Parser | `src/importer/parser.js` | Extract slash command name from user messages with command XML into `command` field |
| DB writer | `src/importer/db-writer.js` | Include `command` in message INSERT |
| Timeline route | `src/server/routes/timeline.js` | Add segment boundary detection; return segments instead of sessions |
| GanttBar | `src/client/components/GanttBar.vue` | Label fallback: use segment rename title; show `:N` suffix in ID display |
| SessionDetailPanel | `src/client/components/SessionDetailPanel.vue` | Show segment indicator (e.g., "2 of 3") when `segmentTotal > 1` |
| DaySummary | `src/client/components/DaySummary.vue` | No change needed if API response shape is correct |

---

## Sources

- Direct analysis of `/home/claude/cctimereporter/src/` (HIGH confidence)
- `references/claude-transcript-schema.md` for JSONL message type definitions (HIGH confidence)
- Project context provided by orchestrator (defines splitting rules already decided)
