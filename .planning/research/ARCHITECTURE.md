# Architecture Patterns: MCP Server + CLI Subcommands

**Domain:** Adding MCP server and CLI subcommands to existing Node.js/Fastify/SQLite app
**Researched:** 2026-03-25
**Confidence:** HIGH (codebase read directly, MCP SDK patterns verified via official docs)

---

## Existing Architecture (as-is)

```
bin/cli.js
  ├── version check (inline, before any imports)
  ├── --debug-import flag handler → exit
  ├── openDatabase()
  ├── createServer(db, { migrated })      ← Fastify factory
  ├── fastify.listen(port)
  ├── spawn browser
  └── SIGINT/SIGTERM handlers

src/server/index.js  (createServer)
  ├── registers timelineRoute(db)
  ├── registers projectsRoute(db)
  ├── registers importRoute(db)
  ├── registers messagesRoute(db)
  ├── registers sessionsRoute(db)
  └── registers @fastify/static (dist/) + catch-all

src/importer/index.js  (importAll)
  └── standalone async function, db + options → stats object
      supports onProgress callback (currently used by SSE route)
```

All query logic currently lives inline inside Fastify route functions. No shared service layer exists yet — routes prepare statements directly against `db` and compute results in-place.

---

## Target Architecture (to-be)

Three execution modes share one codebase, one database, and one set of query logic:

```
bin/cli.js
  ├── version check (unchanged)
  ├── parseArgs() — dispatch to mode
  │
  ├── MODE: web server (default, no subcommand)
  │     openDatabase() → createServer(db) → listen → open browser
  │
  ├── MODE: cli subcommand (summary | sessions | import)
  │     openDatabase() → runCommand(subcommand, db, args) → print JSON → exit
  │
  └── MODE: mcp server (--mcp or mcp subcommand)
        openDatabase() → createServer(db, { mcp: true }) → listen
        (no browser, prints mcp endpoint URL)
```

---

## Component Breakdown

### 1. bin/cli.js — Mode Dispatch

**Status:** Modified (significantly)

The current flat structure expands into a dispatcher that reads `process.argv` before any server/DB work. The version check stays at the top (before imports). After that, a mode selector runs:

```
const args = parseArgs(process.argv.slice(2))
// args.subcommand: undefined | 'summary' | 'sessions' | 'import' | 'mcp'
// args.flags: { date, format, maxAgeDays, port, debug, ... }
```

Three branches follow:
- `if (args.subcommand is CLI command)` → CLI mode
- `if (args.subcommand === 'mcp')` → MCP server mode
- `else` → web server mode (current behavior)

**Design note:** Avoid pulling in a CLI framework (commander, yargs) as a runtime dependency. The current codebase uses `process.argv.indexOf()` inline, which scales fine for a small fixed set of subcommands. A hand-rolled parser or a thin wrapper stays zero-dependency. If the command surface grows beyond ~8 subcommands, revisit commander (lightweight, ESM-compatible, zero deps of its own in v12+).

---

### 2. src/services/ — Data Service Layer (NEW)

**Status:** New directory

The key architectural insight: route handlers, CLI commands, and MCP tools all need the same queries. Instead of duplicating SQL or coupling MCP tools to Fastify internals, extract query logic into plain functions that accept `db` and return plain JS objects.

```
src/services/
  timeline.js      getTimeline(db, { date, idleThresholdMin }) → { projects, workingTimeMs, ... }
  projects.js      getProjects(db) → [{ projectId, projectPath, displayName, lastImportAt }]
  sessions.js      getSession(db, sessionId) → session | null
                   getSessionMessages(db, sessionId) → messages[]
                   updateSession(db, sessionId, { userLabel, userTicket }) → ok
  import.js        runImport(db, { maxAgeDays, onProgress }) → stats
```

These services extract the existing SQL and computation from the Fastify route files. The route files become thin wrappers:

```js
// Before: inline in timelineRoute handler
fastify.get('/api/timeline', async (request, reply) => {
  const stmt = db.prepare(`SELECT ...`);
  // 200 lines of SQL + computation
});

// After: route delegates to service
fastify.get('/api/timeline', async (request, reply) => {
  return getTimeline(db, { date: request.query.date, idleThresholdMin: ... });
});
```

**Why this order matters:** Extract services BEFORE building CLI commands or MCP tools. Both depend on services. Building services first prevents the CLI and MCP layers from reimplementing queries independently.

The existing `computeWorkingTime`, `computeIdleGaps`, `computeForkSegments`, and the large SQL query in `timeline.js` migrate to `src/services/timeline.js`. The existing Fastify route files are refactored to call the services.

---

### 3. src/cli/ — CLI Subcommands (NEW)

**Status:** New directory

```
src/cli/
  index.js         runCommand(subcommand, db, args) → void (writes to stdout, exits)
  commands/
    summary.js     formatSummary(data) — human or JSON output
    sessions.js    formatSessions(data) — human or JSON output
    import.js      runImportCommand(db, args) — progress to stderr, result to stdout
```

Each command:
1. Calls the appropriate service function
2. Formats output (default: JSON to stdout; optionally human-readable with `--format=human`)
3. Exits cleanly with code 0 (or 1 on error)

No long-running process. No Fastify. No browser.

Example invocation patterns:
```
cctimereporter summary --date 2026-03-25
cctimereporter sessions --date 2026-03-25 --format json
cctimereporter import --max-age-days 7
```

---

### 4. src/mcp/ — MCP Server (NEW)

**Status:** New directory

```
src/mcp/
  index.js         createMcpServer(db) → McpServer instance with tools registered
  tools/
    get-timeline.js
    get-projects.js
    run-import.js
    get-session.js
```

Each tool calls a service function. The MCP server is created separately from Fastify and registered as an endpoint on the Fastify instance.

---

### 5. src/server/index.js — MCP Endpoint Registration (Modified)

**Status:** Modified

The Fastify server factory gains an `mcp` option. When enabled, it registers the MCP HTTP endpoint alongside existing API routes:

```js
export function createServer(db, options = {}) {
  const { migrated = false, mcp = false } = options;
  const app = Fastify({ logger: false });

  // existing routes (unchanged)
  app.register(timelineRoute, { db, migrated });
  // ...

  if (mcp) {
    app.register(mcpPlugin, { db });
  }

  // static serving only in web mode
  if (!options.noStatic) {
    app.register(fastifyStatic, { root: distPath, wildcard: false });
    app.setNotFoundHandler(...);
  }

  return app;
}
```

The MCP plugin (`src/mcp/fastify-plugin.js`) registers a POST + GET + DELETE route at `/mcp`:

```js
// src/mcp/fastify-plugin.js
export async function mcpPlugin(fastify, { db }) {
  const mcpServer = createMcpServer(db);
  const transports = new Map(); // sessionId → StreamableHTTPServerTransport

  fastify.post('/mcp', async (request, reply) => {
    // create or retrieve transport by mcp-session-id header
    // call reply.hijack() then transport.handleRequest(request.raw, reply.raw, request.body)
    reply.hijack();
    // ... transport setup and handleRequest
  });

  fastify.get('/mcp', async (request, reply) => {
    // SSE stream from server to client
    reply.hijack();
    const transport = transports.get(request.headers['mcp-session-id']);
    await transport?.handleRequest(request.raw, reply.raw);
  });

  fastify.delete('/mcp', async (request, reply) => {
    // Session teardown
    const transport = transports.get(request.headers['mcp-session-id']);
    await transport?.close();
    transports.delete(request.headers['mcp-session-id']);
    reply.send({ ok: true });
  });
}
```

**Note on reply.hijack():** Fastify's `reply.hijack()` is already used in the existing SSE import progress route (`src/server/routes/import.js`). It gives direct control of `reply.raw` (Node.js ServerResponse). The MCP SDK's `transport.handleRequest(req.raw, res.raw, body)` follows the same pattern — it expects Node.js `IncomingMessage` and `ServerResponse`, not Fastify's wrapped objects. The existing codebase already demonstrates this technique correctly.

---

## MCP SDK Integration

**Package:** `@modelcontextprotocol/sdk` (stable v1.x as of research date; v2 is pre-alpha)
**Import path for HTTP transport:** `@modelcontextprotocol/sdk/server/streamableHttp.js`
**Import path for server:** `@modelcontextprotocol/sdk/server/mcp.js`
**Import path for type guards:** `@modelcontextprotocol/sdk/types.js`

Tool registration pattern (MEDIUM confidence — verified from course material and search results, not from running install):

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const server = new McpServer({ name: 'cctimereporter', version: '0.7.0' });

server.registerTool('get-timeline', {
  description: 'Get sessions grouped by project for a date',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
    idleThresholdMin: z.number().optional(),
  }),
}, async ({ date, idleThresholdMin }) => {
  const result = await getTimeline(db, { date, idleThresholdMin });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

**zod dependency:** The MCP SDK requires zod for inputSchema definitions. Add `zod` explicitly to `package.json` dependencies. Zod v3.x is the expected version range for MCP SDK v1.x.

**DNS rebinding protection:** The MCP SDK has an `enableDnsRebindingProtection` transport option. Since cctimereporter already binds exclusively to `127.0.0.1` (enforced in the existing `fastify.listen` call), the risk is mitigated at the network level. Match the current web server posture and document it.

**Stateless vs stateful sessions:** For read-only tools (get-timeline, get-projects, get-session), stateless mode (`sessionIdGenerator: undefined`) is simpler. For run-import (which has progress), stateful sessions with a `sessionIdGenerator: () => randomUUID()` allow the client to receive streamed progress updates via the GET SSE channel. Implement stateful as the baseline to support both patterns.

---

## File Layout After Migration

```
bin/cli.js                           MODIFIED: mode dispatch added
src/
  db/                                UNCHANGED
  importer/                          UNCHANGED
  utils/                             UNCHANGED
  server/
    index.js                         MODIFIED: mcp option, conditional static serving
    routes/
      timeline.js                    MODIFIED: delegates computation to service
      projects.js                    MODIFIED: delegates to service
      import.js                      MODIFIED: delegates to service
      messages.js                    MODIFIED: delegates to service
      sessions.js                    MODIFIED: delegates to service
  services/                          NEW
    timeline.js                      extracted from routes/timeline.js
    projects.js                      extracted from routes/projects.js
    sessions.js                      extracted from routes/sessions.js + messages.js
    import.js                        thin wrapper around importer/index.js importAll
  cli/                               NEW
    index.js                         runCommand dispatcher
    commands/
      summary.js
      sessions.js
      import.js
  mcp/                               NEW
    index.js                         createMcpServer(db)
    fastify-plugin.js                Fastify route registration for /mcp
    tools/
      get-timeline.js
      get-projects.js
      run-import.js
      get-session.js
  client/                            UNCHANGED
```

**package.json changes:**
- Add `@modelcontextprotocol/sdk` to `dependencies`
- Add `zod` to `dependencies`
- Add `src/services`, `src/cli`, and `src/mcp` to the `files` array (existing gotcha: forgetting `files` causes npm publish to omit new directories)

---

## Build Order

Build in this sequence to avoid blocked dependencies:

**Phase A: Service Layer Extraction**
- Extract `src/services/timeline.js` from `src/server/routes/timeline.js`
- Extract `src/services/projects.js` from `src/server/routes/projects.js`
- Extract `src/services/sessions.js` from `src/server/routes/sessions.js` + `messages.js`
- Refactor route handlers to call services
- All existing API behavior unchanged — this is a pure refactor

Rationale: Both CLI commands and MCP tools depend on services. Building services first means neither the CLI nor MCP phases are blocked on shared query logic. The route refactor is the highest-risk step (touching existing working code) and should happen first, making it easy to isolate any regressions.

**Phase B: CLI Subcommands**
- Hand-rolled arg parser in `bin/cli.js` (extend existing `process.argv` scanning pattern)
- `src/cli/index.js` dispatcher
- Individual command modules calling services
- Zero new runtime dependencies

Rationale: CLI mode has no external dependencies and validates that the service layer works correctly as a standalone query interface. Easily tested by running the binary directly.

**Phase C: MCP Server**
- Add `@modelcontextprotocol/sdk` + `zod` to package.json
- `src/mcp/index.js` with tool registrations
- `src/mcp/fastify-plugin.js` with HTTP transport routing
- Extend `createServer()` with `mcp` option
- Add `mcp` mode dispatch to `bin/cli.js`

Rationale: MCP is the most complex phase (new dependency, HTTP transport plumbing, session management). Building it after services and CLI means tool implementations are thin wrappers over already-validated service functions.

---

## Anti-Patterns to Avoid

**Do not put SQL in MCP tool handlers or CLI commands.** All data access goes through `src/services/`. If a new query is needed for MCP or CLI, the service layer gains a new function.

**Do not share Fastify route plugins with MCP.** The existing API routes serve the web UI. MCP tools expose a different surface (tools, not HTTP endpoints). Reuse the service layer, not the route registration functions.

**Do not use `reply.raw` outside of `reply.hijack()`.** The existing import SSE route demonstrates the correct pattern: call `reply.hijack()` first, then write directly to `reply.raw`. The MCP transport plugin must follow the same pattern.

**Do not run a separate HTTP server for MCP.** The MCP endpoint runs on the same Fastify instance as the API routes. This avoids managing two HTTP servers and two ports.

**Do not add commander or yargs as a runtime dependency** for a small fixed CLI surface. The current `process.argv.indexOf()` pattern is already established in this codebase and scales to a handful of subcommands without external deps.

---

## Data Flow

```
process.argv → parseArgs()
                   │
          ┌────────┴──────────┬──────────────────┐
          │                   │                  │
    web mode             cli mode           mcp mode
          │                   │                  │
    openDatabase()      openDatabase()      openDatabase()
          │                   │                  │
    createServer(db)   runCommand(db, args)  createServer(db, {mcp:true})
          │                   │                  │
    fastify.listen()   services/            fastify.listen()
          │             return data              │
    /api/* routes            │             /api/* routes
    + Vue SPA           stdout JSON         + /mcp endpoint
                             │
                           exit(0)

All three modes share:
  src/services/ ← routes/      (web: HTTP triggers service)
  src/services/ ← commands/    (cli: direct call → stdout)
  src/services/ ← mcp/tools/   (mcp: tool call triggers service)
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Existing architecture | HIGH | Source read directly |
| Service layer extraction | HIGH | Standard refactor, codebase is clean and well-structured |
| CLI mode dispatch | HIGH | Trivial extension of existing argv scanning pattern |
| MCP SDK HTTP transport API | MEDIUM | handleRequest signature and route pattern verified via course material and GitHub search; import paths consistent across sources but not verified by installing the package |
| zod as MCP SDK dependency | MEDIUM | Consistently referenced in SDK docs and examples; exact version constraint not verified |
| reply.hijack() for MCP | HIGH | Pattern already demonstrated in this codebase's import SSE route |
| MCP session management | MEDIUM | Stateful vs stateless trade-off understood; specific API details may need adjustment on SDK install |

---

## Sources

- Codebase read directly: `bin/cli.js`, `src/server/index.js`, `src/server/routes/*.js`, `src/importer/index.js`, `package.json`
- [MCP TypeScript SDK — GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — StreamableHTTPServerTransport exists at `@modelcontextprotocol/sdk/server/streamableHttp.js`
- [MCP Streamable HTTP transport course example](https://mcp.holt.courses/lessons/sses-and-streaming-html/streamable-http) — verified handleRequest(req, res, body) signature, POST/GET/DELETE route pattern, mcp-session-id header, session management map pattern
- [MCP transport specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — Streamable HTTP introduced 2025-03-26, replaces SSE transport
- [fastify-mcp plugin](https://github.com/haroldadmin/fastify-mcp) — reviewed for patterns but not recommended for adoption (thin wrapper around same SDK, less control)
