---
phase: 29-multi-instance-coordination
verified: 2026-03-28T02:20:46Z
status: passed
score: 13/13 must-haves verified
gaps: []
---

# Phase 29: Multi-Instance Coordination Verification Report

**Phase Goal:** Multiple processes share one SQLite database safely — only one web server runs at a time and only one import runs at a time, with automatic stale-process recovery
**Verified:** 2026-03-28T02:20:46Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | process_locks table exists after DB open | VERIFIED | `src/db/schema.js` line 105: `CREATE TABLE IF NOT EXISTS process_locks` in `SCHEMA_DDL`; also in `MIGRATION_V8_TO_V9` (line 182) for migration path |
| 2 | busy_timeout is set to 5000ms on every DB open | VERIFIED | `src/db/index.js` line 194: `db.exec('PRAGMA busy_timeout = 5000')` — called unconditionally in `openDatabase()` after all migration paths |
| 3 | claimLock returns `{ claimed: true }` when no existing lock | VERIFIED | `src/services/coordination.js` lines 79-84: INSERT succeeds on empty table, returns `{ claimed: true }` |
| 4 | claimLock returns `{ claimed: false, owner }` when live PID holds lock | VERIFIED | `src/services/coordination.js` lines 68-72: `isProcessAlive(existing.pid)` returns true → returns `{ claimed: false, owner: existing }` |
| 5 | claimLock reclaims stale lock from dead PID | VERIFIED | `src/services/coordination.js` line 75: `DELETE FROM process_locks WHERE lock_name = ? AND pid = ?` when `isProcessAlive` returns false, then re-inserts |
| 6 | releaseLock only deletes row owned by calling PID | VERIFIED | `src/services/coordination.js` line 104: `DELETE FROM process_locks WHERE lock_name = ? AND pid = ?` — PID guard ensures ownership |
| 7 | Import acquires DB lock before running, releases on completion or error | VERIFIED | `src/services/import.js` lines 62-79: `claimLock` called before `importAll`, `releaseLock` in `finally` block covering both success and error paths |
| 8 | Import conflict error includes source, elapsed time, and actionable hint | VERIFIED | Message: `"Import already running (PID {pid} via {source}, started {ago}). Wait for it to finish or kill the process."` — confirmed by live eval |
| 9 | First server instance claims server lock after listen() | VERIFIED | `bin/cli.js` line 77: `claimLock(db, 'server', process.pid, 'web', actualPort)` called after successful `fastify.listen()` |
| 10 | Second server instance detects live lock, prints URL with PID, exits cleanly | VERIFIED | `bin/cli.js` lines 78-84: checks `lockResult.claimed`, prints `Server already running at http://127.0.0.1:{port} (PID {pid})`, closes fastify + db, exits 0 |
| 11 | Server lock released on SIGINT/SIGTERM | VERIFIED | `bin/cli.js` lines 105-113: `releaseLock(db, 'server', process.pid)` called in both SIGINT and SIGTERM handlers |
| 12 | Stale server lock from crashed process reclaimed by next startup | VERIFIED | `claimLock` in coordination.js handles stale detection generically for any lock name — server lock reuses same path |
| 13 | Server conflict message includes URL of running server | VERIFIED | `bin/cli.js` line 79-80: `ownerUrl = http://127.0.0.1:${lockResult.owner.port}` included in stdout message |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/coordination.js` | exports claimLock, releaseLock, isProcessAlive | VERIFIED | 105 lines, all three functions exported, no stubs |
| `src/db/schema.js` | SCHEMA_VERSION = 9 | VERIFIED | Line 7: `export const SCHEMA_VERSION = 9` |
| `src/db/index.js` | busy_timeout set | VERIFIED | Line 194: `PRAGMA busy_timeout = 5000` unconditionally called |
| `bin/cli.js` | imports and uses claimLock | VERIFIED | Line 23: dynamic import of claimLock, releaseLock; used at lines 77 and 108 |
| `src/services/import.js` | runImport with lock acquisition | VERIFIED | 89 lines; claimLock before importAll, releaseLock in finally |
| `src/server/routes/import.js` | handles ImportConflictError with 409 | VERIFIED | Lines 28-31: 409 response; lines 70-72: SSE conflict event |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bin/cli.js` | `src/services/coordination.js` | dynamic import | WIRED | claimLock and releaseLock imported and called |
| `src/services/import.js` | `src/services/coordination.js` | ES import | WIRED | claimLock, releaseLock, formatLockElapsed all imported and used |
| `src/server/routes/import.js` | `src/services/import.js` | ES import | WIRED | runImport and ImportConflictError imported and used |
| `runImport` | `claimLock` | function call | WIRED | claimLock called as first act in runImport; releaseLock in finally |
| `claimLock` | `process_locks` table | SQL | WIRED | INSERT, SELECT, DELETE all reference `process_locks` by name |
| `openDatabase()` | `MIGRATION_V8_TO_V9` | migration chain | WIRED | migrateV8toV9 applied from all existing version paths (v1–v8) |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| SVC-03: DB-based server ownership coordination | SATISFIED | cli.js claims/releases server lock via claimLock/releaseLock |
| SVC-04: DB-based import lock | SATISFIED | runImport() claims import lock via claimLock before importAll() |
| COORD-01: Multiple MCP instances read concurrently without conflict | SATISFIED | busy_timeout=5000 set on every DB open; WAL mode prevents reader/writer conflicts |
| COORD-02: Only one web server at a time | SATISFIED | Server lock detected, conflicting instance exits with owner URL |
| COORD-03: Only one import at a time with stale detection | SATISFIED | DB lock + in-memory guard; stale PIDs auto-reclaimed |
| COORD-04: Stale process detection and auto-reclaim | SATISFIED | isProcessAlive(pid) via kill(pid, 0); DELETE+re-INSERT on dead PID |

### Anti-Patterns Found

None. No TODO/FIXME, placeholder content, empty handlers, or stub patterns found in any coordination-related files.

### Human Verification Required

None. All coordination logic is structural and verifiable via code inspection.

### Gaps Summary

No gaps. All 13 observable truths verified. The coordination implementation is complete and properly wired:

- `process_locks` table created in schema v9 DDL and migration V8→V9
- `busy_timeout = 5000` set unconditionally in `openDatabase()`
- `coordination.js` implements all three cases (no lock, live lock, stale lock) with race-condition guard
- `releaseLock` uses PID-guarded DELETE to prevent cross-process deletion
- Import service acquires DB lock before work, releases in finally (covers error paths)
- Conflict error message is human-readable with source, elapsed time, and remediation hint
- CLI claims server lock after successful listen, releases on SIGINT/SIGTERM, exits cleanly on conflict with owner URL

---

_Verified: 2026-03-28T02:20:46Z_
_Verifier: Claude (gsd-verifier)_
