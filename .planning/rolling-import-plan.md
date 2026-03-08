# Plan: Rolling 30-Day Import Window + First-Time Welcome

## Context

When a user first runs `npx cctimereporter`, the import scans ALL transcript files with no date limit. For users with months of Claude Code history, this makes the first launch very slow. Additionally, first-time users see a generic "No sessions found" message with no guidance that they need to import.

## Changes

### 1. Schema migration v3→v4 — add timestamp columns to import_log

**File:** `src/db/schema.js`
- Bump `SCHEMA_VERSION` to 4
- Add `MIGRATION_V3_TO_V4` constant: two ALTER TABLE statements adding `first_message_at TEXT` and `last_message_at TEXT` to `import_log`
- Update `SCHEMA_DDL` `import_log` CREATE TABLE to include these columns (for fresh installs)

**File:** `src/db/index.js`
- Import `MIGRATION_V3_TO_V4`
- Add `migrateV3toV4(db)` function
- Wire migration cascade: v1→v2→v3→v4, v2→v3→v4, v3→v4

### 2. Store timestamps in import_log + new query

**File:** `src/importer/db-writer.js`
- Update `updateImportLog()` — add `firstMessageAt` and `lastMessageAt` params, include in INSERT
- Replace `getImportedFileSizes()` with `getImportedFileInfo()` returning `Map<path, { fileSize, lastMessageAt }>`
  - Query includes `WHERE status IN ('ok', 'skipped_old')` to also use cached info from peeked files

### 3. Add cheap first-line timestamp peek

**File:** `src/importer/parser.js`
- Add `peekFirstTimestamp(filePath)` — reads first 8KB with `openSync`/`readSync`, parses first JSON line, returns `timestamp` or null
- This avoids full streaming parse for files we can skip early

### 4. Rolling window logic in importAll()

**File:** `src/importer/index.js`
- Add `maxAgeDays` option (default 30, null = no limit)
- Compute cutoff ISO date string
- Replace `getImportedFileSizes` with `getImportedFileInfo`
- File filtering logic (in order):
  1. Size unchanged + cached → skip (existing behavior)
  2. Size unchanged + cached `lastMessageAt` before cutoff → skip (rolling window on known files)
  3. New file (no cache) → `peekFirstTimestamp()`: if first timestamp before cutoff → record as `skipped_old` in import_log, skip
  4. Otherwise → full import
- Pass `firstMessageAt`/`lastMessageAt` to `updateImportLog()` calls (line 251 for success, also agent files at line 355)

### 5. Import route accepts maxAgeDays

**File:** `src/server/routes/import.js`
- Read `maxAgeDays` from request body (default 30)
- Pass to `importAll(db, { maxAgeDays })`

### 6. Add totalSessions to timeline API response

**File:** `src/server/routes/timeline.js`
- Add prepared statement: `SELECT COUNT(*) AS cnt FROM sessions`
- Include `totalSessions` in response object

### 7. First-time welcome + improved empty-date state

**File:** `src/client/pages/TimelinePage.vue`
- Split the existing empty state (`projects.length === 0`) into two:
  - **First-time welcome** (`totalSessions === 0`): "Welcome to CC Time Reporter" heading, explanation that it scans `~/.claude/projects/` for the last 30 days, prominent Import button
  - **Empty date** (`totalSessions > 0` but no projects for this date): "No sessions found for {date}" with hint to try a different date
- Add CSS for `.timeline-welcome` (centered, padded, max-width 480px)

### 8. Build dist

- Run `npm run build` after all changes

## Files Modified (7)

1. `src/db/schema.js` — schema v4, migration constant, DDL update
2. `src/db/index.js` — migration wiring
3. `src/importer/db-writer.js` — updateImportLog params, getImportedFileInfo
4. `src/importer/parser.js` — peekFirstTimestamp
5. `src/importer/index.js` — rolling window filtering in importAll
6. `src/server/routes/import.js` — pass maxAgeDays
7. `src/server/routes/timeline.js` — totalSessions in response
8. `src/client/pages/TimelinePage.vue` — welcome state + empty-date state

## Verification

1. Delete `~/.cctimereporter/data.db` and run `node bin/cli.js`
2. Open browser — should see welcome message (not generic empty state)
3. Click Import — should complete faster than before (30-day window)
4. Check `sqlite3 ~/.cctimereporter/data.db "SELECT status, COUNT(*) FROM import_log GROUP BY status"` — should show `ok` and `skipped_old` entries
5. Navigate to a date with no sessions — should see "No sessions found for {date}" (different from welcome)
6. Re-run import — old files should be skipped instantly via cached timestamps
