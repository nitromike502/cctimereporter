# Phase 31: MCP Server - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

`npx cctimereporter --mcp` starts a stdio MCP server with tools for programmatic data access and server management. Uses the service layer from Phase 28, coordination locks from Phase 29, and Commander dispatch from Phase 30. Agents connect via stdio transport.

</domain>

<decisions>
## Implementation Decisions

### Tool response shapes
- Agent-optimized responses (not identical to CLI output — may be more concise or structured differently for agent consumption)
- Include both workingTimeMs and workingTime formatted strings (like CLI)
- Data only — no natural-language preambles in responses
- get_session_messages: use existing head/tail split for now (easier), but eventually support all messages (future enhancement)

### Tool naming and descriptions
- snake_case tool names: get_day_summary, get_sessions, get_session_messages, trigger_import, start_server, stop_server, server_status, get_dates
- Date parameter: strict YYYY-MM-DD only (no shortcuts like 'today')
- **New tool: get_dates** — returns list of dates that have session data, helps agent know what to query

### MCP mode integration
- MCP server waits for agent to call trigger_import — no auto-import on startup
- Silent on stderr — MCP protocol only on stdio
- Exit when stdin closes — standard MCP lifecycle
- 8 tools total (original 7 + get_dates)

### Server management tools, descriptions detail level, and invocation pattern

Claude's Discretion — Claude has flexibility to decide:
- Whether MCP process starts Fastify internally or spawns a separate process for start_server
- Whether stop_server kills any cctimereporter server or only MCP-spawned ones
- server_status return shape (minimal vs detailed)
- Whether start_server blocks until listening or returns immediately
- Tool description verbosity (minimal vs rich with examples)
- Whether --mcp is a Commander subcommand or root flag

</decisions>

<specifics>
## Specific Ideas

- The MCP server is the primary consumer of the service layer — it's the reason we built Phases 28-30
- get_dates tool is a lightweight query that makes the agent experience much better (agent knows which dates to query)
- The agent workflow: call get_dates to see available dates → call get_day_summary for a date → optionally drill into sessions or messages

</specifics>

<deferred>
## Deferred Ideas

- Full message retrieval (all messages, no head/tail split) for get_session_messages — future enhancement
- Date shortcuts ('today', 'yesterday') in tool parameters — keep strict YYYY-MM-DD for now

</deferred>

---

*Phase: 31-mcp-server*
*Context gathered: 2026-03-28*
