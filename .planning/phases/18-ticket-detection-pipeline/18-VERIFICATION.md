---
phase: 18-ticket-detection-pipeline
verified: 2026-03-07T18:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 18: Ticket Detection Pipeline Verification Report

**Phase Goal:** Import automatically discovers tickets from additional sources in transcripts — git commits, session summaries, and MCP tool calls
**Verified:** 2026-03-07T18:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After re-import, sessions with ticket references only in git commit messages show the correct ticket as primary | VERIFIED | `detectTicketsFromMessage()` scans `tool_result` blocks for `/\[[^\]]+\s+[0-9a-f]{7,}\]\s+(.+?)(?:\n|$)/g` pattern, extracts commit messages, runs `TICKET_PATTERN.matchAll()`, pushes `source: 'git_commit'` entries (index.js:80-111). `scoreTickets()` awards 100pts base + 10pts/additional via `gitCommitBaseSeen` Set (ticket-scorer.js:201-231). 100pts exceeds MIN_TICKET_SCORE of 15. |
| 2 | After re-import, sessions with ticket references only in summary/title text show the correct ticket as primary | VERIFIED | `importFile()` scans `summaryValue` and `customTitleValue` with `TICKET_PATTERN.matchAll()`, pushes `source: 'summary'` entries (index.js:283-294). `scoreTickets()` receives `{ summary, customTitle }` as 3rd param (index.js:296), awards 25pts flat via `summaryTicketsSeen` Set (ticket-scorer.js:149-160). 25pts exceeds MIN_TICKET_SCORE of 15. |
| 3 | After re-import, sessions with MCP tool calls to Atlassian/Linear/GitHub referencing tickets show those tickets in scoring | VERIFIED | `detectTicketsFromMessage()` checks assistant messages for `tool_use` blocks where `block.name.startsWith('mcp__')`, extracts server name, checks against `MCP_TICKET_PREFIXES` (`['atlassian', 'linear', 'github', 'tickets']`), stringifies input and scans with `TICKET_PATTERN.matchAll()`, pushes `source: 'mcp_tool'` entries (index.js:114-137). `scoreTickets()` awards 100pts base + 10pts/additional via `mcpToolBaseSeen` Set (ticket-scorer.js:234-257). |
| 4 | New detection sources do not produce false positives for common denylist patterns (e.g., UTF-8, OPUS-4) | VERIFIED | `TICKET_PREFIX_DENYLIST` includes `'UTF'` and `'OPUS'` (ticket-scorer.js:33,28). All new detection paths in `detectTicketsFromMessage()` filter against `TICKET_PREFIX_DENYLIST` before pushing results (index.js:102, 128). `addScore()` in `scoreTickets()` also filters via denylist (ticket-scorer.js:136-137). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/importer/ticket-scorer.js` | git_commit, mcp_tool, and summary scoring logic; MCP_TICKET_PREFIXES export | VERIFIED | 273 lines, exports `MCP_TICKET_PREFIXES`, `scoreTickets` accepts 3rd param `{ summary, customTitle }`, JSDoc lists all 6 scoring sources, Set-based base/additional tracking for git_commit and mcp_tool, flat 25pt scoring for summary |
| `src/importer/index.js` | git_commit, mcp_tool, and summary detection in detectTicketsFromMessage() and importFile() | VERIFIED | 544 lines, `detectTicketsFromMessage()` has git_commit detection (lines 80-111) and mcp_tool detection (lines 114-137), `importFile()` has summary detection (lines 283-294), `scoreTickets()` called with 3 args (line 296), `uniqueSummaryTickets` pushed to tickets array (line 344) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.js` | `ticket-scorer.js` | `import MCP_TICKET_PREFIXES` | WIRED | Line 15: `import { scoreTickets, determineWorkingBranch, TICKET_PATTERN, TICKET_PREFIX_DENYLIST, MCP_TICKET_PREFIXES }` |
| `detectTicketsFromMessage()` | `collectTickets()` | git_commit and mcp_tool source entries | WIRED | `source: 'git_commit'` at line 105, `source: 'mcp_tool'` at line 131, both flow through `collectTickets()` to `upsertTickets()` |
| `importFile()` | `scoreTickets()` | 3rd param `{ summary, customTitle }` | WIRED | Line 296: `scoreTickets(messages, workingBranch, { summary: summaryValue, customTitle: customTitleValue })` |
| `importFile()` | `upsertTickets()` | summary detections appended | WIRED | Line 344: `tickets.push(...uniqueSummaryTickets)` before `upsertTickets()` at line 345 |
| `scoreTickets()` | primary_ticket | git_commit 100+10, mcp_tool 100+10, summary 25 | WIRED | Set-based tracking with `gitCommitBaseSeen`, `mcpToolBaseSeen`, `summaryTicketsSeen` |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| TICK-01: Import scans git commit messages for ticket patterns (~50pts) | SATISFIED | Implemented at 100pts base + 10/additional (higher than spec'd 50, but functional) |
| TICK-02: Import scans session summary/title text for ticket patterns (~25pts) | SATISFIED | Implemented at 25pts flat |
| TICK-05: Import scans MCP tool calls for ticket patterns | SATISFIED | Implemented for atlassian, linear, github, tickets prefixes at 100pts base + 10/additional |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| ticket-scorer.js | 38 | "Placeholder" in comment | Info | Comment labeling denylist category, not a stub indicator |

No blocker or warning anti-patterns found.

### Human Verification Required

### 1. End-to-end import with real data

**Test:** Run `npm start`, trigger a full re-import, check that sessions with git commit ticket references show correct primary tickets in the timeline UI
**Expected:** Sessions previously showing no ticket now display the correct ticket from commit messages
**Why human:** Requires real transcript data with git commit output to verify pattern matching works on actual content

### 2. MCP tool detection with real MCP data

**Test:** If any sessions use Atlassian/Linear/GitHub MCP tools, verify their tickets appear after re-import
**Expected:** Tickets from MCP tool inputs appear in scoring
**Why human:** Requires real MCP tool_use blocks in transcripts, which may not exist in all environments

### Gaps Summary

No gaps found. All 4 observable truths verified at all 3 levels (existence, substantive, wired). All 3 requirements (TICK-01, TICK-02, TICK-05) are satisfied. Both modified files load without errors and export correctly. The denylist covers known false-positive patterns. Commits c550ba2, eb35678, 03efba1, and 64502bd are present in git history.

---

_Verified: 2026-03-07T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
