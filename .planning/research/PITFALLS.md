# Domain Pitfalls: MCP Server + CLI Subcommands

**Domain:** Adding MCP HTTP transport and CLI subcommands to an existing Node.js/Fastify npx tool
**Researched:** 2026-03-25
**Scope:** Specific to the cctimereporter codebase (v0.7.0)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken npx distribution, or silent protocol failures.

---

### Pitfall 1: The `importRunning` Guard Only Protects Within a Single Process

**What goes wrong:** The current `importRunning` flag in `src/server/routes/import.js` is a module-level boolean. It prevents two simultaneous imports within the same process. But when a CLI subcommand (`cctimereporter import`) runs alongside an already-running web server (`cctimereporter`), there are now TWO processes, each with their own `importRunning` flag. Both can run `importAll()` concurrently against the same SQLite database.

**Why it happens:** The guard was designed to prevent the frontend from double-clicking the import button. It was never designed for cross-process coordination.

**Consequences:**
- Two import processes write to the same sessions/messages tables concurrently.
- SQLite WAL mode allows one writer at a time. The second writer will get SQLITE_BUSY errors and fail silently (the importer's per-file try/catch swallows these as "import failed for file").
- Data integrity is not violated (SQLite serializes writes) but sessions may be partially imported or stamped with incorrect sizes in import_log, causing them to be skipped on subsequent runs.

**Warning signs:** Import returns fewer files than expected; sessions appear missing until a forced re-import.

**Prevention:** Before triggering any write operation from a CLI subcommand, set a busy_timeout on the database connection (`PRAGMA busy_timeout = 5000`) so the second writer retries rather than fails immediately. Also: document in CLI help that running `import` while the server is active is safe but serialized.

**Phase to address:** The CLI import subcommand phase. Add `PRAGMA busy_timeout = 5000` in `openDatabase()` as a universal baseline before shipping CLI subcommands.

---

### Pitfall 2: MCP Session Management Is Not Provided by the SDK — You Own It

**What goes wrong:** The official `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport` does not manage sessions across requests. Each POST to the MCP endpoint that creates a new transport instance is a fresh session. If you add a route that does `new StreamableHTTPServerTransport(...)` per request without a session map, every request from the same MCP client starts a new uninitialized session. The client sends `mcp-session-id` headers expecting session continuity; the server ignores them and creates a new transport.

**Why it happens:** The SDK documentation shows stateless mode prominently in quick-start examples. Developers build that, deploy it, then find that clients which expect sessions (like Claude Code's MCP client) cannot maintain tool state across requests.

**Consequences:** Tools that require the MCP initialize handshake to complete before use will fail. The client must re-initialize on every request. This manifests as "MCP server not initialized" errors on the client side.

**Warning signs:** Client logs show repeated `InitializeRequest` → `InitializeResponse` cycles. Each tool call works in isolation but shared state (if any) is lost.

**Prevention:** Use a `Map<sessionId, StreamableHTTPServerTransport>` in the route handler. On POST, check for `mcp-session-id` header first; create a new session only if the header is absent or unknown. Destroy transport instances when a DELETE request arrives or when the session map entry reaches an age limit. The `fastify-mcp` or `@getlarge/fastify-mcp` plugins handle this bookkeeping — prefer one of them over hand-rolling it.

**Phase to address:** MCP route implementation phase, before any tool definitions are written.

---

### Pitfall 3: stdout Pollution Breaks JSON CLI Output and MCP stdio Compatibility

**What goes wrong:** `bin/cli.js` currently calls `process.stdout.write()` to print the server URL and status. `src/importer/index.js` calls `process.stderr.write()` for verbose output. However, code paths reached by the new CLI subcommands may inadvertently call `console.log()`, `process.stdout.write()`, or even Fastify's logger if it gets enabled.

For subcommands that output JSON (`cctimereporter sessions --json`), any non-JSON line on stdout corrupts the output for any tool that pipes it: `cctimereporter sessions --json | jq .` will fail to parse.

For an MCP stdio transport (if ever added), stdout is the protocol channel. Any diagnostic message written to stdout would corrupt the JSON-RPC stream and crash the MCP client.

**Why it happens:** The existing code was written for a single mode (web server). There is no stdout discipline because a web server doesn't need it — the browser is the consumer, not stdout.

**Consequences:** Scripted consumers break silently. The bug can be hard to find because the pollution may only happen in error paths.

**Warning signs:** `jq` fails on CLI JSON output; intermittent "unexpected token" errors when piping.

**Prevention:**
1. Create a mode flag at startup (`SERVER_MODE`, `CLI_MODE`) and guard all diagnostic stdout writes.
2. Any diagnostic output in CLI mode goes to stderr exclusively.
3. JSON output (the only stdout content in CLI mode) goes to stdout as a single `process.stdout.write(JSON.stringify(...) + '\n')` call followed by `process.exitCode = 0`.
4. Do NOT call `process.exit()` immediately after a write — Node.js stdout writes are buffered and `process.exit()` truncates unflushed buffers. Use `process.exitCode` + let the event loop drain.

**Phase to address:** CLI subcommand routing phase. Establish the stdout discipline contract as the very first thing before any subcommand is implemented.

---

### Pitfall 4: Adding `@modelcontextprotocol/sdk` Adds `zod` as a Dependency

**What goes wrong:** The `@modelcontextprotocol/sdk` package has a required peer dependency on `zod` for schema validation of tool parameters. `zod` itself is ~50KB gzipped but adds to the install footprint. More importantly, the MCP SDK is moving fast (it was at v1.28.0 at research time). The zod peer dependency version requirements have changed across SDK versions — some versions require `zod >= 3.25`, others import from `zod/v4`.

**Why it happens:** The MCP SDK uses zod to validate all tool input schemas at runtime. This is not optional.

**Consequences:**
- First-time `npx cctimereporter` users will download `@modelcontextprotocol/sdk` + `zod` on every cold start (if not cached).
- Version mismatches between SDK and zod can cause runtime import errors that only surface when a tool is called, not at startup.

**Warning signs:** `Cannot find module 'zod/v4'` at runtime; `npm ls zod` shows two versions.

**Prevention:**
1. Add both `@modelcontextprotocol/sdk` and `zod` to `dependencies` explicitly (not just as peer deps).
2. Pin to a specific SDK version in `package.json` rather than using `^` until the SDK stabilizes.
3. Check SDK release notes before updating — zod import paths changed between major versions.
4. Consider whether MCP tools need zod schemas at all vs. returning plain JS objects that the SDK wraps.

**Phase to address:** Dependency setup phase, before writing any MCP tool code.

---

### Pitfall 5: MCP Endpoint Path Conflicts with the SPA Catch-All

**What goes wrong:** `src/server/index.js` uses a catch-all `setNotFoundHandler` that serves `index.html` for any unmatched route. This is standard SPA behavior. If the MCP endpoint is registered as `/mcp`, Fastify routes are evaluated before the catch-all, so `/mcp` should work.

BUT: the MCP HTTP spec requires the endpoint to handle POST, GET, and DELETE. The catch-all `setNotFoundHandler` only handles routes that matched no registered handler. If the MCP plugin registers only POST and GET on `/mcp`, a DELETE to `/mcp` falls through to the catch-all and returns HTML instead of a proper 405 or 404.

**Why it happens:** The SPA catch-all was designed for the case where a user navigates directly to `/timeline`. It does not know about MCP session termination semantics.

**Consequences:** MCP clients that send `DELETE /mcp` to terminate a session receive an HTML 200 response (index.html). The client may interpret this as success (status 200) and not retry, leaving the server with a dangling session in memory that is never cleaned up.

**Warning signs:** Memory leak in session map; sessions accumulate without bound over a day of MCP usage.

**Prevention:** Register an explicit DELETE handler on the MCP endpoint path that returns 200 (session terminated) or 405 (sessions not supported). Do not rely on the catch-all to handle this correctly.

**Phase to address:** MCP route integration phase.

---

### Pitfall 6: The SPA catch-all Returns HTML for MCP Clients That Probe the Wrong URL

**What goes wrong:** MCP clients (including Claude Code) probe a configured URL with a POST `InitializeRequest`. If the user misconfigures the URL (e.g., uses `http://localhost:3847` instead of `http://localhost:3847/mcp`), the request hits the SPA catch-all, which returns `index.html` with Content-Type `text/html` and status 200. The MCP client sees status 200 but cannot parse the HTML body as JSON-RPC and reports an unhelpful error like "JSON parse error" rather than "wrong URL."

**Why it happens:** The SPA catch-all is unconditional.

**Consequences:** Difficult-to-debug misconfiguration. Users think the MCP server is broken when the URL is just wrong.

**Prevention:** The catch-all should check if the request has `Accept: application/json` or `Accept: text/event-stream` (which MCP clients send per spec) and return a JSON error for those instead of HTML. This is a small guard but saves significant debugging time.

**Phase to address:** MCP route integration phase.

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt but are recoverable.

---

### Pitfall 7: Subcommand Argument Parsing Grows Into an Ad-Hoc Mess

**What goes wrong:** `bin/cli.js` already has an ad-hoc argument parser: it scans `process.argv` directly for `--debug-import`. Adding more subcommands using the same pattern (manual `process.argv.indexOf(...)` checks) creates code that is hard to maintain and does not auto-generate help output.

**Why it happens:** The original `--debug-import` flag was a quick addition. It worked because there was only one flag. As subcommands multiply (import, sessions, status, mcp), the ad-hoc approach requires increasingly complex argument parsing logic with no consistent help format.

**Consequences:** Users get no `--help` output; edge cases (e.g., `cctimereporter import --max-age-days 7`) require careful manual index parsing; the routing logic in `bin/cli.js` becomes a dense chain of if/else.

**Prevention:** Before adding any subcommand, add `commander` to `dependencies`. Commander is 56KB unpacked, has zero dependencies, and handles subcommands, default commands, help generation, and argument types. The existing `--debug-import` flag can be migrated in the same commit that adds commander.

Do not use `yargs` (large, many dependencies) or `meow` (ESM only, extra setup). Commander is the right size for this tool.

**Phase to address:** CLI routing phase, as the first step before any subcommand is implemented.

---

### Pitfall 8: The Existing Port Fallback Loop Starts a Server Even in CLI Mode

**What goes wrong:** `bin/cli.js` currently has no mode routing — it always runs the port-fallback loop and starts Fastify. When subcommands are added, the mode must be determined BEFORE opening the database or starting any server. The current structure is:

```
version check → import db → create server → listen loop → browser open
```

The new structure must be:

```
version check → parse argv → if CLI mode: open db → run command → exit
               → if server mode: open db → create server → listen loop → browser open
```

If the mode check is added AFTER `createServer()`, CLI subcommands still instantiate the full Fastify instance, register all routes, and potentially start listening before the routing logic fires.

**Why it happens:** The mode routing refactor is easy to get wrong: it requires moving the `openDatabase()` call and all imports to happen AFTER the mode decision, not before.

**Consequences:** CLI commands have server startup latency. On a slow machine, `cctimereporter sessions` takes 2+ seconds because it started and stopped Fastify.

**Prevention:** Put mode detection (argv parsing) as the absolute first thing after the Node version check, before any database or server code runs. Use dynamic `import()` per mode branch rather than static imports at the top of `bin/cli.js`.

**Phase to address:** CLI routing phase.

---

### Pitfall 9: Origin Header Validation Is Required by MCP Spec

**What goes wrong:** The MCP spec (Streamable HTTP transport, 2025-03-26) states:

> Servers MUST validate the Origin header on all incoming connections to prevent DNS rebinding attacks.

Since cctimereporter binds to `127.0.0.1` only, the primary risk is a malicious web page on `localhost` making cross-origin requests to the MCP endpoint. Without Origin validation, any web page the user visits can POST to `http://localhost:3847/mcp` and invoke MCP tools as if it were the MCP client.

**Why it happens:** Origin validation is not something Fastify does by default. It requires explicit middleware.

**Consequences:** A malicious page could invoke `import` or read session data via MCP tools. The existing API routes have the same vulnerability (no Origin checks on the REST API), but MCP tool invocation via a browser-triggered request is a new attack surface.

**Warning signs:** No validation = silent security gap. Won't cause functional issues during development.

**Prevention:** Add a Fastify `preHandler` hook on the `/mcp` route that validates `Origin` header is either absent (non-browser clients don't send it) or matches `http://localhost:*` / `http://127.0.0.1:*`. Reject with 403 if a cross-origin browser request is detected. The `fastify-mcp` plugins include this protection; hand-rolled implementations must add it explicitly.

**Phase to address:** MCP route implementation phase, before any tools are defined.

---

### Pitfall 10: MCP Tools That Trigger Import Must Respect the Existing Concurrency Guard

**What goes wrong:** The web server's import routes use a module-level `importRunning` boolean to prevent concurrent imports. If an MCP tool exposes an `import` capability, it runs in the same process as the web server but may be in a different module scope depending on how the MCP server is wired. If the MCP import tool calls `importAll()` directly without checking/setting `importRunning`, it bypasses the guard.

**Why it happens:** The `importRunning` guard is scoped to `src/server/routes/import.js`. Code in `src/server/routes/mcp.js` does not automatically share that state unless it imports from the same module.

**Consequences:** A user clicks the web UI import button while an MCP-triggered import is running. Both proceed simultaneously, causing contention on the SQLite database.

**Prevention:** Extract the concurrency guard into a shared singleton module (e.g., `src/server/import-state.js` that exports `{ getImportRunning, setImportRunning }`). Both the REST import routes and the MCP import tool import from this shared module. This is a 5-minute refactor that prevents the bug entirely.

**Phase to address:** CLI import subcommand phase (establish shared state) and MCP tool definition phase (consume it).

---

### Pitfall 11: `process.exit()` After Writing to stdout Loses Bytes

**What goes wrong:** Node.js stdout is synchronous when connected to a terminal but asynchronous when piped. Calling `process.exit()` immediately after a `process.stdout.write()` in a pipe context (e.g., `cctimereporter sessions | jq .`) can truncate the output because the write has not been flushed.

This is a documented Node.js behavior: `process.exit()` does not wait for pending I/O.

**Why it happens:** Developers test CLI output by running it directly in a terminal where stdout is synchronous, then ship it. The bug only manifests in pipes.

**Warning signs:** `cctimereporter sessions | jq .` works but `cctimereporter sessions | jq . | wc -l` gives wrong counts; sporadic parse failures in scripts.

**Prevention:** Never call `process.exit()` directly after stdout writes. Use `process.exitCode = 0` and let the event loop drain naturally. If cleanup is needed, wrap it in a `process.on('beforeExit', ...)` handler.

**Phase to address:** CLI subcommand implementation phase. Establish the pattern in the first subcommand so it propagates correctly.

---

## Minor Pitfalls

Mistakes that cause annoyance but are quickly fixed.

---

### Pitfall 12: `package.json` files Array Must Include New Source Directories

**What goes wrong:** The project already has a documented packaging gotcha (in MEMORY.md): when adding new source directories, they must be added to the `files` array in `package.json`. If MCP tool definitions are placed in a new directory (e.g., `src/mcp/`) that is not in `files`, `npx cctimereporter` will fail with `Cannot find module` for users who install from npm.

**Why it happens:** `dist/` is gitignored but included via `files` + `prepublishOnly`. Other `src/` subdirectories are explicitly listed. New directories are easy to miss.

**Warning signs:** Works in local dev (full source available) but fails for `npx` users (only published files available).

**Prevention:** Immediately after creating any new top-level directory under `src/`, add it to `package.json`'s `files` array in the same commit.

**Phase to address:** Any phase that creates a new source directory.

---

### Pitfall 13: MCP SDK Import Paths Changed Between Major Versions

**What goes wrong:** The `@modelcontextprotocol/sdk` package has moved exports between versions. Code written against v1.0 may use import paths like `@modelcontextprotocol/sdk/server/index.js` that were reorganized in later versions. The SDK was at v1.28.0 at research time and the API is still evolving.

**Why it happens:** The SDK is young and the MCP spec itself was updated in March 2025 (Streamable HTTP replaced the previous HTTP+SSE transport).

**Warning signs:** Import errors that appear only after `npm update`; working examples from blog posts that fail to run.

**Prevention:** Use exact version pinning (`"@modelcontextprotocol/sdk": "1.28.0"` not `"^1.28.0"`) and check the SDK changelog before updating. Test with `npx` cold install after any version change.

**Phase to address:** Dependency setup phase.

---

### Pitfall 14: Date Argument Parsing for CLI Subcommands Is Not Validated

**What goes wrong:** CLI subcommands that query by date (e.g., `cctimereporter sessions --date 2026-03-25`) receive the date as a string. The server-side timeline route validates dates via query parameter handling, but a CLI subcommand that bypasses the HTTP layer and calls the DB query directly may not perform the same validation. An invalid date string passed to an SQLite `WHERE date(timestamp) = ?` comparison silently returns no rows instead of an error.

**Consequences:** `cctimereporter sessions --date yesterday` returns empty results; user assumes there are no sessions.

**Prevention:** Validate date arguments immediately after parsing: check that the string matches `YYYY-MM-DD` and that `new Date(arg)` is a valid date. Return a clear error and exit code 1 before querying.

**Phase to address:** CLI subcommand implementation phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| CLI subcommand routing | Mode detection after server init causes startup latency | Detect mode before `openDatabase()` or `createServer()` |
| CLI subcommand routing | Ad-hoc argv parsing doesn't scale | Add `commander` as first step, migrate `--debug-import` |
| CLI import subcommand | Cross-process `importRunning` guard bypass | Add `PRAGMA busy_timeout = 5000`; document concurrent usage |
| CLI JSON output | `process.exit()` truncates buffered stdout | Use `process.exitCode` + event loop drain |
| MCP route integration | Missing DELETE handler causes HTML response for session termination | Register explicit DELETE on `/mcp` path |
| MCP route integration | SPA catch-all confuses misconfigured MCP clients | Guard catch-all by Accept header |
| MCP route integration | Origin header not validated | Add preHandler on `/mcp` checking Origin |
| MCP session management | SDK does not manage sessions | Use Map<sessionId, transport> or a Fastify-MCP plugin |
| MCP + REST import concurrency | Shared `importRunning` state not shared across modules | Extract to singleton before adding MCP import tool |
| Dependency setup | SDK zod peer dep version mismatch | Pin SDK version; add zod to explicit dependencies |
| New source directories | Files array not updated = broken npx | Update `files` in same commit as new directory |

---

## Sources

- MCP Specification (Streamable HTTP transport): [https://modelcontextprotocol.io/specification/2025-03-26/basic/transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — HIGH confidence (official spec)
- MCP TypeScript SDK docs: [https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — HIGH confidence (official SDK)
- fastify-mcp plugin: [https://github.com/haroldadmin/fastify-mcp](https://github.com/haroldadmin/fastify-mcp) — MEDIUM confidence (community plugin, session management documented)
- Node.js stdout buffering: [https://sxlijin.github.io/2024-10-09-node-stdout-disappearing-bytes](https://sxlijin.github.io/2024-10-09-node-stdout-disappearing-bytes) — MEDIUM confidence (verified against Node.js docs)
- SQLite WAL concurrent writes: [https://sqlite.org/wal.html](https://sqlite.org/wal.html) — HIGH confidence (official SQLite docs)
- SQLite busy_timeout: [https://sqlite.org/pragma.html#pragma_busy_timeout](https://sqlite.org/pragma.html#pragma_busy_timeout) — HIGH confidence (official SQLite docs)
- Direct source reading: `bin/cli.js`, `src/server/index.js`, `src/server/routes/import.js`, `src/importer/index.js`, `src/db/index.js` — HIGH confidence (codebase itself)
