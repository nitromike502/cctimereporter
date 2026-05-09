---
phase: 33-service-api-token-queries
verified: 2026-05-09T00:00:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 33: Service API Token Queries Verification Report

**Phase Goal:** Token aggregates are queryable via a dedicated backend service and a new API endpoint, with correct filtering to exclude sidechain and fork-branch messages — resolving "what total tokens means" at the SQL layer before any UI commits to a display format.

**Verified:** 2026-05-09T00:00:00Z (retroactive — phase shipped April 2026)
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GET /api/tokens?date=YYYY-MM-DD` returns JSON with input/output/cache_creation/cache_read tokens per session and as day total | VERIFIED | Live test on 2026-04-08: status 200, `dayTotal` object with all four token fields + totalTokens, `sessions[]` array (2 entries) each with same fields |
| 2 | Cache hit rate percentage present in response, computed as cache_read / (cache_read + input) × 100 | VERIFIED | `enrichRow` calls `computeCacheHitRate` (tokens.js:46-50, 66) — both `dayTotal` and each session row carry `cacheHitRate`; live response shows `cacheHitRate: 100` for day with cache_read=501284, input=21 |
| 3 | Sidechain messages (is_sidechain=1) excluded from parent session totals | VERIFIED | All three prepared statements include `AND m.is_sidechain = 0` (tokens.js:95, 119, 141, 163) |
| 4 | Fork-branch messages (is_fork_branch=1) excluded | VERIFIED | All three prepared statements include `AND m.is_fork_branch = 0` (tokens.js:96, 120, 142, 164) |
| 5 | Sessions with no token data return null fields, not zeros | VERIFIED | SUM() returns NULL on empty set; `enrichRow` passes through; live test on 2026-04-09 returned `{inputTokens:null, ..., totalTokens:null, cacheHitRate:null}` |
| 6 | Session detail panel shows token breakdown and cache hit rate when session bar clicked | VERIFIED | SessionDetailPanel.vue renders 4th-row grid: Tokens (totalTokens + breakdown), Cache Hit (cacheHitRate%), Cache (read + creation); receives `tokens` prop bound to `selectedSessionTokens` (TimelinePage.vue:82) |
| 7 | Day summary panel shows total tokens for the selected date | VERIFIED | DaySummary.vue:5-7 renders `\| {{ formattedDayTokens }} tokens` from `dayTokens.totalTokens`; bound via `:day-tokens="tokenData?.dayTotal ?? null"` (TimelinePage.vue:121) |
| 8 | Token data loads independently and does not block timeline | VERIFIED | `fetchTokens()` is its own async function with try/catch fallback (`tokenData.value = null`) and silent-failure on `!res.ok` (TimelinePage.vue:292-301); called in parallel from onMounted alongside `fetchTimeline()` (line 525) |
| 9 | Schema v10 columns wired into queries | VERIFIED | schema.js confirms columns `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `is_fork_branch` exist on `messages` table; tokens service queries them directly |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/tokens.js` | createTokensService factory with prepared statements | EXISTS + SUBSTANTIVE | 233 lines; exports `createTokensService`; 4 prepared statements (dayTotalStmt, perSessionStmt, perMessageStmt, singleSessionStmt); pure helpers `dayBoundaries`, `computeCacheHitRate`, `enrichRow`; returns `{ getDayTokens, getSessionTokens }` |
| `src/server/routes/tokens.js` | GET /api/tokens Fastify plugin | EXISTS + SUBSTANTIVE | 45 lines; exports `tokensRoute`; calls `createTokensService(db)`; validates date with `DATE_RE`; defaults to today via `getTodayString()`; returns 400 on bad input |
| `src/server/index.js` | Route registration | EXISTS + WIRED | Imports `tokensRoute` from './routes/tokens.js' (line 17); registers via `app.register(tokensRoute, { db })` (line 39) alongside other 5 routes |
| `src/client/pages/TimelinePage.vue` | Token fetch + prop passing | EXISTS + SUBSTANTIVE | 677 lines; defines `tokenData` ref (line 194), `fetchTokens` function (line 292), `selectedSessionTokens` computed (line 303); invokes `fetchTokens()` on mount and on date change (lines 504, 525, 534) |
| `src/client/components/SessionDetailPanel.vue` | Token breakdown UI | EXISTS + SUBSTANTIVE | 352 lines; declares `tokens` prop (line 145); renders three detail rows (Tokens, Cache Hit, Cache) using `formatTokenCount` and `formatCacheHitRate` helpers (lines 92-110, 157-167) |
| `src/client/components/DaySummary.vue` | Day total tokens in summary line | EXISTS + SUBSTANTIVE | 275 lines; declares `dayTokens` prop (line 90); `formattedDayTokens` computed (line 103); renders `\| {{ formattedDayTokens }} tokens` (line 6) |

**Artifacts:** 6/6 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| routes/tokens.js | services/tokens.js | createTokensService(db) | WIRED | Line 18 import; line 33 invocation in factory plugin |
| server/index.js | routes/tokens.js | app.register(tokensRoute, { db }) | WIRED | Line 39 registration; live API test returned 200 |
| services/tokens.js | messages table | Prepared SQL with sidechain/fork exclusion | WIRED | All four statements filter `is_sidechain=0 AND is_fork_branch=0`; live test confirms aggregates exclude these rows |
| TimelinePage.vue | /api/tokens | fetch() in fetchTokens() | WIRED | Line 294: `fetch('/api/tokens?date=' + selectedDate.value)`; response stored in `tokenData.value` |
| TimelinePage.vue | SessionDetailPanel.vue | `:tokens="selectedSessionTokens"` | WIRED | Line 82; `selectedSessionTokens` computed looks up matching sessionId in `tokenData.value.sessions` |
| TimelinePage.vue | DaySummary.vue | `:day-tokens="tokenData?.dayTotal"` | WIRED | Line 121 |
| Phase 32 schema v10 | tokens service queries | Direct column reference | WIRED | All v10 token columns present in schema.js and queried by tokens.js |

**Wiring:** 7/7 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| DISP-01: Session detail panel shows input/output/cache token breakdown | SATISFIED | - |
| DISP-02: Session detail panel shows cache hit rate percentage | SATISFIED | - |
| DISP-03: Day summary panel shows total tokens for the day | SATISFIED | - |

**Coverage:** 3/3 requirements satisfied

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| - | - | - | - | None — no TODO/FIXME/placeholder/stub patterns found in any of the six inspected files |

**Anti-patterns:** 0 found (0 blockers, 0 warnings)

Notable observations (informational only):

- The day-boundary helper uses `new Date(date + 'T00:00:00').toISOString()` which depends on the host timezone. This matches the established pattern in `src/services/timeline.js`, so it is consistent with the rest of the codebase. Not a Phase 33 regression.
- `getSessionTokens` returns `null` (not an enriched-with-nulls object) when all four token columns are null — the contract is documented in JSDoc but slightly differs from the per-session shape inside `getDayTokens`. Acceptable for the documented use case (Phase 34/35 future consumer can interpret null as "no data").

## Human Verification Required

None — all goal-level truths verified via source inspection plus live-process tests against the actual SQLite database and a Fastify instance. Visual rendering of the Vue components (Tokens row in detail panel, "| N tokens" line in summary) was verified by reading the templates; an end-user smoke test in a browser is recommended but not required for goal verification since the data path and props are fully wired.

## Gaps Summary

**No gaps found.** Phase goal achieved. Phase 33 successfully delivered:

- A token aggregation service with prepared statements and correct sidechain/fork exclusion (tokens.js, 233 lines)
- A REST endpoint at `GET /api/tokens?date=YYYY-MM-DD` returning the documented JSON shape (routes/tokens.js, 45 lines)
- Vue UI integration: per-session token breakdown + cache hit rate in `SessionDetailPanel`, day-total tokens in `DaySummary`, fetched independently of timeline data so token failures degrade gracefully
- Cross-phase wiring with Phase 32 schema v10 columns is intact

The downstream phases (34 CLI/MCP, 35 chart) had a fully working backend to consume — the live API test confirms the documented response shape is honored.

## Verification Metadata

**Verification approach:** Goal-backward (truths from ROADMAP success criteria + PLAN must_haves frontmatter)
**Must-haves source:** 33-01-PLAN.md and 33-02-PLAN.md frontmatter, plus ROADMAP success criteria
**Automated checks:** All 9 truths + 6 artifacts + 7 key links verified via Read + grep + live Node.js execution against actual database and Fastify server
**Human checks required:** 0
**Total verification time:** Retroactive — phase shipped April 2026

---
*Verified: 2026-05-09T00:00:00Z*
*Verifier: Claude (gsd-verifier, retroactive)*
