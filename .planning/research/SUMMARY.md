# Project Research Summary

**Project:** cctimereporter v0.6.0 — Session Splitting at /clear Boundaries
**Domain:** Developer time-tracking CLI — segmented Gantt timeline
**Researched:** 2026-03-15
**Confidence:** HIGH

## Executive Summary

Session splitting adds virtual sub-units called segments derived from `/clear` command markers stored in the messages table. Each segment becomes its own Gantt bar with independent working time, ticket scoring, and branch detection — while unsplit sessions behave exactly as they do today. The scope is deliberately narrow: `/clear` is the only split signal. The `/rename` command is NOT a split boundary. Claude Code resets the session name on `/clear` as of 2026-03-15, making rename-based splitting and coalescing logic unnecessary. Any FEATURES.md or PITFALLS.md references to /rename splitting rules, configurable coalescing thresholds, or rename-proximity logic are superseded by this scope decision.

The implementation strategy is strictly query-time derivation. No new tables are added to the database; no segment data is persisted. A `command` column added to the messages table at schema v7 captures slash command names during import, and the timeline route uses those markers to slice each session's ordered messages into segments at request time. This is consistent with the existing "import raw data, derive at query time" philosophy already used for worktree grouping and working time computation. Zero new dependencies are required.

The critical risks are all known and manageable. The biggest is that synthetic segment IDs (`session_id:N`) break any code path that passes an ID directly to the database without stripping the `:N` suffix. Every API endpoint consumer that deals in segment IDs must resolve the real session UUID before any DB lookup. The second risk is ticket scoring: the session-level ticket stored at import time reflects the whole session, not each post-/clear context. Ticket scoring must be re-run per segment at query time over each segment's message slice. Both risks have clear, validated prevention strategies.

## Key Findings

### Recommended Stack

Zero new dependencies. The stack is unchanged from v0.5.0.

**Core technologies (unchanged, all already present):**
- **node:sqlite schema migration** (v6 to v7): adds `command TEXT` column with composite index on `(session_id, command)` — routine ALTER TABLE pattern used five times in this codebase already
- **Standard JavaScript iteration**: segment derivation is a simple ordered-list scan in the timeline route — no SQL window functions, CTEs, or additional libraries needed
- **Existing utility functions**: `scoreTickets()`, `determineWorkingBranch()`, and `computeWorkingTime()` are reused over message slices per segment without modification

See `.planning/research/ARCHITECTURE.md` for the exact SQL and JavaScript patterns.

### Expected Features

**Must have (table stakes):**
- `command` column on messages table (schema v7) — foundation for all query-time splitting
- Segment boundary detection (`deriveSegments()`) — JavaScript function over ordered message rows; `/clear` is the only boundary signal
- Per-segment ticket scoring — `scoreTickets()` re-run over each segment's message slice at query time
- Per-segment branch detection — `determineWorkingBranch()` over segment messages
- Per-segment working time — `computeWorkingTime()` over segment timestamps; DaySummary aggregation unchanged
- Segment Gantt bars — segments returned as session-shaped objects with `sessionId: "uuid:N"`; GanttSwimlane and DaySummary need no changes if shape is correct
- Per-segment first prompt — `segmentFirstPrompt` computed from first user message in the segment's slice (prevents all segments showing the session's global `first_prompt` as their title)
- Sessions without /clear unchanged — gated by boundary detection returning a single segment; zero regressions

**Should have (differentiators):**
- Segment indicator in detail panel — "segment N of M" shown in SessionDetailPanel when `segmentTotal > 1`; high orientation value, low effort
- `/clear` shown in messages modal — `command` column makes this low-effort context for users

**Defer to post-v0.6.0:**
- Per-segment user_label / user_ticket editing — requires a new `session_segments` table or a clear storage strategy; full complexity, separate milestone
- Visual split indicator on Gantt bar — adds GanttBar rendering complexity; do after core splitting works
- Segment threshold UI control — query param is sufficient for v0.6.0; UI config can follow

**Deliberate anti-features (do not build):**
- `/rename` as a split signal — explicitly out of scope as of 2026-03-15
- Persisting segments to the database — defeats the purpose of query-time derivation
- Splitting in the import pipeline — couples boundary rules to import; rule changes would require re-import
- Retroactive in-place migration of command column — let incremental import handle it naturally

See `.planning/research/FEATURES.md` for the full feature matrix and dependency tree.

### Architecture Approach

The data flow is a clean three-layer pipeline: import layer detects `/clear` and writes `command = 'clear'` to the messages table; the timeline route fetches ordered messages including the `command` column and runs `deriveSegments()` in JavaScript; each segment is expanded into a session-shaped response object. The frontend receives session-shaped objects regardless of whether they are real sessions or segments — only four components need modification, all to handle the `:N` suffix in the synthetic segment ID.

**Components and change type:**

| Component | Status | Change |
|-----------|--------|--------|
| `src/db/schema.js` | MODIFIED | `command TEXT` column, `MIGRATION_V6_TO_V7`, bump SCHEMA_VERSION to 7 |
| `src/db/index.js` | MODIFIED | Add v6→v7 migration path in openDatabase() |
| `src/importer/parser.js` | MODIFIED | Detect `/clear` in user messages; populate `command` field |
| `src/importer/db-writer.js` | MODIFIED | Add `command` to insertMessages INSERT |
| `src/importer/index.js` | MODIFIED | Add `command: msg.command ?? null` to messagesForDb mapping |
| `src/server/routes/timeline.js` | MODIFIED | Fetch `command` column; `deriveSegments()`; expand into segment objects |
| `src/client/pages/TimelinePage.vue` | MODIFIED | `onSessionEdited` must patch all segments sharing same `parentSessionId` |
| `src/client/components/SessionDetailPanel.vue` | MODIFIED | Strip `:N` from displayed ID; show segment badge when `isSegment` |
| `src/client/components/SessionMessagesModal.vue` | MODIFIED | Strip `:N` suffix before API call |
| `src/client/components/SessionEditModal.vue` | MODIFIED | Strip `:N` suffix before PATCH call |
| GanttBar, GanttSwimlane, DaySummary, GanttChart, bin/cli.js | UNCHANGED | No changes needed |

See `.planning/research/ARCHITECTURE.md` for exact code patterns, SQL queries, and the `deriveSegments()` algorithm.

### Critical Pitfalls

1. **Segment IDs break all existing API endpoints** — `PATCH /api/sessions/:id` and `GET /api/sessions/:id/messages` perform direct DB lookups. A segment ID `abc123:2` returns nothing (404). All three modal/edit components must strip the `:N` suffix before API calls. Add `isSegment: true` and `parentSessionId` fields to segment response objects so the UI knows when to strip. Must be addressed before any UI work on editing.

2. **Ticket scoring is wrong at session granularity** — Import-time scoring over all session messages means segment 2 (post-/clear work on a different ticket) inherits the session's dominant ticket from segment 1. Re-run `scoreTickets()` per segment at query time over each segment's message slice. Session-level `primary_ticket` from DB is only a fallback for unsplit sessions.

3. **Working time double-counting at segment boundaries** — If the `/clear` message timestamp is included in both adjacent segments, the boundary gap inflates both totals. The `/clear` message is the exclusive boundary: segment N ends at the message before `/clear`; segment N+1 starts at the message after `/clear`. The `/clear` message itself is excluded from both segments' timestamp lists.

4. **Overnight clipping and segment splitting order matters** — Clip timestamps to the day boundary first, then split into segments. Segments with zero clamped messages after clipping are excluded. `continuesFromPrevDay`/`continuesIntoNextDay` flags must be recalculated per segment, not inherited from the parent session.

5. **user_label and user_ticket have no per-segment storage** — Both columns live on the sessions row. For v0.6.0, edits apply session-wide: all segments of a session share the same `userLabel`/`userTicket`. The `onSessionEdited` handler in TimelinePage must patch all segments with matching `parentSessionId`. Decide this before building the UI — do not allow the edit UI to imply per-segment storage that does not exist.

See `.planning/research/PITFALLS.md` for the full catalog including moderate and minor pitfalls.

## Implications for Roadmap

The feature has a hard dependency chain: schema before import changes, import before query-time logic, query-time logic before frontend. This maps to three phases with clear validation gates between them.

### Phase 1: Schema + Import Pipeline

**Rationale:** The `command` column must exist in the database before any other work can be tested. This phase has zero visible UI impact and can be shipped and re-imported independently. It is the foundation that unblocks all downstream phases.

**Delivers:** `command` column populated in the messages table for all re-imported sessions. Existing functionality completely unchanged. Degraded behavior (NULL = no segment) is acceptable for sessions not yet re-imported.

**Addresses:** Pitfalls 8 (command column missing blocks all query-time logic), 9 (keep per-session query count at 2, not 3, by folding command into existing messageStmt).

**Files:** `schema.js`, `db/index.js`, `parser.js`, `db-writer.js`, `importer/index.js`

**Validation gate:** Re-import transcripts; run `SELECT command, COUNT(*) FROM messages WHERE command IS NOT NULL GROUP BY command;` — expect rows for `clear`.

### Phase 2: Timeline Route Segment Derivation

**Rationale:** The API changes must be correct and backward-compatible before any frontend component depends on segment IDs. Getting the response shape right here makes Phase 3 low-risk mechanical work.

**Delivers:** `/api/timeline` returns segment objects (`sessionId: "uuid:N"`, `isSegment: true`, `parentSessionId`) for split sessions; unsplit sessions return unchanged. Per-segment working time, ticket scoring, and branch detection all computed correctly.

**Addresses:** Core feature (segment boundary detection, per-segment data), Pitfalls 1 (segment IDs in response design), 3 (ticket scoring per segment), 4 (overnight clipping order), 5 (working time boundary).

**Key constraints:** `deriveSegments()` is a pure JavaScript function — no complex SQL. The `/clear` message is the exclusive boundary (not counted in either segment). Clip to day boundary first, then split. Skip emitting segments with zero timestamps after clipping.

**Files:** `src/server/routes/timeline.js`

**Validation gate:** API returns `"uuid:0"`, `"uuid:1"` for sessions with `/clear` markers. Total working time across all segments of a session equals what the unsplit session would have reported for the same period.

### Phase 3: Frontend Adaptations

**Rationale:** With Phase 2 delivering a correctly shaped API response, frontend changes are a bounded, known set. Each component change is independent and can be done sequentially.

**Delivers:** Segments render as distinct Gantt bars. Detail panel shows segment indicator ("segment N of M"). Messages modal and edit modal work correctly. Session edits propagate to all segments of the same parent.

**Addresses:** Pitfalls 1 (`:N` stripping in modals), 2 (session-wide edit applies to all segments via `onSessionEdited`), 6 (messages modal shows full-session messages — acceptable degraded behavior for v0.6.0).

**Files:** `SessionMessagesModal.vue`, `SessionEditModal.vue`, `SessionDetailPanel.vue`, `TimelinePage.vue`

**Validation gate:** Click a split session bar — detail panel shows "segment N of M". Open messages modal — shows first messages of full session (correct for v0.6.0). Edit label on a segment — all other segments of the same parent session update in the UI without a page refresh.

### Phase Ordering Rationale

- Schema migration is the strict prerequisite; nothing else is testable without it
- Timeline route changes must stabilize before frontend components commit to the ID scheme
- Frontend changes are all reactive to the API shape — batching them in Phase 3 keeps each phase independently verifiable
- The three-phase structure matches the build order suggested in ARCHITECTURE.md exactly

### Research Flags

Phases with well-documented, low-risk patterns (no additional research needed):
- **Phase 1 (Schema + Import):** ALTER TABLE ADD COLUMN is a routine pattern in this codebase (done five times). Parser regex for `/clear` detection is straightforward. No unknowns.
- **Phase 3 (Frontend):** Changes are mechanical ID-stripping in known, already-read component files. No unknowns.

Phases requiring implementation-time rigor (not additional research, but careful execution):
- **Phase 2 (Route logic):** Working time boundary handling (Pitfall 5) and overnight clipping order (Pitfall 4) need unit tests against known session fixtures. The logic is fully understood; execution needs rigor, not more research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; established migration pattern used five times already |
| Features | HIGH | Based on direct codebase analysis; splitting rules already decided and simplified to /clear only |
| Architecture | HIGH | Pure JavaScript segment derivation; data flow completely mapped with exact file and function names |
| Pitfalls | HIGH | Based on direct code inspection of v0.5.0; all failure modes verified against actual code paths |

**Overall confidence:** HIGH

### Gaps to Address

- **Messages modal segment filtering (v0.7.0 backlog):** For v0.6.0, the messages modal shows the first messages of the full session regardless of which segment was clicked (Pitfall 6 in PITFALLS.md). This is documented acceptable degraded behavior. A future improvement passes segment timestamps as query params to filter the message stream.

- **Per-segment user editing (post-v0.6.0):** The v0.6.0 decision is edits apply session-wide. If per-segment labels become a user need, the storage key should be the UUID of the `/clear` message that triggered the split (not the segment index N, which can shift if earlier messages are inserted).

- **Re-import requirement for existing data:** Sessions imported before schema v7 will have NULL `command` values and will appear as single unsplit segments until re-imported. The incremental import system handles this naturally; no forced full re-import is required. This is acceptable degraded behavior, not data corruption.

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `/home/claude/cctimereporter/src/` (v0.5.0) — all architecture findings, schema state, component boundaries
- `references/claude-transcript-schema.md` — JSONL message type definitions for /clear command detection

### Secondary
- Project orchestrator scope decision (2026-03-15) — /rename removed from scope; /clear is the only split signal; no coalescing thresholds

---
*Research completed: 2026-03-15*
*Scope note: /rename is NOT a split signal for v0.6.0. Only /clear creates segments. Disregard any FEATURES.md or PITFALLS.md references to /rename splitting, configurable coalescing thresholds, or rename-proximity logic — those reflect the original scope before simplification.*
*Ready for roadmap: yes*
