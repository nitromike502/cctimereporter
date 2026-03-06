---
phase: 11-bug-fixes
verified: 2026-03-04T21:53:43Z
status: passed
score: 5/5 must-haves verified
---

# Phase 11: Bug Fixes Verification Report

**Phase Goal:** Fix data quality and UI issues discovered during v0.2.0 user testing
**Verified:** 2026-03-04T21:53:43Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking a session with no AI summary shows the first user message as the summary fallback | VERIFIED | `SessionDetailPanel.vue` line 98: `props.session.summary \|\| props.session.firstPrompt \|\| '\u2014'`; `firstPrompt` flows from DB through timeline API (`first_prompt` column selected in `sessionStmt`, passed as `firstPrompt` in session object) |
| 2 | Subagent sessions (e.g. -tmp-pr-review-*) do not appear as separate timeline rows; their working time counts toward the parent session | VERIFIED | `WORKTREE_PROJECT_RE` in `index.js` marks worktree projects `is_subagent=1`; `timeline.js` SQL WHERE clause filters `AND (s.is_subagent = 0 OR s.is_subagent IS NULL)` |
| 3 | Day Summary table columns are properly aligned in all three tabs | VERIFIED | `DaySummary.vue` `.col-right` CSS: `text-align: right; white-space: nowrap; width: 1%` applied to all numeric th/td in all three tabs |
| 4 | Ticket and Branch tabs in Day Summary show the associated project name | VERIFIED | `allSessions` computed tags each session with `projectDisplayName`; `ticketRows` and `branchRows` build `projects` field as `[...new Set(sessions.map(s => s.projectDisplayName))].sort().join(', ')` |
| 5 | Known false-positive ticket patterns (CLAUDE-*, OPUS-*, VERSION-*) are filtered from ticket detection | VERIFIED | `TICKET_PREFIX_DENYLIST` contains CLAUDE, OPUS, VERSION (and 32+ others); `TICKET_PATTERN` uses `\b[A-Z]{2,8}-\d{1,6}\b/gi`; `MIN_TICKET_SCORE=15` rejects single-mention noise |

**Score:** 5/5 truths verified

---

## Plan 01 Must-Haves: Parser + Subagent Detection

| Must-Have | Status | Evidence |
|-----------|--------|---------|
| Slash command XML is never captured as firstPrompt | VERIFIED | `SYNTHETIC_MSG_RE = /^\s*(<command-name>\|<teammate-message\|<local-command)/` guards firstPrompt capture at `parser.js:99` |
| Teammate message XML is never captured as firstPrompt | VERIFIED | `<teammate-message` is one of the three patterns in `SYNTHETIC_MSG_RE` |
| Local command XML is never captured as firstPrompt | VERIFIED | `<local-command` is one of the three patterns in `SYNTHETIC_MSG_RE` |
| Real user text is still captured as firstPrompt | VERIFIED | Guard only rejects XML-starting messages; normal text falls through to `firstPrompt = trimmed.slice(0, 200)` |
| Worktree-based subagent projects are marked is_subagent=1 | VERIFIED | `WORKTREE_PROJECT_RE.test(project.projectPath)` at `index.js:363` → `isWorktreeProject` passed to `importFile()` → `is_subagent: isSubagent ? 1 : 0` written to DB |
| Existing Pattern B subagent detection still works | VERIFIED | `isTeamSubagent = data.userType === 'external' && data.agentName != null` at `index.js:214`; combined with `\|\| isWorktreeProject` |
| src/importer/parser.js contains SYNTHETIC_MSG_RE | VERIFIED | `parser.js:13`: `const SYNTHETIC_MSG_RE = /^\s*(<command-name>\|<teammate-message\|<local-command)/;` |
| src/importer/index.js contains WORKTREE_PROJECT_RE | VERIFIED | `index.js:28`: `const WORKTREE_PROJECT_RE = /\/-tmp-\|\/\.claude\/worktrees\//;` |

---

## Plan 02 Must-Haves: DaySummary Column Alignment + Project Column

| Must-Have | Status | Evidence |
|-----------|--------|---------|
| Numeric columns use white-space: nowrap | VERIFIED | `.col-right` at `DaySummary.vue:244`: `white-space: nowrap` |
| Ticket tab shows a Project column | VERIFIED | `<th>Project</th>` at line 39; `<td>{{ row.projects }}</td>` at line 46 in Ticket tab template |
| Branch tab shows a Project column | VERIFIED | `<th>Project</th>` at line 60; `<td>{{ row.projects }}</td>` at line 67 in Branch tab template |
| Sessions spanning multiple projects show comma-separated names | VERIFIED | `[...new Set(sessions.map(s => s.projectDisplayName))].sort().join(', ')` in both `ticketRows` and `branchRows` |
| Project tab is unchanged | VERIFIED | Project tab template has no Project column — only Project, Sessions, Working Time |
| src/client/components/DaySummary.vue contains projectDisplayName | VERIFIED | Lines 113, 141, 165 use `projectDisplayName` |

---

## Plan 03 Must-Haves: Ticket False Positive Filtering

| Must-Have | Status | Evidence |
|-----------|--------|---------|
| TICKET_PREFIX_DENYLIST contains CLAUDE, OPUS, GEMINI, GPT | VERIFIED | `ticket-scorer.js:28`: `'CLAUDE', 'OPUS', 'GEMINI', 'GPT', 'SONNET', 'HAIKU'` in denylist |
| TICKET_PREFIX_DENYLIST contains GRAY, RED, GREEN, BLUE, PRIMARY, SECONDARY, SURFACE | VERIFIED | `ticket-scorer.js:30-31`: all present in CSS/design tokens group |
| TICKET_PREFIX_DENYLIST does NOT contain STORY, BUG, TASK, EPIC | VERIFIED | Comment at line 23 confirms exclusion; grep confirms none present in the Set literal |
| TICKET_PATTERN regex limits digit count to {1,6} | VERIFIED | `ticket-scorer.js:20`: `export const TICKET_PATTERN = /\b[A-Z]{2,8}-\d{1,6}\b/gi;` |
| TICKET_PATTERN uses word boundary \b assertions | VERIFIED | Same line: leading `\b` and trailing `\b` |
| scoreTickets() returns null below MIN_TICKET_SCORE (15) | VERIFIED | `ticket-scorer.js:188`: `return bestScore >= MIN_TICKET_SCORE ? best : null;` |
| src/importer/ticket-scorer.js contains MIN_TICKET_SCORE | VERIFIED | `ticket-scorer.js:49`: `export const MIN_TICKET_SCORE = 15;` |

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/importer/parser.js` | VERIFIED | Exists, 192 lines, exports `parseTranscript` and `extractContentText`, contains `SYNTHETIC_MSG_RE` |
| `src/importer/index.js` | VERIFIED | Exists, 447 lines, exports `importAll`, contains `WORKTREE_PROJECT_RE` |
| `src/importer/ticket-scorer.js` | VERIFIED | Exists, 189 lines, exports `scoreTickets`, `TICKET_PATTERN`, `TICKET_PREFIX_DENYLIST`, `MIN_TICKET_SCORE` |
| `src/client/components/DaySummary.vue` | VERIFIED | Exists, 248 lines, has all three tab templates, Project column in Ticket/Branch tabs, `.col-right` CSS |
| `src/server/routes/timeline.js` | VERIFIED | Exists, 201 lines, SQL filters `is_subagent = 0`, passes `first_prompt` as `firstPrompt` in session objects |
| `src/client/components/SessionDetailPanel.vue` | VERIFIED | Exists, `summaryText` computed uses `summary \|\| firstPrompt \|\| '—'` fallback chain |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `parser.js` SYNTHETIC_MSG_RE | `firstPrompt` capture | regex guard at line 99 | WIRED | Guard prevents XML text reaching `firstPrompt` |
| `index.js` WORKTREE_PROJECT_RE | `is_subagent` DB column | `importFile()` options → `upsertSession()` | WIRED | Pattern tested at line 363, flag written at line 250 |
| `is_subagent` DB column | timeline API response | SQL WHERE clause | WIRED | `timeline.js:104`: `AND (s.is_subagent = 0 OR s.is_subagent IS NULL)` |
| `first_prompt` DB column | `SessionDetailPanel` | timeline API `firstPrompt` field | WIRED | `timeline.js:175`: `firstPrompt: row.first_prompt`; `SessionDetailPanel:98`: `session.firstPrompt` |
| `allSessions` flatMap | `ticketRows`/`branchRows` | `projectDisplayName` tag | WIRED | Tagged at `DaySummary.vue:113`, consumed at lines 141 and 165 |
| `TICKET_PREFIX_DENYLIST` | `scoreTickets()` | `addScore()` guard | WIRED | `ticket-scorer.js:129`: denylist check before accumulation |
| `MIN_TICKET_SCORE` | `scoreTickets()` return | threshold check at line 188 | WIRED | `return bestScore >= MIN_TICKET_SCORE ? best : null` |

---

## Anti-Patterns Found

None detected. No TODOs, FIXMEs, placeholders, or stub patterns found in the modified files.

---

## Human Verification Required

### 1. Summary Fallback Display (Visual)

**Test:** Import sessions, navigate to the timeline, click a session bar for a session that has no AI-generated summary. Verify the detail panel shows the first user message text instead of an em-dash.
**Expected:** "Summary" field in session detail panel shows real user text, not "—".
**Why human:** Requires live data with specific session state (no summary, has firstPrompt).

### 2. Subagent Row Suppression (Visual)

**Test:** After a fresh import with worktree-based projects (paths containing `-tmp-`), verify those projects do not appear as separate Gantt rows in the timeline.
**Expected:** No `-tmp-pr-review-*` style project rows visible in the timeline.
**Why human:** Requires live import of worktree project data.

### 3. Ticket False Positive Elimination (Functional)

**Test:** After a full re-import, open the Day Summary Ticket tab and confirm CLAUDE-*, OPUS-*, GRAY-*, UTF-* style entries no longer appear.
**Expected:** Only legitimate project ticket keys (e.g. AILASUP-123, STORY-8) appear in the Ticket tab.
**Why human:** Requires real import data to confirm filtering works end-to-end.

---

## Gaps Summary

No gaps found. All 5 success criteria from the phase roadmap are structurally verified:

1. **Summary fallback** — `SessionDetailPanel.vue` uses `summary || firstPrompt || '—'`; `firstPrompt` is stored from clean (non-XML) user messages via `SYNTHETIC_MSG_RE` guard, and passed through the full API pipeline.
2. **Subagent suppression** — Worktree projects flagged `is_subagent=1` via `WORKTREE_PROJECT_RE`; timeline SQL filters them out.
3. **Column alignment** — `.col-right` CSS class applies `white-space: nowrap; width: 1%` to all numeric columns across all three DaySummary tabs.
4. **Project column in Ticket/Branch tabs** — `projectDisplayName` tagged at `allSessions` flatMap, consumed in `ticketRows` and `branchRows`, rendered in both tab templates.
5. **False positive filtering** — `TICKET_PREFIX_DENYLIST` blocks 35+ prefixes; `TICKET_PATTERN` uses word boundaries and `\d{1,6}` cap; `MIN_TICKET_SCORE=15` rejects single-mention noise.

---

_Verified: 2026-03-04T21:53:43Z_
_Verifier: Claude (gsd-verifier)_
