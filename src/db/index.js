/**
 * Database layer.
 * Opens (or creates) the SQLite database at ~/.cctimereporter/data.db,
 * applies the schema, and returns the DatabaseSync instance.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCHEMA_DDL, SCHEMA_VERSION } from './schema.js';

export const DB_DIR = join(homedir(), '.cctimereporter');
export const DB_PATH = join(DB_DIR, 'data.db');

/**
 * Opens the database, creating it if it doesn't exist.
 * Handles schema version mismatches and corruption by dropping and rebuilding.
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

    if (existingVersion !== 0 && existingVersion !== SCHEMA_VERSION) {
      // Schema mismatch — drop and recreate. Database is a cache, always re-importable.
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
