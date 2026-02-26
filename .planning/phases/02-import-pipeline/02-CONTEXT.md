# Phase 2: Import Pipeline - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Port the Python PoC's JSONL import pipeline to Node.js — parsing transcripts, detecting forks, scoring tickets, and importing idempotently into SQLite. Validated against the Python PoC output for the same files. The server/CLI invocation and timeline UI are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Schema expansion
- Add only tables/columns the success criteria require: `tickets` table (for ticket detection verification), `import_log` table (for idempotent skip tracking)
- Do NOT add fork_points table, tool_uses table, or other discovery-era tables
- Add fork_count and real_fork_count columns to sessions table (run fork detection, store counts on session)
- Do NOT expand messages table beyond what's needed — add columns incrementally as features require them
- Schema auto-migrates on import (detect PRAGMA user_version, run migrations before importing — user never runs a separate migrate step)

### Ticket detection
- Ticket pattern: `[a-zA-Z]{2,8}-\d+` (generic, not hardcoded to AILASUP)
- Drop the username prefix from branch matching — scan branch names directly for the ticket pattern
- Keep the Python scoring weights: /prep-ticket = 500pts (700 if first message), branch match = 100 + 5/message, content mention = 10/mention
- Scoring logic goes in a dedicated file/module with clear documentation — values may need adjustment
- /prep-ticket detection: both inline and XML format (matching Python PoC)

### Import behavior & idempotency
- Skip logic: track per-file size in import_log. Re-import only files whose size changed (JSONL files only grow via appended messages)
- Re-import strategy: full re-parse of changed files, upsert (INSERT OR REPLACE/IGNORE) — no DELETE step
- Skip `agent-` prefixed files (sub-agent transcripts are part of parent session)
- Sub-agent working time: infer from main session timestamps (time between agent tool_use launch and tool_result return counts as working time, not idle)
- Project discovery: read project paths from `~/.claude.json` `projects` property (object keys are paths) instead of reverse-engineering from transcript directory names

### Python PoC parity
- Functionally equivalent, not column-for-column match — same sessions found, same primary tickets detected, same message counts
- Python PoC tables/columns were created during discovery; the Node port only implements what's needed to produce the result
- Fork detection runs during import but only stores counts on session row
- Validation: manual spot-check (run both importers, compare a few sessions)

### Claude's Discretion
- Which slash commands beyond /prep-ticket to scan for ticket references
- Exact import_log table structure
- Whether to add parent_uuid to messages table (may be needed for fork detection logic)
- Error handling for malformed JSONL lines
- Import progress reporting approach

</decisions>

<specifics>
## Specific Ideas

- "Any time gaps where a sub-agent was actively working should be included in the total working time" — agent launch-to-result spans count as active, not idle
- Use `~/.claude.json` projects property for discovery — more reliable than directory name parsing
- Scoring module should be easy to modify — "values may need adjustments or changes"

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-import-pipeline*
*Context gathered: 2026-02-25*
