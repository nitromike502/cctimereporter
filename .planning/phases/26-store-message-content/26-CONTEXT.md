# Phase 26: Store Message Content - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Store user and assistant message text in the messages table during import. Enables DB-based message retrieval without re-reading JSONL files. The messages modal migration (Phase 27) is a separate phase.

</domain>

<decisions>
## Implementation Decisions

### Content extraction
- Extract only `type='text'` blocks from message content arrays — ignore tool_use, tool_result blocks entirely
- Strip XML tags from extracted text (same approach as the existing summary parser — command-message, bash-input, local-command, skill expansion tags)
- Skip system messages (they have no text content — just structural tree nodes)
- Skip messages with no meaningful text after extraction (e.g. tool approval clicks that result in empty string)
- Only store content for `type='user'` and `type='assistant'` messages

### Truncation behavior
- Only truncate if extracted text is longer than 1250 characters (250 char buffer zone)
- When truncating: find word boundary (last space) near 1000 chars, cut there, append "..."
- Messages ≤ 1250 chars are stored in full, untouched
- Same 1000 char target limit for both user and assistant messages

### Re-import behavior
- Content column included in the ON CONFLICT DO UPDATE clause (Claude's discretion on exact pattern — follows existing fork_branch_id precedent)
- Show re-import notification banner after schema migration (same pattern as existing migration banner)

### Schema design
- Single `content TEXT` column on messages table — no separate role or truncation flag columns
- Role derived from existing `type` column (type='user' → user, type='assistant' → assistant)
- Messages without stored content have NULL content (progress, system, tool-only, empty)

### Claude's Discretion
- Exact ON CONFLICT update pattern (always overwrite vs only-fill-NULLs)
- XML tag stripping implementation (reuse existing parseCommandXml or lighter approach)
- Schema migration version number (continues from current)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — follow existing import pipeline patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 26-store-message-content*
*Context gathered: 2026-03-23*
