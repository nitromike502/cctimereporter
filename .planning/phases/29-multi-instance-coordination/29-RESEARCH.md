# Phase 29: Multi-Instance Coordination - Research

**Researched:** 2026-03-27
**Domain:** SQLite multi-process coordination, PID-based advisory locks, Node.js process detection
**Confidence:** HIGH

## Summary

This phase adds DB-based coordination to a Node.js/SQLite application so that multiple processes (web server, CLI import, MCP) share one database safely. The pattern is well-understood: a `process_locks` table stores PID + metadata per named lock, and PID liveness is checked with `process.kill(pid, 0)`. Stale locks (dead PIDs) are auto-reclaimed at claim-time.

The Node.js `node:sqlite` module on v22.17.1 supports both PRAGMA `busy_timeout` and the `timeout` constructor option (added in v22.18.0, so PRAGMA is the safe path on this runtime). SQLite WAL mode (already enabled) allows unlimited concurrent readers alongside one writer, making multi-reader MCP access safe without any additional coordination.

The existing `_importState` module-level guard in `src/services/import.js` becomes a DB-backed check. The `runImport()` API surface stays the same. Server ownership is new code built on the same `process_locks` table.

**Primary recommendation:** Use a single `process_locks` table with named lock rows (`'server'` and `'import'`), `INSERT OR IGNORE` to attempt claim, PID-alive check for stale detection, and `DELETE WHERE pid = ?` for release. Set `PRAGMA busy_timeout = 5000` at DB open time. Keep the in-memory guard alongside the DB guard as a fast-path within a single process.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:sqlite` (DatabaseSync) | Node 22.17.1 built-in | All DB operations | Already in use, synchronous API |
| `node:process` | Built-in | PID detection via `process.kill(pid, 0)` | Standard cross-platform pattern |

### No New Dependencies

This phase requires zero new npm packages. All mechanisms use:
- SQLite DDL (new table via migration)
- `process.pid` — the current process's PID
- `process.kill(pid, 0)` — cross-platform liveness test (throws ESRCH if dead)
- SQLite `PRAGMA busy_timeout` — prevents SQLITE_BUSY on contention

## Architecture Patterns

### Recommended Project Structure

New file: `src/services/coordination.js` — all lock/unlock logic in one place.

```
src/services/
├── coordination.js   # NEW: claimServerLock, releaseServerLock,
│                     #      claimImportLock, releaseImportLock, isProcessAlive
├── import.js         # MODIFIED: replace module-level state with DB lock calls
├── sessions.js       # unchanged
└── timeline.js       # unchanged
```

Schema change: `src/db/schema.js` — add `process_locks` table to SCHEMA_DDL, add `MIGRATION_V8_TO_V9` constant, increment `SCHEMA_VERSION` to 9.

CLI change: `bin/cli.js` — after `fastify.listen()`, call `claimServerLock(db, port)`. On conflict (dead PID reclaimed: proceed; live PID: print URL and exit). Register SIGINT/SIGTERM cleanup to release lock.

### Pattern 1: process_locks Table Schema

```sql
CREATE TABLE IF NOT EXISTS process_locks (
  lock_name  TEXT PRIMARY KEY,   -- 'server' or 'import'
  pid        INTEGER NOT NULL,
  source     TEXT NOT NULL,      -- 'web', 'cli', or 'mcp'
  port       INTEGER,            -- only for 'server' lock
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

One row per named lock. PRIMARY KEY prevents two rows for the same lock name. No history kept — the row is deleted on release. This is the simplest correct design and is easy to reason about.

### Pattern 2: PID Liveness Check

```javascript
// Source: Node.js docs + verified locally on v22.17.1
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = existence check only, no effect
    return true;
  } catch (_) {
    return false; // ESRCH: no such process
  }
}
```

Works cross-platform. Returns `false` for any PID that cannot be signaled (dead, zombie, permission error). Verified locally: dead PIDs return false, own PID returns true.

### Pattern 3: Claim with Stale Detection

```javascript
// Source: verified locally with node:sqlite v22.17.1
function claimLock(db, lockName, pid, source, port = null) {
  const existing = db.prepare(
    'SELECT * FROM process_locks WHERE lock_name = ?'
  ).get(lockName);

  if (existing) {
    if (isProcessAlive(existing.pid)) {
      // Live conflict — return owner info to caller
      return { claimed: false, owner: existing };
    }
    // Stale lock — reclaim by removing the dead entry
    db.prepare(
      'DELETE FROM process_locks WHERE lock_name = ? AND pid = ?'
    ).run(lockName, existing.pid);
  }

  db.prepare(
    'INSERT INTO process_locks (lock_name, pid, source, port) VALUES (?, ?, ?, ?)'
  ).run(lockName, pid, source, port);

  return { claimed: true };
}
```

The `AND pid = ?` on DELETE is a safety guard: if two processes race and both see a stale lock, only one DELETE succeeds. The second process re-reads and finds the first process's fresh row (which IS alive), returning a conflict. This avoids a TOCTOU race.

### Pattern 4: Lock Release

```javascript
function releaseLock(db, lockName, pid) {
  // Only delete the row if this process owns it
  db.prepare(
    'DELETE FROM process_locks WHERE lock_name = ? AND pid = ?'
  ).run(lockName, pid);
}
```

The `AND pid = ?` guard ensures a crashed-and-restarted process cannot accidentally delete a new owner's lock.

### Pattern 5: busy_timeout via PRAGMA

The `timeout` constructor option for `DatabaseSync` was added in Node.js v22.18.0. The runtime is v22.17.1, so use PRAGMA instead:

```javascript
// Source: verified locally on v22.17.1
db.exec('PRAGMA busy_timeout = 5000'); // 5 seconds
```

This goes in `openDatabase()` alongside the existing WAL and foreign_keys PRAGMAs. Prevents immediate `SQLITE_BUSY` failures when a second process is briefly writing. 5000ms is generous for this workload — import writes are the only heavy operation.

### Pattern 6: Import Lock Extension

The existing `ImportConflictError` constructor format must be updated to include `source`:

```javascript
// Current format: "Import already running (PID 12345, started 2m 15s ago)"
// New format: "Import already running (PID 12345 via CLI, started 2m 15s ago)"
constructor(pid, source, startedAt) {
  const elapsedMs = Date.now() - new Date(startedAt + 'Z').getTime();
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const ago = minutes > 0 ? `${minutes}m ${seconds}s ago` : `${seconds}s ago`;
  super(`Import already running (PID ${pid} via ${source}, started ${ago})`);
  // ...
}
```

The `started_at` column in process_locks stores UTC via `datetime('now')`. Verified: SQLite's `datetime('now')` returns UTC matching `new Date().toISOString()`.

### Pattern 7: Server Ownership Flow in cli.js

```javascript
// After fastify.listen() succeeds:
const { claimServerLock } = await import('../src/services/coordination.js');
const result = claimServerLock(db, process.pid, 'web', actualPort);

if (!result.claimed) {
  const { owner } = result;
  const url = `http://127.0.0.1:${owner.port}`;
  process.stdout.write(`Server already running at ${url} (PID ${owner.pid})\n`);
  try { await fastify.close(); } catch (_) {}
  db.close();
  process.exit(0);
}

// Register cleanup
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    releaseServerLock(db, process.pid);
    // ... existing shutdown
  });
}
```

### Anti-Patterns to Avoid

- **Using `INSERT OR REPLACE` without PID guard on DELETE:** Two processes could both see a stale lock and race to replace it. Use `DELETE WHERE pid = dead_pid` + then `INSERT`, not `REPLACE`.
- **Trusting the DB timestamp for elapsed time directly:** `datetime('now')` is UTC but stored as a string. When computing elapsed time in JS, parse as UTC: `new Date(startedAt + 'Z')`. Otherwise local timezone offsets cause incorrect elapsed times.
- **Removing the in-memory guard:** Keep `_importState` in `import.js` as a fast-path guard for within-process calls. The DB lock handles cross-process. Both guards together prevent any double-import scenario.
- **Not cleaning startup:** On startup, do NOT preemptively clear all stale locks. Let claim-time detection handle it. Preemptive cleanup on startup could delete a valid lock from another process that started slightly earlier.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PID existence check | Custom `/proc/PID` parsing | `process.kill(pid, 0)` | Cross-platform, one line |
| Advisory lock file system | Lockfiles in filesystem | `process_locks` SQLite table | Already have the DB, atomic with ACID |
| Distributed lock with TTL | Expiry-based lock reclaim | PID liveness check at claim time | TTLs require clock sync; PID check is instantaneous |
| Busy-wait retry loop | setTimeout retry on SQLITE_BUSY | `PRAGMA busy_timeout` | SQLite handles this internally, no polling needed |

**Key insight:** All coordination needs can be solved with the existing SQLite connection plus `process.kill(pid, 0)`. No new infrastructure, no new dependencies.

## Common Pitfalls

### Pitfall 1: TOCTOU Race on Stale Lock Reclaim

**What goes wrong:** Process A and B both see a stale lock from dead PID X. Both delete it. Both insert their own row. Only the last INSERT wins — the first process now thinks it holds the lock but doesn't.

**Why it happens:** Read-check-then-write is not atomic in SQLite without a transaction.

**How to avoid:** Wrap the entire claim sequence (SELECT + conditional DELETE + INSERT) in `BEGIN IMMEDIATE` transaction. `BEGIN IMMEDIATE` acquires a write lock upfront so no other writer can intervene. Alternatively, use `DELETE WHERE lock_name = ? AND pid = ?` to make the delete conditional on still being the stale owner — if the row is gone (raced away), the INSERT will fail with a UNIQUE constraint, and the process can re-read to find the winner.

**Warning signs:** Tests that simulate two concurrent claim attempts on a stale lock revealing a race condition.

### Pitfall 2: Wrong Timezone Parsing of started_at

**What goes wrong:** Elapsed time in error messages is off by hours.

**Why it happens:** `datetime('now')` returns `"2026-03-28 01:55:19"` (UTC, no 'Z'). `new Date("2026-03-28 01:55:19")` in V8 parses this as LOCAL time, not UTC.

**How to avoid:** Append 'Z' before parsing: `new Date(startedAt + 'Z').getTime()`. Verified that `datetime('now')` and JS UTC match exactly.

**Warning signs:** Elapsed times that are exactly N hours off (matching the system timezone offset).

### Pitfall 3: busy_timeout Not Set → SQLITE_BUSY Errors on Concurrent Reads

**What goes wrong:** MCP instances doing read-only queries get `SQLITE_BUSY` while import holds a write lock.

**Why it happens:** Default busy_timeout is 0 — SQLite returns the error immediately rather than waiting.

**How to avoid:** Set `PRAGMA busy_timeout = 5000` in `openDatabase()`. In WAL mode, readers almost never block on writers, but brief lock transitions (checkpoint, WAL file growth) can cause momentary contention.

**Warning signs:** Intermittent `ERR_SQLITE_ERROR: database is locked` errors from read operations.

### Pitfall 4: Server Lock Not Cleaned Up on Crash

**What goes wrong:** Server crashes without SIGINT/SIGTERM, leaving a lock row with a now-dead PID. Next start-up sees a "conflict."

**Why it happens:** `process.on('SIGINT')` doesn't fire on `process.exit()` or unhandled exceptions.

**How to avoid:** This is expected behavior — the stale detection at claim time handles it. Document clearly that stale lock reclaim IS the recovery path. Do not try to guarantee cleanup on every crash path; that's unsolvable. The PID check makes this graceful.

**Warning signs:** None needed — stale detection makes this a non-issue for the user.

### Pitfall 5: Schema Migration Version Skew

**What goes wrong:** Incrementing SCHEMA_VERSION but forgetting to add the migration path in `openDatabase()`.

**Why it happens:** The migration ladder in `openDatabase()` has one branch per old version. Adding a new migration constant without adding the v8→v9 branch means v8 databases are dropped and recreated (data loss).

**How to avoid:** Always update both: (1) `SCHEMA_VERSION` constant, (2) `SCHEMA_DDL` (new table), (3) `MIGRATION_V8_TO_V9` constant, (4) all existing version branches in `openDatabase()` to chain through v9, (5) new else-if branch for `existingVersion === 8`.

## Code Examples

### Full Coordination Service Skeleton

```javascript
// src/services/coordination.js
// Source: verified patterns using node:sqlite v22.17.1 locally

/**
 * Check if a process is alive by attempting to send signal 0.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Attempt to claim a named lock in the process_locks table.
 * If the existing owner's PID is dead, reclaim it.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} lockName - 'server' or 'import'
 * @param {number} pid
 * @param {string} source - 'web', 'cli', or 'mcp'
 * @param {number|null} port - only for server lock
 * @returns {{ claimed: boolean, owner?: object }}
 */
export function claimLock(db, lockName, pid, source, port = null) {
  const existing = db.prepare(
    'SELECT * FROM process_locks WHERE lock_name = ?'
  ).get(lockName);

  if (existing) {
    if (isProcessAlive(existing.pid)) {
      return { claimed: false, owner: existing };
    }
    // Stale — reclaim. AND pid guard handles concurrent reclaim race.
    db.prepare(
      'DELETE FROM process_locks WHERE lock_name = ? AND pid = ?'
    ).run(lockName, existing.pid);
  }

  try {
    db.prepare(
      'INSERT INTO process_locks (lock_name, pid, source, port) VALUES (?, ?, ?, ?)'
    ).run(lockName, pid, source, port);
    return { claimed: true };
  } catch (err) {
    if (err.code === 'ERR_SQLITE_ERROR' && err.message.includes('UNIQUE')) {
      // Race: another process claimed between our delete and insert
      const winner = db.prepare(
        'SELECT * FROM process_locks WHERE lock_name = ?'
      ).get(lockName);
      return { claimed: false, owner: winner };
    }
    throw err;
  }
}

/**
 * Release a named lock. Only deletes if this process owns it.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} lockName
 * @param {number} pid
 */
export function releaseLock(db, lockName, pid) {
  db.prepare(
    'DELETE FROM process_locks WHERE lock_name = ? AND pid = ?'
  ).run(lockName, pid);
}
```

### Migration SQL

```sql
-- MIGRATION_V8_TO_V9
CREATE TABLE IF NOT EXISTS process_locks (
  lock_name  TEXT PRIMARY KEY,
  pid        INTEGER NOT NULL,
  source     TEXT NOT NULL,
  port       INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### openDatabase() PRAGMA Addition

```javascript
// Add immediately after existing PRAGMAs in openDatabase():
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000'); // NEW
```

### Elapsed Time Formatting (UTC-safe)

```javascript
// Source: verified locally — datetime('now') returns UTC without 'Z'
function formatElapsed(startedAt) {
  const elapsedMs = Date.now() - new Date(startedAt + 'Z').getTime();
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s ago` : `${seconds}s ago`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Module-level `_importState` | DB-backed `process_locks` row | This phase | Cross-process safety |
| Port-scan for server conflict detection | DB-backed server ownership | This phase | Includes URL + PID, not just port |
| No busy_timeout (default 0) | `PRAGMA busy_timeout = 5000` | This phase | Eliminates SQLITE_BUSY on brief contention |

**Deprecated/outdated:**
- `_resetImportState()` export: still needed for in-process tests, but the DB lock becomes the authoritative guard for cross-process scenarios

## Open Questions

1. **Race window between claimLock INSERT and actual listen()**
   - What we know: `bin/cli.js` currently listens first, then would claim the server lock. If two instances start simultaneously and both listen on different ports before checking, we might have two servers.
   - What's unclear: The CONTEXT.md says "claim ownership immediately at startup when it starts listening" — this implies claim happens right after listen(), which is the right order.
   - Recommendation: Claim the 'server' lock immediately after `fastify.listen()` succeeds. If claim fails (live conflict), close the just-opened server and exit. The current port-fallback loop (ports 3847-3856) means two servers on different ports is currently possible — claiming the lock stops that.

2. **Import lock source field for web-triggered imports**
   - What we know: The `source` can be 'web', 'cli', or 'mcp'. Web-triggered imports go through `/api/import` route.
   - What's unclear: Does `runImport()` know the source (web vs cli)? Currently `runImport()` has no source parameter.
   - Recommendation: Add optional `source` parameter to `runImport(db, { maxAgeDays, onProgress, source })` defaulting to `'web'`. CLI import command (if it exists) passes `'cli'`.

3. **CLI `import` subcommand scope**
   - What we know: `bin/cli.js` currently only starts a web server. The CONTEXT.md mentions "CLI, MCP instances" as separate process types.
   - What's unclear: Is there a separate CLI import invocation path now, or is this Phase 31 territory?
   - Recommendation: For this phase, treat `source = 'web'` for all HTTP-triggered imports. The source field is set up for future CLI/MCP differentiation.

## Sources

### Primary (HIGH confidence)
- Node.js v22 official docs (fetched live) — DatabaseSync constructor, timeout option added v22.18.0
- `https://nodejs.org/api/sqlite.html` — PRAGMA via exec(), timeout option
- Local verification — `process.kill(pid, 0)` pattern tested on v22.17.1
- Local verification — `datetime('now')` UTC behavior confirmed
- Local verification — `INSERT OR IGNORE` + stale detection pattern tested end-to-end
- Local verification — `PRAGMA busy_timeout` via exec confirmed working

### Secondary (MEDIUM confidence)
- `https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/` — busy_timeout recommendations, WAL mode concurrency
- `https://sqlite.org/wal.html` — WAL mode multiple readers, single writer

### Tertiary (LOW confidence)
- WebSearch results on advisory lock patterns — community practice, not official spec

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing dependencies, zero new npm packages
- Architecture: HIGH — patterns verified with working code on the exact runtime in use
- Pitfalls: HIGH — race condition analysis from first principles + verified timezone behavior
- Migration pattern: HIGH — matches existing migration style in codebase exactly

**Research date:** 2026-03-27
**Valid until:** 2026-06-27 (stable domain — SQLite locking behavior, process signals)
