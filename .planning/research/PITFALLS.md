# Pitfalls Research: Session Splitting at /clear and /rename Boundaries

**Domain:** Adding segment splitting to existing timeline system
**Researched:** 2026-03-15
**Confidence:** HIGH (based on direct code inspection of existing system)

---

## Critical Pitfalls

### Pitfall 1: Segment IDs That Collide With Real Session IDs

**What goes wrong:** Using `session_id:N` as synthetic segment IDs means any code path that takes an ID and looks it up in the sessions table will silently fail (404) or return wrong data. The PATCH endpoint, messages route, and any future endpoint all use `session_id` as a direct DB lookup key.

**Why it happens:** Segments are query-time derivations, not DB rows. Code written for real session IDs cannot be reused for segment IDs without a routing layer that strips the `:N` suffix.

**Consequences:**
- Clicking "Edit" on a split segment calls `PATCH /api/sessions/abc123:2` — `findStmt.get('abc123:2')` returns nothing, endpoint returns 404
- Messages modal calls `GET /api/sessions/abc123:2/messages` — sessionStmt returns nothing, 404
- Any future endpoint using `:id` params breaks silently for segments

**Prevention:** Establish a consistent ID-resolution layer before building any segment-aware API:
- Route layer extracts base session ID from `segmentId` before DB lookup (`abc123:2` → `abc123`)
- All endpoints that accept a segment ID must resolve it this way
- Alternatively, change the segment ID scheme to avoid colon syntax — but the `session_id:N` convention must be decided once and held consistently

**Warning signs:** 404s when clicking Edit on a split segment in the UI. Check if `PATCH /api/sessions/:id` route has any `:N` stripping logic.

**Phase:** Must be addressed before any UI work on editing segment metadata.

---

### Pitfall 2: user_label and user_ticket Have No Segment-Level Storage

**What goes wrong:** `user_label` and `user_ticket` live on the sessions table. Segments are derived at query time — they have no row. A user who edits the label on segment 2 of session `abc123` needs somewhere to store `user_label` for that specific segment, not the whole session.

**Why it happens:** The design stores user edits at session granularity. With splitting, the session row becomes a container for multiple segments, each potentially needing its own label.

**Consequences:**
- Editing segment 2's label overwrites segment 1's label (same row)
- There is no stable storage for per-segment user edits
- If editing is disabled for segments (simpler choice), users lose the ability to name split sessions

**Two paths:**
1. **Add a `session_segments` table** with `(session_id, segment_index, user_label, user_ticket)`. Segments read from here first, fall back to parent session row. Complex but full-featured.
2. **Disable editing for sessions with /clear boundaries** (simplest, preserves correctness). Show a tooltip: "This session has multiple segments. Editing is not supported."

**Prevention:** Decide the segment editing strategy before building the UI. Do not let the UI call PATCH with a segment ID unless the API layer can actually store it.

**Warning signs:** User edits segment label, refreshes page, label is gone — because it was written to the wrong row.

**Phase:** Must be decided in data model phase, before UI.

---

### Pitfall 3: Ticket Scoring Runs on Full Session at Import Time — Segments Get Wrong Tickets

**What goes wrong:** `scoreTickets()` runs on all messages in a session at import, producing one `primary_ticket` for the entire session. After a /clear, the user pivoted to a new ticket — but the segment for the new topic shows the old ticket because the session-level score is dominated by the first segment's messages.

**Why it happens:** Import-time scoring cannot know where future /clear boundaries will fall. The ticket that wins the full-session score might be almost entirely confined to segment 1.

**Concrete example:** Session with 30 messages on STORY-10, then `/clear`, then 5 messages on BUG-42. STORY-10 wins at import time. Segment 2 (BUG-42 work) incorrectly shows STORY-10.

**Consequences:**
- Day summary shows wrong ticket for post-/clear work
- Gantt bar labels are wrong
- User confusion about what ticket time was spent on

**Prevention:**
- Segment-level ticket scoring must happen at query time (consistent with segments being query-time derivations)
- At query time, after splitting messages into segments, run `scoreTickets()` on each segment's messages independently
- The session-level `primary_ticket` from the DB remains as a fallback for unsplit sessions
- Performance: this adds CPU per-segment per timeline request — keep segment count per session small (it will be, since /clear is rare)

**Warning signs:** A segment whose messages clearly reference one ticket displays a completely different ticket from earlier in the session.

**Phase:** Query-time segment logic phase.

---

### Pitfall 4: Overnight Session Clipping Interacts With Segment Splitting in Non-Obvious Ways

**What goes wrong:** Current timeline.js clips sessions at day boundaries using `clampedTimestamps`. The clipping logic runs on the full session's message list. If a session spans midnight AND has /clear boundaries, the split points and the midnight boundary interact: a segment might entirely belong to the previous day (zero messages on the current day) but still be "attached" to the session row that overlaps the current day.

**Why it happens:** Both clipping and splitting operate on the same message list independently. Their order of application matters, but it is not defined.

**Consequences:**
- Segment 1 of a midnight-spanning session has zero messages on the requested day — it should be excluded, but if splitting runs before clipping it might still appear
- Working time double-counts or under-counts depending on order of operations
- `continuesFromPrevDay` / `continuesIntoNextDay` flags need to be per-segment, not per-session

**Prevention:**
1. Define a strict operation order: **clip to day boundaries first, then split into segments**
2. Segments with zero clamped messages after clipping are excluded
3. `continuesFromPrevDay` and `continuesIntoNextDay` are recalculated per segment (a segment that starts mid-day is never "continuing from prev day" even if the parent session is)

**Warning signs:** A /clear at 11:58 PM produces a post-clear segment that spans midnight and shows the wrong day's working time.

**Phase:** Query-time segment logic phase.

---

### Pitfall 5: Working Time Double-Counting at Segment Boundaries

**What goes wrong:** When splitting a session into segments, the timestamp at a /clear boundary is the /clear message itself (type `user`, carries a command). If the working time algorithm includes this message in both segment N (as its last timestamp) and segment N+1 (as its first timestamp), the gap spanning the /clear point is counted twice — once ending segment N and once beginning segment N+1.

**Why it happens:** `computeWorkingTime` uses consecutive pairs. If a split point timestamp appears as the last entry of one segment and the first of the next, the gap between "last message before /clear" and "/clear itself" is counted in segment N, AND the gap between "/clear" and "first post-/clear message" is counted in segment N+1. This can inflate both totals.

**More likely problem:** If the idle threshold check spans the /clear boundary — e.g., messages on each side are 5 minutes apart — that gap would have been excluded as part of working time in the unsplit session, but now it appears as working time at the end of segment N.

**Prevention:**
- The /clear message itself should be the exclusive boundary: segment N ends at the message BEFORE /clear, segment N+1 starts at the message AFTER /clear
- The /clear message is not included in either segment's message list for working time calculation
- Test with: session where messages are 3 min apart across a /clear — verify neither segment claims the cross-boundary gap

**Warning signs:** Total working time across all segments exceeds what the unsplit session would have reported for the same period.

**Phase:** Working time calculation phase.

---

### Pitfall 6: Messages Modal Shows Wrong Messages for a Segment

**What goes wrong:** `GET /api/sessions/:id/messages` reads the JSONL file for the whole session. When called with a segment ID (after `:N` stripping), it returns ALL messages from the file, not just the messages belonging to that segment. The user sees messages from a completely different part of the session.

**Why it happens:** The messages route uses the session's `file_path` to stream the JSONL. It has no knowledge of segment boundaries.

**Consequences:**
- Messages modal for segment 2 shows segment 1's conversation
- For long sessions with /clear, the "first 10 messages" shown are always from the beginning of the full session

**Prevention:** The messages route needs to accept optional `segmentStart` / `segmentEnd` parameters (timestamps or message position) and filter the streamed messages accordingly. Alternatively, pass `commandCol` filter context so the route knows where the segment boundaries are.

**Simplest approach:** Pass segment boundaries as query params (`?afterTimestamp=...&beforeTimestamp=...`) and filter JSONL output to that window.

**Warning signs:** Clicking the messages modal on segment 2 shows an unrelated conversation from segment 1.

**Phase:** Messages modal integration phase.

---

## Moderate Pitfalls

### Pitfall 7: /rename Near Segment Start — Threshold Logic Is Stateful

**What goes wrong:** The rule "if /rename is followed by /clear (or happens before N user messages), treat it as labeling not splitting" requires tracking state across messages. A naive implementation computes this per-/rename independently, but the "look ahead for /clear" check requires scanning forward. Combined with the configurable threshold (default 3 user messages), this is more complex than it looks.

**Prevention:** Process boundary events in a single pass, in order. Emit a list of `{ type: 'split'|'label', position: N, name?: string }` events. Decide split vs label at emit time with full context. Do not re-scan for each event.

**Warning signs:** A /rename followed immediately by /clear still creates a split. Or a /rename 10 messages from the start is treated as labeling when it should split.

**Phase:** Boundary detection logic phase.

---

### Pitfall 8: command Column Missing or Unreliable for Detecting Boundaries

**What goes wrong:** The project context states "command column on messages stores slash command names at import time." But the current schema shows messages table has no `command` column. The `parse-command-xml.js` utility exists but is only used in the parser to clean `firstPrompt`. If the `command` column doesn't exist in the DB, the query-time segment split logic has nothing to query.

**Verification needed:** Check whether `command` column exists on `messages` table, or whether boundary detection requires re-reading from JSONL (which would hurt performance) or requires a schema migration to add the column.

**Prevention:**
- If column doesn't exist: schema migration v7 adds `command TEXT` to messages, backfilled on next import
- Import pipeline must be updated to set `command` for messages where type=user and command XML is detected
- Query-time logic reads `messages.command = '/clear'` or `messages.command = '/rename'` — no JSONL re-reading

**Warning signs:** Timeline API calls are slow because each session requires a separate JSONL file read for boundary detection.

**Phase:** Must be resolved in data model / schema migration phase (before query-time logic).

---

### Pitfall 9: Query Performance — Per-Session Message Fetch Already N+1

**What goes wrong:** The current timeline route already has an N+1 query pattern: one `sessionStmt` returns all sessions, then for each session a separate `messageStmt` fetches timestamps. With segment splitting, boundary detection requires either a third per-session query (for command messages) or changes to the message fetch to include command data. Adding a third query per session triples the query count.

**Prevention:**
- Extend the existing `messageStmt` to also return `command` column (once column exists)
- Single augmented query: `SELECT timestamp, command FROM messages WHERE session_id = ? AND ...`
- Do not add a separate query pass just for boundary detection

**Warning signs:** Timeline API response time scales linearly with session count on a given day.

**Phase:** Schema and query layer phase.

---

### Pitfall 10: Segment Index Stability — Re-Import Changes Segment Numbering

**What goes wrong:** Segment indices (`:1`, `:2`, etc.) are assigned at query time based on message order. If a JSONL file is re-imported and gains new messages (e.g., the session was still active), segment boundaries shift. Any stored reference to `session_id:2` (e.g., a user_label stored by segment index) now points to the wrong segment.

**Why it happens:** Segments are derived, not stable. Message UUIDs are stable, but segment indices are position-dependent.

**Prevention:**
- Do not use segment index as the stable key for stored data
- If per-segment storage is added (see Pitfall 2), key it by the UUID of the message that triggered the split (the /clear message UUID), not by index N
- The display ID `session_id:N` is for the UI only; storage keys should use split-point UUID

**Warning signs:** User sets label on segment 2, session grows with new messages that push an earlier /clear earlier, label now appears on segment 3 or disappears.

**Phase:** Data model design phase.

---

### Pitfall 11: firstPrompt and Summary Don't Update Per-Segment

**What goes wrong:** `first_prompt` on the sessions row is the first user message of the entire session. After splitting, segment 2's display title should come from the first user message of segment 2 — not the session's `first_prompt`. Similarly, `summary` and `custom_title` apply to the whole session.

**Consequences:**
- All segments in a split session show the same `firstPrompt` in the Gantt bar
- The session detail panel shows session-wide summary for a segment that covers a narrow sub-topic

**Prevention:**
- Query-time segment construction computes `segmentFirstPrompt` from the first user message in that segment's message slice
- Session-level `summary` / `custom_title` displayed in detail panel is annotated as "full session" context
- `userLabel` (per-segment, if implemented) takes priority for display name

**Warning signs:** Two split segments showing identical titles in the Gantt bar.

**Phase:** Query-time segment construction.

---

## Minor Pitfalls

### Pitfall 12: /clear With No Subsequent Messages Creates Empty Segment

**What goes wrong:** A /clear as the last message in a session (user quit after clearing) produces a segment with zero messages after the boundary. An empty segment has no timestamps, no working time, and nothing to display — but the split logic might still emit it.

**Prevention:** Filter out zero-message segments before returning from the API. Minimum segment size is 1 message.

**Warning signs:** Empty entries in the Gantt timeline, or segments with `startTime === endTime`.

**Phase:** Boundary detection edge cases.

---

### Pitfall 13: Backward Compatibility — Existing Clients Don't Know About Segments

**What goes wrong:** The timeline API currently returns `sessions[]` arrays per project. If segments replace sessions in the response, any client code that assumed `sessionId` is a real DB key (e.g., code that builds a PATCH URL from a session object) will break silently.

**Prevention:**
- Add a `isSegment: true` flag and `parentSessionId` field to segment objects in the API response
- Keep the response shape identical (session-like objects); segments are just session-like objects with synthetic IDs
- UI can use `isSegment` to conditionally disable edit affordances if per-segment editing is not supported

**Warning signs:** Edit modal opens on a segment, PUT request to `/api/sessions/abc:2` silently 404s, no error shown to user.

**Phase:** API design and UI integration.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Schema migration (v7) | `command` column absence blocks all query-time logic | Add column + importer update before any splitting logic |
| Boundary detection logic | /rename threshold logic is stateful; easy to get split vs label wrong | Single-pass event emission with full forward context |
| Query-time segment construction | Working time double-counts at split points | Exclusive boundary: /clear message is in neither segment |
| Query-time segment construction | Overnight clipping order matters | Clip to day first, split second |
| Messages route | Segment ID lookup returns full-session messages | Add timestamp range params to filter message stream |
| PATCH endpoint | Segment IDs cause 404 on all write paths | ID-resolution layer strips `:N` suffix before DB lookup |
| UI integration | Segments appear editable but edits silently fail | `isSegment` flag disables edit UI or routes through new per-segment storage |
| Ticket scoring per segment | Session-level score wrong for post-/clear work | Re-run scoreTickets() on segment message slices at query time |

---

*Research completed: 2026-03-15*
*Scope: pitfalls specific to adding session splitting to the existing cctimereporter v0.5.0 system*
