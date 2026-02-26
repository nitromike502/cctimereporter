---
phase: 02
plan: 03
subsystem: import-pipeline
tags: [discovery, orchestrator, import-pipeline, idempotent, size-based-skip, node-sqlite]

dependency-graph:
  requires:
    - 01-01  # Package skeleton, db schema, openDatabase()
    - 02-01  # db-writer: upsertSession, insertMessages, upsertTickets, updateImportLog, getImportedFileSizes
    - 02-02  # parseTranscript, detectForks, scoreTickets, determineWorkingBranch, TICKET_PATTERN
  provides:
    - discoverProjects: reads ~/.claude.json + filesystem scan, returns merged project list
    - findTranscriptFiles: filters .jsonl files for a project, skips agent- prefixed
    - importAll: full end-to-end import pipeline, idempotent via size-based skip
  affects:
    - 03-xx  # Query layer reads sessions, messages, tickets tables populated here
    - 04-xx  # Component library — no dependency on importer
    - 05-xx  # Timeline UI reads database populated by this importer

tech-stack:
  added: []
  patterns:
    - dual-source-discovery: ~/.claude.json + filesystem scan merged and deduplicated
    - size-based-skip: file_size comparison in import_log skips unchanged files without mtime
    - per-file-error-isolation: each file import wrapped in try/catch, errors logged not propagated
    - orphaned-dir-handling: directories not in ~/.claude.json included without path decoding (lossy encoding)

key-files:
  created:
    - src/importer/discovery.js
    - src/importer/index.js
  modified: []

decisions:
  - id: size-based-skip
    choice: Compare file.size against import_log.file_size to skip unchanged files
    rationale: Size is always available (statSync) and deterministic; mtime is unreliable across filesystem operations
    alternatives: mtime-based (Python PoC approach — fragile on copy/move), hash-based (expensive for large JSONL)
  - id: orphaned-dir-no-decode
    choice: Use directory name as-is for orphaned project paths (no decoding)
    rationale: RESEARCH.md documents the encoding as lossy — '-' replaces '/' but '-' also appears in path components
    alternatives: Attempt heuristic decode (produces incorrect paths for paths with hyphens in directory names)
  - id: dual-source-discovery
    choice: Merge ~/.claude.json projects + filesystem scan, deduplicate by transcriptDir
    rationale: ~/.claude.json may be missing/malformed; filesystem scan catches projects created outside Claude app
    alternatives: Filesystem scan only (loses clean projectPath from ~/.claude.json)
  - id: ticket-collection-stringify
    choice: JSON.stringify array content for ticket scanning in detectTicketsFromMessage
    rationale: User messages with array content (tool_result blocks) may contain ticket references; stringify captures all
    alternatives: extractContentText (filters text blocks only — misses ticket refs in non-text blocks)

metrics:
  duration: ~4 min
  completed: 2026-02-26
  tasks-total: 2
  tasks-completed: 2
  deviations: 0
---

# Phase 02 Plan 03: Project Discovery and Import Orchestrator Summary

**One-liner:** Dual-source project discovery (~/.claude.json + filesystem), size-based idempotent import orchestrator wiring parser, fork detector, ticket scorer, and db-writer into a complete pipeline.

## What Was Built

Two modules completing the import pipeline: `discovery.js` for project/file enumeration, and `index.js` as the top-level orchestrator.

### src/importer/discovery.js

`discoverProjects()` merges two discovery sources:

1. **~/.claude.json `projects` property** — the authoritative Claude app project registry. Each key is a project path; it encodes to transcript directory name by replacing all `/` with `-`. Only projects whose transcript directory actually exists on disk are included.

2. **~/.claude/projects/ filesystem scan** — catches orphaned directories that exist on disk but are not registered in `~/.claude.json`. Orphaned dirs use the raw directory name as their `projectPath` since the encoding is documented as lossy (RESEARCH.md) — decoding would produce incorrect paths.

Results are deduplicated by transcript directory path and sorted by `projectPath`.

`findTranscriptFiles(transcriptDir)` returns file objects for importable transcripts:
- Must end with `.jsonl`
- Must not start with `agent-` (sub-agent files)
- Must be a regular file (not a subdirectory like UUID session dirs)
- Returns: `{ name, path, sessionId, size }`

Both functions handle missing/unreadable paths gracefully with stderr warnings, never throwing.

### src/importer/index.js

`importAll(db, options)` is the async entry point that orchestrates the full pipeline:

1. **Discover** all projects via `discoverProjects()`
2. **Load import state** via `getImportedFileSizes()` — one DB read for all previously imported sizes
3. **For each project:** get-or-create the `projects` table record
4. **For each file:** compare current size to stored size; skip if unchanged (idempotent)
5. **For each file to import:**
   - Parse with `parseTranscript()`
   - Detect forks with `detectForks()`
   - Score tickets with `scoreTickets()` / `determineWorkingBranch()`
   - Count tool_use blocks across assistant messages
   - Compute first/last timestamps (ISO8601 string sort = lexicographic sort)
   - Write session, messages, tickets, import_log via db-writer functions
6. **After each project:** update `projects.last_import_at`
7. **Return** summary object: `{ projectsFound, filesProcessed, filesSkipped, totalMessages, errors }`

Ticket collection (`collectTickets`) scans all messages for:
- User messages: `/prep-ticket` slash command (inline and XML format), generic `TICKET_PATTERN` mentions
- All messages: `gitBranch` ticket pattern matches

Deduplication is by `(ticket_key, source)` — the same ticket from different sources is recorded separately, as in the Python PoC.

## Verified Against Real Data

Tested against all 7 discovered projects (46 JSONL files, 7,335 messages):

- **First run:** 46 files processed, 0 errors, sessions/messages/tickets all populated
- **Second run:** 45 files skipped (1 file growing because it's the active session — correct behavior)
- **Session count:** stable at 46 across multiple runs (INSERT OR REPLACE prevents duplicates)
- **Primary tickets:** 25 of 46 sessions have `primary_ticket IS NOT NULL`
- **Import log:** 46 entries with `status = 'ok'`, one entry per file

Ticket detection correctly identifies: `BUG-043`, `STORY-8`, `STORY-1`, `BUG-032`, `STORY-7`, `AUTH-01`, and others from branch names and content across multiple project directories.

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

The full import pipeline is complete. Phase 3 (query layer) can now:
- Query `sessions` for working time calculations
- Query `messages` for timeline data
- Query `tickets` for ticket-session relationships
- Call `importAll(db, options)` from the CLI to populate the database

No blockers. No concerns.
