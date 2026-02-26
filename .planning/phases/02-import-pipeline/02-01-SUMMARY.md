---
phase: 02
plan: 01
subsystem: database
tags: [sqlite, schema-migration, db-writer, import-pipeline]
requires: [01-01]
provides: [v2-schema, db-writer-module]
affects: [02-02, 02-03, 02-04]
tech-stack:
  added: []
  patterns: [BEGIN/COMMIT-manual-transactions, INSERT-OR-REPLACE-upsert, INSERT-OR-IGNORE-idempotent-batch]
key-files:
  created:
    - src/importer/db-writer.js
  modified:
    - src/db/schema.js
    - src/db/index.js
decisions:
  - "MIGRATION_V1_TO_V2 exported as string constant; migrateV1toV2() iterates statements, wraps each ALTER TABLE in try/catch for idempotency"
  - "node:sqlite has no db.transaction() — all batch ops use db.exec('BEGIN')/db.exec('COMMIT') with ROLLBACK in catch"
  - "upsertSession uses INSERT OR REPLACE (sessions.session_id is UNIQUE, full row replacement is correct for re-import)"
  - "upsertTickets uses INSERT OR IGNORE to avoid overwriting is_primary on re-import of same ticket"
metrics:
  duration: 2m 11s
  completed: 2026-02-26
---

# Phase 2 Plan 01: Schema v2 Migration and DB Writer Summary

**One-liner:** v2 schema with tickets/import_log tables and prepared-statement writers using manual BEGIN/COMMIT transactions via node:sqlite.

## What Was Built

### Task 1: Schema v1 → v2 migration

`src/db/schema.js` bumped to SCHEMA_VERSION=2 with the full v2 DDL for fresh installs. New tables added:

- **tickets** — records each ticket detection per session with source, detected_at, is_primary flag
- **import_log** — tracks per-file import status (file_path, file_size, status, error_msg) for change detection on re-import

New columns on existing tables:
- sessions: file_size, assistant_message_count, fork_count, real_fork_count, is_compacted, has_subagents, last_updated_at, custom_title, slug
- messages: parent_uuid, subtype, is_meta, is_fork_branch

`src/db/index.js` now detects `user_version = 1` and calls `migrateV1toV2()` automatically. Each ALTER TABLE statement is wrapped in try/catch (SQLite has no ADD COLUMN IF NOT EXISTS) making migration idempotent. Transaction is wrapped in `db.exec('BEGIN')` / `db.exec('COMMIT')` as required by node:sqlite.

### Task 2: DB writer module

`src/importer/db-writer.js` exports five functions:

| Function | Semantics |
|---|---|
| `upsertSession(db, sessionData)` | INSERT OR REPLACE — full row replacement on re-import |
| `insertMessages(db, sessionId, messages)` | Batch INSERT OR IGNORE in BEGIN/COMMIT transaction |
| `upsertTickets(db, sessionId, tickets, primaryTicket)` | INSERT OR IGNORE with is_primary computed per row |
| `updateImportLog(db, filePath, sessionId, fileSize, status, errorMsg)` | INSERT OR REPLACE on UNIQUE(file_path) |
| `getImportedFileSizes(db)` | Returns Map<file_path, file_size> for change detection |

## Decisions Made

1. **MIGRATION_V1_TO_V2 as exported constant** — downstream code can inspect or test migration SQL without opening a database; migration function is purely internal to index.js
2. **Manual BEGIN/COMMIT** — node:sqlite's DatabaseSync has no `.transaction()` wrapper method; all batch operations explicitly manage their transaction boundary
3. **INSERT OR REPLACE for sessions** — session row is completely owned by the import pipeline; replace semantics are correct and simpler than UPDATE
4. **INSERT OR IGNORE for tickets** — preserves is_primary flag set by a prior import if the same (session_id, ticket_key, source) triple is seen again

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `PRAGMA user_version` returns 2 after open
2. Fresh database (delete + recreate) has all 5 tables: projects, sessions, messages, tickets, import_log
3. v1 database (3 tables, user_version=1) auto-migrates to v2 with all new columns present
4. Running migration twice produces no errors (try/catch on duplicate column)
5. Integration test: upsertSession, insertMessages, upsertTickets, updateImportLog, getImportedFileSizes all execute without error; running each twice produces no duplicates

## Next Phase Readiness

Phase 02-02 (transcript parser) can now:
- Call `openDatabase()` and receive a v2-ready db
- Use all five db-writer functions to persist parsed data
- Use `getImportedFileSizes()` to skip unchanged files on incremental import

No blockers for 02-02.
