---
phase: 32-data-foundation
plan: 01
subsystem: database
tags: [sqlite, schema-migration, token-tracking, import-pipeline, node-sqlite]

# Dependency graph
requires:
  - phase: 31-mcp-and-coordination
    provides: schema v9 with process_locks table, import pipeline with db-writer
provides:
  - Schema v10 with 7 token columns on messages table (6 INTEGER token counts + 1 TEXT model)
  - MIGRATION_V9_TO_V10 constant, auto-migration chain from all prior versions
  - extractTokenUsage() helper in import pipeline extracting from rawMessage.message.usage
  - insertMessages() extended to write all 7 token columns with ON CONFLICT DO UPDATE
  - Token data populated for both main session messages and agent sidechain messages
affects: [33-token-service, 34-token-visualization, 35-token-cli-mcp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Token extraction from rawMessage.message.usage with nested ephemeral cache path (usage.cache_creation.ephemeral_*)"
    - "NULL convention for non-assistant messages — token columns are NULL, not zero"
    - "Model name from rawMessage.message.model, not from usage sub-object"

key-files:
  created: []
  modified:
    - src/db/schema.js
    - src/db/index.js
    - src/importer/db-writer.js
    - src/importer/index.js

key-decisions:
  - "NULL not 0 for non-assistant message token columns — avoids misleading zero aggregates in downstream queries"
  - "Ephemeral cache tiers nested at usage.cache_creation.ephemeral_* (not top-level usage.ephemeral_*) — matches actual JSONL transcript schema"
  - "Agent sidechain messages also get token extraction — subagent users would lose actual spend data without it"

patterns-established:
  - "extractTokenUsage(msg): returns null for non-assistant, reads nested usage object with safe optional chaining"
  - "insertMessages ON CONFLICT DO UPDATE now includes all 7 token columns — re-import backfills token data without data loss"

# Metrics
duration: 2min
completed: 2026-04-09
---

# Phase 32 Plan 01: Data Foundation Summary

**Schema v10 with 7 token columns on messages table (6 INTEGER token counts + TEXT model), full migration chain from v1-v9, and import pipeline wired to extract token usage from JSONL rawMessage.message.usage for both main and agent sidechain messages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-09T01:13:38Z
- **Completed:** 2026-04-09T01:16:23Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Schema v10 with MIGRATION_V9_TO_V10 for 7 new messages columns, threaded through all 9 existing version branches in openDatabase()
- extractTokenUsage() helper correctly reads nested ephemeral cache tiers from usage.cache_creation (not top-level usage)
- All 7 columns in insertMessages INSERT + ON CONFLICT DO UPDATE — re-import backfills token data without losing any existing data
- Agent sidechain messages also get token data extracted — preserves actual spend tracking for subagent users
- 3,398 assistant messages populated with non-NULL token integers and model strings on first import after migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema v10 migration and DDL update** - `8e7639d` (feat)
2. **Task 2: Import pipeline token extraction and DB writer update** - `7553d79` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `src/db/schema.js` - SCHEMA_VERSION 10, MIGRATION_V9_TO_V10, 7 new columns in SCHEMA_DDL
- `src/db/index.js` - migrateV9toV10(), import of MIGRATION_V9_TO_V10, threaded through all version branches + new v9 branch
- `src/importer/db-writer.js` - insertMessages extended with 7 new columns in INSERT, VALUES, ON CONFLICT DO UPDATE, and stmt.run() bindings
- `src/importer/index.js` - extractTokenUsage() helper added, messagesForDb mapping updated, agent path updated

## Decisions Made
- NULL not 0 for non-assistant message token columns: avoids misleading zero aggregates; downstream queries can cleanly filter `WHERE type = 'assistant' AND input_tokens IS NOT NULL`
- Ephemeral cache tiers read from `usage.cache_creation.ephemeral_*` not `usage.ephemeral_*`: matches the actual nested structure in the JSONL transcript schema reference
- Agent sidechain messages also extract token data: required to avoid missing actual API spend when users use subagents

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Token data foundation is complete: schema v10 live, import pipeline extracts and stores all 7 columns
- Phase 33 (token service layer) can immediately query messages with token data using `WHERE type = 'assistant' AND is_sidechain = 0 AND is_fork_branch = 0 AND input_tokens IS NOT NULL`
- No blockers. The `migrated` flag from openDatabase() will trigger the existing re-import banner, prompting users to run import --all to backfill older sessions not covered by the 7-day window import

---
*Phase: 32-data-foundation*
*Completed: 2026-04-09*
