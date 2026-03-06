---
phase: 11-bug-fixes
plan: 01
subsystem: importer
tags: [parser, jsonl, subagent, worktree, firstPrompt, regex]

# Dependency graph
requires:
  - phase: 08-session-context
    provides: firstPrompt extraction from JSONL and session-index, used directly in parser.js

provides:
  - SYNTHETIC_MSG_RE regex in parser.js filtering slash command XML from firstPrompt capture
  - WORKTREE_PROJECT_RE regex in index.js marking worktree projects as is_subagent=1

affects:
  - future import pipeline changes (subagent detection patterns)
  - session display (firstPrompt used as fallback when no summary)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regex guard on firstPrompt capture prevents XML garbage from reaching session display"
    - "Worktree subagent detection computed in importAll() and passed via options to importFile()"

key-files:
  created: []
  modified:
    - src/importer/parser.js
    - src/importer/index.js

key-decisions:
  - "SYNTHETIC_MSG_RE placed at module level (not inside function) for clarity and reuse"
  - "isWorktreeProject computed in importAll() where project object is available, passed via options — importFile() never has direct access to project path"
  - "isTeamSubagent rename clarifies the two detection patterns (B: team-based, C: worktree-based)"

patterns-established:
  - "Subagent detection: combine patterns with || rather than nested conditions"
  - "Options object used to pass computed flags into importFile() without changing signature structure"

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 11 Plan 01: Bug Fixes (Parser + Subagent Detection) Summary

**SYNTHETIC_MSG_RE filters slash command XML from firstPrompt, WORKTREE_PROJECT_RE marks -tmp- worktree projects as subagents**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-04T21:45:00Z
- **Completed:** 2026-03-04T21:50:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- parser.js now skips user-type messages containing `<command-name>`, `<teammate-message>`, or `<local-command>` XML when capturing firstPrompt — sessions no longer show XML as their fallback display text
- index.js detects worktree-based subagent projects via path pattern (`-tmp-` or `.claude/worktrees/`) and marks them `is_subagent=1` so they don't appear as separate timeline rows
- Existing Pattern B team-based subagent detection (`userType=external` + `agentName`) preserved unchanged under renamed variable `isTeamSubagent`

## Task Commits

Each task was committed atomically:

1. **Task 1: Filter synthetic messages from firstPrompt capture** - `904d111` (fix)
2. **Task 2: Detect worktree-based subagent projects in index.js** - `626dd13` (fix)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `src/importer/parser.js` - Added SYNTHETIC_MSG_RE constant; added regex guard in firstPrompt capture block
- `src/importer/index.js` - Added WORKTREE_PROJECT_RE constant; compute isWorktreeProject in importAll(); destructure in importFile(); combine with isTeamSubagent

## Decisions Made
- SYNTHETIC_MSG_RE placed at module level for clarity — regex guard `&& !SYNTHETIC_MSG_RE.test(trimmed)` is the minimal single-line change
- isWorktreeProject computed in importAll() and passed via options because importFile() signature does not include the project object — avoids changing function signature
- Renamed isSubagent → isTeamSubagent for the inner check to clarify Pattern B vs Pattern C semantics

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both bugs fixed and committed; build passing
- Ready for remaining Phase 11 plans (day summary table, ticket false positives)

---
*Phase: 11-bug-fixes*
*Completed: 2026-03-04*
