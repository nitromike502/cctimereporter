---
phase: 22-schema-and-import
plan: "01"
subsystem: database
tags: [sqlite, schema-migration, fork-detection, import-pipeline]

# Dependency graph
requires:
  - phase: 21-import-progress-and-reimport
    provides: v0.6.0 import pipeline with SSE progress and re-import notification
provides:
  - Schema v7 with fork_branch_id TEXT column on messages table
  - Auto-migration chain from any prior version (v1-v6) to v7
  - Fork detector that assigns stable branch IDs per secondary branch
  - db-writer that persists fork_branch_id and updates on re-import
affects: [23-fork-segments-api, 24-fork-bar-renderer, 25-fork-bar-interaction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Branch ID = first child UUID of secondary branch (stable across re-imports)"
    - "ON CONFLICT DO UPDATE for fork_branch_id ensures re-import populates existing messages"
    - "Primary branch messages have NULL fork_branch_id; only secondary branches get IDs"

key-files:
  created: []
  modified:
    - src/db/schema.js
    - src/db/index.js
    - src/importer/fork-detector.js
    - src/importer/db-writer.js
    - src/importer/index.js

key-decisions:
  - "Branch ID = first child UUID of secondary branch — immutable UUID makes it stable"
  - "insertMessages changed from INSERT OR IGNORE to ON CONFLICT DO UPDATE to backfill fork_branch_id on existing messages without losing other data"
  - "Primary branch messages intentionally receive NULL fork_branch_id — they stay on the main timeline"

patterns-established:
  - "Migration pattern: add new migrateVNtoVN+1 function, wire into all prior version chains"

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 22 Plan 01: Schema and Import Summary

**Schema v7 with fork_branch_id on messages, stable branch ID assignment in fork-detector, and ON CONFLICT DO UPDATE in db-writer to backfill existing rows on re-import**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T02:56:11Z
- **Completed:** 2026-03-22T02:58:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added fork_branch_id TEXT column to messages table (schema v7, NULL = not a fork branch)
- Auto-migration from any prior version (v1-v6) adds the column via ALTER TABLE
- detectForks() now returns forkBranchMap: Map<uuid, branchId> alongside existing forkBranchUuids Set
- insertMessages() changed from INSERT OR IGNORE to ON CONFLICT DO UPDATE so re-importing populates fork_branch_id on previously-imported messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema v7 migration and fork_branch_id column** - `7ceb5ce` (feat)
2. **Task 2: Fork detector branch ID assignment and db-writer integration** - `8514511` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `src/db/schema.js` - SCHEMA_VERSION bumped to 7, fork_branch_id added to DDL, MIGRATION_V6_TO_V7 exported
- `src/db/index.js` - MIGRATION_V6_TO_V7 imported, migrateV6toV7() added, all migration paths updated
- `src/importer/fork-detector.js` - detectForks() returns forkBranchMap with per-branch stable IDs
- `src/importer/db-writer.js` - insertMessages() uses ON CONFLICT DO UPDATE for fork_branch_id + is_fork_branch
- `src/importer/index.js` - messagesForDb mapping includes fork_branch_id from forkBranchMap; agent messages get fork_branch_id: null

## Decisions Made
- **Branch ID = first child UUID:** The UUID of the first message in each secondary branch is used as the branch ID. UUIDs are immutable JSONL values, so this is perfectly stable across re-imports — no separate ID generation needed.
- **Primary branch = NULL fork_branch_id:** Only secondary branches get IDs. The primary branch (largest descendant count) stays on the main timeline and gets NULL, matching the render model where fork bars only appear for secondary branches.
- **ON CONFLICT DO UPDATE:** Changed from INSERT OR IGNORE to ON CONFLICT DO UPDATE (updating only fork_branch_id and is_fork_branch). This lets existing message rows receive fork data on re-import without touching timestamps, type, or other immutable fields.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema v7 with fork_branch_id is live; existing DB auto-migrates on next start
- fork_branch_id will be NULL on existing messages until re-imported with `force=true` or until files are naturally re-imported (size change)
- Phase 23 (fork segments API) can now query `SELECT DISTINCT fork_branch_id FROM messages WHERE session_id = ? AND fork_branch_id IS NOT NULL` to discover branches per session
- Working time policy for fork messages (is_fork_branch=1) still needs a decision before Phase 23 ships

---
*Phase: 22-schema-and-import*
*Completed: 2026-03-22*
