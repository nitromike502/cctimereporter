/**
 * Coordination service — cross-process lock claim/release/liveness checks.
 *
 * Provides DB-based coordination for multi-instance scenarios:
 *   claimLock(db, lockName, pid, source, port?)   — attempt to claim a named lock
 *   releaseLock(db, lockName, pid)                — release own lock
 *   isProcessAlive(pid)                            — check if a PID is alive
 *   formatLockElapsed(startedAt)                   — format UTC datetime as "Xm Ys ago"
 *
 * All functions are stateless; the DB handle is passed per-call.
 * No module-level prepared statements — db handle varies per caller.
 */

/**
 * Check if a process is alive by sending signal 0 to the PID.
 *
 * @param {number} pid
 * @returns {boolean} true if the process exists, false if dead or inaccessible
 */
export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Format a UTC datetime string (from SQLite datetime('now')) as elapsed time.
 * SQLite datetime('now') returns ISO-like UTC strings without a 'Z' suffix,
 * so we append 'Z' before parsing.
 *
 * @param {string} startedAt - UTC datetime string e.g. "2026-03-27 14:30:00"
 * @returns {string} e.g. "2m 15s ago" or "45s ago"
 */
export function formatLockElapsed(startedAt) {
  const startMs = new Date(startedAt + 'Z').getTime();
  const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s ago` : `${seconds}s ago`;
}

/**
 * Attempt to claim a named lock in the process_locks table.
 *
 * Handles three cases:
 *   1. No existing lock — INSERT and return { claimed: true }
 *   2. Existing lock with live PID — return { claimed: false, owner }
 *   3. Existing lock with dead PID — DELETE stale row, INSERT, return { claimed: true }
 *
 * Race condition handling: the DELETE uses `AND pid = ?` guard so a concurrent
 * reclaimer won't delete the new owner's row. If our INSERT loses a race with
 * another claimer, the UNIQUE constraint fires and we re-SELECT the winner.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} lockName
 * @param {number} pid
 * @param {string} source - 'web' | 'cli' | 'mcp'
 * @param {number|null} [port]
 * @returns {{ claimed: boolean, owner?: object }}
 */
export function claimLock(db, lockName, pid, source, port = null) {
  // Check for existing lock
  const existing = db.prepare('SELECT * FROM process_locks WHERE lock_name = ?').get(lockName);

  if (existing) {
    if (isProcessAlive(existing.pid)) {
      // Live process holds the lock — conflict
      return { claimed: false, owner: existing };
    }

    // Stale lock — delete it (AND pid guard prevents TOCTOU race)
    db.prepare('DELETE FROM process_locks WHERE lock_name = ? AND pid = ?').run(lockName, existing.pid);
  }

  // Attempt to insert our lock
  try {
    db.prepare(
      'INSERT INTO process_locks (lock_name, pid, source, port) VALUES (?, ?, ?, ?)'
    ).run(lockName, pid, source, port);

    return { claimed: true };
  } catch (err) {
    // UNIQUE constraint — another process won the race
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      const winner = db.prepare('SELECT * FROM process_locks WHERE lock_name = ?').get(lockName);
      return { claimed: false, owner: winner };
    }
    throw err;
  }
}

/**
 * Release a named lock — only deletes the row if it belongs to the calling PID.
 * No-op if the lock doesn't exist or belongs to another PID.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} lockName
 * @param {number} pid
 */
export function releaseLock(db, lockName, pid) {
  db.prepare('DELETE FROM process_locks WHERE lock_name = ? AND pid = ?').run(lockName, pid);
}
