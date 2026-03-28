# Phase 31: MCP Server - Research

**Researched:** 2026-03-27
**Domain:** @modelcontextprotocol/sdk stdio server, Commander dispatch, service layer integration
**Confidence:** HIGH

## Summary

Phase 31 adds `npx cctimereporter --mcp` as a stdio MCP server exposing 8 tools to agents. The implementation uses `@modelcontextprotocol/sdk` v1.28.0 (latest as of research date). The SDK's high-level `McpServer` class with `StdioServerTransport` is the correct approach. Tool schemas are plain objects of zod schemas (not wrapped in `z.object()`). `zod` v4.x is a required peer dependency — must be added to package.json alongside the SDK.

The SDK API was verified by installing the package and reading source code. The `McpServer.registerTool()` method is the current API (`tool()` is deprecated). Tool handlers are async-capable, return `{ content: [{ type: 'text', text: JSON.stringify(data) }] }` for data responses, and use `{ isError: true, content: [...] }` for errors. The stdio transport does NOT auto-exit when stdin closes — the server must listen to `process.stdin` 'end'/'close' event manually and call `process.exit(0)`.

**Primary recommendation:** Use `McpServer` + `StdioServerTransport`, `registerTool` with plain zod shape objects, handle stdin close with `process.stdin.on('close', () => process.exit(0))`, and integrate `--mcp` as a Commander root option dispatched before `parseAsync`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | 1.28.0 | MCP server + stdio transport | Official Anthropic SDK |
| zod | ^4.3.6 (installed as dep of SDK) | Tool schema validation | Required by SDK, already present in node_modules after SDK install |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander (existing) | ^14.0.3 | --mcp flag dispatch | Already in project |
| node:sqlite (existing) | built-in | DB access for tools | Already in project |
| src/services/* (existing) | — | Business logic for all tools | All 8 tools use service layer |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| McpServer (high-level) | Server (low-level) | Low-level requires manual schema + handler wiring; `McpServer` is the recommended API per SDK docs |
| zod v4 (ships with SDK) | zod v3 | Both work — SDK supports `^3.25 \|\| ^4.0`; v4 is newer, use whichever is installed |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk zod
```

Note: `zod` becomes a direct dependency of cctimereporter, not just a transitive one. The SDK lists `zod` as both a `dependency` and `peerDependency`.

## Architecture Patterns

### Recommended Project Structure
```
src/mcp/
├── server.js          # createMcpServer(db) — McpServer factory, registers all 8 tools
├── tools/
│   ├── query.js       # get_day_summary, get_sessions, get_session_messages, get_dates
│   └── action.js      # trigger_import, start_server, stop_server, server_status
bin/cli.js             # Add --mcp root option that dispatches to MCP mode
```

### Pattern 1: McpServer Factory with registerTool

**What:** Create `McpServer`, call `registerTool(name, config, handler)` for each tool, then `connect(transport)`.
**When to use:** Always — this is the only supported high-level API.

```javascript
// Source: /tmp/mcp-research/node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/progressExample.js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer(
  { name: 'cctimereporter', version: '0.7.0' },
  { capabilities: {} }
);

server.registerTool('get_day_summary', {
  description: 'Get ticket-grouped working time summary for a date.',
  inputSchema: {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format'),
    idle_threshold_min: z.number().int().min(1).max(120).optional().describe('Idle threshold in minutes (default: 10)')
  }
}, async ({ date, idle_threshold_min }) => {
  // ... call service layer
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Exit when stdin closes (client disconnected)
  process.stdin.on('close', () => process.exit(0));
}
main().catch(err => {
  process.exit(1); // Silent — MCP mode cannot write to stderr
});
```

### Pattern 2: Tool Error Response

**What:** Return `{ isError: true, content: [...] }` for business errors (not thrown exceptions). Thrown exceptions are auto-caught by `McpServer` and wrapped as error responses.

```javascript
// Source: McpServer.createToolError() in dist/esm/server/mcp.js
// For ImportConflictError, return error result instead of throwing:
try {
  const result = await runImport(db, { source: 'mcp' });
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...result }) }] };
} catch (err) {
  if (err instanceof ImportConflictError) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: 'already_running', message: err.message }) }]
    };
  }
  throw err; // Re-throw unexpected errors (SDK auto-wraps)
}
```

### Pattern 3: --mcp Commander Dispatch

**What:** Check for `--mcp` flag BEFORE `program.parseAsync()` and branch to MCP mode. Mirrors how `--debug-import` is handled in the existing `cli.js`.

```javascript
// Source: existing bin/cli.js pattern
const mcpIdx = process.argv.indexOf('--mcp');
if (mcpIdx !== -1) {
  const { startMcpServer } = await import('../src/mcp/server.js');
  await startMcpServer(db);
  process.exit(0); // Should not be reached — process.stdin close handles exit
}
```

Alternatively, `--mcp` can be a Commander option/subcommand that calls the same function. The early-exit approach is simpler and consistent with existing `--debug-import` pattern.

### Pattern 4: get_dates Query

**What:** Simple DB query to return distinct dates that have session data. No existing service method — add directly in the tool handler or as a small utility.

```javascript
// Direct DB query — no service abstraction needed for this simple query
const rows = db.prepare(`
  SELECT DISTINCT DATE(first_message_at) AS date
  FROM sessions
  WHERE first_message_at IS NOT NULL
  ORDER BY date DESC
`).all();
return { content: [{ type: 'text', text: JSON.stringify({ dates: rows.map(r => r.date) }) }] };
```

### Pattern 5: start_server (Recommended Approach)

**What:** MCP process checks existing server lock; if running, returns URL. If not running, starts Fastify inline (same process, not spawned subprocess). No blocking — start and return URL immediately.

**Why inline over spawn:** Spawned subprocess is harder to track, coordinate, and test. The existing `serve` command already shows how to start Fastify + claim lock. The MCP process can own the server by starting it in the same process.

```javascript
// Check lock → if running, return URL; if not, start Fastify
const existing = db.prepare('SELECT * FROM process_locks WHERE lock_name = ?').get('server');
if (existing && isProcessAlive(existing.pid)) {
  return { content: [{ type: 'text', text: JSON.stringify({ status: 'running', url: `http://127.0.0.1:${existing.port}` }) }] };
}
// Start inline — load server, listen, claim lock
const { createServer } = await import('./server/index.js');
const fastify = createServer(db, {});
await fastify.listen({ port: 3847, host: '127.0.0.1' });
const port = fastify.server.address().port;
claimLock(db, 'server', process.pid, 'mcp', port);
return { content: [{ type: 'text', text: JSON.stringify({ status: 'started', url: `http://127.0.0.1:${port}` }) }] };
```

### Anti-Patterns to Avoid

- **Writing to stderr:** MCP stdio protocol is JSON-RPC on stdout/stdin only. Any stderr output corrupts the protocol stream from the client's perspective. All error info goes in the tool return value.
- **Using `tool()` instead of `registerTool()`:** `tool()` is deprecated as of SDK source (marked `@deprecated`). Use `registerTool()`.
- **Wrapping inputSchema in `z.object()`:** `inputSchema` takes a plain object `{ field: z.schema() }`, not `z.object({ field: z.schema() })`. The SDK wraps it internally.
- **Not handling stdin close:** The SDK transport does not auto-exit when stdin closes. You must add `process.stdin.on('close', () => process.exit(0))`.
- **Throwing errors for business failures:** MCP tool errors (import conflict, session not found) should return `{ isError: true, content: [...] }`, not throw. Thrown errors are auto-caught by the SDK but produce less structured output.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC framing | Custom stdio parser | StdioServerTransport | Handles newline-delimited JSON, buffer management, backpressure |
| Tool schema validation | Manual arg checking | zod schemas in inputSchema | SDK validates automatically before handler is called |
| Error wrapping | try/catch + format | Return `{ isError: true }` | SDK handles unexpected exceptions; use error return for expected failures |
| Tool list negotiation | Manual capabilities | McpServer handles it | `registerTool()` auto-registers tools capability |

**Key insight:** The MCP SDK handles all protocol concerns. Implementation effort is entirely in the tool handlers (calling service layer, formatting responses).

## Common Pitfalls

### Pitfall 1: zod Not in package.json

**What goes wrong:** After `npm install @modelcontextprotocol/sdk`, `zod` is in node_modules as a transitive dep but not in `package.json`. Importing `from 'zod'` in cctimereporter's own source files works locally but is unreliable in production (npm may prune transitive deps).

**Why it happens:** zod is a peer dependency of the SDK, installed as a transitive dep but not owned by cctimereporter.

**How to avoid:** Always run `npm install @modelcontextprotocol/sdk zod` — add both to `package.json`.

**Warning signs:** Works in dev, breaks after `npm ci` or fresh install.

### Pitfall 2: stderr Output in MCP Mode

**What goes wrong:** Any `console.error()`, `process.stderr.write()`, or Fastify startup messages going to stderr corrupt the MCP protocol from the client's perspective.

**Why it happens:** Existing code and Fastify use stderr for logging. MCP clients parse all stdout/stdin as JSON-RPC.

**How to avoid:** In MCP mode, suppress all stderr. Pass `logger: false` to Fastify. Don't call `console.error()`. Any error info goes into tool responses.

**Warning signs:** Client receives malformed responses; MCP inspector shows parse errors.

### Pitfall 3: Process Keeps Running After Client Disconnect

**What goes wrong:** Agent/client closes its end of the pipe (stdin), but the cctimereporter MCP process continues running indefinitely, holding DB locks.

**Why it happens:** Node.js doesn't exit when stdin closes unless you tell it to. The SDK transport removes its stdin listeners but doesn't call `process.exit`.

**How to avoid:** Add `process.stdin.on('close', () => process.exit(0))` after `server.connect(transport)`. Clean up locks in the exit handler.

**Warning signs:** Multiple orphaned cctimereporter processes visible in `ps`.

### Pitfall 4: DB Lock Leak on MCP Exit

**What goes wrong:** If MCP process starts Fastify inline (for `start_server`), the server lock is held by the MCP process PID. When MCP exits (stdin close), the server also exits, but the lock row stays in the DB if not explicitly released.

**Why it happens:** `process.exit(0)` skips `finally` blocks in async code.

**How to avoid:** Register a `process.on('exit', ...)` handler (synchronous, always runs before exit) to release locks. Use `releaseLock(db, 'server', process.pid)` synchronously.

**Warning signs:** Subsequent `serve` or `--mcp` calls find stale lock, falsely report server running.

### Pitfall 5: McpServer.tool() vs registerTool()

**What goes wrong:** Using the `tool()` method (deprecated as of SDK 1.28.0). The signature parsing for `tool()` is complex and fragile (it supports many overloads). The `registerTool()` API is explicit and config-object based.

**How to avoid:** Always use `server.registerTool(name, { description, inputSchema }, handler)`.

## Code Examples

Verified patterns from official sources (SDK dist/esm/examples):

### Minimal Stdio Server Bootstrap

```javascript
// Source: dist/esm/examples/server/progressExample.js (verified)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'cctimereporter', version: '0.7.0' });

server.registerTool('get_day_summary', {
  description: 'Get working time summary grouped by ticket for a date.',
  inputSchema: {
    date: z.string().describe('Date in YYYY-MM-DD format (e.g. 2026-03-27)'),
    idle_threshold_min: z.number().int().min(1).optional().describe('Idle gap threshold in minutes (default: 10)')
  }
}, async ({ date, idle_threshold_min = 10 }) => {
  const svc = createTimelineService(db);
  const report = svc.getTimelineReport(date, { thresholdMin: idle_threshold_min });
  const enriched = enrichWithFormattedTime(report);
  return { content: [{ type: 'text', text: JSON.stringify(enriched) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

// MANDATORY: exit when client disconnects
process.stdin.on('close', () => {
  releaseLock(db, 'server', process.pid); // clean up any locks this process holds
  db.close();
  process.exit(0);
});
```

### Tool with Error Response (not thrown)

```javascript
// Source: pattern derived from McpServer.createToolError() in dist/esm/server/mcp.js
server.registerTool('trigger_import', {
  description: 'Trigger a data import from Claude Code session files.',
  inputSchema: {
    max_age_days: z.number().int().min(1).max(365).optional().describe('Max age of sessions to import (default: 2)')
  }
}, async ({ max_age_days }) => {
  try {
    const result = await runImport(db, { maxAgeDays: max_age_days, source: 'mcp' });
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...result }) }] };
  } catch (err) {
    if (err instanceof ImportConflictError) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'already_running', message: err.message }) }]
      };
    }
    throw err; // Re-throw unexpected errors — SDK wraps them
  }
});
```

### No-argument Tool

```javascript
// Source: McpServer.registerTool type signature from dist/esm/server/mcp.d.ts
// For tools with no input, omit inputSchema entirely
server.registerTool('server_status', {
  description: 'Check if the cctimereporter web server is running.'
}, async () => {
  const lock = db.prepare('SELECT * FROM process_locks WHERE lock_name = ?').get('server');
  if (lock && isProcessAlive(lock.pid)) {
    return { content: [{ type: 'text', text: JSON.stringify({ running: true, url: `http://127.0.0.1:${lock.port}`, pid: lock.pid }) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify({ running: false }) }] };
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `server.tool()` | `server.registerTool()` | SDK 1.x (recent) | `tool()` is `@deprecated`, use `registerTool()` |
| `Server` low-level class | `McpServer` high-level class | SDK 1.x | SDK docs recommend `McpServer`; `Server` is for advanced use |
| zod v3 only | zod v3 or v4 | SDK 1.28.0 | Both supported via `^3.25 \|\| ^4.0` peer dep |
| SSE transport | StdioServerTransport | N/A | stdio is correct for CLI tool / agent spawning pattern |

**SDK note:** The SDK (as of 1.28.0) ships ESM and CJS. The package uses `"type": "module"` in ESM dist. Since cctimereporter is also `"type": "module"`, use ESM imports: `from '@modelcontextprotocol/sdk/server/mcp.js'`.

## Open Questions

1. **start_server: inline Fastify vs spawned subprocess**
   - What we know: Inline is simpler, no IPC needed, coordination lock already handles port tracking
   - What's unclear: If MCP process exits while Fastify is running inline, web server also stops (might surprise user)
   - Recommendation: Start Fastify inline. Document behavior. Add `--detach` as future enhancement if needed.

2. **stop_server scope: own processes only vs any server**
   - What we know: `process_locks` table tracks PID + source for all server processes
   - What's unclear: Should `stop_server` only kill servers started by THIS mcp instance, or any cctimereporter server?
   - Recommendation: Kill any cctimereporter server process (look up lock, send SIGTERM to that PID). More useful for agents.

3. **Zod version pinning**
   - What we know: SDK peer dep is `"zod": "^3.25 || ^4.0"`. zod v4.3.6 is installed transitively.
   - What's unclear: Whether to pin to v3 or v4 in package.json. The `import { z } from 'zod'` works with both.
   - Recommendation: Add `"zod": "^4.0"` to package.json to align with what's already installed.

## Sources

### Primary (HIGH confidence)
- Installed package source: `/tmp/mcp-research/node_modules/@modelcontextprotocol/sdk/dist/esm/` — direct source inspection
  - `server/mcp.js` — McpServer implementation, registerTool signature
  - `server/stdio.js` — StdioServerTransport: uses process.stdin/stdout, no auto-exit on close
  - `server/index.js` — Server (low-level, deprecated for McpServer use)
  - `examples/server/progressExample.js` — minimal working stdio server pattern
  - `examples/server/mcpServerOutputSchema.js` — registerTool with structured output
  - `examples/server/toolWithSampleServer.js` — registerTool with simple content response
  - `types.js` — CallToolResultSchema: `content[]` + `isError?` + `structuredContent?`
- Package version: 1.28.0 (verified via `npm show @modelcontextprotocol/sdk version`)
- zod version: 4.3.6 (verified via installed node_modules)

### Secondary (MEDIUM confidence)
- Existing cctimereporter service layer examined: `src/services/timeline.js`, `src/services/import.js`, `src/services/sessions.js`, `src/services/coordination.js`, `src/cli/format.js` — all confirmed working, directly usable in tool handlers

### Tertiary (LOW confidence)
- None — all critical claims verified from source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified by installing and reading SDK 1.28.0 source code
- Architecture: HIGH — patterns derived from SDK examples + existing codebase patterns
- Pitfalls: HIGH — stdin close, stderr, zod peer dep, lock leak all verified from source code behavior

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (SDK moves fast, re-verify if >1 month old)
