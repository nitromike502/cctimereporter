---
phase: 34-cli-mcp-extension
plan: 01
subsystem: api
tags: [cli, mcp, tokens, commander, token-usage]

# Dependency graph
requires:
  - phase: 33-token-service
    provides: createTokensService(db) with getDayTokens(date) and getSessionTokens(sessionId)
provides:
  - CLI summary command outputs top-level tokens object (DISP-04)
  - CLI sessions command outputs per-session tokens object (DISP-05)
  - MCP get_day_summary tool includes top-level tokens (DISP-06)
  - MCP get_sessions tool includes per-session tokens inside each project's sessions (DISP-07)
affects: [consumers of CLI JSON output, MCP client integrations, v1.1.0 release]

# Tech tracking
tech-stack:
  added: []
  patterns: [token service injected at handler time (CLI) and factory time (MCP), sessionTokenMap pattern for per-session lookup]

key-files:
  created: []
  modified:
    - src/cli/commands/summary.js
    - src/cli/commands/sessions.js
    - src/mcp/tools/query.js

key-decisions:
  - "sessionId stripped from tokens sub-object when embedding in session response — redundant since sessionId is already on the parent session object"
  - "Lazy import pattern preserved in CLI commands (import at action time, not module level) — consistent with existing timeline service import pattern"
  - "MCP factory pattern (tokens instantiated at registerQueryTools call time) — consistent with timeline/sessions services"

patterns-established:
  - "sessionTokenMap: Map<sessionId, tokenRow> built from getDayTokens().sessions for O(1) per-session lookup"
  - "tokens: null for sessions without token data — never tokens with zero values"

# Metrics
duration: 2min
completed: 2026-04-09
---

# Phase 34 Plan 01: CLI/MCP Extension Summary

**Token usage totals added to CLI JSON output and all 4 MCP query tools, completing DISP-04 through DISP-07 with additive-only changes to existing response shapes**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-09T01:55:11Z
- **Completed:** 2026-04-09T01:57:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- CLI `summary` command now outputs `tokens` at top level with all 6 token fields (inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, totalTokens, cacheHitRate)
- CLI `sessions` command now outputs `tokens` per session object (null when session has no token data)
- MCP `get_day_summary` tool now includes `tokens` at top level in response
- MCP `get_sessions` tool now includes `tokens` per session within each project group
- Fixed pre-existing code smell: removed duplicate `outputJSON` import in sessions.js that shadowed the top-level import

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI summary and sessions token enrichment** - `2f313d5` (feat)
2. **Task 2: MCP get_day_summary and get_sessions token enrichment** - `1e242da` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/cli/commands/summary.js` - Added createTokensService lazy import, getDayTokens call, spread tokens into output
- `src/cli/commands/sessions.js` - Added createTokensService lazy import, sessionTokenMap, per-session tokens in enrichedSessions map; removed duplicate outputJSON import
- `src/mcp/tools/query.js` - Added createTokensService top-level import + factory instantiation; enriched get_day_summary and get_sessions handlers

## Decisions Made
- `sessionId` is stripped from the tokens sub-object embedded in each session response — it's redundant since `sessionId` is already at the parent session level, and matches the plan guidance
- CLI lazy import pattern preserved: `createTokensService` is imported inside `.action()` handler alongside the existing timeline service import — not at module level. This defers the DB prepared-statement setup until the command actually runs, consistent with how the timeline service is imported in both CLI commands.
- MCP uses factory-time instantiation: `const tokens = createTokensService(db)` called once at `registerQueryTools()` time — consistent with how `timeline` and `sessions` services are already instantiated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate `outputJSON` import in sessions.js**
- **Found during:** Task 1 (CLI sessions enrichment)
- **Issue:** Line 25 had `const { outputJSON } = await import('../format.js');` inside the action handler, shadowing the top-level `outputJSON` import on line 9. Plan explicitly flagged this as a pre-existing code smell to fix.
- **Fix:** Removed the redundant inner import; the top-level import is used throughout
- **Files modified:** src/cli/commands/sessions.js
- **Verification:** `node -e "import('./src/cli/commands/sessions.js').then(() => console.log('OK'))"` passes; CLI sessions command runs correctly
- **Committed in:** 2f313d5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — pre-existing duplicate import)
**Impact on plan:** The plan explicitly called this out as a code smell to fix. No scope creep.

## Issues Encountered
None — token service API matched plan expectations exactly (createTokensService, getDayTokens, correct return shape).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DISP-04 through DISP-07 complete — CLI and MCP consumers can now access token usage data
- Phase 35 (Token Visualization UI) can proceed — the data layer (Phase 32), service layer (Phase 33), and CLI/MCP exposure (Phase 34) are all complete
- Token values are consistent across CLI and MCP — both call getDayTokens on the same service with the same sidechain/fork-branch exclusion rules

---
*Phase: 34-cli-mcp-extension*
*Completed: 2026-04-09*
