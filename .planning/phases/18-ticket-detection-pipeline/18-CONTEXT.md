# Phase 18: Ticket Detection Pipeline - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the import pipeline to discover ticket references from three new sources: git commit messages in tool_result blocks, session summary/title text, and MCP tool call inputs from known services. These feed into the existing multi-source scoring system. No UI changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Scoring weights
- Git commit messages: 100pts base — similar to branch, strong signal
- Git commit accumulation: +10pts per additional commit mentioning the same ticket (boosted vs standard +5) — multiple commits referencing the same ticket is very strong confirmation
- Session summary/title: 25pts — low confidence, mentioned in passing
- MCP tool call inputs: 100pts base — similar to branch, direct user action
- Existing sources unchanged: slash commands (500-700pts), branch (100 + 5/msg), content mentions (10/mention)

### MCP tool call patterns
- Only scan tool calls from known MCP service prefixes (not all tool blocks)
- Default prefixes: `mcp__atlassian`, `mcp__linear`, `mcp__github`, `mcp__tickets`
- Scan tool INPUT (arguments) only, not output/results — user requesting a specific ticket is the signal
- Match standard ticket pattern `[A-Z]{2,8}-\d+` within the tool input JSON

### Claude's Discretion
- Per-mention accumulation rates for MCP and summary sources
- Whether summary scanning checks just the summary field or also first_prompt
- Exact parsing approach for git commit output in tool_result blocks
- False positive handling for new sources (existing denylist applies; additional rules if needed)

</decisions>

<specifics>
## Specific Ideas

- Git commits are probably the most reliable auto-detection source after explicit slash commands — especially when multiple commits reference the same ticket
- The user has a personal MCP called "tickets" (or similar) that should be included in the default prefix list
- New sources should go through the existing denylist and score threshold filtering

</specifics>

<deferred>
## Deferred Ideas

- User-configurable MCP prefix list — relates to TICK-F3 (custom regex patterns), future phase
- Detection source visibility in UI (showing "from git commit" etc.) — not in scope, could be future enhancement

</deferred>

---

*Phase: 18-ticket-detection-pipeline*
*Context gathered: 2026-03-07*
