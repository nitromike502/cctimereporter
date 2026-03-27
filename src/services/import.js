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

/**
 * Error thrown when an import is already in progress.
 */
export class ImportConflictError extends Error {
  /**
   * @param {number} pid     - PID of the running import process
   * @param {number} startTime - Date.now() when import started
   */
  constructor(pid, startTime) {
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(elapsedSec / 60);
    const seconds = elapsedSec % 60;
    const ago = minutes > 0 ? `${minutes}m ${seconds}s ago` : `${seconds}s ago`;
    super(`Import already running (PID ${pid}, started ${ago})`);
    this.name = 'ImportConflictError';
    this.pid = pid;
    this.startTime = startTime;
  }
}

// Module-level concurrency guard — null when idle, object when running
let _importState = null; // null | { pid: number, startTime: number }

/**
 * Run the import pipeline with concurrency protection.
 *
 * Throws ImportConflictError if another import is already in progress.
 * Progress is passed through to onProgress if provided.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ maxAgeDays?: number, onProgress?: Function }} [opts]
 * @returns {Promise<{ projectsFound: number, filesProcessed: number, filesSkipped: number, totalMessages: number, errors: string[] }>}
 */
export async function runImport(db, { maxAgeDays, onProgress } = {}) {
  if (_importState !== null) {
    throw new ImportConflictError(_importState.pid, _importState.startTime);
  }

  _importState = { pid: process.pid, startTime: Date.now() };

  try {
    return await importAll(db, { maxAgeDays, onProgress });
  } finally {
    _importState = null;
  }
}

/**
 * Reset the module-level import state. For test teardown only.
 */
export function _resetImportState() {
  _importState = null;
}
