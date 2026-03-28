---
phase: 31-mcp-server
plan: 01
subsystem: api
tags: [mcp, stdio, zod, @modelcontextprotocol/sdk, json-rpc, tools]

# Dependency graph
requires:
  - phase: 28-service-layer
    provides: createTimelineService(db) and createSessionsService(db) factory functions
  - phase: 30-cli-subcommands
    provides: Commander-based bin/cli.js with early-exit pattern for pre-Commander flags
provides:
  - stdio MCP server startable via `node bin/cli.js --mcp`
  - 4 query tools: get_day_summary, get_sessions, get_session_messages, get_dates
  - MCP server factory at src/mcp/server.js
  - Query tool registrations at src/mcp/tools/query.js
affects:
  - phase: 31-02 (action tools — registerActionTools will be conditionally loaded by server.js)

# Tech tracking
tech-stack:
  added:
    - "@modelcontextprotocol/sdk ^1.28.0 — MCP protocol implementation"
    - "zod ^4.3.6 — input schema validation for tool parameters"
  patterns:
    - "registerTool(name, { description, inputSchema }, handler) — inputSchema is ZodRawShape (plain object of zod schemas, not z.object())"
    - "Tool handlers return { content: [{ type: 'text', text: JSON.stringify(data) }] }"
    - "server.connect(transport) is non-blocking — process kept alive by stdin 'close' listener"
    - "isMcpMode else-branch in bin/cli.js — MCP mode skips entire Commander setup"
    - "Action tools loaded with try/catch dynamic import — gracefully skips if action.js not yet created"

key-files:
  created:
    - src/mcp/server.js
    - src/mcp/tools/query.js
  modified:
    - bin/cli.js
    - package.json
    - package-lock.json

key-decisions:
  - "server.connect(transport) resolves immediately (non-blocking) — process stays alive via stdin.on('close') listener, not by awaiting connect"
  - "isMcpMode else-branch wraps entire Commander section — prevents program.parseAsync running in MCP mode"
  - "get_dates uses direct db.prepare().all() — no service abstraction needed for simple date list query"
  - "registerActionTools wrapped in try/catch dynamic import — Plan 01 works standalone before Plan 02 creates action.js"

patterns-established:
  - "MCP tool registration: server.registerTool(name, { description, inputSchema: ZodRawShape }, handler)"
  - "inputSchema is a plain object { key: z.schema() } NOT z.object({ key: z.schema() })"
  - "Error response: { isError: true, content: [{ type: 'text', text: JSON.stringify({ error, message }) }] }"
  - "No stderr in MCP mode — StdioServerTransport owns stdio; all logging suppressed"

# Metrics
duration: 7min
completed: 2026-03-28
---

# Phase 31 Plan 01: MCP Server Summary

**stdio MCP server via `--mcp` flag with 4 query tools (get_day_summary, get_sessions, get_session_messages, get_dates) using @modelcontextprotocol/sdk and zod input validation**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T20:15:39Z
- **Completed:** 2026-03-28T20:22:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Installed `@modelcontextprotocol/sdk` and `zod` dependencies; added `src/mcp` to package.json files array
- Created `src/mcp/server.js` factory that boots a stdio MCP server and exits cleanly when stdin closes
- Created `src/mcp/tools/query.js` with 4 query tools reusing existing service layer
- Wired `--mcp` flag in `bin/cli.js` before Commander, skipping entire Commander setup in MCP mode
- Verified end-to-end: initialize handshake, tools/list returns 4 tools, get_dates returns real data, process exits on stdin close

## Task Commits

1. **Task 1: Install deps, create MCP server factory, wire --mcp dispatch** - `8312909` (feat)
2. **Task 2: Implement 4 query tool registrations** - `f72b4e8` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/mcp/server.js` - MCP server factory; creates McpServer, registers tools, connects StdioServerTransport
- `src/mcp/tools/query.js` - 4 query tool registrations using createTimelineService and createSessionsService
- `bin/cli.js` - Added isMcpMode check + else-branch wrapping entire Commander section
- `package.json` - Added @modelcontextprotocol/sdk, zod, src/mcp to files array
- `package-lock.json` - Updated lockfile with 77 new packages

## Decisions Made

- **server.connect() is non-blocking** — resolved immediately; process.exit(0) after await would kill the server before any messages were processed. Fixed by wrapping Commander setup in `else (!isMcpMode)` block and relying on `stdin.on('close', () => process.exit(0))` to keep the process alive.
- **isMcpMode else-branch** — cleaner than a `return` (not possible at ESM top-level) or separate entry point. The entire Commander setup is skipped in MCP mode.
- **get_dates queries DB directly** — no service abstraction needed; simple `SELECT DISTINCT DATE(...)` with no business logic.
- **registerActionTools try/catch** — Plan 02 creates action.js; server.js references it conditionally so Plan 01 works standalone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] process.exit(0) after startMcpServer caused immediate exit**

- **Found during:** Task 1 verification (end-to-end test)
- **Issue:** Plan specified `process.exit(0)` after `await startMcpServer(db)` with comment "this line is never reached". In practice, `server.connect(transport)` resolves immediately (non-blocking), so `process.exit(0)` fired before any messages were processed.
- **Fix:** Removed `process.exit(0)` and wrapped entire Commander section in `else (!isMcpMode)` block. The `stdin.on('close')` listener in server.js keeps the event loop alive and exits when the MCP host disconnects.
- **Files modified:** bin/cli.js
- **Verification:** End-to-end test with Python subprocess confirmed: initialize response received, get_dates tool returns real data, exit code 0 on stdin close.
- **Committed in:** `8312909` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Critical fix — without it, MCP server exited immediately on startup. Fix required understanding that MCP SDK's connect() is non-blocking.

## Issues Encountered

The MCP SDK's `StdioServerTransport` uses newline-delimited JSON (not Content-Length framing). The `server.connect()` method resolves immediately after setting up listeners — it does not block/await. This is idiomatic Node.js async but not obvious from the type signature. Discovered via debugging and fixed with the else-branch approach.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- MCP server boots via `--mcp` flag with 4 query tools responding correctly
- `registerActionTools` in server.js uses try/catch dynamic import — Plan 02 just needs to create `src/mcp/tools/action.js` and export `registerActionTools(server, db)`
- Service layer (Phase 28) and DB are already integrated — action tools can use the same factory pattern
- `npm pack --dry-run` confirms `src/mcp/` is included in the published package

---
*Phase: 31-mcp-server*
*Completed: 2026-03-28*
