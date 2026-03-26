# Project Research Summary

**Project:** CC Time Reporter v0.8.0 — Programmatic Data Access (MCP Server + CLI Subcommands)
**Domain:** Adding programmatic access layer to an existing Node.js/Fastify/SQLite npx CLI tool
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

This milestone adds two parallel programmatic access surfaces to CC Time Reporter: an MCP server (via Streamable HTTP transport mounted on the existing Fastify instance) and CLI subcommands that output machine-readable JSON. Both surfaces are thin wrappers over the same query logic that already powers the web UI. The driving workflow is a Claude agent that calls `get_day_summary`, reads ticket-grouped time totals, and logs them to Harvest or Jira via other MCP tools — no new data is computed, only the same data the UI shows is exposed in a structured, stable format.

The recommended implementation order is: (1) extract a `src/services/` layer from the existing Fastify route handlers, (2) build CLI subcommands as thin service wrappers with clean stdout discipline, (3) add the MCP server on top of the validated service layer. This sequence is critical — both CLI commands and MCP tools depend on the service layer, and the service extraction is a refactor of existing working code that must be validated before new surfaces are built on top of it. Two new runtime dependencies are required: `@modelcontextprotocol/sdk@1.28.0` (pin the version) and `zod` (MCP SDK peer dependency), plus `commander` for CLI subcommand parsing.

The primary risks are: MCP session state management (the SDK does not handle it — you must maintain a `Map<sessionId, transport>` yourself), stdout pollution corrupting JSON output in the CLI layer (requires strict stderr-only diagnostics from day one), and a cross-process import concurrency gap when both the web server and CLI run simultaneously (addressed with `PRAGMA busy_timeout = 5000` and a shared import-state singleton). None of these risks are blocking — they are well-understood and have clear preventions that must be baked in during phase setup, not retrofitted.

---

## Key Findings

### Recommended Stack

The existing stack requires no changes. Two runtime dependencies are added for MCP: `@modelcontextprotocol/sdk@1.28.0` (MCP server implementation and Streamable HTTP transport) and `zod` (required peer dependency for tool input schema validation). One additional runtime dependency is added for CLI: `commander@14.0.3` (subcommand parsing, help generation, argument type coercion). Both new package versions were verified against the live npm registry on 2026-03-25.

Do not use the `fastify-mcp` community plugin — direct use of `StreamableHTTPServerTransport` with `request.raw`/`reply.raw` is 10 lines and sufficient for this use case. The pattern is already demonstrated in the existing SSE import progress route (`reply.hijack()` is used there today). Avoid `yargs` (overcapacity) and hand-rolled argv parsing for subcommands (does not scale to help output or argument types). See [STACK.md](STACK.md) for full rationale.

**Core technologies:**
- `@modelcontextprotocol/sdk` v1.28.0: MCP server + Streamable HTTP transport — only stable production-ready SDK, ESM-compatible, pin exact version (API still evolving toward v2)
- `zod` v3.x: Tool input schema validation — required peer dep for SDK, add explicitly to avoid version mismatch errors at runtime
- `commander` v14.0.3: CLI subcommand parsing — purpose-built for Git/npm-style CLIs, zero dependencies, ESM-compatible via `./esm.mjs` export

### Expected Features

The milestone implements four MCP tools and three CLI subcommands. The tools expose exactly what the web UI computes — no new data model, no new computations, just reshaping existing query output for agent consumption. See [FEATURES.md](FEATURES.md) for full I/O contract specifications.

**Must have (table stakes):**
- `get_day_summary` MCP tool — ticket-grouped time totals for a date; the primary tool for a logging agent
- `get_sessions` MCP tool — per-session detail when summary is insufficient for logging decisions
- `trigger_import` MCP tool — agent must be able to refresh stale data before querying
- `npx cctimereporter summary --date YYYY-MM-DD` — scripting/piping equivalent of `get_day_summary`
- `npx cctimereporter sessions --date YYYY-MM-DD` — scripting equivalent of `get_sessions`
- `npx cctimereporter import [--days N]` — non-interactive import trigger

**Should have (differentiators):**
- `get_session_messages` MCP tool — lets agent inspect message content for ambiguous sessions
- `idleThresholdMin` parameter on all tools — produces numbers consistent with user's UI configuration
- `userTicket`/`userLabel` fields in session output — surfaces high-confidence manually-set values
- `alreadyRunning` flag on import error — agent can distinguish "busy" from other failures
- Origin header validation on `/mcp` route — prevents DNS rebinding attacks (required by MCP spec)

**Defer to v0.9.0+:**
- Date range queries — requires UI date range picker first for consistency
- Session mutation via MCP — read-only tools only in this milestone; editing stays UI-only
- SSE streaming for import progress via MCP — synchronous result is sufficient for agent workflow

### Architecture Approach

The architecture adds a `src/services/` layer that extracts query logic from the existing Fastify route handlers. This shared layer is the foundation both CLI commands and MCP tools call — route handlers become thin adapters. Three new directories are added: `src/services/` (extracted query logic), `src/cli/` (subcommand implementations), and `src/mcp/` (MCP server, Fastify plugin, tool definitions). The `bin/cli.js` entry point gains mode dispatch at the very top, before any database or server initialization. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full file layout and data flow diagram.

**Major components:**
1. `src/services/` (NEW) — `getTimeline()`, `getSessions()`, `getSessionMessages()`, `runImport()` as plain functions accepting `db` and returning plain JS objects; shared by all three surfaces
2. `src/cli/` (NEW) — `runCommand()` dispatcher + per-subcommand modules; call services, write JSON to stdout, exit via `process.exitCode` not `process.exit()`
3. `src/mcp/` (NEW) — `createMcpServer(db)` with tool registrations + `fastify-plugin.js` registering POST/GET/DELETE on `/mcp` with a session `Map<sessionId, transport>`
4. `bin/cli.js` (MODIFIED) — mode detection first (web server / CLI subcommand / MCP server), then branch to the appropriate path; mode determined before `openDatabase()` or `createServer()` are called
5. `src/server/routes/*.js` (MODIFIED) — refactored to delegate to services; all existing API behavior unchanged

### Critical Pitfalls

See [PITFALLS.md](PITFALLS.md) for full analysis, detection signs, and phase-specific warnings.

1. **MCP session state not managed by SDK** — implement `Map<sessionId, StreamableHTTPServerTransport>` before writing any tool definitions; create new transport only when `mcp-session-id` header is absent; destroy on DELETE; skip this and clients get "not initialized" errors on every tool call

2. **stdout pollution corrupts JSON CLI output** — establish a `CLI_MODE` flag at startup before any subcommand code runs; all diagnostics go to stderr exclusively; use `process.exitCode = 0` not `process.exit()` — stdout writes are buffered in pipes and `process.exit()` truncates them before flush

3. **`importRunning` guard is process-scoped, not machine-scoped** — extract to a shared singleton `src/server/import-state.js` so both the REST route and MCP import tool share one flag; add `PRAGMA busy_timeout = 5000` to `openDatabase()` to handle the CLI-vs-server cross-process case gracefully

4. **MCP DELETE handler missing causes SPA catch-all to return HTML** — register an explicit DELETE handler on `/mcp` for session termination; also guard the SPA catch-all to return JSON error for requests with `Accept: application/json` or `Accept: text/event-stream` headers

5. **`package.json` files array must include new source directories** — add `src/services`, `src/cli`, `src/mcp` to `files` in the same commit that creates each directory; omitting this breaks `npx` for all published users (this is a documented gotcha from v0.5.0+)

---

## Implications for Roadmap

Based on research, the implementation has clear hard dependencies that dictate phase order: services must exist before CLI or MCP can be built; CLI validates services before MCP adds protocol complexity. Suggested three-phase structure:

### Phase 1: Service Layer Extraction

**Rationale:** Both CLI commands and MCP tools depend on shared query functions. This refactor must come first to unblock all downstream phases. It is also the highest-risk step (modifying existing working code) and benefits from being isolated so any regressions are easy to identify before new features are layered on.
**Delivers:** `src/services/timeline.js`, `src/services/sessions.js`, `src/services/import.js`; refactored route handlers that delegate to services; all existing API behavior unchanged — purely structural
**Addresses:** Architecture's service layer dependency; prevents SQL duplication across MCP and CLI
**Avoids:** Pitfall 10 (import concurrency) — extract import-state singleton here; Pitfall 12 (files array) — add `src/services` to `files` immediately in this phase
**Research flag:** Standard refactor pattern, no additional research needed.

### Phase 2: CLI Subcommands

**Rationale:** CLI commands have no new external dependencies and validate that the service layer works correctly as a standalone query interface. They are testable by running the binary directly. Establishing stdout discipline and mode dispatch here prevents pollution issues from bleeding into the MCP phase.
**Delivers:** `npx cctimereporter summary`, `npx cctimereporter sessions`, `npx cctimereporter import`; mode dispatch in `bin/cli.js`; commander integration migrating the existing `--debug-import` flag
**Uses:** `commander` (new dependency); `src/services/` from Phase 1
**Implements:** `src/cli/` directory; headless execution path in `bin/cli.js`
**Avoids:** Pitfall 3 (stdout pollution) — stdout discipline established here; Pitfall 8 (server starts in CLI mode) — mode dispatch before DB open; Pitfall 11 (process.exit truncates) — use `process.exitCode` pattern from day one; Pitfall 14 (date validation) — validate before querying
**Research flag:** Standard CLI patterns, no additional research needed.

### Phase 3: MCP Server

**Rationale:** MCP is the highest-complexity phase (new dependency, HTTP transport plumbing, session state management). Building it after services and CLI means tool implementations are thin wrappers over already-validated service functions. Most MCP pitfalls must be addressed in setup, before tools are defined.
**Delivers:** `/mcp` HTTP endpoint on the existing Fastify server; `get_day_summary`, `get_sessions`, `trigger_import`, `get_session_messages` tools; `mcp` mode in `bin/cli.js`
**Uses:** `@modelcontextprotocol/sdk@1.28.0` + `zod` (new dependencies); `src/services/` from Phase 1
**Implements:** `src/mcp/` directory; `mcpPlugin` Fastify registration; `Map<sessionId, transport>` session management; Origin header validation
**Avoids:** Pitfall 2 (SDK doesn't manage sessions) — implement session Map upfront; Pitfall 4 (zod version mismatch) — pin SDK version, add zod explicitly; Pitfall 5 (DELETE handler missing) — register all three HTTP methods; Pitfall 6 (SPA catch-all returns HTML) — guard by Accept header; Pitfall 9 (Origin validation) — add preHandler on `/mcp`; Pitfall 13 (SDK import paths) — pin version
**Research flag:** MCP SDK HTTP transport details are MEDIUM confidence — the `handleRequest(req.raw, res.raw, body)` signature and session Map pattern are verified from third-party sources but not from a live SDK install. Build time to verify and adjust the actual SDK API before writing tool definitions.

### Phase Ordering Rationale

- Services before CLI and MCP: both phases depend on service functions; building out of order forces duplication or rework
- CLI before MCP: CLI validates the service interface with no external dependencies before MCP protocol complexity is added
- Route refactor in Phase 1, not "later": the service extraction modifies existing working code; doing it first makes regression isolation clean
- MCP setup tasks (session Map, Origin validation, DELETE handler) are Phase 3 prerequisites, not optional — do them before writing the first tool definition

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (MCP Server):** MCP SDK transport API is MEDIUM confidence — `handleRequest` signature, session Map lifecycle, and the exact Zod version required by SDK v1.28.0 should be verified against the actual package at install time; allow iteration time in phase planning

Phases with standard patterns (skip research-phase):
- **Phase 1 (Service Extraction):** Pure in-codebase refactor, no external API surface
- **Phase 2 (CLI Subcommands):** commander is well-documented; stdout/stderr discipline is established Node.js convention

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Both new package versions verified against live npm registry 2026-03-25; ESM compatibility confirmed via package exports inspection |
| Features | HIGH | Based on direct codebase analysis of existing routes + official MCP tool specification; I/O contracts derived from what the web UI already computes |
| Architecture | HIGH | Existing codebase read directly; service extraction is a well-understood refactor; MCP integration pattern verified via fastify-mcp source and course material; `reply.hijack()` pattern already in codebase |
| Pitfalls | HIGH | Critical pitfalls sourced from official SQLite docs, official MCP spec, and direct codebase reading; session management and SDK transport API details rated MEDIUM |

**Overall confidence:** HIGH

### Gaps to Address

- **MCP SDK exact Zod peer dep version:** SDK v1.28.0 requires `zod >= 3.25 || ^4.0` but the import path for Zod v4 changed between versions. Verify with `npm install` output before writing tool schemas — resolve during Phase 3 dependency setup, not during planning.
- **Stateless vs stateful transport baseline:** STACK.md recommends stateless (simpler, no session cleanup); ARCHITECTURE.md recommends stateful as baseline (enables import progress streaming). Resolution: start stateless, upgrade to stateful only if `trigger_import` needs progress streaming. Per FEATURES.md, the agent workflow does not require streaming — synchronous result is sufficient.
- **`reply.hijack()` interaction with Fastify 5 on GET (SSE channel):** The existing import route uses hijack on POST correctly. MCP adds GET and DELETE to the same path. Verify that hijacking GET for SSE does not conflict with Fastify 5's response lifecycle during Phase 3 implementation.
- **MCP subcommand transport type (stdio vs HTTP):** FEATURES.md recommends stdio first for simplicity; STACK.md and ARCHITECTURE.md assume HTTP on Fastify. The right call for this codebase is HTTP (no separate process, works alongside running web server), but confirm the `mcp` subcommand UX during Phase 3 planning — specifically whether it starts the full Fastify server or a standalone stdio listener.

---

## Sources

### Primary (HIGH confidence)
- npm registry — `npm view @modelcontextprotocol/sdk version` → 1.28.0; `npm view commander version` → 14.0.3 (live, 2026-03-25)
- MCP Specification (Streamable HTTP transport, 2025-03-26) — official spec for POST/GET/DELETE route pattern, Origin validation requirement, `mcp-session-id` header semantics
- MCP TypeScript SDK GitHub docs — `McpServer`, `StreamableHTTPServerTransport`, `registerTool()` API
- SQLite WAL + `busy_timeout` documentation — concurrent write behavior, PRAGMA recommendations
- Direct codebase read — `bin/cli.js`, `src/server/index.js`, `src/server/routes/*.js`, `src/importer/index.js`, `src/db/index.js`, `package.json`

### Secondary (MEDIUM confidence)
- fastify-mcp plugin (haroldadmin/fastify-mcp v2.1.0) — `request.raw`/`reply.raw` pattern, session Map lifecycle
- MCP Streamable HTTP course material — `handleRequest(req, res, body)` signature, `mcp-session-id` header usage
- Node.js stdout buffering reference — `process.exit()` truncation behavior in pipes
- CLI best practices (clig.dev) — stdout/stderr separation conventions
- Harvest MCP Server reference — real-world time-tracking MCP tool naming and structure

### Tertiary (LOW confidence)
- MCP SDK v2 status — pre-alpha on main branch, v1.x production-recommended (cross-referenced with README; v2 may ship during or after development of this milestone)

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
