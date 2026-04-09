---
phase: 33-service-api-token-queries
plan: 01
subsystem: api
tags: [sqlite, fastify, tokens, cache-hit-rate, node-sqlite]

# Dependency graph
requires:
  - phase: 32-data-foundation
    provides: schema v10 with token columns on messages table (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, model)
provides:
  - createTokensService(db) factory with getDayTokens and getSessionTokens
  - GET /api/tokens?date=YYYY-MM-DD endpoint returning per-session and day-total aggregates
  - Cache hit rate computation (cache_read / (cache_read + input) × 100, one decimal)
affects:
  - 34-cli-mcp-tokens (CLI/MCP tools will consume createTokensService directly)
  - 35-chart-page (chart page will fetch /api/tokens endpoint)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory service pattern: createTokensService(db) with prepared statements at factory time"
    - "Thin route wrapper: tokensRoute delegates all logic to service, validates date only"
    - "Sidechain/fork exclusion: is_sidechain=0 AND is_fork_branch=0 filters on all token aggregates"

key-files:
  created:
    - src/services/tokens.js
    - src/server/routes/tokens.js
  modified:
    - src/server/index.js

key-decisions:
  - "Null check for getSessionTokens: aggregate queries always return 1 row; check all-null columns to distinguish 'no session' from 'session with no token data'"
  - "total_tokens uses COALESCE on each operand to avoid NULL propagation in arithmetic SUM"
  - "Cache hit rate null check: denominator = (cacheRead ?? 0) + (input ?? 0); returns null when 0 (no data)"

patterns-established:
  - "Token exclusion filters: always apply AND m.is_sidechain = 0 AND m.is_fork_branch = 0 to all token queries"
  - "Day boundary: use new Date(date + 'T00:00:00').toISOString() matching timeline.js convention"

# Metrics
duration: 3min
completed: 2026-04-09
---

# Phase 33 Plan 01: Service API Token Queries Summary

**createTokensService factory + GET /api/tokens endpoint with sidechain/fork exclusion and JS-computed cache hit rate**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-09T01:50:38Z
- **Completed:** 2026-04-09T01:53:15Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Token aggregation service with 3 prepared statements (day total, per-session, single-session)
- GET /api/tokens?date=YYYY-MM-DD returning dayTotal + sessions array with 6 fields each
- Correct sidechain/fork exclusion confirmed against live database (197 sidechain + 3 fork messages correctly excluded from 590 total on 2026-04-07)

## Task Commits

Each task was committed atomically:

1. **Task 1: Token aggregation service** - `5069045` (feat)
2. **Task 2: API route and server registration** - `b153d30` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/services/tokens.js` - createTokensService(db) factory with getDayTokens and getSessionTokens
- `src/server/routes/tokens.js` - GET /api/tokens Fastify route plugin
- `src/server/index.js` - Added tokensRoute import and registration

## Decisions Made
- **Null detection in getSessionTokens:** SQLite aggregate queries always return exactly one row even for non-existent sessions (all columns null). Used multi-column null check (all four token columns null) to return `null` from the function, matching the plan spec's "returns null if no rows" intent.
- **total_tokens COALESCE strategy:** Used `SUM(COALESCE(col, 0) + ...)` pattern for total_tokens to avoid NULL propagation in arithmetic. Individual breakdown columns (`input_tokens`, etc.) use plain `SUM()` to preserve NULL for sessions with no token data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getSessionTokens null detection**
- **Found during:** Task 1 (token aggregation service) — verification step
- **Issue:** Plan said "returns null if no rows" but SQLite aggregate queries always return 1 row (all-null columns) for non-existent sessions. The `if (!row) return null` check never triggered.
- **Fix:** Added explicit multi-column null check: `if (row.input_tokens === null && row.output_tokens === null && row.cache_creation_input_tokens === null && row.cache_read_input_tokens === null)` return null.
- **Files modified:** src/services/tokens.js
- **Verification:** `getSessionTokens('nonexistent-session-id')` returns `null`; valid session returns enriched object.
- **Committed in:** 5069045 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — SQLite aggregate null detection)
**Impact on plan:** Fix required for correct null contract. No scope creep.

## Issues Encountered
- Pre-existing staged files (src/client/App.vue, src/client/pages/TokensPage.vue) were included in Task 1 commit. These are Phase 35 scaffolding pre-staged from Phase 32 session. No functional impact on this plan's deliverables.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Token service ready for Phase 34 CLI/MCP consumption (import `createTokensService` directly)
- Token API endpoint ready for Phase 35 chart page (`fetch('/api/tokens?date=...')`)
- 6 sessions with token data confirmed on 2026-04-07 with real values (42K input, 71K output, 28.6M cache reads)
- No blockers.

---
*Phase: 33-service-api-token-queries*
*Completed: 2026-04-09*
