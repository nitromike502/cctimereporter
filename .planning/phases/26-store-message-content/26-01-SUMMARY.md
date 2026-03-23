---
phase: 26-store-message-content
plan: 01
subsystem: database
tags: [sqlite, schema-migration, importer, content-extraction, xml-stripping, truncation]

# Dependency graph
requires:
  - phase: 22-fork-detection
    provides: fork_branch_id column and schema v7 migration pattern
provides:
  - Schema v8 with content TEXT column on messages table
  - Auto-migration from any prior schema version (v1-v7) to v8
  - extractMessageContent() helper for text extraction and cleaning
  - Message content stored in DB for user and assistant messages
  - ON CONFLICT DO UPDATE includes content (re-import populates previously NULL rows)
affects:
  - phase: 27-messages-modal — reads content from DB instead of re-reading JSONL files

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Schema migration: ALTER TABLE ADD COLUMN with MIGRATION_VX_TO_VY constant pattern extended to v8
    - Content extraction: extractContentText() + cleanUserMessage() pipeline for stored text

key-files:
  created: []
  modified:
    - src/db/schema.js
    - src/db/index.js
    - src/importer/db-writer.js
    - src/importer/index.js

key-decisions:
  - "Only user and assistant message types get content stored; tool_use, tool_result, system, progress all get NULL"
  - "Truncation threshold 1250 chars; word-boundary cut near 1000 chars with '...' appended"
  - "cleanUserMessage() used for both user and assistant messages (strips slash command XML, bash tags, skill expansion tags)"
  - "ON CONFLICT DO UPDATE includes content = excluded.content so re-import populates previously NULL rows"
  - "Agent sidechain messages explicitly set content: null (they are imported separately from transcript files)"

patterns-established:
  - "extractMessageContent(msg): null for non-user/assistant, extractContentText + cleanUserMessage + truncation for others"
  - "Migration chain: each new version adds one migrateVXtoVY function wired into all lower-version paths"

# Metrics
duration: 16min
completed: 2026-03-23
---

# Phase 26 Plan 01: Store Message Content Summary

**Schema v8 adds content TEXT column to messages, populated during import with XML-stripped, word-boundary-truncated text for user and assistant messages only**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-23T22:42:02Z
- **Completed:** 2026-03-23T22:58:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `content TEXT` column to messages table via schema v8 (DDL + ALTER TABLE migration)
- Auto-migration from any prior version (v1-v7) wired via `migrateV7toV8()` in every migration path
- `extractMessageContent()` helper extracts text-type content blocks, strips XML tags via `cleanUserMessage()`, and truncates at word boundary when > 1250 chars
- `insertMessages()` now includes `content` in INSERT and in `ON CONFLICT DO UPDATE SET` for re-import idempotency
- Verified: 8780 messages with content after full import, only user/assistant types, 0 messages exceeding 1250 chars

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema v8 migration — add content column to messages** - `03c91da` (feat)
2. **Task 2: Importer content extraction and db-writer integration** - `03076f9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/db/schema.js` - Bumped SCHEMA_VERSION to 8, added `content TEXT` to CREATE TABLE, added MIGRATION_V7_TO_V8 export
- `src/db/index.js` - Imported MIGRATION_V7_TO_V8, added migrateV7toV8(), wired into all migration paths including new v7-only branch
- `src/importer/index.js` - Added extractMessageContent() helper, imports for extractContentText and cleanUserMessage, content field in messagesForDb mapping and agent messages mapping
- `src/importer/db-writer.js` - Added content to INSERT columns/values, ON CONFLICT DO UPDATE SET, and stmt.run() bindings

## Decisions Made
- Only `user` and `assistant` message types get content stored — tool_use, tool_result, system, progress all get NULL. This keeps the content column focused on human-readable conversation text.
- Truncation uses 1250-char threshold (store at full length below), word-boundary cut near 1000 chars (1000 + `...` = 1003 max for truncated messages). Natural messages can end with `...` in prose — verified no stored content exceeds 1250 chars.
- `cleanUserMessage()` handles both user and assistant messages — it strips slash command XML, bash input/output tags, and skill expansion tags, making it suitable for assistant messages too (which may have skill tags).
- `content = excluded.content` in ON CONFLICT DO UPDATE enables re-import to populate content on rows that previously had NULL (important for upgrade path from v7 where content didn't exist).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

During verification, noticed 804 DB messages ending with `...` had lengths up to 1022 chars. Investigation revealed these are naturally-occurring `...` in original message text (Claude using ellipsis in prose like "Spawning 2 agents in parallel..."). Confirmed: 0 messages exceed 1250 chars in DB, so no messages were improperly stored. All truncated messages (cut by our code) are <= 1003 chars.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `content` column now available in messages table for all sessions after re-import
- Phase 27 (messages modal) can read from DB instead of re-reading JSONL files
- Migration triggers `migrated = true` which will show re-import banner to users on next app start
- Users should trigger a re-import to populate content on existing message rows

---
*Phase: 26-store-message-content*
*Completed: 2026-03-23*
