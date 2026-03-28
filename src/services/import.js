/**
 * Import service — wraps importAll() with a module-level concurrency guard.
 *
 * Provides:
 *   runImport(db, opts)      — async import with conflict detection
 *   ImportConflictError      — thrown when import is already running
 *   _resetImportState        — for test teardown only
 *
 * Unlike the sessions and timeline services, import is NOT a factory pattern
 * because the concurrency guard is module-level state (not DB-bound).
 */

import { importAll } from '../importer/index.js';
import { claimLock, releaseLock, formatLockElapsed } from './coordination.js';

/**
 * Error thrown when an import is already in progress.
 */
export class ImportConflictError extends Error {
  /**
   * @param {number} pid       - PID of the running import process
   * @param {string} source    - 'web' | 'cli' | 'mcp'
   * @param {string|number} startedAt - UTC datetime string (from DB) or epoch ms (in-memory guard)
   */
  constructor(pid, source, startedAt) {
    let ago;
    if (typeof startedAt === 'string') {
      // From DB: SQLite datetime('now') UTC string without Z suffix
      ago = formatLockElapsed(startedAt);
    } else {
      // From in-memory guard: epoch ms timestamp
      const elapsedMs = Date.now() - startedAt;
      const sec = Math.floor(elapsedMs / 1000);
      ago = Math.floor(sec / 60) > 0 ? `${Math.floor(sec / 60)}m ${sec % 60}s ago` : `${sec}s ago`;
    }
    super(`Import already running (PID ${pid} via ${source}, started ${ago}). Wait for it to finish or kill the process.`);
    this.name = 'ImportConflictError';
    this.pid = pid;
    this.source = source;
    this.startedAt = startedAt;
  }
}

// Module-level concurrency guard — null when idle, object when running
let _importState = null; // null | { pid: number, startTime: number, source: string }

/**
 * Run the import pipeline with concurrency protection.
 *
 * Acquires a DB-based lock first (cross-process), then checks the in-memory
 * guard as a fast-path for same-process double calls.
 *
 * Throws ImportConflictError if another import is already in progress.
 * Progress is passed through to onProgress if provided.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ maxAgeDays?: number, onProgress?: Function, source?: string }} [opts]
 * @returns {Promise<{ projectsFound: number, filesProcessed: number, filesSkipped: number, totalMessages: number, errors: string[] }>}
 */
export async function runImport(db, { maxAgeDays, onProgress, source = 'web' } = {}) {
  // DB lock check first — cross-process conflict detection
  const lockResult = claimLock(db, 'import', process.pid, source);
  if (!lockResult.claimed) {
    throw new ImportConflictError(lockResult.owner.pid, lockResult.owner.source, lockResult.owner.started_at);
  }

  // In-memory guard — fast-path for same-process double calls
  if (_importState !== null) {
    releaseLock(db, 'import', process.pid);
    throw new ImportConflictError(_importState.pid, _importState.source, _importState.startTime);
  }

  _importState = { pid: process.pid, startTime: Date.now(), source };

  try {
    return await importAll(db, { maxAgeDays, onProgress });
  } finally {
    _importState = null;
    releaseLock(db, 'import', process.pid);
  }
}

/**
 * Reset the module-level import state. For test teardown only.
 * Note: this only resets the in-memory guard; DB lock is released in finally.
 */
export function _resetImportState() {
  _importState = null;
}
