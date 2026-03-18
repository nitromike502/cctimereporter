---
phase: 19-schema-import-contract
plan: 01
subsystem: database
tags: [sqlite, migration, schema, importer, parser, api-contract]

# Dependency graph
requires:
  - phase: 17-18-incremental-import
    provides: schema v6, import pipeline with INSERT OR IGNORE on messages
provides:
  - Schema v7 with command TEXT column on messages table
  - Slash command detection during JSONL import (detectCommand function)
  - command field propagated through full import pipeline (main + agent paths)
  - Segment-aware API contract document for GET /api/timeline
affects: [20-timeline-segments, 21-frontend-rendering, 22-time-filtering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "schema migration chain: each version migrates through all subsequent steps"
    - "command detection: XML format via parseCommandXml(), plain-text via regex"
    - "INSERT OR IGNORE means command col NULL for pre-v7 rows until re-import"

key-files:
  created:
    - src/server/routes/timeline-contract.md
  modified:
    - src/db/schema.js
    - src/db/index.js
    - src/importer/parser.js
    - src/importer/db-writer.js
    - src/importer/index.js

key-decisions:
  - "No backfill UPDATE in v7 migration — existing rows get NULL, re-import populates"
  - "detectCommand takes rawMsg (JSONL line object), not normalized message, to access msg.type and extractContentText()"
  - "INSERT OR IGNORE on messages means command stays NULL for already-imported rows — by design"

patterns-established:
  - "Migration pattern: MIGRATION_VN_TO_VM constant + migrateFn + added to all prior version branches"
  - "Field propagation: parser emits field → messagesForDb maps it → db-writer inserts it"

# Metrics
duration: 3min
completed: 2026-03-18
---

# Phase 19 Plan 01: Schema and Import Contract Summary

**Schema v7 with command TEXT column on messages, slash command detection in import pipeline (clear/rename/gsd:*), and segment-aware API contract for GET /api/timeline**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-18T02:51:03Z
- **Completed:** 2026-03-18T02:53:48Z
- **Tasks:** 3
- **Files modified:** 5 + 1 created

## Accomplishments
- Schema migrated to v7 with `command TEXT` on messages — upgrades from any prior version (1-6) handled in cascade
- `detectCommand()` function in parser.js detects slash commands in both XML (`<command-name>/clear</command-name>`) and plain-text (`/clear`) formats
- Full import pipeline propagates `command` field: parser → messagesForDb mapping → agent messages mapping → db-writer INSERT
- After re-import, 21 distinct command values found in messages table including `clear`, `gsd:execute-phase`, `rename`, etc.
- API contract document defines segment-aware response shape that Phases 20, 21, 22 will code against

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration v6 to v7** - `b62a96f` (feat)
2. **Task 2: Parser command detection and import pipeline wiring** - `00a8798` (feat)
3. **Task 3: Segment-aware API contract document** - `81d2cdb` (docs)

## Files Created/Modified
- `src/db/schema.js` - SCHEMA_VERSION 7, command TEXT in DDL, MIGRATION_V6_TO_V7 constant
- `src/db/index.js` - migrateV6toV7 function, updated all version branches (1-5), new branch for v6
- `src/importer/parser.js` - detectCommand() function, command field in messages.push()
- `src/importer/db-writer.js` - command column in INSERT OR IGNORE, $command in stmt.run()
- `src/importer/index.js` - command field in messagesForDb mapping and agent messages mapping
- `src/server/routes/timeline-contract.md` - Full segment-aware API contract with behavioral rules, example JSON, implementation notes

## Decisions Made
- No backfill UPDATE in migration: existing rows retain `command = NULL` until re-imported. This is intentional — the database is a cache and always re-importable.
- `detectCommand` operates on the raw JSONL message object (`msg`), not the normalized message, since it needs `msg.type` and passes the whole object to `extractContentText()`.
- The `command = 'clear'` query in Phase 20 will find split points at query time (not stored as a separate column on sessions).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 20 (Timeline Segments backend): `messages.command` column ready, contract document written. Phase 20 can query `WHERE command = 'clear'` to find split points and derive segments at query time in the timeline route.
- Phase 21 (Frontend rendering): Contract document fully specifies `segments[]` array shape, segmentId format, and all fields needed for Gantt rendering.
- Phase 22 (Time-of-day filtering): Contract specifies per-segment `workingTimeMs` and `idleGaps` — filtering operates on the same segment structure.
- Concern carried forward: PATCH /api/sessions/:id and GET /api/sessions/:id/messages will receive segmentIds once Phase 21 ships — Phase 20 must add segment ID resolution (strip `:N` suffix) before Phase 21 goes live.

---
*Phase: 19-schema-import-contract*
*Completed: 2026-03-18*
