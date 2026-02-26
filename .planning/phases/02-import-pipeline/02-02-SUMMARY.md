---
phase: 02
plan: 02
subsystem: import-pipeline
tags: [parser, jsonl, fork-detection, ticket-scoring, pure-functions, node-readline]

dependency-graph:
  requires:
    - 01-01  # Package skeleton with ESM module setup
  provides:
    - parseTranscript: async JSONL streaming parser returning messages + session metadata
    - extractContentText: content extraction helper for ticket scanning
    - detectForks: message tree fork classifier (progress vs real)
    - scoreTickets: multi-source ticket scoring returning primary ticket key
    - determineWorkingBranch: branch frequency analyzer with ticket preference
  affects:
    - 02-03  # Import orchestrator wires these three modules together with db-writer

tech-stack:
  added: []
  patterns:
    - readline-streaming: node:readline createInterface + for-await for memory-efficient JSONL parsing
    - pure-functions: all three modules are stateless, no db dependency, independently testable
    - iterative-dfs: stack-based tree traversal avoids call-stack overflow on deep message trees
    - generic-ticket-pattern: "[a-zA-Z]{2,8}-\\d+ covers any project's ticket system"

key-files:
  created:
    - src/importer/parser.js
    - src/importer/fork-detector.js
    - src/importer/ticket-scorer.js
  modified: []

decisions:
  - id: generic-ticket-pattern
    choice: "[a-zA-Z]{2,8}-\\d+ instead of AILASUP-\\d+"
    rationale: Locked in CONTEXT.md — supports any project's ticket system generically
    alternatives: AILASUP-specific pattern (too narrow, breaks for other orgs)
  - id: extractContentText-placement
    choice: Export from parser.js, import into ticket-scorer.js
    rationale: Content extraction is logically part of parsing; scorer imports it to avoid duplication
    alternatives: Duplicate in scorer or put in a shared utils module
  - id: ticket-scoring-weights
    choice: prep-ticket=500/700, branch-base=100, branch-freq=5/msg, content=10/mention
    rationale: Direct port from Python PoC — weights deliberately asymmetric so /prep-ticket always wins
    alternatives: N/A (locked by PoC design)

metrics:
  duration: ~2 min
  completed: 2026-02-26
  tasks-total: 2
  tasks-completed: 2
  deviations: 0
---

# Phase 02 Plan 02: Parser, Fork Detector, Ticket Scorer Summary

**One-liner:** Pure-function JSONL parser (readline streaming), iterative DFS fork classifier, and multi-source ticket scorer with generic pattern.

## What Was Built

Three pure-function modules under `src/importer/` that transform raw JSONL transcript data into structured import data, ported faithfully from the Python PoC.

### src/importer/parser.js

`parseTranscript(filePath)` streams a JSONL file line-by-line using `node:readline` `createInterface` + `for await`, never loading the entire file into memory. Returns a session object with:
- `messages[]` — normalized message objects with uuid, type, timestamp, parentUuid, gitBranch, rawMessage, and all optional fields
- Session metadata: `summary`, `customTitle`, `slug`, `hasCompactBoundary`, `hasSubagents`

Malformed lines write a warning to stderr and continue — the import never crashes on bad data.

`extractContentText(rawMsg)` handles three content shapes: string (return as-is), array (filter `type=text` blocks, join with newline), object (JSON.stringify). Returns empty string for missing content.

### src/importer/fork-detector.js

`detectForks(messages)` builds a `childrenMap` (parentUuid -> childUuids[]) and `msgByUuid` map, then walks all parents with 2+ children. Classifies each fork as:
- **Progress fork**: all non-first children have type `progress` or `file_history_snapshot` — not a real conversation branch
- **Real fork**: all other cases — increments `realForkCount` and marks secondary branch UUIDs via iterative DFS (stack-based, avoids recursion limit)

Returns `{ forkCount, realForkCount, forkBranchUuids: Set }`.

### src/importer/ticket-scorer.js

`scoreTickets(messages, workingBranch)` applies the locked scoring weights:
- Working branch ticket match: **100 pts base**
- Per-message gitBranch ticket match: **5 pts**
- User message `/prep-ticket` command: **500 pts** (or **700** if in first user message)
- User message content mention: **10 pts/match**

All ticket keys are normalized to uppercase before scoring. Returns the highest-scoring key or null.

`determineWorkingBranch(messages)` counts gitBranch frequency across messages, skips common non-working branches (main, master, develop, dev, staging, project-* prefix, target-version-* prefix), then prefers branches containing TICKET_PATTERN over generic branch names.

`TICKET_PATTERN` is exported as `/[a-zA-Z]{2,8}-\d+/gi` — the generic locked pattern.

## Verified Against Real Data

Tested against `/home/meckert/.claude/projects/-home-claude-cctimereporter/*.jsonl`:
- Parser: 305 messages parsed, 297 with timestamps, slug and metadata extracted correctly
- Fork detector: 28 forkCount, 28 realForkCount, 169 forkBranchUuids
- Scorer: correctly identifies tickets from branch names and content across multiple project directories

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

Plan 02-03 (import orchestrator) can now wire these three modules together with the db-writer from 02-01. All three modules are pure functions with consistent interfaces:
- `parseTranscript(filePath)` -> session data
- `detectForks(messages)` -> fork stats
- `scoreTickets(messages, workingBranch)` -> primaryTicket
- `determineWorkingBranch(messages)` -> branch

No blockers. No concerns.
