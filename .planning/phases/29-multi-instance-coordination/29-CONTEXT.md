# Phase 29: Multi-Instance Coordination - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Multiple processes (web server, CLI, MCP instances) share one SQLite database safely. Only one web server runs at a time, only one import runs at a time, with automatic stale-process recovery. This phase adds DB-based coordination to the service layer from Phase 28.

</domain>

<decisions>
## Implementation Decisions

### Server ownership lifecycle
- Web mode (`npx cctimereporter`) claims ownership immediately at startup when it starts listening
- MCP processes only claim when `start_server` tool is called (Phase 31)
- If another process already owns the server, web mode prints "Server already running at http://localhost:PORT (PID XXXXX)" and exits cleanly (does NOT open browser)
- Server conflict responses always include the URL of the running server
- Stale PID detection: if owning PID is dead, reclaim

### Import lock behavior
- No force option — always reject if import is running. User must wait or kill the process manually
- Stale PID detection auto-reclaims dead locks (handles crashes without user action)
- Lock records the source: 'web', 'cli', or 'mcp' alongside PID and start time
- Rejection message includes PID + elapsed time (format from Phase 28: "Import already running (PID 12345 via CLI, started 2m 15s ago)")

### Error messaging
- CLI conflicts include actionable hints: "Import already running (PID 12345 via CLI, started 2m ago). Wait for it to finish or kill the process."
- Web UI import 409 shows details: "Import in progress (started from CLI 2m ago)" in the progress area
- Server already-running responses always include the URL

### Schema, storage, shutdown, lock cleanup, and busy_timeout

Claude's Discretion — Claude has flexibility to decide:
- New table vs reusing existing infrastructure for coordination state
- Whether schema migration is additive-only or uses ALTER
- Whether to set PRAGMA busy_timeout and what value
- Whether lock rows are cleaned on startup or kept for history
- Shutdown cleanup approach (signal handlers + stale detection as fallback, or just stale detection)
- Whether DB lock fully replaces the in-memory guard or works alongside it

</decisions>

<specifics>
## Specific Ideas

- Phase 28 already has an in-memory `_importState` in `src/services/import.js` with `ImportConflictError` — this phase upgrades that to DB-based
- The `runImport()` API should stay the same for callers — the upgrade is internal
- Server ownership is new — no existing code for this, needs to be built from scratch
- The `stop_server` MCP tool (Phase 31) will need to read the ownership row to know which PID to kill

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 29-multi-instance-coordination*
*Context gathered: 2026-03-27*
