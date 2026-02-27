---
phase: 03-server-and-cli
plan: 02
subsystem: cli
tags: [fastify, node-sqlite, child_process, spawn, sigint, sigterm, port-fallback]

# Dependency graph
requires:
  - phase: 03-server-and-cli/03-01
    provides: createServer(db) Fastify factory
  - phase: 01-foundation
    provides: openDatabase() returning DatabaseSync instance
provides:
  - bin/cli.js entry point with full server lifecycle
  - Port fallback loop (3847 → 3848 ... up to 10 attempts on EADDRINUSE)
  - Browser auto-open via platform-appropriate command (xdg-open/open/cmd)
  - SIGINT/SIGTERM graceful shutdown closing server and database
affects:
  - 04-component-library (frontend served from this running server)
  - 05-timeline-ui (browser auto-opened to /timeline?date=today)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dynamic import after Node version check (ESM hoisting workaround)
    - Port fallback loop with EADDRINUSE detection
    - Signal handler registration via process.on for SIGINT/SIGTERM
    - spawn with detached + unref for fire-and-forget browser open

key-files:
  created: []
  modified:
    - bin/cli.js

key-decisions:
  - "Dynamic import pattern (await import()) used for all modules — established in 01-01, extended here"
  - "Port fallback tries up to 10 ports before fatal error — sufficient for local tool use"
  - "Browser open is best-effort (try/catch around spawn) — URL already printed to stdout as fallback"
  - "SIGINT and SIGTERM share same async handler — registered via for...of loop over signal array"
  - "fastify.close() and db.close() both wrapped in try/catch in shutdown — ensures exit(0) even on close errors"

patterns-established:
  - "Server lifecycle pattern: openDatabase → createServer(db) → listen with port fallback → print URL → open browser → register signal handlers"

# Metrics
duration: 1min
completed: 2026-02-27
---

# Phase 3 Plan 02: CLI Entry Point Summary

**`node bin/cli.js` starts Fastify server with port fallback, auto-opens browser to today's timeline, and handles SIGINT/SIGTERM graceful shutdown**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-27T03:21:30Z
- **Completed:** 2026-02-27T03:22:59Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced 3-line stub with full server lifecycle in `bin/cli.js`
- Port fallback loop: tries 3847, increments up to 3856 before fatal error — verified working (3847 occupied → 3848)
- Platform-aware browser open: `xdg-open` (Linux), `open` (macOS), `cmd /c start` (Windows) with `spawn({ detached, stdio: 'ignore' }).unref()`
- SIGINT and SIGTERM both trigger graceful shutdown: prints message, closes Fastify, closes DatabaseSync, exits 0
- Node 22 version check (lines 1-16) preserved exactly as-is

## Task Commits

1. **Task 1: Replace CLI stub with server lifecycle** - `ad670f4` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `bin/cli.js` - Full server lifecycle: version check preserved, dynamic imports, port fallback loop, startup message, browser open, signal handlers

## Decisions Made

- Dynamic import pattern used for all three imports (`openDatabase`, `createServer`, `spawn`) — consistent with established pattern from 01-01, required to avoid ESM hoisting issues
- Browser open wrapped in try/catch — best-effort only, URL is already printed to stdout so failure is silent
- SIGINT/SIGTERM handlers share identical async function via for...of loop — avoids duplication, covers both common termination signals
- Both `fastify.close()` and `db.close()` individually wrapped in try/catch in shutdown handler — ensures `process.exit(0)` runs even if one close fails

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Port 3847 was occupied during Test 2 verification (EADDRINUSE from blocking server). Port fallback kicked in as expected — server started on 3848. This is the intended behavior, not an issue.

## Next Phase Readiness

- Phase 3 is now complete: Fastify server + all API routes (03-01) + CLI lifecycle (03-02)
- `npx cctimereporter` invocation flow works end-to-end
- API contract is established and reachable: `/api/timeline`, `/api/projects`, `POST /api/import`
- Ready for Phase 4 (component library) — server is running and accepting requests

---
*Phase: 03-server-and-cli*
*Completed: 2026-02-27*
