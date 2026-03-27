# Phase 28: Service Layer - Research

**Researched:** 2026-03-26
**Domain:** Node.js service layer extraction / refactoring (no new libraries)
**Confidence:** HIGH

## Summary

Phase 28 is a pure refactoring of existing code — no new libraries, no new functionality. The goal is to extract query and business logic from Fastify route handlers into `src/services/` modules that can be called by routes, CLI, and MCP without starting a web server.

The codebase is already well-structured. Route handlers currently own both HTTP concerns (param parsing, status codes) and business logic (SQL queries, data transformation). The extraction is straightforward: move the logic functions and prepared statements out of route registration closures and into service modules that accept `db` as a parameter.

The primary design decision left to discretion is how many service files to create and whether services own their prepared statements. Based on reading the actual code, the right approach is: three service files (`timeline.js`, `sessions.js`, `import.js`), services prepare their own statements at module load time via a factory pattern, and utility functions move to `src/utils/` for shared access.

**Primary recommendation:** Create three service modules with factory functions that accept `db` and return operation functions. Routes become thin HTTP wrappers. No new dependencies.

## Standard Stack

This phase introduces no new libraries. It uses only what's already present:

### Core (existing, no changes)
| Component | Version | Purpose |
|-----------|---------|---------|
| `node:sqlite` | built-in (Node 22+) | Database access — `DatabaseSync`, `StatementSync` |
| Fastify 5 | ^5.7.4 | HTTP server — routes stay as thin wrappers |
| Node.js ESM | `"type": "module"` | Module system — all files use `import`/`export` |

### No New Dependencies Required

This phase adds zero npm packages. The service layer is plain JavaScript functions.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure After Phase 28

```
src/
├── services/
│   ├── timeline.js      # getTimeline(db, { date, thresholdMin }) → two projections
│   ├── sessions.js      # getMessages(db, sessionId, opts), updateSession(db, id, fields)
│   └── import.js        # runImport(db, { maxAgeDays, onProgress }) → result
├── server/
│   └── routes/
│       ├── timeline.js  # thin: param validation, call service, return response
│       ├── sessions.js  # thin: param validation, call service, 404 on null
│       ├── messages.js  # thin: param validation, call service, 404 on null
│       └── import.js    # thin: concurrency guard, SSE setup, call service
├── importer/            # unchanged — import.js service delegates to importAll()
└── utils/
    └── timeline-utils.js  # computeWorkingTime, computeIdleGaps, getDisplayName, getWorktreeParentPath
```

### Pattern 1: Service Factory with Prepared Statements

Services prepare statements once at construction time. This avoids re-preparing on every call and matches the existing pattern in route handlers where `db.prepare()` is called during plugin registration, not inside request handlers.

**What:** Factory function accepts `db`, returns object with operation methods.
**When to use:** All three services — ensures statement reuse across calls.

```javascript
// src/services/timeline.js
// Source: derived from existing src/server/routes/timeline.js pattern

export function createTimelineService(db) {
  // Prepare statements once at construction time
  const sessionStmt = db.prepare(`
    SELECT s.session_id, s.primary_ticket, s.working_branch, ...
    FROM sessions s JOIN projects p ON s.project_id = p.id
    WHERE s.first_message_at < ? AND s.last_message_at >= ? ...
    ORDER BY s.first_message_at
  `);
  const messageStmt = db.prepare(`
    SELECT timestamp FROM messages WHERE session_id = ? ...
  `);

  return {
    /**
     * Returns UI projection (current timeline shape with idleGaps, forkSegments)
     */
    getTimelineUI(date, { thresholdMin = 10 } = {}) { ... },

    /**
     * Returns reporting projection (ticket-grouped totals + session detail)
     * Used by MCP get_day_summary and CLI reporting commands
     */
    getTimelineReport(date, { thresholdMin = 10 } = {}) { ... },
  };
}
```

### Pattern 2: Route as Thin HTTP Wrapper

Routes handle only HTTP concerns: parsing query params, input validation, setting status codes, serializing response. All data fetching and transformation moves to the service.

**What:** Route plugin receives a pre-constructed service (or constructs it from `db`).
**When to use:** All routes after extraction.

```javascript
// src/server/routes/timeline.js (after extraction)
import { createTimelineService } from '../../services/timeline.js';

export async function timelineRoute(fastify, opts) {
  const { db, migrated = false } = opts;
  const svc = createTimelineService(db);

  fastify.get('/api/timeline', async (request, reply) => {
    const { date, threshold } = request.query;
    // HTTP concern: param validation
    if (date && !DATE_RE.test(date)) {
      reply.code(400);
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }
    // HTTP concern: compute effective date/threshold
    const effectiveDate = date ?? getTodayString();
    const thresholdMin = Math.max(1, Math.min(60, parseInt(threshold, 10) || 10));

    // Service call — no HTTP knowledge
    const result = svc.getTimelineUI(effectiveDate, { thresholdMin });
    return { ...result, schemaMigrated: migrated };
  });
}
```

### Pattern 3: Two Projections from One Data Fetch

The UI projection and reporting projection share the same underlying SQL queries. The service should fetch once and compute both views from the same data, or clearly separate them so callers choose what they need.

**What:** `getTimelineUI()` returns the current full response shape (with idleGaps, forkSegments, continuesFromPrevDay). `getTimelineReport()` returns a flatter structure (ticket-grouped totals + sessions without UI noise).
**When to use:** MCP calls `getTimelineReport()`. Web UI route calls `getTimelineUI()`.

Reporting projection shape (for MCP `get_day_summary`):
```javascript
{
  date: '2026-03-26',
  workingTimeMs: 14400000,       // total across all sessions
  byTicket: [
    {
      ticket: 'PROJ-123',
      workingTimeMs: 7200000,
      sessionCount: 2,
      projects: ['cctimereporter'],
      sessions: [                 // session-level detail
        {
          sessionId: '...',
          project: 'cctimereporter',
          ticket: 'PROJ-123',
          branch: 'feat/proj-123',
          workingTimeMs: 3600000,
          summary: 'Implement service layer',
          startTime: '...',
          endTime: '...',
        }
      ]
    }
  ],
  unticketedSessions: [ ... ],   // sessions with no ticket
}
```

### Pattern 4: Import Service Delegation

The import service is a thin wrapper around the existing `importAll()` in `src/importer/index.js`. It adds:
1. The concurrency guard (currently in-memory boolean in route, will become DB-based in Phase 29)
2. PID + start time on rejection
3. Progress callback forwarding

```javascript
// src/services/import.js
import { importAll } from '../importer/index.js';

// In-memory guard (Phase 29 will make this DB-based)
let _importState = null; // null | { pid, startTime }

export async function runImport(db, { maxAgeDays, onProgress } = {}) {
  if (_importState) {
    const elapsed = Math.round((Date.now() - _importState.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const ago = mins > 0 ? `${mins}m ${secs}s ago` : `${secs}s ago`;
    throw new ImportConflictError(
      `Import already running (PID ${_importState.pid}, started ${ago})`
    );
  }

  _importState = { pid: process.pid, startTime: Date.now() };
  try {
    return await importAll(db, { maxAgeDays, onProgress });
  } finally {
    _importState = null;
  }
}

export class ImportConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportConflictError';
    this.pid = /* extract from message or pass separately */;
    this.startTime = /* extract from message or pass separately */;
  }
}
```

The route catches `ImportConflictError` and returns 409. The CLI checks for it and exits with an informative message. The MCP tool returns it as an error response.

### Pattern 5: Sessions PATCH Service Decision

The sessions PATCH route (`PATCH /api/sessions/:id`) updates `user_label` and `user_ticket`. Based on the context decisions, Claude has discretion here. Recommendation: **create a service for it** because:
1. Phase 30 (CLI) may want a `cctimereporter session edit` command
2. Phase 31 (MCP) may want a `update_session` tool
3. The operation is simple enough that the service is 5 lines

```javascript
// src/services/sessions.js — updateSession and getMessages both live here

export function createSessionsService(db) {
  const findStmt = db.prepare('SELECT session_id FROM sessions WHERE session_id = ?');
  const updateStmt = db.prepare(`
    UPDATE sessions SET user_label = $user_label, user_ticket = $user_ticket
    WHERE session_id = $session_id
  `);
  // ... message query statements ...

  return {
    updateSession(sessionId, { userLabel, userTicket }) {
      const row = findStmt.get(sessionId);
      if (!row) return null; // caller maps null → 404
      updateStmt.run({ $user_label: userLabel || null, $user_ticket: userTicket || null, $session_id: sessionId });
      return { ok: true };
    },

    getMessages(sessionId, { forkBranchId } = {}) {
      const row = findStmt.get(sessionId);
      if (!row) return null; // caller maps null → 404
      // ... query and shape messages ...
    }
  };
}
```

### Utility Function Placement

Current utility functions in `src/server/routes/timeline.js` that should move:

| Function | Move To | Reason |
|----------|---------|--------|
| `computeWorkingTime()` | `src/utils/timeline-utils.js` | Needed by both UI and reporting projections, potentially by CLI |
| `computeIdleGaps()` | `src/utils/timeline-utils.js` | UI projection only, but logically paired with computeWorkingTime |
| `getDisplayName()` | `src/utils/timeline-utils.js` | Used in projects route too — already duplicated |
| `getWorktreeParentPath()` | `src/utils/timeline-utils.js` | Discovery logic used in grouping |
| `computeForkSegments()` | stays in `src/services/timeline.js` | Only used by UI projection; not worth extracting further |

`src/utils/` already exists and contains `config.js` and `parse-command-xml.js` — this pattern is established.

### Anti-Patterns to Avoid

- **Don't put HTTP concerns in services:** Services must not import Fastify, touch `request`/`reply`, or know about SSE. HTTP serialization is the route's job.
- **Don't re-prepare statements per call:** The existing code prepares statements during plugin registration (outside handlers). Services must maintain this: prepare in constructor/factory, reuse across calls.
- **Don't duplicate the SQL:** Both UI and reporting projections should share the same underlying session query. Extract a private `_querySessionRows()` helper inside the service, then shape differently for each projection.
- **Don't make services stateful (except the import guard):** Timeline and sessions services take `db` as input and have no other state. Only `import.js` has the `_importState` guard, and that's intentional (Phase 29 will externalize it to DB anyway).
- **Don't build a DI container or service registry:** `createServer()` already passes `db` to route plugins. Routes call `createTimelineService(db)` inline. No abstraction layer needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| SSE streaming | Custom event emitter | Keep the existing SSE code in `import.js` route — it's already correct |
| Progress events | Custom pub/sub | Keep the `onProgress` callback pattern already in `importAll()` |
| Statement caching | Custom cache layer | `db.prepare()` called once at service construction time |
| Concurrency control | Complex locking | Simple module-level variable (`_importState`) — Phase 29 makes it DB-based |

**Key insight:** This phase is a move, not a build. The goal is zero new code for the business logic — only reorganization and the reporting projection shape.

## Common Pitfalls

### Pitfall 1: Forgetting `package.json` `files` Array

**What goes wrong:** `src/services/` is created but not added to `files` in `package.json`. When published via `npm publish`, the services directory is not included. CLI and MCP fail with module-not-found errors in production.

**Why it happens:** The `files` array in `package.json` is an allowlist. New source directories must be added explicitly.

**How to avoid:** Add `"src/services"` to the `files` array in the same commit that creates the directory. The success criteria explicitly calls this out (SVC criterion 4).

**Warning signs:** Running `npm pack --dry-run` and checking whether `src/services/` files appear in the output.

### Pitfall 2: Prepared Statement Scope Mismatch

**What goes wrong:** Services prepare statements inside the returned methods (per-call) instead of at construction time. This works but is slower and loses the existing optimization.

**Why it happens:** Moving logic out of plugin registration (where `db.prepare()` naturally lives) can cause developers to move the `db.prepare()` call with the function body.

**How to avoid:** Always prepare statements in the factory/constructor body, not inside individual methods.

### Pitfall 3: Breaking the Dynamic Placeholder Query for Fork Rows

**What goes wrong:** The `forkRowsBySession` batch query in `timeline.js` uses a dynamic `IN (?, ?, ?)` clause built with `sessionIdsWithForks.map(() => '?').join(', ')`. This cannot use a pre-prepared statement.

**Why it happens:** `node:sqlite`'s `DatabaseSync.prepare()` requires the SQL to be static. Dynamic `IN` clauses need `db.prepare()` called inline with the runtime-computed placeholder count.

**How to avoid:** Keep the dynamic fork query inline (call `db.prepare()` per request for this specific query only). This is the existing behavior — preserve it. Store `db` on the service instance for this purpose.

**Warning signs:** Trying to prepare `SELECT ... WHERE session_id IN (?)` once and calling it with multiple IDs.

### Pitfall 4: Route Tests Regressing on Behavior

**What goes wrong:** The refactoring changes a subtle behavior — for example, the `schemaMigrated` flag, which is passed through from `bin/cli.js` via server options, gets dropped or always returns `false`.

**Why it happens:** `schemaMigrated` is not data from the DB — it's a one-time flag from `openDatabase()`. It must stay in the route layer, not the service.

**How to avoid:** The route handler adds `schemaMigrated: migrated` to the service result before returning. This is explicitly an HTTP-layer concern (it's a web UI migration notification, not data).

### Pitfall 5: Concurrency Guard Leaks Between Tests

**What goes wrong:** The in-memory `_importState` variable in `src/services/import.js` is module-level. If a test doesn't await the import or throws, subsequent tests see `_importState` as non-null and all return 409-equivalent errors.

**Why it happens:** ES modules are singletons in Node.js — module-level state persists across all imports in the same process.

**How to avoid:** Use a `try/finally` block (already planned) to guarantee the state is cleared. Consider exporting a `_resetImportState()` function for test teardown only.

## Code Examples

### Service Construction at Route Registration Time

```javascript
// src/server/routes/timeline.js
// Source: derived from existing pattern in codebase

import { createTimelineService } from '../../services/timeline.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function timelineRoute(fastify, opts) {
  const { db, migrated = false } = opts;
  const svc = createTimelineService(db); // construct once, reuse across requests

  fastify.get('/api/timeline', async (request, reply) => {
    const date = request.query.date ?? getTodayString();
    if (!DATE_RE.test(date)) {
      reply.code(400);
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }
    const thresholdMin = Math.max(1, Math.min(60, parseInt(request.query.threshold, 10) || 10));
    const result = svc.getTimelineUI(date, { thresholdMin });
    return { ...result, schemaMigrated: migrated };
  });
}
```

### Import Route After Extraction

```javascript
// src/server/routes/import.js
import { runImport, ImportConflictError } from '../../services/import.js';

export async function importRoute(fastify, opts) {
  const { db } = opts;

  fastify.post('/api/import', async (request, reply) => {
    const parsed = parseInt(request.body?.maxAgeDays, 10);
    const maxAgeDays = Number.isFinite(parsed) ? parsed : undefined;
    try {
      const result = await runImport(db, { maxAgeDays });
      return { ok: true, ...result };
    } catch (err) {
      if (err instanceof ImportConflictError) {
        reply.code(409);
        return { error: err.message };
      }
      throw err;
    }
  });

  fastify.get('/api/import/progress', async (request, reply) => {
    const parsed = parseInt(request.query.maxAgeDays, 10);
    const maxAgeDays = Number.isFinite(parsed) ? parsed : undefined;

    // SSE setup stays in route — it's HTTP-layer concern
    reply.hijack();
    const raw = reply.raw;
    let clientConnected = true;
    request.raw.on('close', () => { clientConnected = false; });

    function sendEvent(name, data) {
      if (clientConnected) raw.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      const result = await runImport(db, {
        maxAgeDays,
        onProgress: (progress) => sendEvent('progress', progress),
      });
      sendEvent('complete', result);
    } catch (err) {
      if (err instanceof ImportConflictError) {
        sendEvent('error', { message: err.message, conflict: true });
      } else {
        sendEvent('error', { message: err.message });
      }
    } finally {
      raw.end();
    }
  });
}
```

### Dynamic IN Clause Handling in Service

```javascript
// src/services/timeline.js (partial)
// Preserving the existing pattern for fork rows — db stored on service

export function createTimelineService(db) {
  // ... static prepared statements ...

  return {
    getTimelineUI(date, { thresholdMin = 10 } = {}) {
      // ... compute dayStartUTC, dayEndUTC ...
      const sessions = sessionStmt.all(dayEndUTC, dayStartUTC);

      // Dynamic query — cannot pre-prepare, must build at query time
      const sessionIdsWithForks = sessions.filter(s => s.real_fork_count > 0).map(s => s.session_id);
      if (sessionIdsWithForks.length > 0) {
        const placeholders = sessionIdsWithForks.map(() => '?').join(', ');
        const forkRows = db.prepare(`
          SELECT session_id, fork_branch_id, MIN(timestamp) AS start_time, ...
          FROM messages WHERE session_id IN (${placeholders}) ...
        `).all(...sessionIdsWithForks);
        // ...
      }
      // ...
    }
  };
}
```

## State of the Art

| Old Approach | New Approach | Impact |
|--------------|--------------|--------|
| Business logic inside Fastify plugin registration closures | Business logic in `src/services/` pure functions | Routes become thin; CLI/MCP can call services directly |
| In-memory import guard in route module | In-memory guard in service module (DB-based in Phase 29) | Concurrency state owned by service, not route |
| Helper functions local to `timeline.js` route | Shared utils in `src/utils/timeline-utils.js` | Reusable by services and any future consumers |

## Open Questions

1. **Should `getDisplayName()` be deduplicated now?**
   - What we know: `getDisplayName()` exists in `timeline.js` route. `projects.js` route uses `project_path.split('/').pop()` inline (a simpler version). They're slightly different implementations.
   - What's unclear: Whether the discrepancy is intentional (projects list vs Gantt display may legitimately differ).
   - Recommendation: Move the full `getDisplayName()` (with BUILD_DIR_NAMES logic) to `src/utils/timeline-utils.js`. Update both consumers. If the projects route only needs `split('/').pop()`, that's fine to leave inline — don't force-unify.

2. **Should services use `db.prepare()` or accept pre-built statements?**
   - What we know: The factory pattern (services call `db.prepare()` during construction) is clean and consistent with the existing route code.
   - What's unclear: Whether future phases (Phase 29, 30, 31) would benefit from passing statements as dependencies.
   - Recommendation: Use factory pattern (`createTimelineService(db)`) for this phase. Passing statements would be over-engineering for now.

3. **Reporting projection: compute at service layer or at MCP layer?**
   - What we know: CONTEXT.md says services return two projections. The reporting projection is ticket-grouped totals.
   - What's unclear: How much ticket-grouping logic lives in the service vs being computed in MCP/CLI.
   - Recommendation: Service computes the grouping (it has access to the raw session data). MCP/CLI receive a ready-to-use structure. The service knows both formats; callers choose.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `/home/claude/cctimereporter/src/server/routes/timeline.js` — full route handler, all business logic
- Direct code inspection of `/home/claude/cctimereporter/src/server/routes/import.js` — concurrency guard, SSE pattern
- Direct code inspection of `/home/claude/cctimereporter/src/server/routes/sessions.js` — update pattern
- Direct code inspection of `/home/claude/cctimereporter/src/server/routes/messages.js` — query modes, fork branch handling
- Direct code inspection of `/home/claude/cctimereporter/src/importer/index.js` — importAll() signature and options
- Direct code inspection of `/home/claude/cctimereporter/package.json` — files array, existing structure

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions — locked choices and discretion areas for this phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, pure refactoring of code I've read
- Architecture: HIGH — based on direct code inspection, decisions from CONTEXT.md, and established patterns in the codebase
- Pitfalls: HIGH — the `package.json` files array pitfall is documented in MEMORY.md as a past real issue; dynamic IN clause is visible in the current code; others are code-inspection based

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable — no external dependencies)
