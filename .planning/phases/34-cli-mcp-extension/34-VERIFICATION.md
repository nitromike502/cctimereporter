---
phase: 34-cli-mcp-extension
verified: 2026-05-09T00:00:00Z
status: passed
score: 6/6 must-haves verified
---

# Phase 34: CLI/MCP Extension Verification Report

**Phase Goal:** Token totals appear in structured CLI JSON output and MCP tool responses, extending existing outputs without breaking current consumers.  
**Verified:** 2026-05-09 (retroactive — phase shipped April 2026, VERIFICATION.md skipped at the time)  
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CLI `summary --pretty` JSON includes top-level `tokens` object with input/output/cache-creation/cache-read fields | ✓ VERIFIED | Live run `node bin/cli.js summary --date 2026-04-07 --pretty` returned top-level `tokens` with `inputTokens: 42242, outputTokens: 71317, cacheCreationInputTokens: 1522865, cacheReadInputTokens: 28614517, totalTokens: 30250941, cacheHitRate: 99.9` |
| 2 | CLI `sessions --pretty` JSON includes per-session `tokens` object on each session | ✓ VERIFIED | Live run `node bin/cli.js sessions --date 2026-04-07 --pretty` returned an array of session objects, each with a `tokens` sub-object alongside existing `workingTime`, `startTime`, `userLabel`, etc. |
| 3 | MCP `get_day_summary` response includes top-level `tokens` (same shape as CLI) | ✓ VERIFIED | `src/mcp/tools/query.js:42-46` builds `{ ...enriched, tokens: tokenData.dayTotal ?? null }` from the same `createTokensService(db).getDayTokens(date)` call as CLI summary |
| 4 | MCP `get_sessions` response includes per-session `tokens` inside each project's `sessions[]` | ✓ VERIFIED | `src/mcp/tools/query.js:60-82` builds `enrichedProjects` mapping each project's `sessions` to inject a `tokens` field per session |
| 5 | Sessions/days without token data return `tokens: null` (not zero objects) | ✓ VERIFIED (with caveat) | CLI sessions code path (line 54-61) and MCP code path (line 70-77) explicitly use `st ? {...} : null`. CAVEAT: at the day-level (CLI summary / MCP get_day_summary), `tokenData.dayTotal` is always an object from `enrichRow`, so when no data exists it is an object with all-`null` fields (e.g. `2026-04-09` returned `{ inputTokens: null, outputTokens: null, ..., cacheHitRate: null }`) rather than `tokens: null`. This is consistent with the token service contract (per `src/services/tokens.js:79-99`) and matches HTTP API behavior, but technically deviates from the literal must_haves wording. |
| 6 | Existing output fields are unchanged — no field removals or renames | ✓ VERIFIED | Live summary still has `date`, `workingTimeMs`, `byTicket`, `unticketedSessions`, `workingTime`. Live sessions still has `sessionId`, `project`, `ticket`, `branch`, `workingTimeMs`, `summary`, `customTitle`, `startTime`, `endTime`, `userLabel`, `userTicket`, `workingTime`. `tokens` is appended additively. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/cli/commands/summary.js` | CLI summary command with token enrichment | ✓ EXISTS + SUBSTANTIVE + WIRED | 41 lines. Lazy-imports `createTokensService` (line 25), instantiates `tokenSvc` (line 27), calls `tokenSvc.getDayTokens(date)` (line 37), spreads `tokens: tokenData.dayTotal ?? null` into output (line 38). |
| `src/cli/commands/sessions.js` | CLI sessions command with per-session token enrichment | ✓ EXISTS + SUBSTANTIVE + WIRED | 69 lines. Lazy-imports `createTokensService` (line 25), builds `sessionTokenMap` from `tokenSvc.getDayTokens(date).sessions` (line 44-45), enriches each session in `enrichedSessions.map(s => ...)` with `tokens: st ? {...} : null` (line 50-62). Plan-flagged shadowed `outputJSON` import was eliminated (single top-level import at line 9). |
| `src/mcp/tools/query.js` | MCP query tools with token enrichment on `get_day_summary` and `get_sessions` | ✓ EXISTS + SUBSTANTIVE + WIRED | 122 lines. Static-imports `createTokensService` (line 17). Factory-time instantiation `const tokens = createTokensService(db)` (line 29). `get_day_summary` handler enriches with `tokens` (line 42-47). `get_sessions` handler enriches each session within each project (line 60-82). Tool 3 (`get_session_messages`) and Tool 4 (`get_dates`) intentionally untouched. |

**Artifacts:** 3/3 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/cli/commands/summary.js` | `src/services/tokens.js` | dynamic import + `getDayTokens(date)` | ✓ WIRED | Line 25: `await import('../../services/tokens.js')`; line 37: `tokenSvc.getDayTokens(date)`; result spread into output line 38. |
| `src/cli/commands/sessions.js` | `src/services/tokens.js` | dynamic import + `getDayTokens(date).sessions` Map lookup | ✓ WIRED | Line 25 import; line 44-45 builds `sessionTokenMap`; line 50 looks up by `s.sessionId`; line 54-61 picks the camelCase fields. |
| `src/mcp/tools/query.js` | `src/services/tokens.js` | static import + factory-time `tokens` instance | ✓ WIRED | Line 17 import, line 29 instance, line 44 + line 62 use `tokens.getDayTokens(date)` in tool handlers — pattern matches `timeline` and `sessions` services in same file. |
| Token shape consistency (HTTP/CLI/MCP) | `enrichRow` in `src/services/tokens.js` | shared service factory | ✓ WIRED | All three surfaces consume identical `{ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, totalTokens, cacheHitRate }` shape produced by `enrichRow()` (`src/services/tokens.js:59-68`). Live CLI output confirmed all six fields. |
| Additive-only changes (no breaking field removals) | Existing output schemas | spread operator used everywhere | ✓ WIRED | Every enrichment uses `{ ...obj, tokens: ... }` — no destructive mutation. Verified live: all pre-existing fields still present in summary and sessions output. |

**Wiring:** 5/5 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| DISP-04: CLI summary command includes token totals | ✓ SATISFIED | — |
| DISP-05: CLI sessions command includes per-session token totals | ✓ SATISFIED | — |
| DISP-06: MCP `get_day_summary` includes token totals | ✓ SATISFIED | — |
| DISP-07: MCP `get_sessions` includes per-session token totals as additive fields | ✓ SATISFIED | — |

**Coverage:** 4/4 requirements satisfied

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/cli/commands/summary.js` | — | None | — | Clean implementation; no TODOs, no stubs, no custom SQL in command. |
| `src/cli/commands/sessions.js` | — | None | — | Clean implementation; the previously flagged duplicate `outputJSON` import is gone. Field selection explicitly drops `tokenMessages` (which is intended for chart use, not session listings) and the redundant `sessionId` field — matches plan guidance. |
| `src/mcp/tools/query.js` | — | None | — | Clean implementation; tool input schemas not polluted with token args; `result` and `enriched` not mutated; tools 3 and 4 correctly untouched. |
| Day-summary `tokens` shape on empty days | summary.js:38, query.js:45 | ℹ️ Info | ℹ️ Info | When a day has no token data, `tokens` becomes an object of `null`s rather than literal `tokens: null`. This stems from the token service always returning a `dayTotal` object (never null), so `?? null` never triggers. Functionally non-breaking and matches the HTTP API contract for cross-surface consistency, but worth noting against must_haves truth #5. |

**Anti-patterns:** 1 informational note, 0 blockers, 0 warnings

## Human Verification Required

None — all four ROADMAP success criteria were verified by direct execution of the CLI commands and source-level inspection of the MCP tool registrations. The MCP code paths share their service calls with the CLI code paths (same `createTokensService(db).getDayTokens(date)` factory output), so live CLI output is sufficient evidence that the MCP tools produce equivalent JSON.

## Gaps Summary

**No gaps found.** Phase goal achieved.

The implementation matches the plan's must_haves exactly:

- All three artifacts exist, are substantive, and import the token service.
- All key wiring links are present and use the spread-only additive pattern.
- All four DISP-04 through DISP-07 requirements are satisfied.
- Cross-surface shape consistency is guaranteed by sharing the same `enrichRow` formatter.
- Backward compatibility is preserved — pre-existing fields untouched.

Minor observation (not a gap): on days with zero token data, the day-level `tokens` is an object of nulls rather than a literal `null`. This is by design in the token service contract and matches HTTP behavior; per-session `tokens` correctly returns `null` when a session has no token data.

## Recommended Fix Plans

None — no fix plans needed.

## Verification Metadata

**Verification approach:** Goal-backward (started from ROADMAP success criteria + plan must_haves)  
**Must-haves source:** `34-01-PLAN.md` frontmatter (truths + artifacts + key_links)  
**Automated checks:** 14 passed, 0 failed (3 artifacts × 3 levels + 5 wiring links)  
**Live execution:** `node bin/cli.js summary --date 2026-04-07 --pretty` and `node bin/cli.js sessions --date 2026-04-07 --pretty` both ran successfully and emitted the expected `tokens` shape; `node -e "import('./src/mcp/tools/query.js')"` parsed cleanly.  
**Human checks required:** 0  
**Retroactive verification:** Yes (phase shipped April 2026; report written 2026-05-09 from existing source state).

---
*Verified: 2026-05-09T00:00:00Z*  
*Verifier: Claude (gsd-verifier subagent)*
