/**
 * Database layer.
 * Opens (or creates) the SQLite database at ~/.cctimereporter/data.db,
 * applies the schema, and returns the DatabaseSync instance.
 * Automatically migrates v1 databases to v2 on open.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCHEMA_DDL, SCHEMA_VERSION, MIGRATION_V1_TO_V2 } from './schema.js';

export const DB_DIR = join(homedir(), '.cctimereporter');
export const DB_PATH = join(DB_DIR, 'data.db');

/**
 * Migrates a v1 database to v2 in place.
 * Each ALTER TABLE statement is wrapped in try/catch since SQLite has no
 * ALTER TABLE ADD COLUMN IF NOT EXISTS — re-running is safe.
 *
 * @param {DatabaseSync} db
 */
function migrateV1toV2(db) {
  // Split on semicolons, filter empty lines, run each statement individually.
  // ALTER TABLE statements must be run one at a time; CREATE TABLE/INDEX can be batched.
  const statements = MIGRATION_V1_TO_V2
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  db.exec('BEGIN');
  try {
    for (const stmt of statements) {
      try {
        db.exec(stmt + ';');
      } catch (err) {
        // "duplicate column name" means the column already exists — safe to ignore.
        // Any other error is re-thrown.
        if (!err.message.includes('duplicate column name') &&
            !err.message.includes('already exists')) {
          throw err;
        }
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Opens the database, creating it if it doesn't exist.
 * Handles schema version mismatches:
 *   - version 0 (fresh): apply DDL normally
 *   - version 1: auto-migrate to v2
 *   - version 2 (current): apply DDL normally (CREATE IF NOT EXISTS is idempotent)
 *   - unknown version: drop and recreate (database is a cache, always re-importable)
 *
 * @returns {DatabaseSync} An open DatabaseSync instance.
 */
export function openDatabase() {
  mkdirSync(DB_DIR, { recursive: true });

  let db;

  try {
    db = new DatabaseSync(DB_PATH);

    // Check schema version via PRAGMA user_version.
    const row = db.prepare('PRAGMA user_version').get();
    const existingVersion = row.user_version;

    if (existingVersion === 1) {
      // Auto-migrate v1 → v2.
      migrateV1toV2(db);
      // PRAGMA user_version cannot use parameter binding — interpolate directly.
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } else if (existingVersion !== 0 && existingVersion !== SCHEMA_VERSION) {
      // Unknown version — drop and recreate.
      db.close();
      unlinkSync(DB_PATH);
      db = new DatabaseSync(DB_PATH);
    }
  } catch (_err) {
    // Corruption or open failure — delete and recreate.
    if (db) {
      try { db.close(); } catch (_) { /* ignore */ }
    }
    if (existsSync(DB_PATH)) {
      unlinkSync(DB_PATH);
    }
    db = new DatabaseSync(DB_PATH);
  }

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_DDL);
  // PRAGMA user_version cannot use parameter binding — must interpolate directly.
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  return db;
}
