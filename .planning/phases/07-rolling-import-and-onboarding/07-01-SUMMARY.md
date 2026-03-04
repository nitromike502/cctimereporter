---
phase: 07-rolling-import-and-onboarding
plan: 01
subsystem: database
tags: [sqlite, schema-migration, import-pipeline, node-sqlite]

# Dependency graph
requires: []
provides:
  - Schema v4 with first_message_at/last_message_at columns on import_log
  - MIGRATION_V3_TO_V4 constant and migrateV3toV4() function
  - getImportedFileInfo() replacing getImportedFileSizes() with richer cache data
  - updateImportLog() with optional timestamp params (backward-compatible)
  - peekFirstTimestamp() for cheap file-level skip decisions
affects:
  - 07-02 (rolling window import logic — depends on getImportedFileInfo and peekFirstTimestamp)
  - 07-03 (welcome/onboarding state — depends on import_log data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration cascade: each migrate function only handles its own step, orchestrated in openDatabase() cascade"
    - "Safe ALTER TABLE: runMigration() wraps each statement in try/catch for idempotent re-runs"
    - "Cheap file peek: synchronous 8KB read to decide skip/import without streaming full file"

key-files:
  created: []
  modified:
    - src/db/schema.js
    - src/db/index.js
    - src/importer/db-writer.js
    - src/importer/parser.js
    - src/importer/index.js

key-decisions:
  - "getImportedFileInfo includes 'skipped_old' status in addition to 'ok' so peeked-and-skipped files are tracked for instant re-skip on subsequent imports"
  - "peekFirstTimestamp is synchronous by design — it is a skip decision gate, not hot event-loop code"
  - "updateImportLog params are optional with null defaults to maintain full backward compatibility at existing call sites"

patterns-established:
  - "Cache map pattern: getImportedFileInfo returns Map<filePath, {fileSize, lastMessageAt}> — richer than old size-only map"
  - "Peek-before-stream: synchronous partial read (first 8KB) as cheap skip gate before full async stream"

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 7 Plan 01: Schema v4 Migration and Import Cache Foundation Summary

**Schema v4 adds timestamp columns to import_log, enabling rolling-window import skip logic via a new getImportedFileInfo() cache map and peekFirstTimestamp() synchronous file peek**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T03:28:27Z
- **Completed:** 2026-03-04T03:31:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Schema v4 with `first_message_at` and `last_message_at` on `import_log`, migrated from v1/v2/v3 without data loss
- `getImportedFileInfo()` replaces `getImportedFileSizes()` — returns richer `{ fileSize, lastMessageAt }` objects, queries both `ok` and `skipped_old` statuses
- `peekFirstTimestamp()` reads only the first 8 KB of a JSONL file synchronously to extract the first message's timestamp — enables cheap rolling-window skip decisions without streaming the full file
- `updateImportLog()` extended with optional `firstMessageAt`/`lastMessageAt` params, all existing call sites remain compatible

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema v4 migration — add timestamp columns to import_log** - `379ed1d` (feat)
2. **Task 2: Update db-writer caching functions and add peekFirstTimestamp** - `ba288f4` (feat)

## Files Created/Modified
- `src/db/schema.js` - SCHEMA_VERSION bumped to 4, MIGRATION_V3_TO_V4 added, SCHEMA_DDL import_log updated with new columns
- `src/db/index.js` - migrateV3toV4() function added, wired into v1/v2/v3 cascade paths in openDatabase()
- `src/importer/db-writer.js` - updateImportLog() extended with timestamp params; getImportedFileSizes() replaced by getImportedFileInfo()
- `src/importer/parser.js` - peekFirstTimestamp() added as synchronous synchronous 8KB file peek utility
- `src/importer/index.js` - Updated to use getImportedFileInfo() instead of getImportedFileSizes() (Rule 3 blocker fix)

## Decisions Made
- Include `'skipped_old'` in getImportedFileInfo status filter so files that were previously peeked and skipped don't require re-peeking on next import run
- peekFirstTimestamp is synchronous — appropriate because it is a skip-gate decision before async work, not called in a hot async loop
- updateImportLog params default to null to preserve all existing call sites without changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated importer/index.js to use renamed getImportedFileInfo**
- **Found during:** Task 2 verification
- **Issue:** Removing `getImportedFileSizes` from db-writer.js would break the importer import which still referenced the old name, causing a runtime failure at the start of every import
- **Fix:** Updated import declaration and both usage sites (main files loop and agent files loop) in `src/importer/index.js` to use `getImportedFileInfo()` with `?.fileSize` property access
- **Files modified:** src/importer/index.js
- **Verification:** grep confirms no references to getImportedFileSizes remain in src/
- **Committed in:** ba288f4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary correctness fix. Without it, the importer would crash on next run. No scope creep.

## Issues Encountered
- Two `import_log` CREATE TABLE blocks in schema.js (one in SCHEMA_DDL, one in MIGRATION_V1_TO_V2) required careful context-matching to update only the SCHEMA_DDL block. Resolved by including surrounding unique context in the edit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema v4 is live, all migration paths tested
- getImportedFileInfo() and peekFirstTimestamp() ready for plan 07-02 rolling window logic
- updateImportLog() accepts timestamp params; plan 07-02 will populate them during import
- No blockers

---
*Phase: 07-rolling-import-and-onboarding*
*Completed: 2026-03-04*
