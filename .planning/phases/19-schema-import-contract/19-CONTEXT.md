# Phase 19: Schema, Import, and API Contract - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `command` column to the messages table (schema v7), detect slash commands during JSONL import, and define the segment-aware API contract that frontend phases will code against. No segment derivation logic — that's Phase 20.

</domain>

<decisions>
## Implementation Decisions

### Schema migration
- Add `command TEXT` column to messages table via ALTER TABLE (v6→v7)
- Follow existing migration pattern in `src/db/index.js`
- `command` stores the slash command name only (e.g., `'clear'`, `'rename'`), not arguments
- Existing messages get `NULL` — no backfill, re-import populates naturally

### Parser command detection
- Detect slash commands in user messages during JSONL parsing
- Store in `command` field on the message object passed to `insertMessages()`
- All slash commands detected (not just `/clear`) — general-purpose column

### API contract
- Follow existing endpoint patterns and response structure from other routes
- Segment-aware response shape designed to minimize frontend changes
- Contract documented so Phases 20, 21, 22 can proceed in parallel

### Claude's Discretion
- Exact API response shape for segments (follow existing timeline route patterns)
- How to detect slash commands in JSONL user messages (regex, XML parsing, etc.)
- Whether contract goes in a doc file or inline in code comments
- INSERT statement changes for the `command` column in db-writer.js

</decisions>

<specifics>
## Specific Ideas

- Follow existing endpoint guidelines and structure from other routes in `src/server/routes/`
- The contract must be concrete enough for frontend phases to code against without the backend being complete

</specifics>

<deferred>
## Deferred Ideas

- Expanded re-import notification system — captured as TODO, future phase candidate

</deferred>

---

*Phase: 19-schema-import-contract*
*Context gathered: 2026-03-15*
