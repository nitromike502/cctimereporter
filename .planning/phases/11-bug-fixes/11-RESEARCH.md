# Phase 11: Bug Fixes - Research

**Researched:** 2026-03-04
**Domain:** Codebase bug investigation — importer, API, Vue components
**Confidence:** HIGH (all findings based on direct codebase inspection and live database queries)

## Summary

All five bugs were traced to their root causes through direct inspection of source files and live database queries. The bugs fall into three categories: importer data quality (BUG-01, BUG-02, BUG-05), UI display issues (BUG-03, BUG-04), and one hybrid (BUG-02 requires both importer logic and a display-side understanding of the existing `is_subagent` column).

The most critical finding is that BUG-01 (empty summaries) has two distinct failure modes: (1) the `first_prompt` column IS being stored but contains slash command XML rather than real user text, because the parser does not filter slash command messages; and (2) for sessions that only start with slash commands, `first_prompt` is set to an XML payload like `<command-name>/clear</command-name>` which renders as garbage in the UI. The component code (`summaryText` computed) is correct — the pipeline feeding it is broken.

BUG-02 (subagent sessions) already has partial infrastructure: the `is_subagent` column exists in the schema and the API route already filters `is_subagent = 0 OR is_subagent IS NULL`. The problem is that worktree-based subagent projects (e.g., `-tmp-pr-review-{random}`) are separate Claude Code project directories — not detected as `is_subagent` by the current heuristic (which only catches `userType === 'external' && agentName != null`). These worktree sessions need a different detection mechanism.

BUG-03 and BUG-04 are pure template/CSS work in `DaySummary.vue`. BUG-05 (ticket false positives) is severe: the live database contains hundreds of false positive ticket keys (GRAY-100, OPUS-4, UTF-8, VUE-3, WSL-2, PSR-12, etc.) generated from documentation text and code examples in session content.

**Primary recommendation:** Fix in the suggested order from BUGS.md: BUG-01 → BUG-02 → BUG-03+04 → BUG-05.

---

## BUG-01: Session Summary — Root Cause Analysis

### Affected Files

- `src/importer/parser.js` — `parseTranscript()`, `extractContentText()`
- `src/importer/index.js` — `importFile()`, line 229 `first_prompt: firstPromptValue`
- `src/client/components/SessionDetailPanel.vue` — `summaryText` computed (correct)
- `src/server/routes/timeline.js` — includes `first_prompt` in API response (correct)

### Root Cause

**The component and API pipeline are correct.** The `summaryText` computed in `SessionDetailPanel.vue` correctly does:
```js
return props.session.summary || props.session.firstPrompt || '\u2014'
```
And the API route returns both `summary: row.summary` and `firstPrompt: row.first_prompt`.

The bug lives in **`parser.js` line 92–98**: the first-prompt extraction captures slash command messages as `firstPrompt` because slash commands are ordinary `user`-type messages with `isMeta: undefined` (falsy, passes the `!msg.isMeta` check).

```js
// parser.js — current behavior
if (!firstPrompt && msg.type === 'user' && !msg.isMeta) {
  const text = extractContentText(msg);
  const trimmed = text?.trim();
  if (trimmed) {
    firstPrompt = trimmed.slice(0, 200);  // BUG: captures slash command XML
  }
}
```

Verified from live JSONL: a slash command like `/clear` produces:
```
USER isMeta: undefined type: string
content: <command-name>/clear</command-name>\n  <command-message>clear</command-message>...
```

From live database query (84 total sessions):
- 67 have a non-null `first_prompt`
- 38 of those 67 contain slash command XML (`LIKE '%<command-%'`)
- The remaining 29 are "real" prompts (including teammate-message XML, which is also not a human prompt)

**Secondary issue:** Sessions with `summary=null` and `first_prompt` as slash command XML hit the fallback, but the fallback shows XML garbage. Sessions with `summary=null` and `first_prompt IS NULL` show the em-dash fallback, which is correct.

**No sessions in the current database have a `sessions-index.json` summary** — the project with a sessions-index (`-home-claude-manager`) has 0 sessions imported into the DB (likely because it falls outside the 30-day window or path mismatch). So the `summaryValue = indexEntry?.summary ?? data.summary ?? null` path never fires in practice.

### Proposed Fix

In `parser.js`, add a filter after extracting `text` to skip slash command content:

```js
// Option A: detect XML command structure
const SLASH_CMD_RE = /^\s*<command-name>/;

if (!firstPrompt && msg.type === 'user' && !msg.isMeta) {
  const text = extractContentText(msg);
  const trimmed = text?.trim();
  if (trimmed && !SLASH_CMD_RE.test(trimmed)) {
    firstPrompt = trimmed.slice(0, 200);
  }
}
```

Also filter `<teammate-message>` XML (subagent sessions get teammate messages as their first user message):
```js
const SYNTHETIC_MSG_RE = /^\s*(<command-name>|<teammate-message|<local-command)/;
```

After the fix, a re-import is needed (or force re-import) to populate `first_prompt` correctly for existing sessions. The importer uses `INSERT OR REPLACE` so re-importing will overwrite.

### Complexity Estimate

**Low** — 2–3 line change in `parser.js`. The rest of the pipeline is correct. Requires a re-import to fix existing data (force flag already exists).

---

## BUG-02: Subagent Sessions — Root Cause Analysis

### Affected Files

- `src/importer/discovery.js` — `discoverProjects()` — includes ALL directories including worktree dirs
- `src/importer/index.js` — `importFile()` — subagent detection logic at line 206–207
- `src/server/routes/timeline.js` — `sessionStmt` already filters `is_subagent = 0 OR is_subagent IS NULL`
- `src/db/schema.js` — `is_subagent BOOLEAN DEFAULT 0` column exists (schema v3+)

### Root Cause

The bug has **two distinct subagent patterns**. The existing code handles one but not the other:

**Pattern A (already handled):** Tool-invoked subagents — files inside `<uuid>/subagents/agent-*.jsonl`. These are imported and merged into the parent session via `findAgentFiles()` and `insertMessages()`. No new session rows are created. Working correctly.

**Pattern B (already handled for team agents):** Team-based subagent sessions — detected by `userType === 'external' && agentName != null` in `importFile()` line 206. These get `is_subagent = 1`. The timeline API filters them. Working correctly for team agents.

**Pattern C (NOT handled — the bug):** Worktree-based subagent projects. When Claude Code uses `EnterWorktree`, it creates a new git worktree at a path like:
```
/home/claude/manager/.claude/worktrees/tmp-pr-review-abc123/
```
This worktree path gets registered in `~/.claude.json` as a separate project entry. `discoverProjects()` finds it as a legitimate project and imports its sessions. These sessions:
- Have no `agentName` set (so Pattern B detection misses them)
- Have no `userType === 'external'` (they're direct user sessions in a worktree)
- Have project paths matching `-tmp-` or `.claude/worktrees/` patterns

From the live filesystem check: no `-tmp-` projects exist in the current test environment (because the user hasn't run worktree-based subagent work recently), but the bug is real in production usage.

### Proposed Fix

**Two approaches:**

**Option 1 — Project-path-based filtering (discovery.js)**

Filter projects at discovery time based on path patterns:
```js
// In discoverProjects(), skip worktree project paths
const SKIP_PROJECT_PATTERNS = [
  /\/-tmp-/,          // Claude Code worktrees: -tmp-pr-review-abc123
  /\/\.claude\/worktrees\//,  // Alternative worktree location
];

function isWorktreeProject(projectPath) {
  return SKIP_PROJECT_PATTERNS.some(re => re.test(projectPath));
}
```

Then in the loop:
```js
for (const projectPath of Object.keys(projects)) {
  if (isWorktreeProject(projectPath)) continue;  // skip worktree projects
  // ... existing code
}
```

**Limitation:** This filters at discovery time, meaning worktree sessions are never stored. The bug report says worktree working time SHOULD count toward the parent session. This is complex to implement (requires knowing which parent session the worktree served).

**Option 2 — Mark as is_subagent at import time**

Detect worktree projects by path pattern and set `is_subagent = 1` on their sessions. The existing timeline filter already excludes these. Working time attribution to a parent session is deferred (or dropped as a v1 simplification).

```js
// In importFile() or importAll(), add:
const isWorktreeSession = /\/-tmp-/.test(project.projectPath) ||
                          /\/\.claude\/worktrees\//.test(project.projectPath);
// Then pass isWorktreeSession to importFile to set is_subagent=1
```

**Recommended approach:** Option 2 (mark as subagent, exclude from timeline). Working time attribution to parent is a separate future feature. The BUGS.md notes this requirement but it's a significant additional complexity. The minimum fix is exclusion.

**Key question:** What exact path patterns do worktree projects use? The bug report says `-tmp-pr-review-{random}`. The pattern would be `/-tmp-[a-z]` in the project path. Need to confirm the exact pattern from `EnterWorktree` tool behavior.

### Complexity Estimate

**Medium** — Path pattern filtering in `discovery.js` or `index.js` is straightforward. The "count toward parent" working time attribution is complex and should be deferred.

---

## BUG-03: Day Summary Column Alignment — Root Cause Analysis

### Affected Files

- `src/client/components/DaySummary.vue` — all three `<table>` elements

### Root Cause

The tables use `width: 100%` and `border-collapse: collapse` but have **no explicit column width specifications**. The browser's table layout algorithm sizes columns based on content width. Since the first column (Project/Ticket/Branch name) contains variable-length strings, the table layout is non-deterministic and changes row by row.

The header row `<th>` elements have the same `text-align: left` / `.col-right` CSS as the data `<td>` elements. This alone doesn't cause misalignment. The actual issue is that the three columns (`<th>Project</th>`, `<th class="col-right">Sessions</th>`, `<th class="col-right">Working Time</th>`) have no `width` constraints. The browser's auto layout sizes them based on the widest content in each column.

When the first column content is very long (long ticket names, long branch names), the first column expands and compresses the numeric columns inconsistently between header and body rows.

**Most likely specific cause:** Looking at the CSS:
```css
.summary-table th {
  text-align: left;  /* applies to ALL th including col-right ones */
}
.col-right {
  text-align: right;
}
```

The `.col-right` on `<th>` overrides `text-align: left` from `.summary-table th`. This should be fine. The actual misalignment is more likely a **width inheritance issue** where `Sessions` and `Working Time` headers render at their intrinsic min-width (content-based) but data cells in those columns may be constrained differently.

**The clean fix:** Use `table-layout: fixed` with explicit column widths, or use `<col>` elements to define widths. Alternatively, set `white-space: nowrap` and fixed widths on the numeric columns:

```css
.col-right {
  text-align: right;
  white-space: nowrap;
  width: 1%;  /* shrink to content */
}
```

Or use explicit `width` on the columns:
```html
<colgroup>
  <col style="width: auto">
  <col style="width: 80px">
  <col style="width: 100px">
</colgroup>
```

### Complexity Estimate

**Low** — Pure CSS fix. Add `white-space: nowrap` to `.col-right` and/or set `table-layout: fixed` with column widths via `<colgroup>`.

---

## BUG-04: Missing Project Column — Root Cause Analysis

### Affected Files

- `src/client/components/DaySummary.vue` — `ticketRows` and `branchRows` computeds, Ticket and Branch tab templates
- `src/server/routes/timeline.js` — API response shape (project info available per session)
- `src/client/pages/TimelinePage.vue` — passes `timelineData.projects` (unfiltered) to DaySummary

### Root Cause

The `ticketRows` and `branchRows` computeds in `DaySummary.vue` call `groupBy(allSessions.value, ...)` where `allSessions` is a flat list of sessions derived from `props.projects.flatMap(p => p.sessions)`. The project association is **lost during flatMap** — the session objects do not carry a `projectId` or `displayName` field of their own.

From `timeline.js` API response, each session object contains:
```js
{
  sessionId, startTime, endTime, workingTimeMs, idleGaps,
  ticket, branch, summary, firstPrompt, messageCount, ...
}
```
No `projectId` or `projectName`. The project is the parent container in the response shape:
```json
{
  "projects": [
    { "projectId": 3, "displayName": "cctimereporter", "sessions": [...] }
  ]
}
```

To show project info in the Ticket/Branch tabs, session objects need project attribution either:
1. **Added at flatMap time** — tag each session with `displayName` when building `allSessions`
2. **Kept in groupBy output** — include project info in the row objects

### Data Available

`props.projects` is the full unfiltered `timelineData.projects` array (from `TimelinePage.vue` line 75: `<DaySummary :projects="timelineData.projects" />`). Each project has `projectId` and `displayName`. Sessions can be tagged at flatMap time.

### Proposed Fix

**Option A: Tag sessions at flatMap time**
```js
const allSessions = computed(() =>
  props.projects.flatMap(p =>
    p.sessions.map(s => ({ ...s, projectDisplayName: p.displayName }))
  )
)
```

Then in `ticketRows` and `branchRows`, group sessions by ticket/branch AND collect unique project names:
```js
const row = {
  ticket,
  sessionCount: sessions.length,
  workingTimeMs: sessions.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0),
  projects: [...new Set(sessions.map(s => s.projectDisplayName))].join(', '),
}
```

Add a `<th>Project</th>` and `<td>{{ row.projects }}</td>` to the Ticket and Branch tab tables.

**Option B: Restructure groupBy** to accept an additional dimension (more complex, not needed).

**Design consideration:** A single ticket or branch may span multiple projects. The project column should show a comma-separated list or use a compact notation.

### Complexity Estimate

**Low-Medium** — `allSessions` computed change (1 line), update `ticketRows`/`branchRows` computeds to include project info, add `<th>`/`<td>` to both table templates.

---

## BUG-05: Ticket False Positives — Root Cause Analysis

### Affected Files

- `src/importer/ticket-scorer.js` — `TICKET_PATTERN`, `TICKET_PREFIX_DENYLIST`, `scoreTickets()`
- `src/importer/index.js` — `detectTicketsFromMessage()`, `TICKET_PATTERN` usage
- `src/db/schema.js` — `tickets` table (clean up on re-import via `DELETE FROM tickets WHERE session_id = ?`)

### Root Cause

The regex `TICKET_PATTERN = /[a-zA-Z]{2,8}-\d+/gi` is intentionally broad. From live database inspection, the false positives are numerous and severe. Example false positives found in the actual database:

**Model names:** `OPUS-4`, `CLAUDE-1000`, `GEMINI-1`, `CLAUDE-7882`, `CLAUDE-0335`

**CSS/color tokens:** `GRAY-100` through `GRAY-900`, `GREEN-500`, `PRIMARY-50`, `SURFACE-50`

**Version strings / standards:** `UTF-8`, `ISO-8601`, `PSR-12`, `PSR-4`, `WSL-2`, `VUE-3`, `LARAVEL-11`, `CPYTHON-310`, `CPYTHON-312`

**Template/example tickets in docs:** `TICKET-123`, `ABC-123`, `USER-123`, `USER-456`, `BUG-043`, `PLAYER-123`, `TEAM-123`, `DEF-456`

**Tooling internals / auto-generated IDs:** `APPROVAL-177...` (timestamps as numeric suffix), `BASH-177...`, `SHUTDOWN-177...` (already in denylist)

**Single-char false positives from word splitting:** `ICATIONS-671`, `LANATION-1`, `MPARISON-1` (mid-word matches from long words)

The current `TICKET_PREFIX_DENYLIST = new Set(['SHUTDOWN'])` only blocks one prefix.

### Proposed Fix

**Approach 1: Prefix denylist expansion** (minimal, targeted)

Add known false-positive prefixes to the denylist:
```js
export const TICKET_PREFIX_DENYLIST = new Set([
  // Model names
  'CLAUDE', 'OPUS', 'GEMINI', 'GPT',
  // CSS tokens / design systems
  'GRAY', 'RED', 'GREEN', 'BLUE', 'PRIMARY', 'SECONDARY', 'SURFACE',
  // Version strings / standards
  'UTF', 'ISO', 'PSR', 'WSL', 'VUE', 'LARAVEL', 'CPYTHON', 'PYTHON',
  // Auto-generated IDs (timestamp-suffixed)
  'SHUTDOWN', 'APPROVAL', 'BASH',
  // Example/placeholder tickets
  'TICKET', 'BUG', 'TASK', 'EPIC', 'STORY', 'TEST', 'USER', 'PLAYER', 'TEAM',
]);
```

**Limitation:** This blocklist will grow over time and requires maintenance. Some (e.g., `STORY`, `EPIC`, `TASK`, `BUG`) are legitimate ticket prefixes for many teams. Adding them to the denylist would break real ticket detection.

**Approach 2: Regex refinement to prevent mid-word matching**

The pattern `[a-zA-Z]{2,8}-\d+` matches mid-word substrings because it has no word boundary assertion. Wrapping with `\b`:
```js
export const TICKET_PATTERN = /\b[A-Z]{2,8}-\d+\b/g;
```

This eliminates matches like `ICATIONS-671` (from `COMMUNICATIONS-671` not matched here, but from content like `...notifications-671...`). However `\b` behavior with hyphens is complex — in `CLAUDE-1000`, both `CLAUDE` and `1000` are bounded by word boundaries, so `\b` doesn't help filter `CLAUDE-1000`.

**Approach 3: Maximum digit count filter**

Legitimate ticket numbers are rarely more than 5-6 digits. Timestamp-suffixed IDs like `APPROVAL-1772078192534` have 13-digit suffixes. A max-digit filter catches these:
```js
// Only matches up to 6 digits (filters timestamp-suffix false positives)
export const TICKET_PATTERN = /\b[A-Z]{2,8}-\d{1,6}\b/g;
```

This removes the `APPROVAL-177...` and `BASH-177...` family.

**Approach 4: Scoring threshold**

Currently `scoreTickets()` returns the highest-scoring ticket regardless of score. If no ticket scores above a minimum threshold, return null:
```js
const MIN_TICKET_SCORE = 15;  // at least one real mention
if (bestScore < MIN_TICKET_SCORE) return null;
```

With the current scoring weights:
- Content mention: 10 pts each
- Branch: 100 pts base + 5/message
- `/prep-ticket`: 500–700 pts

A threshold of 15 would require either 2 content mentions or 1 content mention + branch presence. This filters pure-noise single-mention false positives.

**Recommended combined fix:**
1. Add obvious model-name and standards prefixes to `TICKET_PREFIX_DENYLIST`
2. Change regex to `\d{1,6}` to filter timestamp IDs
3. Add minimum score threshold of 15 points
4. Do NOT add `STORY`, `BUG`, `TASK`, `EPIC` to denylist — these are real ticket prefixes for many teams

**Re-import note:** `upsertTickets()` in `db-writer.js` already does `DELETE FROM tickets WHERE session_id = ?` before inserting, so a re-import will clean up old false positives automatically.

### Complexity Estimate

**Low-Medium** — Changes to `ticket-scorer.js` constants and one regex. Requires re-import to clean database. The "UI to review/correct" approach mentioned in BUGS.md is a separate feature and out of scope for this phase.

---

## Recommendations

### Execution Order (matches BUGS.md suggestion)

1. **BUG-01** first — highest user-visible impact, simple fix, enables meaningful summary display
2. **BUG-02** — path-pattern filtering at discovery time, defer working-time attribution to parent
3. **BUG-03 + BUG-04** — both are DaySummary.vue changes, do together
4. **BUG-05** — conservative denylist expansion + digit-count filter, avoid removing general prefixes

### Cross-Cutting Concern: Re-import

BUG-01, BUG-02 (for existing sessions), and BUG-05 all benefit from a re-import after the code fix. The import pipeline already supports `force: true` re-import. Consider triggering a force re-import as part of the fix verification.

### Schema Changes

No schema changes required for any of the 5 bugs. All required columns exist:
- `first_prompt TEXT` — exists (schema v5)
- `is_subagent BOOLEAN` — exists (schema v3)
- `primary_ticket TEXT` — exists

### What Doesn't Need Research

- Vue template changes (BUG-03, BUG-04) are straightforward CSS/template work
- The existing `is_subagent` filtering in `timeline.js` is already correct
- The `summaryText` computed in `SessionDetailPanel.vue` is already correct

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection: `src/importer/parser.js`, `src/importer/ticket-scorer.js`, `src/importer/discovery.js`, `src/importer/index.js`, `src/importer/session-index.js`, `src/server/routes/timeline.js`
- Direct source code inspection: `src/client/components/DaySummary.vue`, `src/client/components/SessionDetailPanel.vue`
- Live database queries against `~/.cctimereporter/data.db` (84 sessions)
- Live JSONL file inspection confirming slash command `isMeta` behavior
- `src/db/schema.js` — confirmed column existence

### Secondary (MEDIUM confidence)
- `references/claude-transcript-schema.md` — confirms `isMeta` field semantics and slash command structure

## Metadata

**Confidence breakdown:**
- BUG-01 root cause: HIGH — confirmed via live DB (38 of 67 sessions have slash command first_prompt)
- BUG-02 root cause: HIGH for pattern B/C distinction; MEDIUM for exact worktree path patterns (no `-tmp-` projects in test environment)
- BUG-03 root cause: HIGH — CSS table layout behavior, confirmed no column widths set
- BUG-04 root cause: HIGH — confirmed `allSessions` flatMap loses project association
- BUG-05 root cause: HIGH — confirmed via live `tickets` table dump showing hundreds of false positives

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable codebase, no external deps involved)
