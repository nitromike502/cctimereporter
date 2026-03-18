# Architecture: Session Splitting at /clear and /rename Boundaries

**Domain:** Session segmentation within existing import pipeline + timeline API + Vue frontend
**Researched:** 2026-03-15
**Approach:** Query-time segment derivation (consistent with existing "import raw, derive at query time" philosophy)

---

## Overview

Session splitting adds virtual segments derived from `/clear` and `/rename` command markers
stored in the messages table. Segments replace their parent session visually — each segment
becomes its own Gantt bar with independent working time, label, and timing.

The design decision is already fixed: **no new DB tables, no changes to the import schema
for sessions, no splitting at import time**. Segments are computed in the timeline route
from a `command` column added to the messages table.

---

## Data Flow: End-to-End

```
JSONL file
  └── parser.js                 [MODIFIED] detect /clear and /rename in user messages
        └── normalized message includes command: 'clear' | 'rename' | null
  └── db-writer.js              [MODIFIED] insertMessages writes command column
        └── messages.command = 'clear' | 'rename' | null

SQLite messages table           [SCHEMA v7] adds command column
  └── timeline route            [MODIFIED] SQL derives segments from command markers
        └── segments: [{ session_id, segment_index, start, end, timestamps[] }]
  └── API response              [MODIFIED] sessions array replaced by segments array
        └── each segment: { sessionId: "uuid:0", startTime, endTime, workingTimeMs, ... }

Vue TimelinePage                [MODIFIED] selectedSession uses segment sessionId
  └── GanttSwimlane             [NO CHANGE] already handles any array of session objects
  └── GanttBar                  [MODIFIED] label logic handles segment-suffixed sessionId
  └── SessionDetailPanel        [MODIFIED] sessionId display strips :N suffix for copy
  └── SessionMessagesModal      [MODIFIED] strips :N suffix before API call
  └── SessionEditModal          [MODIFIED] strips :N suffix, save uses real session_id
  └── DaySummary                [NO CHANGE] sums workingTimeMs across all items, works as-is
```

---

## Schema Change: messages.command (v7 Migration)

**New column:** `command TEXT` on the `messages` table.

Null for most messages. Set to `'clear'` or `'rename'` for user messages that contain
the corresponding slash command.

```sql
-- MIGRATION_V6_TO_V7
ALTER TABLE messages ADD COLUMN command TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_command ON messages(session_id, command);
```

The composite index on `(session_id, command)` is critical — the segment derivation
query filters `WHERE command IS NOT NULL` per session, and adding it to the session_id
index keeps the lookup cheap even for large message tables.

**Schema version:** bump `SCHEMA_VERSION` from 6 to 7.

---

## Import Pipeline Changes

### parser.js

The parser already calls `parseCommandXml()` for `firstPrompt` extraction. Extend it to
detect segment-boundary commands on user messages.

**Detection logic (inline, not via parseCommandXml):**

```javascript
// In the message normalization block inside parseTranscript():
let command = null;
if (msg.type === 'user' && !msg.isMeta) {
  const text = extractContentText(msg)?.trim() ?? '';
  // Check raw text for /clear (inline) or XML form
  if (/^\s*\/clear\b/.test(text) ||
      /<command-name>\s*\/clear\s*<\/command-name>/.test(text)) {
    command = 'clear';
  } else if (/^\s*\/rename\b/.test(text) ||
             /<command-name>\s*\/rename\s*<\/command-name>/.test(text)) {
    command = 'rename';
  }
}

messages.push({
  // ... existing fields ...
  command,
});
```

The `system` subtype `local_command` also records slash commands (as metadata), but it
has no `timestamp` and is filtered out before DB insert anyway. Target only `user` messages.

**What parser.js returns:** the `messages` array gains a `command` field (`null` or string).

### db-writer.js

`insertMessages` adds `command` to the INSERT statement:

```javascript
INSERT OR IGNORE INTO messages (
  session_id, uuid, type, subtype, timestamp,
  parent_uuid, git_branch, is_meta, is_sidechain, is_fork_branch, command
) VALUES (
  $session_id, $uuid, $type, $subtype, $timestamp,
  $parent_uuid, $git_branch, $is_meta, $is_sidechain, $is_fork_branch, $command
)
```

The `importer/index.js` `messagesForDb` mapping adds `command: msg.command ?? null`.

**INSERT OR IGNORE behavior:** existing rows are not updated. On re-import of a changed
file, new messages are added but old rows are skipped. The `command` field will be correct
on first import; re-imports of unchanged messages are no-ops. This is acceptable: command
markers don't change after they're written.

---

## Timeline Route Changes

### Segment Derivation Algorithm

The timeline route currently queries all timestamps for a session, computes `workingTimeMs`
and `idleGaps` in JavaScript, then returns one session object per row.

With segments, the route replaces that per-session loop with a segment-aware algorithm:

**Step 1:** fetch sessions as before (the SQL query is unchanged).

**Step 2:** for each session, fetch messages with timestamps AND the command column,
ordered by timestamp:

```sql
SELECT timestamp, command
FROM messages
WHERE session_id = ?
  AND type IN ('user', 'assistant')
  AND timestamp IS NOT NULL
ORDER BY timestamp
```

**Step 3:** split message timestamps into segments in JavaScript:

```javascript
function deriveSegments(msgRows) {
  // msgRows: [{ timestamp, command }, ...]
  // Returns array of { segmentIndex, timestamps[] }
  const segments = [];
  let current = [];
  let segIdx = 0;

  for (const { timestamp, command } of msgRows) {
    current.push(timestamp);
    // /clear or /rename marks end of current segment
    if (command === 'clear' || command === 'rename') {
      segments.push({ segmentIndex: segIdx, timestamps: current });
      current = [];
      segIdx++;
    }
  }
  // Always emit final segment (handles sessions with no commands too)
  segments.push({ segmentIndex: segIdx, timestamps: current });

  return segments;
}
```

**Step 4:** for sessions with only one segment (no command markers), emit the session
object unchanged — same shape as today, `sessionId` unchanged, no `:N` suffix added.
This preserves backward compatibility for unsplit sessions.

**Step 5:** for sessions with multiple segments, emit one object per segment:

```javascript
{
  sessionId: `${row.session_id}:${seg.segmentIndex}`,
  // startTime/endTime from segment timestamps (clamped to day boundaries)
  // workingTimeMs/idleGaps computed from segment timestamps only
  // ticket, branch, summary, etc. inherited from parent session row
  isSegment: true,
  segmentIndex: seg.segmentIndex,
  parentSessionId: row.session_id,
}
```

The `segmentIndex: 0` case (pre-/clear portion) gets suffix `:0`. The portion after the
last `/clear` in a session gets the highest index.

**Note on the command message itself:** the `/clear` message is included in segment N
(before the boundary), not segment N+1. The next message after it starts the new segment.
This matches user intuition: the segment ends when `/clear` is typed.

### What stays the same in the API response

- Top-level `{ date, totalSessions, projects }` shape unchanged
- Each project still has `sessions: []` array
- All existing session object fields present on each segment object
- Sessions without `/clear` or `/rename` are emitted as before (no suffix, no `isSegment`)

### Working Time for Segments

`computeWorkingTime` and `computeIdleGaps` are called on each segment's timestamp subset
separately. The thresholdMs is the same value for all segments in the session.

The day-boundary clamping logic applies per-segment: if segment timestamps span day
boundaries, only timestamps within the requested day are used (same clamped logic as
today).

---

## Frontend Changes

### Components: No Change Required

**GanttSwimlane** — iterates `sessions` array and places each in a sub-row using the
greedy overlap algorithm. Works identically whether items are real sessions or segments,
since the shape is the same. No change needed.

**DaySummary** — sums `workingTimeMs` across all session objects in `projects`. Segments
are session objects, so the totals work correctly. The "By Project" grouping may show
more rows if ticket/branch varies per segment — this is correct behavior. No change needed.

**GanttLegend** — uses `projectPath` for color assignment. Unaffected. No change needed.

**TimelineToolbar**, **AppCheckbox**, **GanttChart** — no change needed.

### Components: Modification Required

**GanttBar**

The `label` computed property falls back to `props.session.sessionId.slice(0, 8)` as
last resort. When `sessionId` is `"abc123def456:1"`, the sliced fallback shows `"abc123de"`
which is still readable as a partial UUID. No label change strictly required.

However, for segments the `/rename` command's new name (from `customTitle`) is the right
label for that segment. The label priority chain needs no structural change — it already
uses `customTitle` — but the segment's `customTitle` should reflect the `/rename` value
active during that segment's window. This is a concern for ticket/summary data scoping,
not GanttBar itself.

**SessionDetailPanel**

The "Session ID:" field displays `props.session.sessionId.slice(0, 12) + '...'`. For a
segment, this shows `"abc123def456:1..."` which is slightly awkward but readable.

Two options:
1. Display the real session ID (strip suffix) with segment indicator: `"abc123def456 [seg 1]"`
2. Leave as-is (`:1` is self-documenting)

Recommendation: strip the suffix for the displayed short ID, show segment badge if
`isSegment` is true. This keeps copy-paste of the session ID clean.

**SessionMessagesModal**

Calls `GET /api/sessions/:id/messages`. The `:id` must be the real session UUID, not
the suffixed segment ID. Strip `:N` before making the API call.

```javascript
const realSessionId = sessionId.replace(/:\d+$/, '')
fetch(`/api/sessions/${encodeURIComponent(realSessionId)}/messages`)
```

The messages modal shows the first messages of the full session regardless of segment.
This is acceptable for now — a future improvement could filter to segment-scoped messages.

**SessionEditModal**

The PATCH call uses `session.sessionId` directly. Same fix: strip `:N` suffix before the
API call. The `userLabel` and `userTicket` edits apply to the full session row in DB —
this means all segments of a session share the same `userLabel`/`userTicket`. This is
correct behavior (you label the session, not individual segments).

**TimelinePage**

`onSelectSession` currently deselects when clicking the same `sessionId`. With segments,
`"uuid:0"` and `"uuid:1"` are different IDs, so clicking between segments of the same
parent session does not toggle — it just selects. This is correct.

`onSessionEdited` patches `timelineData` by matching on `sessionId`. With segments,
this needs to update all segments of the same parent session:

```javascript
function onSessionEdited({ userLabel, userTicket }) {
  if (!selectedSession.value) return
  const parentId = selectedSession.value.parentSessionId ?? selectedSession.value.sessionId
  for (const project of timelineData.value?.projects ?? []) {
    for (const session of project.sessions) {
      const sessionParent = session.parentSessionId ?? session.sessionId
      if (sessionParent === parentId) {
        session.userLabel = userLabel
        session.userTicket = userTicket
      }
    }
  }
  selectedSession.value = { ...selectedSession.value, userLabel, userTicket }
}
```

`selectedProjectName` finds the project owning the selected session by searching
`p.sessions.some(s => s.sessionId === selectedSession.value.sessionId)`. Segment IDs
are unique, so this lookup works as-is.

The `fetchTimeline` re-sync after threshold change searches
`data.projects.flatMap(p => p.sessions).find(s => s.sessionId === id)`.
Segment IDs persist across threshold changes (they are structural, not threshold-dependent),
so this also works as-is.

---

## Component Boundary Map

| Component | Status | Change |
|-----------|--------|--------|
| `src/db/schema.js` | MODIFIED | Add command column, MIGRATION_V6_TO_V7, bump SCHEMA_VERSION to 7 |
| `src/db/index.js` | MODIFIED | Add v6→v7 migration path in openDatabase() |
| `src/importer/parser.js` | MODIFIED | Detect /clear and /rename, populate command field on messages |
| `src/importer/db-writer.js` | MODIFIED | insertMessages includes command column |
| `src/importer/index.js` | MODIFIED | messagesForDb mapping adds command: msg.command ?? null |
| `src/server/routes/timeline.js` | MODIFIED | messageStmt fetches command column, deriveSegments() logic, multi-segment expansion |
| `src/client/pages/TimelinePage.vue` | MODIFIED | onSessionEdited handles segment parent matching |
| `src/client/components/SessionDetailPanel.vue` | MODIFIED | Strip :N suffix from displayed session ID, optional segment badge |
| `src/client/components/SessionMessagesModal.vue` | MODIFIED | Strip :N suffix before API call |
| `src/client/components/SessionEditModal.vue` | MODIFIED | Strip :N suffix before PATCH API call |
| `src/client/components/GanttBar.vue` | UNCHANGED | Existing label fallback works; segment ID slice still readable |
| `src/client/components/GanttSwimlane.vue` | UNCHANGED | Greedy row algorithm works on any session-shaped objects |
| `src/client/components/DaySummary.vue` | UNCHANGED | Sums workingTimeMs across all items correctly |
| `src/client/components/GanttChart.vue` | UNCHANGED | Renders swimlanes per project |
| `bin/cli.js` | UNCHANGED | No --segment-threshold arg needed; threshold is already a query param the UI controls |

---

## Suggested Build Order

The feature has a hard dependency chain: schema must exist before import changes can
be tested, and import must populate `command` before the route can derive segments.

### Phase 1: Schema + Import Pipeline (backend only, no visible UI change)

1. `schema.js` — add `command` column, `MIGRATION_V6_TO_V7`, bump version to 7
2. `db/index.js` — add v6→v7 migration path
3. `parser.js` — detect /clear and /rename, add `command` to returned messages
4. `db-writer.js` — add `command` to INSERT
5. `importer/index.js` — add `command` to `messagesForDb` mapping
6. Validate: re-import transcripts, verify `command` column populated correctly

### Phase 2: Timeline Route Segment Derivation (API change, frontend backward compatible)

7. `timeline.js` — update messageStmt to fetch command column
8. `timeline.js` — implement `deriveSegments()` helper
9. `timeline.js` — expand session objects into segment objects in the project loop
10. Validate: API returns `sessionId: "uuid:0"` etc. for split sessions; unsplit sessions unchanged

### Phase 3: Frontend Adaptations

11. `SessionMessagesModal.vue` — strip :N suffix
12. `SessionEditModal.vue` — strip :N suffix
13. `SessionDetailPanel.vue` — clean up displayed session ID for segments
14. `TimelinePage.vue` — fix onSessionEdited to match parent session across all segments
15. Validate: click a segment bar, view messages, edit label, verify all segments update

---

## SQL Query Patterns

### Fetch messages with command column (per session)

```sql
SELECT timestamp, command
FROM messages
WHERE session_id = ?
  AND type IN ('user', 'assistant')
  AND timestamp IS NOT NULL
ORDER BY timestamp
```

### Find sessions that have any split commands (for debugging/validation)

```sql
SELECT DISTINCT session_id, command, COUNT(*) as cnt
FROM messages
WHERE command IS NOT NULL
GROUP BY session_id, command
ORDER BY cnt DESC
LIMIT 20;
```

### Count command markers across all sessions (for stats)

```sql
SELECT command, COUNT(*) AS total
FROM messages
WHERE command IS NOT NULL
GROUP BY command;
```

No CTE or window function is needed for segment derivation — the algorithm is cleaner
in JavaScript where iterating the ordered message list and slicing on command markers
is straightforward. The SQL stays simple: fetch ordered rows, derive in application code.

---

## Key Invariants

1. **Unsplit sessions are unchanged.** Sessions with no `/clear` or `/rename` markers
   emit a single object with the original `sessionId`, no `:N` suffix, no `isSegment`
   flag. All existing functionality continues to work.

2. **Segment IDs are stable.** `session_id:N` depends only on the ordered position of
   command markers. Re-imports do not change this (command markers are append-only in
   practice). The only destabilizing change would be inserting new messages before an
   existing marker, which cannot happen (Claude Code appends to JSONL, never inserts).

3. **Working time does not double-count.** Each timestamp belongs to exactly one segment.
   `DaySummary` totals remain accurate.

4. **User edits apply session-wide.** `userLabel` and `userTicket` are stored on the
   session row, not per-segment. All segments of a session inherit the same values.
   The UI update in `onSessionEdited` must patch all segments in `timelineData`.

5. **The messages API serves the full session.** `GET /api/sessions/:id/messages` takes
   a real session UUID. Segment consumers strip the `:N` suffix before calling it.

---

## Risks and Edge Cases

### The command message itself

A `/clear` message has a timestamp. Including it in the pre-clear segment (as proposed)
means the segment's `endTime` is the `/clear` timestamp, which is slightly after the
last real work. This is a minor cosmetic issue — the bar ends a fraction of a second
later than the actual last work message.

Alternative: exclude the command message from both segments (gap between them). This
creates a zero-length gap that could confuse `computeIdleGaps`. Recommendation: include
in pre-clear segment as described.

### /rename with no subsequent messages

If `/rename` is the last message in a session, the post-rename segment has zero messages.
`deriveSegments` will emit it with an empty timestamps array. `computeWorkingTime([]) = 0`
and `computeIdleGaps([]) = []`. The segment will have no `startTime`/`endTime`. Handle:
skip emitting a segment if its timestamp array is empty after clamping to the current day.

### Sessions spanning multiple days

Day-boundary clamping already applies per-session. With segments, apply clamping per
segment: filter each segment's timestamps to `>= dayStartUTC && < dayEndUTC`. If the
filtered array is empty, skip the segment for that day. This correctly handles a session
where `/clear` happened on day 1 and no further messages followed until day 2.

### Re-import of existing sessions

`insertMessages` uses `INSERT OR IGNORE`. Messages already in the DB without a `command`
value will not be updated to add the command on re-import. The workaround: force
re-import (`--force` flag or size change triggers re-import) after deploying v7.

The schema migration adds the column as NULL, so existing rows are NULL (no command),
which correctly means "no segment boundary" — old sessions will appear as single
unsplit segments until re-imported. This is acceptable degraded behavior, not a corruption.

### Very long sessions with many /clear calls

A session with 20 `/clear` calls produces 21 segment objects. The frontend renders all
of them as GanttBars. The `GanttSwimlane` greedy row assignment stacks them into
sub-rows if they overlap — but segments are by definition non-overlapping since they
cover disjoint time ranges within the same session. No layout issues expected.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Schema change | HIGH | Simple ALTER TABLE ADD COLUMN with existing migration pattern |
| Parser detection | HIGH | parseCommandXml already handles XML form; inline /clear is simple regex |
| DB write path | HIGH | insertMessages pattern well-established; adding one column is mechanical |
| Segment derivation algorithm | HIGH | Pure JavaScript; no complex SQL required |
| Frontend backward compat | HIGH | Unsplit sessions untouched; split sessions are additive shape |
| Edge case: empty last segment | MEDIUM | Needs explicit guard in deriveSegments; straightforward to add |
| Edge case: re-import NULL migration | MEDIUM | Force re-import gives correct result; degraded behavior is acceptable |
