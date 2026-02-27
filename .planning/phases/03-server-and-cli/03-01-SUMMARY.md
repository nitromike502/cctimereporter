---
phase: 03-server-and-cli
plan: 01
subsystem: api
tags: [fastify, http, rest-api, node-sqlite, working-time, idle-gap]

# Dependency graph
requires:
  - phase: 02-import-pipeline
    provides: importAll(db) orchestrator and DatabaseSync db layer
provides:
  - createServer(db) Fastify factory at src/server/index.js
  - GET /api/projects route returning flat project list
  - GET /api/timeline?date=YYYY-MM-DD route with idle-gap working-time computation
  - POST /api/import route with 409 concurrency guard
affects:
  - 03-02-cli (starts the server returned by createServer)
  - 04-component-library (frontend will call these API routes)
  - 05-timeline-ui (timeline route shape determines API contract)

# Tech tracking
tech-stack:
  added: [fastify@5.7.4]
  patterns:
    - Fastify plugin pattern (async function(fastify, opts)) for route registration
    - Prepared statement caching inside plugin body outside handler for efficiency
    - Module-level concurrency guard (let importRunning) for singleton import lock
    - Idle-gap working-time algorithm ported from Python PoC (10 min threshold)

key-files:
  created:
    - src/server/index.js
    - src/server/routes/timeline.js
    - src/server/routes/projects.js
    - src/server/routes/import.js
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "createServer(db) is synchronous factory — does NOT call listen() (CLI's responsibility)"
  - "Fastify logger: false — CLI tool prints its own output, no request logging noise"
  - "Prepared statements cached at plugin registration time (inside plugin, outside handler)"
  - "importRunning guard at module level — shared across all requests, reset in finally block"
  - "computeWorkingTime is module-private (not exported) — internal to timeline route"
  - "POST /api/import returns 409 on overlap rather than queuing — simpler for local tool"

patterns-established:
  - "Route files export single async plugin function following Fastify plugin pattern"
  - "opts.db is passed as plugin option — routes are database-aware via opts, not global"
  - "node:sqlite DatabaseSync is synchronous — no await on db.prepare().all()/.get()/.run()"

# Metrics
duration: 11min
completed: 2026-02-27
---

# Phase 3 Plan 01: Server and API Routes Summary

**Fastify HTTP server with three REST API routes: timeline (with idle-gap working-time), project listing, and import triggering with 409 concurrency guard**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-27T03:16:10Z
- **Completed:** 2026-02-27T03:27:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Fastify 5.7.4 installed as sole new dependency
- `createServer(db)` factory registers all three route plugins via `fastify.register()`
- `GET /api/timeline?date=YYYY-MM-DD` returns sessions grouped by project with `workingTimeMs` computed from message timestamps using idle-gap algorithm (10 min threshold, matching Python PoC)
- `GET /api/projects` returns flat sorted list of project objects with `displayName` derived from path
- `POST /api/import` calls `importAll(db)` with module-level concurrency guard — concurrent requests receive 409 Conflict

## Task Commits

1. **Task 1+2: Fastify server factory and API route handlers** - `ff3af08` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `src/server/index.js` - `createServer(db)` factory; imports and registers three route plugins
- `src/server/routes/timeline.js` - `GET /api/timeline` with `computeWorkingTime()` idle-gap algorithm, sessions grouped by project in Map
- `src/server/routes/projects.js` - `GET /api/projects` with prepared statement cached at registration time
- `src/server/routes/import.js` - `POST /api/import` with `importRunning` module-level guard returning 409 on concurrency
- `package.json` - fastify added to dependencies
- `package-lock.json` - lockfile updated

## Decisions Made

- `createServer(db)` does NOT call `listen()` — separation of construction from invocation makes the factory testable and reusable (CLI calls `listen()`)
- `Fastify({ logger: false })` — this is a CLI tool with its own output; Fastify's built-in request logging is noise
- Prepared statements cached inside plugin body but outside handler — avoids re-preparing on every HTTP request, still scoped to plugin lifecycle
- `importRunning` at module level — a singleton boolean is sufficient for local single-user tool (no need for queue or distributed lock)
- 409 Conflict rather than queuing concurrent imports — simpler, correct for local use, user can retry
- `computeWorkingTime` is not exported — it's an implementation detail of the timeline route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Port 3847 was occupied from a background process during verification; switched to port 3849 for testing. No impact on delivered code.

## Next Phase Readiness

- Server factory is ready for Plan 02 (CLI) to import and call `app.listen()`
- API contract is established — frontend phases 4 and 5 can code against these endpoints
- No blockers

---
*Phase: 03-server-and-cli*
*Completed: 2026-02-27*
