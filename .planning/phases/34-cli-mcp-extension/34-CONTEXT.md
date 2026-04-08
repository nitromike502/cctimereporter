# Phase 34: CLI and MCP Extension - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Token totals appear in CLI JSON output (summary and sessions commands) and MCP tool responses (get_day_summary and get_sessions). Purely additive fields — no breaking changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Entire phase is Claude's discretion — user trusts Claude to mirror existing patterns
- JSON structure, field naming, nesting — follow whatever conventions the existing CLI/MCP outputs use
- Token fields are additive — existing consumers can ignore them

</decisions>

<specifics>
## Specific Ideas

No specific requirements — follow existing patterns in src/cli/commands/ and src/mcp/tools/.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 34-cli-mcp-extension*
*Context gathered: 2026-04-07*
