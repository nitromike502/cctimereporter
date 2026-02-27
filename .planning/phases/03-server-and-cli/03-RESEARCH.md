# Phase 3: Server and CLI - Research

**Researched:** 2026-02-26
**Domain:** Fastify HTTP server, Node.js CLI patterns, browser launch, port detection
**Confidence:** HIGH (Fastify patterns), HIGH (port strategy), MEDIUM (browser open), HIGH (SQL query patterns)

## Summary

Phase 3 wires an HTTP server around the existing import pipeline. The goal is `npx cctimereporter` starting a Fastify server, opening the browser, and exposing three API routes. This is a local-only tool — no auth, no TLS, no external access — which simplifies many decisions significantly.

Fastify v5.7.4 is the current release and is the correct choice here: it is ESM-native, Node.js 20+ only (codebase requires 22+), has a plugin-based architecture for adding static file serving later, and adds only one `npm install` to the currently zero-dependency project. The second dependency will be `@fastify/static` v8.x (Fastify v5 compatible) for serving the Vue frontend in Phase 4.

Port detection does not require an extra package. The correct approach is to catch the `EADDRINUSE` error on `fastify.listen()` and retry with port+1. Browser opening similarly does not need a dependency — `child_process.spawn()` with platform-switched commands handles macOS/Linux/Windows cleanly. The SQL for the `/api/timeline` query translates directly from the Python `query.py` working-time logic, fetching messages per session per date and computing idle-gap-aware working seconds in JavaScript.

**Primary recommendation:** Add `fastify` as the sole dependency for this phase. Everything else — port retry, browser open, graceful shutdown, timeline SQL — uses Node.js stdlib.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.7.4 | HTTP server framework | ESM-native, Node 20+ required, low overhead, plugin system for static files in Phase 4. First/only external dep. |

### Supporting (Phase 4+)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/static | ^8.x | Serve Vue dist/ assets | Phase 4, when Vue frontend is built. v8.x is Fastify v5 compatible. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastify | express | Express does not provide built-in JSON schema validation or serialization optimization; less plugin-forward |
| fastify | Node.js http module | Would require manual routing, JSON parsing, and error handling — not worth it for 3 endpoints |
| child_process (stdlib) | `open` npm package | The `open` package handles edge cases (WSL, unusual Linux DEs). For a tool that's also running in WSL, `open` may be more reliable. Flag as open question. |

### Installation

```bash
npm install fastify
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── server/
│   ├── index.js        # createServer() factory — Fastify instance setup
│   ├── routes/
│   │   ├── timeline.js # GET /api/timeline?date=YYYY-MM-DD
│   │   ├── projects.js # GET /api/projects
│   │   └── import.js   # POST /api/import
│   └── static.js       # @fastify/static registration (Phase 4)
bin/
└── cli.js              # Version check + start server + open browser + signal handling
```

### Pattern 1: Fastify Server Factory

**What:** Export a `createServer(db)` function that builds and returns the Fastify instance without calling `listen()`. `cli.js` handles listen, port retry, and browser open separately.

**When to use:** Standard practice — separates server construction from invocation. Makes the server testable and reusable.

**Example:**
```javascript
// src/server/index.js
// Source: https://fastify.dev/docs/latest/Guides/Getting-Started/
import Fastify from 'fastify';
import { timelineRoute } from './routes/timeline.js';
import { projectsRoute } from './routes/projects.js';
import { importRoute } from './routes/import.js';

export function createServer(db) {
  const fastify = Fastify({ logger: false }); // logger: false for CLI tool; we print our own output

  fastify.register(timelineRoute, { db });
  fastify.register(projectsRoute, { db });
  fastify.register(importRoute, { db });

  return fastify;
}
```

### Pattern 2: Route as Plugin

**What:** Each route file exports an async function that Fastify treats as a plugin. Options (including `db`) flow via the options argument.

**Example:**
```javascript
// src/server/routes/timeline.js
// Source: https://fastify.dev/docs/latest/Reference/Routes/
export async function timelineRoute(fastify, opts) {
  const { db } = opts;

  fastify.get('/api/timeline', async (request, reply) => {
    const { date } = request.query;
    // ... query db, return data
    return { sessions: [...] };
  });
}
```

### Pattern 3: Port Detection via EADDRINUSE Catch

**What:** Try to listen on `DEFAULT_PORT`. If the OS returns EADDRINUSE, increment and retry. Use a small max-retry cap to avoid infinite loops.

**When to use:** Required for user-facing CLI tools where the default port may be occupied.

**Example:**
```javascript
// bin/cli.js
// Source: verified via Node.js net docs + Fastify server reference
const DEFAULT_PORT = 3847; // Unlikely-to-conflict port for a local tool

async function startWithPortFallback(fastify, startPort, maxRetries = 10) {
  let port = startPort;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fastify.listen({ port, host: '127.0.0.1' });
      return port;
    } catch (err) {
      if (err.code === 'EADDRINUSE' && attempt < maxRetries - 1) {
        port++;
        continue;
      }
      throw err;
    }
  }
}
```

**Critical note:** Fastify v5 requires `listen()` to receive an options object — variadic `listen(port, host, cb)` was removed. Always use `fastify.listen({ port, host })`.

### Pattern 4: Browser Open (stdlib only)

**What:** Use `child_process.spawn()` with platform-switched commands. Detach and ignore stdio so the browser process outlives the parent check.

**Example:**
```javascript
// Source: Node.js child_process docs + verified platform commands
import { spawn } from 'node:child_process';

export function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32'  ? 'cmd'  :
    'xdg-open'; // Linux

  const args =
    process.platform === 'win32' ? ['/c', 'start', '', url] : [url];

  spawn(cmd, args, {
    detached: true,
    stdio: 'ignore',
  }).unref(); // unref() prevents the child from keeping the Node process alive
}
```

**WSL caveat (LOW confidence):** WSL2 environments may not have `xdg-open` configured. The `open` npm package bundles a vendored xdg-open that handles this. Since cctimereporter is actively used in WSL (per env context), this may be worth adding `open` as a dependency. Flag as open question.

### Pattern 5: Graceful Shutdown

**What:** Fastify has no built-in signal handling. Add SIGINT/SIGTERM handlers manually. Close Fastify first (which runs `onClose` hooks), then close the database, then exit.

**Example:**
```javascript
// Source: https://fastify.dev/docs/latest/Reference/Server/
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    process.stdout.write('\ncctimereporter stopped.\n');
    try {
      await fastify.close();
      db.close();
    } catch (_) { /* ignore close errors */ }
    process.exit(0);
  });
}
```

**Important:** Fastify's `close()` sets the server to return 503 for new requests by default (`return503OnClosing: true`). This is the correct behavior for a graceful shutdown.

### Pattern 6: Get Actual Bound Port After Listen

**What:** After `listen()` resolves, use `fastify.server.address().port` to get the actual port (necessary when port 0 or retry changes the port).

```javascript
// Source: https://fastify.dev/docs/latest/Reference/Server/
const port = await startWithPortFallback(fastify, DEFAULT_PORT);
const actualPort = fastify.server.address().port; // confirms the real port
const url = `http://localhost:${actualPort}`;
process.stdout.write(`cctimereporter running at ${url}\nPress Ctrl+C to stop.\n`);
```

### Pattern 7: Timeline SQL Query (JavaScript port of Python logic)

**What:** The `/api/timeline` endpoint needs sessions for a date, grouped by project, each with working-time computed. The working-time calculation requires message timestamps — it cannot be done purely in SQL with the idle-gap model. The approach: query sessions + messages for the date, compute gaps in JS.

**SQL for session + message fetch:**
```sql
-- Source: derived from scripts/query.py query_working_time()
SELECT
  s.session_id,
  s.primary_ticket,
  s.working_branch,
  s.first_message_at,
  s.last_message_at,
  s.message_count,
  s.user_message_count,
  s.fork_count,
  s.real_fork_count,
  p.project_path,
  p.id AS project_id
FROM sessions s
JOIN projects p ON s.project_id = p.id
WHERE DATE(s.first_message_at) <= ? AND DATE(s.last_message_at) >= ?
ORDER BY s.first_message_at
```

Then for each session, fetch message timestamps:
```sql
SELECT timestamp
FROM messages
WHERE session_id = ?
  AND type IN ('user', 'assistant')
  AND timestamp IS NOT NULL
ORDER BY timestamp
```

**Working-time algorithm (JS translation):**
```javascript
// Source: direct port of scripts/query.py query_working_time()
const IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function computeWorkingTime(timestamps) {
  if (timestamps.length < 2) return 0;
  const parsed = timestamps.map(t => new Date(t).getTime());
  let workingMs = 0;
  for (let i = 1; i < parsed.length; i++) {
    const gap = parsed[i] - parsed[i - 1];
    if (gap <= IDLE_THRESHOLD_MS) {
      workingMs += gap;
    }
  }
  return workingMs;
}
```

### Pattern 8: API Response Shape

**What:** Direct-data JSON (no envelope wrapper) for simple bounded responses. This aligns with 2026 best practice for non-paginated local tool APIs.

**Timeline response shape:**
```json
{
  "date": "2026-02-26",
  "projects": [
    {
      "projectId": 1,
      "projectPath": "/home/user/myapp",
      "displayName": "myapp",
      "sessions": [
        {
          "sessionId": "abc123",
          "startTime": "2026-02-26T09:00:00.000Z",
          "endTime": "2026-02-26T11:30:00.000Z",
          "workingTimeMs": 4200000,
          "ticket": "AILASUP-42",
          "branch": "meckert-AILASUP-42",
          "messageCount": 87,
          "userMessageCount": 23,
          "forkCount": 2,
          "realForkCount": 1
        }
      ]
    }
  ]
}
```

**Projects response shape:**
```json
[
  {
    "projectId": 1,
    "projectPath": "/home/user/myapp",
    "displayName": "myapp",
    "lastImportAt": "2026-02-26T08:00:00.000Z"
  }
]
```

**Import response shape:**
```json
{
  "ok": true,
  "projectsFound": 5,
  "filesProcessed": 3,
  "filesSkipped": 12,
  "totalMessages": 1500,
  "errors": []
}
```

### Anti-Patterns to Avoid

- **Calling `listen()` with variadic args:** `fastify.listen(3000, '127.0.0.1', cb)` was removed in Fastify v5. Always use options object: `fastify.listen({ port: 3000, host: '127.0.0.1' })`.
- **Passing logger instance via `logger` option:** Fastify v5 requires `loggerInstance` for a custom Pino instance. For this tool, use `logger: false` and print manually.
- **Registering `@fastify/static` twice without `decorateReply: false`:** If registering multiple static roots in Phase 4+, the second registration must pass `decorateReply: false`.
- **Forgetting `unref()` on the browser spawn:** Without `.unref()`, the spawned browser process keeps the Node.js event loop alive, preventing clean shutdown.
- **Computing working time in SQL:** The idle-gap algorithm requires sequential timestamp comparison — this must be done in application code, not SQL.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP server with routing | Custom http.createServer() router | Fastify | Request parsing, JSON serialization, error handling, plugin system — all handled |
| Static file serving (Phase 4) | Custom fs.readFile() handler | @fastify/static | Content-type detection, caching headers, range requests, ETag — edge cases multiply fast |
| Port availability detection | Pre-check with net.createServer() | EADDRINUSE catch-and-retry | Pre-check has a TOCTOU race condition; catching EADDRINUSE is atomic |

**Key insight:** The only things worth hand-rolling here are browser opening and graceful shutdown — both are 5-10 lines of stdlib code with no meaningful edge cases for a local tool.

---

## Common Pitfalls

### Pitfall 1: Fastify v5 listen() API change

**What goes wrong:** `fastify.listen(3000)` or `fastify.listen(3000, '127.0.0.1', callback)` throws `FST_ERR_LISTEN_OPTIONS_INVALID`.

**Why it happens:** Fastify v5 removed the old variadic signature to enforce the options-object API.

**How to avoid:** Always `fastify.listen({ port: N, host: 'X' })`. This is also Promise-based — `await fastify.listen(...)` returns the address string.

**Warning signs:** `FST_ERR_LISTEN_OPTIONS_INVALID` error on startup.

### Pitfall 2: Browser opens before server is ready

**What goes wrong:** `open(url)` is called before `await fastify.listen()` resolves, causing the browser to hit a connection refused error.

**Why it happens:** Async sequencing error — browser launch placed before the await.

**How to avoid:** Always `await fastify.listen(...)`, then open the browser.

### Pitfall 3: SQLite database is opened multiple times

**What goes wrong:** The CLI opens the database, the import route's handler also calls `openDatabase()`, creating a second connection.

**Why it happens:** Routes independently calling `openDatabase()` instead of receiving the shared `db` instance.

**How to avoid:** Open the database once in `cli.js`, pass it to `createServer(db)`, inject into each route via plugin options. Never call `openDatabase()` inside route handlers.

### Pitfall 4: node:sqlite DatabaseSync is synchronous — don't await it

**What goes wrong:** `await db.prepare(...).all()` — the `await` is superfluous and can mask errors if code mistakenly expects a Promise.

**Why it happens:** Confusion between `better-sqlite3`-style synchronous API (which this is) and async ORMs.

**How to avoid:** `node:sqlite` `DatabaseSync` is fully synchronous. No `await` needed or correct for database calls. Fastify async route handlers are fine — just don't add await to db calls.

### Pitfall 5: Import route concurrent execution

**What goes wrong:** Two simultaneous `POST /api/import` requests run the import pipeline concurrently, causing transaction conflicts on the SQLite database.

**Why it happens:** HTTP servers are concurrent by nature; SQLite in WAL mode handles concurrent reads but not concurrent writes well.

**How to avoid:** Use a simple boolean flag (`let importRunning = false`) in the route module. If `importRunning` is true when a POST arrives, return `409 Conflict`. Set to false in a finally block.

**Warning signs:** SQLite `SQLITE_BUSY` errors during concurrent imports.

### Pitfall 6: Timeline query returns no data for correct dates

**What goes wrong:** `GET /api/timeline?date=2026-02-26` returns empty results even though sessions exist for that date.

**Why it happens:** Sessions that span midnight have `first_message_at` on one date and `last_message_at` on another. A simple `WHERE DATE(first_message_at) = ?` misses them.

**How to avoid:** Use the Python query pattern: `WHERE DATE(first_message_at) <= ? AND DATE(last_message_at) >= ?`. This correctly includes sessions that cross midnight.

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### Full cli.js skeleton

```javascript
#!/usr/bin/env node
// Source: bin/cli.js pattern + Fastify docs + Node.js child_process docs

// Version check MUST run before any ESM imports (existing pattern)
const _nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (_nodeMajor < 22) { /* ... existing check ... */ }

import { openDatabase } from '../src/db/index.js';
import { createServer } from '../src/server/index.js';
import { spawn } from 'node:child_process';

const DEFAULT_PORT = 3847;
const TODAY = new Date().toISOString().slice(0, 10);

const db = openDatabase();
const fastify = createServer(db);

// Port retry loop
let port = DEFAULT_PORT;
for (let attempt = 0; attempt < 10; attempt++) {
  try {
    await fastify.listen({ port, host: '127.0.0.1' });
    break;
  } catch (err) {
    if (err.code === 'EADDRINUSE' && attempt < 9) { port++; continue; }
    process.stderr.write(`Failed to start server: ${err.message}\n`);
    process.exit(1);
  }
}

const url = `http://127.0.0.1:${port}`;
process.stdout.write(`cctimereporter running at ${url}\nPress Ctrl+C to stop.\n`);

// Open browser
const browserUrl = `${url}/timeline?date=${TODAY}`;
const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
const args = process.platform === 'win32' ? ['/c', 'start', '', browserUrl] : [browserUrl];
spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    process.stdout.write('\ncctimereporter stopped.\n');
    try { await fastify.close(); } catch (_) {}
    try { db.close(); } catch (_) {}
    process.exit(0);
  });
}
```

### Route with Fastify plugin pattern

```javascript
// Source: https://fastify.dev/docs/latest/Guides/Getting-Started/
// src/server/routes/projects.js

export async function projectsRoute(fastify, opts) {
  const { db } = opts;

  fastify.get('/api/projects', async (_request, _reply) => {
    const rows = db.prepare(`
      SELECT id, project_path, last_import_at
      FROM projects
      ORDER BY project_path
    `).all();

    return rows.map(row => ({
      projectId: row.id,
      projectPath: row.project_path,
      displayName: row.project_path.split('/').pop(),
      lastImportAt: row.last_import_at,
    }));
  });
}
```

### Import route with concurrency guard

```javascript
// src/server/routes/import.js
import { importAll } from '../../importer/index.js';

let importRunning = false;

export async function importRoute(fastify, opts) {
  const { db } = opts;

  fastify.post('/api/import', async (_request, reply) => {
    if (importRunning) {
      reply.code(409);
      return { error: 'Import already in progress' };
    }

    importRunning = true;
    try {
      const result = await importAll(db, {});
      return { ok: true, ...result };
    } finally {
      importRunning = false;
    }
  });
}
```

### @fastify/static registration (Phase 4 preview)

```javascript
// Source: https://github.com/fastify/fastify-static
// Fastify v5 requires @fastify/static v8.x
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

fastify.register(fastifyStatic, {
  root: join(__dirname, '../../dist'), // Vue build output
  prefix: '/',
  // For SPA: send index.html for any unmatched route
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fastify.listen(port, host, cb)` | `fastify.listen({ port, host })` | Fastify v5 (2024) | Breaking — old form throws at startup |
| `logger: customPinoInstance` | `loggerInstance: customPinoInstance` | Fastify v5 (2024) | Breaking — but irrelevant here (using `logger: false`) |
| `fastify-static` (unscoped) | `@fastify/static` (scoped) | Fastify v4 era | Old package deprecated; use scoped package |
| `req.connection` | `req.socket` | Fastify v5 (2024) | Breaking — but not used in this phase |

**Deprecated/outdated:**
- `fastify-static` (unscoped npm package): Replaced by `@fastify/static`. Do not use.
- `fastify.listen(port, callback)` variadic form: Removed in v5.

---

## Open Questions

1. **Browser opening in WSL2**
   - What we know: `xdg-open` is the Linux standard, but WSL2 may not have it configured or may need `wslview` instead. The codebase runs in WSL2 (per environment context).
   - What's unclear: Whether the WSL2 user will have `xdg-open` working or if WSL-specific handling is needed.
   - Recommendation: Use the stdlib `spawn` approach for v1. If browser opening fails silently (spawn exits non-zero), the URL is already printed to stdout so the user can open it manually. This is acceptable for v1. The `open` npm package handles WSL2 but adds a dependency. Decide at implementation time whether WSL2 handling is worth the dep.

2. **Static file serving fallback for SPA routes (Phase 4 concern)**
   - What we know: `@fastify/static` serves files from a root directory. For a Vue SPA, any unmatched route should return `index.html`.
   - What's unclear: `@fastify/static` v8 behavior for unmatched routes with SPA mode. Need to verify if there's a `setNotFoundHandler` pattern or if a custom 404 handler is needed.
   - Recommendation: Defer to Phase 4 when the Vue build exists. Document here that a catch-all returning `index.html` will be needed.

3. **Default port selection**
   - What we know: The CONTEXT.md says "try default port, increment if occupied" but does not specify the default port.
   - What's unclear: No port is specified in any prior decisions or files.
   - Recommendation: Use `3847` — unlikely to conflict with common dev servers (React: 3000, Vite: 5173, Vue CLI: 8080, Next.js: 3000). Plan should establish this as the constant.

---

## Sources

### Primary (HIGH confidence)
- [Fastify Getting Started Guide](https://fastify.dev/docs/latest/Guides/Getting-Started/) — server creation, routes, plugin pattern
- [Fastify Server Reference](https://fastify.dev/docs/latest/Reference/Server/) — listen(), close(), addresses(), signal handling
- [Fastify v5 Migration Guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/) — breaking changes, variadic listen removal, logger option change
- [fastify/fastify-static GitHub](https://github.com/fastify/fastify-static) — compatibility table, decorateReply option, ESM import
- Existing codebase: `scripts/query.py` — working-time SQL algorithm ported to JS

### Secondary (MEDIUM confidence)
- [npm fastify](https://www.npmjs.com/package/fastify) — confirmed v5.7.4 is current (February 2026)
- [npm @fastify/static](https://www.npmjs.com/package/@fastify/static) — confirmed v9.0.0 current, v8.x for Fastify v5
- [Socket.IO EADDRINUSE docs](https://socket.io/how-to/handle-eaddrinused-errors) — port 0 and EADDRINUSE patterns in Node.js

### Tertiary (LOW confidence)
- WebSearch result: `open` npm package handles WSL2 xdg-open — single source, unverified against official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Fastify v5.7.4 confirmed current, ESM support confirmed, Node 22 requirement compatible
- Architecture: HIGH — all patterns derived from official Fastify docs + existing codebase code
- SQL queries: HIGH — direct port from working Python implementation in scripts/query.py
- Browser open: MEDIUM — platform switch logic is well-known pattern, WSL2 edge case is LOW confidence
- Pitfalls: HIGH — mostly derived from Fastify v5 migration guide and codebase constraints

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (Fastify releases ~monthly; check for v5.x patch changes)
