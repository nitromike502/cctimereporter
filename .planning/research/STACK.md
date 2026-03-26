# Technology Stack: MCP Server + CLI Subcommands

**Project:** CC Time Reporter — MCP server and CLI programmatic access milestone
**Researched:** 2026-03-25
**Question:** What stack additions/changes are needed for adding an MCP server (HTTP transport on Fastify) and CLI subcommands to an existing Node.js/Fastify app?

## Verdict

**Two additions are needed.** Add `@modelcontextprotocol/sdk` for the MCP server and `commander` for CLI subcommand parsing. The MCP SDK integrates directly with the existing Fastify 5 server via `request.raw` / `reply.raw`. The CLI subcommands require restructuring `bin/cli.js` to dispatch to a server path or a headless path. No other dependencies are required.

---

## Existing Stack (Do Not Change)

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 22+ (required for `node:sqlite`) |
| Database | node:sqlite (built-in) | — |
| Web server | Fastify | ^5.7.4 |
| Static files | @fastify/static | ^9.0.0 |
| Frontend | Vue 3 + Vite | devDependencies |
| Distribution | npx | — |
| Package type | ESM (`"type": "module"`) | — |

---

## Additions Required

### 1. @modelcontextprotocol/sdk

**Purpose:** MCP server implementation — defines tools, resources, and handles the Streamable HTTP transport protocol.

**Current version:** 1.28.0 (verified via `npm view @modelcontextprotocol/sdk version`, 2026-03-25)

**Install:**
```bash
npm install @modelcontextprotocol/sdk
```

**Why this version:** The SDK README (fetched 2026-03-25) states a stable v2 is anticipated for Q1 2026, but "v1.x remains the recommended version for production use." v2 is pre-alpha on the main branch. Use the current 1.x stable.

**ESM compatibility:** Confirmed — the package has `"type": "module"` and ships dual ESM/CJS builds. This project's `"type": "module"` is fully compatible.

**Peer dependency:** Requires `zod` `^3.25 || ^4.0`. The SDK already bundles its own Zod usage internally; if the project does not use Zod directly, no explicit peer install is needed unless a lint/install warning appears.

**Key imports:**
```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

### 2. commander

**Purpose:** CLI subcommand parsing for `summary --date`, `sessions --date`, `import --days`.

**Current version:** 14.0.3 (verified via `npm view commander version`, 2026-03-25)

**Install:**
```bash
npm install commander
```

**Why commander over alternatives:**

| Library | Verdict | Reason |
|---------|---------|--------|
| commander | **Use this** | Purpose-built for subcommand CLIs (Git/npm style), clean API, no framework opinion, Node.js 20+ required (matches this project), exports `./esm.mjs` for ESM projects |
| Built-in `process.argv` parsing | Reject | `bin/cli.js` already hand-parses `--debug-import` and it's already awkward. Adding subcommands via string matching is maintenance debt. |
| yargs | Reject | Heavier; adds middleware/validation machinery not needed here. Weekly downloads higher but feature excess for 3 subcommands. |
| minimist | Reject | Argument parsing only — no subcommand dispatch, no help generation. Would require manual subcommand routing on top. |

**ESM note:** commander 14.x ships `"type": "commonjs"` as its main entry but exports `./esm.mjs` explicitly. In an ESM project, import from the root: `import { Command } from 'commander'` — Node.js will resolve to the ESM export automatically via the `exports` field in commander's package.json.

---

## Fastify + MCP Integration Pattern

The MCP SDK's `StreamableHTTPServerTransport` accepts Node.js `IncomingMessage` and `ServerResponse` objects. Fastify exposes these as `request.raw` and `reply.raw`.

**Verified pattern** (source: `fastify-mcp` v2.1.0 source inspection, 2026-03-25):

```js
// In a Fastify route handler:
fastify.post('/mcp', async (request, reply) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined  // stateless mode
  });
  const server = createMcpServer();  // returns configured McpServer instance
  await server.connect(transport);
  await transport.handleRequest(request.raw, reply.raw, request.body);
  reply.hijack();  // tell Fastify not to send a response (transport owns the stream)
});
```

**Stateless vs stateful:**

| Mode | Use case | Session storage |
|------|----------|----------------|
| Stateless (`sessionIdGenerator: undefined`) | Simple tools, no streaming notifications | None — fresh transport per request |
| Stateful (UUID generator) | Long-running tools, progress streaming | Map of sessionId → transport instance |

**Recommendation: start stateless.** The use case (summary, sessions, import queries) is request/response with no long-lived server→client push. Stateless mode is simpler and avoids session cleanup edge cases. The `fastify-mcp` library source comments note the SDK's `onclose` event is unreliable for stateful cleanup — avoid stateful until needed.

**Do NOT use the `fastify-mcp` plugin.** The plugin is available (v2.1.0, December 2025), but it adds a `Sessions` class and lifecycle event layer that is unnecessary for stateless mode. Direct use of `StreamableHTTPServerTransport` with `request.raw`/`reply.raw` is 10 lines and has no extra dependency. The plugin exists to manage multi-session state; skip it.

---

## CLI Subcommand Architecture

The current `bin/cli.js` is a single-path script: Node version check → DB open → Fastify start → browser open. Adding subcommands requires a dispatch layer.

**Recommended restructuring:**

```
bin/cli.js  (entry point — dispatch only)
  ├── process.argv[2] === 'summary'  → run summary command (headless)
  ├── process.argv[2] === 'sessions' → run sessions command (headless)
  ├── process.argv[2] === 'import'   → run import command (headless)
  └── (no subcommand)               → start server + open browser (current behavior)
```

Headless commands:
- Open DB
- Run query via existing route logic (extracted to a shared module) or direct SQL
- Write JSON to `process.stdout`
- Exit with code 0 or 1

**Do NOT start Fastify for headless commands.** The DB and query logic are independent of the HTTP server. Starting Fastify just to call a route adds unnecessary startup time and port allocation.

**Do NOT reuse route handlers directly.** Route handlers are coupled to `request`/`reply` Fastify objects. Instead, extract query logic from `src/server/routes/` into thin service modules in `src/services/` that both route handlers and CLI commands can call.

Example refactor:
```
src/services/timeline.js   — getTimeline(db, date, idleThreshold) → array
src/services/sessions.js   — getSessions(db, date) → array
src/server/routes/timeline.js  — thin adapter calling getTimeline()
bin/cli.js summary command     — calls getTimeline(), JSON.stringify to stdout
```

---

## What NOT to Add

| Candidate | Decision | Reason |
|-----------|----------|--------|
| `fastify-mcp` plugin | Skip | Overhead for stateless mode; 10 lines of direct integration is sufficient |
| `@modelcontextprotocol/node` package | Skip | This is the Node.js HTTP wrapper bundled inside the main SDK as of 1.x; not a separate install |
| `zod` (explicit) | Skip unless warned | SDK peer dep, but not needed in project code unless tools have complex input validation |
| `tsx` / TypeScript | Skip | Project is plain JS ESM; no type compilation toolchain warranted |
| `yargs` | Skip | Overcapacity for 3 subcommands |
| `dotenv` | Skip | No environment configuration needed |

---

## Updated Installation

```bash
# MCP server
npm install @modelcontextprotocol/sdk

# CLI subcommand parsing
npm install commander
```

No dev-only additions needed. Both are runtime dependencies (used in the distributed CLI).

---

## Sources

- `npm view @modelcontextprotocol/sdk version` — confirmed 1.28.0 (HIGH confidence, live npm registry)
- `npm view commander version` — confirmed 14.0.3 (HIGH confidence, live npm registry)
- `npm view @modelcontextprotocol/sdk --json` — confirmed ESM `"type": "module"`, exports structure (HIGH confidence)
- `npm view commander --json` — confirmed `"type": "commonjs"` with `./esm.mjs` export (HIGH confidence)
- GitHub: modelcontextprotocol/typescript-sdk docs/server.md (fetched 2026-03-25) — `handleRequest(req, res, body)` pattern (HIGH confidence)
- GitHub: haroldadmin/fastify-mcp v2.1.0 src/streamable-http.ts (fetched 2026-03-25) — `request.raw`/`reply.raw` pattern verified (HIGH confidence)
- WebSearch: "Fastify request.raw reply.raw MCP transport" — confirmed `reply.hijack()` needed after `handleRequest` (MEDIUM confidence, cross-referenced with Fastify docs)
- WebSearch: SDK v2 status — v2 pre-alpha, v1.x production-recommended (MEDIUM confidence, cross-referenced with README)
- Direct code inspection of `bin/cli.js` — current entry point structure (HIGH confidence)
