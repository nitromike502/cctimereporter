# Phase 18: Ticket Detection Pipeline - Research

**Researched:** 2026-03-07
**Domain:** JSONL transcript parsing, multi-source ticket scoring
**Confidence:** HIGH

## Summary

This phase extends the existing ticket detection system with three new sources: git commit messages found in tool_result blocks, session summary/title text, and MCP tool call inputs. All three integrate into the existing `scoreTickets()` function in `ticket-scorer.js` and the `detectTicketsFromMessage()` / `collectTickets()` functions in `index.js`.

The codebase has a clean separation between ticket detection (collecting ticket references with source tags) and ticket scoring (assigning points). Detection happens in `index.js` via `detectTicketsFromMessage()` and `collectTickets()`, while scoring happens in `ticket-scorer.js` via `scoreTickets()`. Both must be extended for the new sources.

**Primary recommendation:** Add three new detection+scoring pathways that follow the exact patterns of the existing `branch` and `content` sources, keeping the same addScore/denylist/dedup architecture.

## Standard Stack

No new libraries needed. This phase is pure logic changes to existing modules.

### Core Files to Modify
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/importer/ticket-scorer.js` | Scoring engine | Add git_commit, summary, mcp_tool scoring weights |
| `src/importer/index.js` | Detection + orchestration | Add git_commit, summary, mcp_tool detection in `detectTicketsFromMessage()` |
| `src/importer/parser.js` | JSONL streaming parser | No changes needed - rawMessage already preserved |

### Key Insight: No Parser Changes Needed
The parser already stores `rawMessage` (the full JSONL line object) on every normalized message. All three new sources can be extracted from `rawMessage` in `detectTicketsFromMessage()` without touching the parser.

## Architecture Patterns

### Current Detection/Scoring Flow
```
parseTranscript() → messages with rawMessage
    ↓
detectTicketsFromMessage(msg)  → [{ticket_key, source, detected_at}]
    ↓ (per message, aggregated by collectTickets)
collectTickets(messages) → deduplicated by (ticket_key, source)
    ↓
upsertTickets(db, sessionId, tickets, primaryTicket)
    ↓
scoreTickets(messages, workingBranch) → primaryTicket (highest score)
```

Detection and scoring are separate passes. `collectTickets()` feeds the `tickets` table (recording WHERE each ticket was found). `scoreTickets()` determines the primary ticket via point accumulation. Both must be extended.

### Pattern: Adding a New Source

For each new source, two changes are needed:

1. **In `detectTicketsFromMessage()` (index.js):** Add a new block that scans the message's rawMessage for ticket patterns and pushes `{ ticket_key, source: 'new_source', detected_at }` results.

2. **In `scoreTickets()` (ticket-scorer.js):** Add a scoring block that applies points for the new source.

### Existing Source Values in tickets.source Column
- `slash_command` - /prep-ticket detection
- `content` - user message text mentions
- `branch` - git branch name match

### New Source Values to Add
- `git_commit` - ticket found in git commit message output
- `summary` - ticket found in session summary or title
- `mcp_tool` - ticket found in MCP tool call input

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ticket pattern matching | New regex | Existing `TICKET_PATTERN` constant | Already handles word boundaries, length limits |
| Denylist filtering | New filter | Existing `TICKET_PREFIX_DENYLIST` | Already comprehensive, shared across all sources |
| Deduplication | New dedup logic | Existing `collectTickets()` Map-based dedup | Dedupes by `ticket_key + source` automatically |
| Score accumulation | New scoring system | Existing `addScore()` closure in `scoreTickets()` | Handles normalization, denylist, accumulation |

## Common Pitfalls

### Pitfall 1: Regex lastIndex State
**What goes wrong:** `TICKET_PATTERN` has the `/g` flag, so its `lastIndex` persists between uses.
**Why it happens:** The existing code already resets `lastIndex` before each use.
**How to avoid:** Always use `matchAll()` (creates fresh iterator) or reset `lastIndex = 0` before `test()`. Never use `exec()` in a loop with `/g` regex.
**Warning signs:** Intermittent missed detections.

### Pitfall 2: Git Commit Output Format Variations
**What goes wrong:** Assuming git commit output always starts with `[branch hash]`.
**Why it happens:** Tool results can contain error messages, hook output, or multi-command output.
**How to avoid:** Use a robust regex that finds `[branchname hash] commit message` anywhere in the text, not just at position 0. Also handle the case where the tool_result is an error or hook block.
**Warning signs:** Regex matching `[main 218042e]` but missing `[feature/TICK-123 abc1234]`.

### Pitfall 3: Scanning Too Many Messages for Git Commits
**What goes wrong:** Scanning all message types for git commit output when only `user` messages with `tool_result` blocks contain it.
**Why it happens:** Git commit output appears in `tool_result` content blocks inside `user` messages (the result of a Bash tool_use).
**How to avoid:** Only scan `user` messages, only look at `tool_result` content blocks.

### Pitfall 4: MCP Tool Name Matching
**What goes wrong:** Using exact string matching instead of prefix matching for MCP server names.
**Why it happens:** MCP tool names follow the pattern `mcp__{server}__{tool}` but server names can contain hyphens (e.g., `mcp__plugin_playwright_playwright__browser_click`).
**How to avoid:** Split on `__` and check if the second segment starts with a known prefix. The configured prefixes are: `atlassian`, `linear`, `github`, `tickets`.

### Pitfall 5: Double-Counting Git Commits and Content
**What goes wrong:** A git commit message like `fix(TICK-123): resolve issue` could be detected as both `git_commit` source and `content` source if the tool_result text is also scanned as general content.
**Why it happens:** Currently, user message content scanning scans ALL content including tool_result blocks (via `extractContentText` which uses `JSON.stringify` on arrays).
**How to avoid:** This is actually by design - the dedup in `collectTickets()` keeps separate entries per source, and `scoreTickets()` accumulates from all sources independently. A ticket in a commit message SHOULD score both git_commit points and content points. The existing architecture handles this correctly.

### Pitfall 6: Session Summary/Title Not in Messages
**What goes wrong:** Trying to scan summary/title from within `detectTicketsFromMessage()`.
**Why it happens:** Summary and customTitle are session-level metadata, not per-message fields. They're extracted by the parser and returned alongside messages.
**How to avoid:** Summary/title scanning must happen at the session level (in `importFile()`), not per-message. Create a separate function or handle it inline after parsing.

## Code Examples

### Source 1: Git Commit Messages in tool_result Blocks

**Verified from sample transcripts (HIGH confidence):**

Git commit output appears in user messages as `tool_result` content blocks (string type). The format is:
```
[branch-name short-hash] commit message\n N files changed, X insertions(+), Y deletions(-)
```

Real examples from transcripts:
```
[main 218042e] docs(05): capture phase context\n 1 file changed, 73 insertions(+)
[main 31b0d73] fix(05-03): fix filter checkboxes, date picker overflow, chart layout\n 8 files changed...
[main 12f1559] feat(15-01): add session custom title to timeline and UI\n 3 files changed...
```

The commit message is between `] ` and `\n`. Ticket patterns can appear in:
- The commit message text itself (e.g., `fix(TICK-123): ...`)
- The branch name within the brackets (e.g., `[feature/TICK-123 abc1234]`)

**Detection code pattern:**
```javascript
// In detectTicketsFromMessage() — scan user messages with tool_result blocks
if (msg.type === 'user') {
  const content = msg.rawMessage?.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'tool_result' && typeof block.content === 'string') {
        // Match git commit output: [branch hash] message
        const commitMatches = block.content.matchAll(
          /\[[^\]]+\s+[0-9a-f]{7,}\]\s+(.+?)(?:\n|$)/g
        );
        for (const cm of commitMatches) {
          const commitMsg = cm[1];
          TICKET_PATTERN.lastIndex = 0;
          for (const tm of commitMsg.matchAll(TICKET_PATTERN)) {
            const key = tm[0].toUpperCase();
            if (!TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) {
              results.push({
                ticket_key: key,
                source: 'git_commit',
                detected_at: msg.timestamp,
              });
            }
          }
        }
      }
    }
  }
}
```

**Scoring code pattern:**
```javascript
// In scoreTickets() — score git_commit detections
// Accumulate per-commit: 100 base for first commit, +10 per additional
// Need to track which tickets were seen in commits
if (msg.type === 'user') {
  const content = msg.rawMessage?.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'tool_result' && typeof block.content === 'string') {
        const commitMatches = block.content.matchAll(
          /\[[^\]]+\s+[0-9a-f]{7,}\]\s+(.+?)(?:\n|$)/g
        );
        for (const cm of commitMatches) {
          TICKET_PATTERN.lastIndex = 0;
          for (const tm of cm[1].matchAll(TICKET_PATTERN)) {
            // First commit: 100pts, additional: 10pts each
            // Use a Set to track whether base has been given
            addScore(tm[0], gitCommitBaseSeen.has(tm[0].toUpperCase()) ? 10 : 100);
            gitCommitBaseSeen.add(tm[0].toUpperCase());
          }
        }
      }
    }
  }
}
```

### Source 2: Session Summary/Title Text

**Structure (HIGH confidence, verified from parser.js and session-index.js):**

Summary and customTitle come from two places:
1. JSONL `type: "summary"` entries (rare in-transcript)
2. `sessions-index.json` file (more common, loaded via `readSessionIndex()`)

In `importFile()`, the merged values are already computed as `summaryValue` and `customTitleValue`. These can be scanned for tickets before the `upsertSession()` call.

**Scanning approach:**
```javascript
// In importFile(), after merging summary/title values but before upsertSession
// Scan summary + customTitle + firstPrompt for ticket patterns
const summaryTexts = [summaryValue, customTitleValue].filter(Boolean);
const summaryTickets = [];
for (const text of summaryTexts) {
  TICKET_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(TICKET_PATTERN)) {
    const key = match[0].toUpperCase();
    if (!TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) {
      summaryTickets.push({ ticket_key: key, source: 'summary', detected_at: null });
    }
  }
}
```

**Scoring:** 25pts per ticket mention in summary/title. No accumulation - a ticket mentioned twice in summary still gets 25pts (it's the same low-confidence signal).

**Recommendation on first_prompt:** Do NOT scan first_prompt for ticket patterns. First_prompt is already the first user message content, which is already scanned as `content` source (10pts/mention). Scanning it again as `summary` would double-count. Summary and customTitle are genuinely different signals.

### Source 3: MCP Tool Call Inputs

**Structure (HIGH confidence, verified from transcript schema reference):**

MCP tool calls appear as `tool_use` blocks in `assistant` messages:
```json
{
  "type": "tool_use",
  "id": "toolu_01ABC...",
  "name": "mcp__atlassian__jira_get_issue",
  "input": {
    "issue_key": "PROJ-123",
    "project_id": "..."
  }
}
```

The tool name format is `mcp__{server}__{tool}`. The server name is the second `__`-delimited segment.

**Detection approach:**
```javascript
// In detectTicketsFromMessage() — scan assistant messages for MCP tool_use blocks
const MCP_PREFIXES = ['atlassian', 'linear', 'github', 'tickets'];

if (msg.type === 'assistant') {
  const content = msg.rawMessage?.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'tool_use' && typeof block.name === 'string' && block.name.startsWith('mcp__')) {
        // Extract server name: mcp__{server}__{tool}
        const parts = block.name.split('__');
        const server = parts[1] || '';
        if (!MCP_PREFIXES.some(prefix => server.startsWith(prefix))) continue;

        // Scan the input JSON for ticket patterns
        const inputStr = JSON.stringify(block.input || {});
        TICKET_PATTERN.lastIndex = 0;
        for (const match of inputStr.matchAll(TICKET_PATTERN)) {
          const key = match[0].toUpperCase();
          if (!TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) {
            results.push({
              ticket_key: key,
              source: 'mcp_tool',
              detected_at: msg.timestamp,
            });
          }
        }
      }
    }
  }
}
```

**Scoring:** 100pts base (first detection), +10pts per additional MCP call mentioning the same ticket.

**Note on assistant vs user messages:** The `tool_use` block is in the `assistant` message. The `tool_result` is in the following `user` message. We scan the `tool_use` input (assistant message) because that's where the user's intent is expressed (Claude calls the tool with specific ticket references). The `tool_result` content would be the Jira/Linear API response, which is noise.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 2 sources (slash_command, content+branch) | Will be 5 sources | This phase | Much better ticket coverage for sessions without /prep-ticket |

### Scoring Weight Summary (After This Phase)
| Source | Points | Accumulation | Rationale |
|--------|--------|-------------|-----------|
| `/prep-ticket` (first msg) | 700 | N/A | Explicit user declaration, strongest signal |
| `/prep-ticket` (later) | 500 | N/A | Explicit user declaration |
| Branch name | 100 base | +5/message | Persistent structural signal |
| Git commit message | 100 base | +10/additional commit | Strong confirmation, multiple commits very strong |
| MCP tool call input | 100 base | +10/additional call | Direct user action via external tool |
| Session summary/title | 25 | Flat (no accumulation) | Low confidence, mentioned in passing |
| Content mention | 10 | Per mention | Weakest signal, could be discussion |

### Minimum Score Threshold
`MIN_TICKET_SCORE = 15` remains unchanged. This means:
- A single content mention (10pts) does NOT make a ticket primary
- A single summary mention (25pts) DOES make a ticket primary
- A single git commit or MCP call (100pts) DOES make a ticket primary

## Key Implementation Details

### Where Detection Happens vs Where Scoring Happens

Currently there's a subtle split:
- **`detectTicketsFromMessage()` in index.js** handles detection for the `tickets` table (records all findings)
- **`scoreTickets()` in ticket-scorer.js** independently re-scans messages for scoring

This means changes are needed in BOTH files. Detection logic in `index.js` feeds the `tickets` table. Scoring logic in `ticket-scorer.js` determines `primary_ticket`.

### Summary/Title Scanning is Session-Level, Not Message-Level

Unlike git commits and MCP calls (which are per-message), summary and title are session-level data. Options:

1. **Add to `scoreTickets()` signature** - pass summary/title as additional parameters
2. **Scan inline in `importFile()`** - add to tickets array + add to a new session-level scoring call

**Recommendation:** Option 1 - extend `scoreTickets(messages, workingBranch, { summary, customTitle })` with an optional third parameter. This keeps all scoring logic in one place.

For detection, add summary tickets to the `collectTickets()` result inline in `importFile()` (append them to the array before calling `upsertTickets()`).

### MCP Prefix Configuration

The user specified default prefixes: `atlassian`, `linear`, `github`, `tickets`. These should be a module-level constant (not configurable at runtime in this phase). Export it for testing.

```javascript
export const MCP_TICKET_PREFIXES = ['atlassian', 'linear', 'github', 'tickets'];
```

## Open Questions

1. **Tool_result content format edge cases**
   - What we know: Git commit output is a plain string in `tool_result.content`
   - What's unclear: Whether `tool_result.content` can also be an array of text blocks (the schema says it can be "string or JSON")
   - Recommendation: Handle both string and array-of-text-blocks formats defensively

2. **Existing content scanning overlap with git commits**
   - What we know: `extractContentText()` uses `JSON.stringify(content)` for arrays, which includes tool_result text
   - What's unclear: Whether existing `content` detection already catches some tickets from git commit messages
   - Recommendation: This is fine - different sources score independently, and the ticket table deduplicates by `(ticket_key, source)`. A ticket in a commit message can legitimately score as both `content` (10pts) and `git_commit` (100pts).

## Sources

### Primary (HIGH confidence)
- `src/importer/ticket-scorer.js` - Current scoring weights and denylist
- `src/importer/index.js` - Current detection and orchestration flow
- `src/importer/parser.js` - Message parsing and rawMessage preservation
- `src/importer/session-index.js` - Summary/title loading from sessions-index.json
- `src/importer/db-writer.js` - Ticket upsert with source column
- `src/db/schema.js` - tickets table schema with UNIQUE(session_id, ticket_key, source)
- `references/claude-transcript-schema.md` - Tool use/result block structure
- 34 sample JSONL transcripts at `/tmp/cctimereporter-research/` - Real git commit output patterns verified

### Secondary (MEDIUM confidence)
- None needed - all findings verified from codebase and sample data

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all existing code verified
- Architecture: HIGH - Exact patterns verified from codebase, clear extension points
- Pitfalls: HIGH - Verified from real transcript data and existing code patterns
- Git commit format: HIGH - 58 examples verified across sample transcripts
- MCP tool format: HIGH - Verified from transcript schema reference (no real Atlassian/Linear examples in samples, but format is documented)
- Summary/title scanning: HIGH - Parser and session-index code fully reviewed

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable domain, internal codebase)
