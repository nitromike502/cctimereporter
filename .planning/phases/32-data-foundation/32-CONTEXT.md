# Phase 32: Data Foundation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Token usage fields are stored in SQLite per assistant message, schema auto-migrates from v9 to v10, and historical sessions are backfilled via re-import. This phase is pure data infrastructure — no UI, no API, no service layer.

</domain>

<decisions>
## Implementation Decisions

### Re-import strategy
- Auto re-import on first run after migration — migration triggers a full re-import automatically
- Re-import everything (--all equivalent) — transcripts are purged after ~30 days, so only recent sessions will have JSONL files available
- Sessions whose transcripts were purged will keep existing metadata but token columns stay NULL — this is expected and handled by downstream display (show "—" for unavailable data)

### Sidechain and fork token policy
- Store everything, filter at query time — consistent "import raw, derive at query time" philosophy
- Sidechain messages (is_sidechain=1) get their token data extracted and stored
- Fork branch messages (is_fork_branch=1) get their token data extracted and stored
- The service layer (Phase 33) decides what to include/exclude in displayed totals

### NULL vs zero convention
- Non-assistant messages get NULL in all token columns (no usage data exists)
- Only assistant messages have token values written
- Semantically correct: NULL means "no data" not "zero tokens"
- Downstream queries filter with `WHERE input_tokens IS NOT NULL` or `type = 'assistant'`

### Claude's Discretion
- Exact column names in the schema
- Migration implementation details (ALTER TABLE approach)
- How to trigger auto re-import after migration (inline vs deferred)

</decisions>

<specifics>
## Specific Ideas

- Seven new columns on messages: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, ephemeral_5m_input_tokens, ephemeral_1h_input_tokens, model
- Three-place update required: schema.js DDL, db-writer.js insertMessages, importer/index.js messagesForDb mapping
- Usage object is on `rawMessage.message.usage` for assistant messages

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 32-data-foundation*
*Context gathered: 2026-04-07*
