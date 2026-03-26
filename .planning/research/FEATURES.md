# Feature Landscape: MCP Server + CLI Programmatic Access

**Domain:** Programmatic access to local time-tracking/session data
**Researched:** 2026-03-25
**Confidence:** HIGH (based on direct codebase analysis, official MCP documentation, and verified CLI design patterns)

---

## Context: What This Milestone Does

This milestone adds two parallel access layers to CC Time Reporter's existing data pipeline:

1. **MCP server** — tools that Claude agents can call to pull session/time data, then log it to Harvest/Jira via other MCP servers
2. **CLI subcommands** — non-interactive commands that output JSON to stdout, usable in scripts and agent toolchains

Both layers are thin wrappers over the existing query and import logic. No new data is computed — what the web UI already shows, these surfaces expose programmatically.

**The driving workflow:** A Claude agent runs `get_day_summary(date)`, reads ticket-grouped time totals, decides what to log, then calls Harvest/Jira MCP tools. The agent needs clean, structured, predictable data. Noise (fork detail, idle gaps, raw timestamps) is secondary.

---

## Table Stakes

Features that must exist for this milestone to be useful. Missing any of these breaks the core workflow.

### MCP Tools

| Tool | Why Required | Inputs | Output |
|------|-------------|--------|--------|
| `get_day_summary` | Core tool — gives the agent ticket-grouped totals for a day without reading all session detail | `date?: string` (YYYY-MM-DD, defaults today) | Ticket-grouped time map, project breakdown, total working time |
| `get_sessions` | Gives the agent full session list when it needs per-session context to interpret what was worked | `date?: string` (YYYY-MM-DD, defaults today) | Array of session objects matching web UI shape |
| `trigger_import` | Without this, data is stale — agent must be able to refresh before querying | `maxAgeDays?: number` | Import result stats (projectsFound, filesProcessed, filesSkipped, totalMessages, errors) |
| `get_session_messages` | Gives the agent message content when session summary/ticket is unclear — essential for interpreting ambiguous sessions | `sessionId: string`, `forkBranchId?: string` | Messages array (head+tail with skip count), totalCount, skipped |

### CLI Subcommands

| Command | Why Required | Flags | Output |
|---------|-------------|-------|--------|
| `npx cctimereporter summary --date YYYY-MM-DD` | Scripting/piping — agent or shell script gets day summary as JSON | `--date`, `--idle-threshold`, `--json` (default) | Same structure as `get_day_summary` |
| `npx cctimereporter sessions --date YYYY-MM-DD` | Agent or script needs full session list | `--date`, `--idle-threshold`, `--json` | Same structure as `get_sessions` |
| `npx cctimereporter import [--days N]` | Trigger import non-interactively | `--days N` (default 2), `--json` | Import result stats to stdout |

---

## Detailed Input/Output Specifications

### `get_day_summary` / `summary` subcommand

**Purpose:** Ticket-grouped time totals for a day. The primary tool for a logging agent — it needs to know "I worked 2.5h on PROJ-123 and 1h on PROJ-456".

**Input:**
```json
{
  "date": "2026-03-25",           // optional, YYYY-MM-DD, defaults to today
  "idleThresholdMin": 10          // optional, 1–60, defaults to 10
}
```

**Output:**
```json
{
  "date": "2026-03-25",
  "totalWorkingTimeMs": 12600000,
  "byTicket": [
    {
      "ticket": "PROJ-123",
      "workingTimeMs": 9000000,
      "sessionCount": 2,
      "projects": ["cctimereporter"]
    },
    {
      "ticket": null,
      "workingTimeMs": 3600000,
      "sessionCount": 1,
      "projects": ["other-project"]
    }
  ],
  "byProject": [
    {
      "projectPath": "/home/claude/cctimereporter",
      "displayName": "cctimereporter",
      "workingTimeMs": 9000000,
      "sessionCount": 2
    }
  ],
  "sessionCount": 3
}
```

**Edge cases:**
- Date with no sessions: return valid structure with empty arrays and zero totals, not 404
- `ticket: null` group is a real group — sessions with no detected ticket
- Multiple tickets pointing to same session: session time counted under primary ticket only
- `userTicket` overrides `primary_ticket` — always prefer user-set values (same as web UI)

**Source:** Aggregates the same data the web UI's day summary panel shows. The server-side computation (working time with idle gap exclusion, worktree grouping) must run identically to `GET /api/timeline`.

---

### `get_sessions` / `sessions` subcommand

**Purpose:** Full session list for a day. Gives the agent per-session context when it needs to understand what happened in each session.

**Input:**
```json
{
  "date": "2026-03-25",
  "idleThresholdMin": 10
}
```

**Output:**
```json
{
  "date": "2026-03-25",
  "sessions": [
    {
      "sessionId": "abc123...",
      "startTime": "2026-03-25T09:00:00.000Z",
      "endTime": "2026-03-25T11:30:00.000Z",
      "workingTimeMs": 7200000,
      "elapsedTimeMs": 9000000,
      "ticket": "PROJ-123",
      "userTicket": null,
      "branch": "feat/my-feature",
      "summary": "Implement session editing modal",
      "firstPrompt": "Can you add a way to rename sessions?",
      "customTitle": "Session editing",
      "userLabel": null,
      "messageCount": 47,
      "userMessageCount": 12,
      "project": "cctimereporter",
      "projectPath": "/home/claude/cctimereporter",
      "realForkCount": 2,
      "continuesFromPrevDay": false,
      "continuesIntoNextDay": false
    }
  ],
  "totalCount": 3
}
```

**Edge cases:**
- Sessions with no detected ticket: `ticket: null`
- Overnight sessions: `startTime`/`endTime` clamped to day boundaries (same as web UI)
- Worktree sessions: grouped under parent project (same as web UI)
- `userLabel` and `userTicket` are user-edited values from PATCH /api/sessions/:id — always include them even if null (agent needs to know)

---

### `trigger_import` / `import` subcommand

**Purpose:** Refresh the database before querying. Agent calls this first if data might be stale.

**Input:**
```json
{
  "maxAgeDays": 2
}
```

**Output:**
```json
{
  "ok": true,
  "projectsFound": 12,
  "filesProcessed": 8,
  "filesSkipped": 47,
  "totalMessages": 1203,
  "errors": []
}
```

**Edge cases:**
- Import already running: return error with `alreadyRunning: true` flag (409 analog)
- Import errors are non-fatal — `errors` array may be populated with strings even when `ok: true`
- For CLI: progress to stderr (if `--verbose`), result to stdout

---

### `get_session_messages` / (no CLI equivalent needed)

**Purpose:** Fetch stored message content for a session. Agent uses this when summary/ticket is insufficient to know what the session was about.

**Input:**
```json
{
  "sessionId": "abc123...",
  "forkBranchId": null
}
```

**Output:**
```json
{
  "messages": [
    {
      "uuid": "msg-uuid...",
      "role": "user",
      "content": "Can you help me implement...",
      "timestamp": "2026-03-25T09:00:00.000Z",
      "isForkBranch": false,
      "forkBranchId": null
    }
  ],
  "totalCount": 47,
  "skipped": 27
}
```

**Edge cases:**
- Session not found: `isError: true`, message "Session not found" (in MCP content array, not protocol error)
- `forkBranchId: "all"` returns messages across all branches
- Head (10) + tail (10) truncation already implemented in `/api/sessions/:id/messages` — reuse directly
- Messages have `content: null` for tool-use-only messages in fork branches — return `"(no text content)"` as placeholder (matches existing behavior)

---

## Differentiators

Features that go beyond what's minimally required and add meaningful value for the agent workflow.

| Feature | Value Proposition | Complexity | Notes |
|---------|------------------|------------|-------|
| **`idleThresholdMin` as parameter on all tools** | Agent can specify the same threshold the user has configured in the UI, producing consistent numbers | Low | Already in `GET /api/timeline?threshold=N`; expose same parameter |
| **`userTicket` and `userLabel` in session output** | Agent can see when the user manually overrode ticket/label — this is high-confidence data | Low | Already in DB; just include in output |
| **Ticket-grouped totals in `get_day_summary`** | Agent needs totals by ticket, not by session. Computing this server-side saves the agent from aggregating | Medium | New computation, not directly from existing routes |
| **Human-readable time in tool descriptions** | MCP tool descriptions should explain units (ms, not seconds) and what fields mean — agents read these | Low | Documentation quality, no code change |
| **`displayName` in project output** | Project display names (not raw paths) match what users see in the UI — agents should refer to them consistently | Low | Already computed in `getDisplayName()` |
| **Error with `alreadyRunning` flag** | Agent can distinguish "import busy, retry later" from other errors and handle gracefully | Low | Better than raw 409 HTTP code |
| **`--idle-threshold` on CLI commands** | CLI users scripting reports can match their configured threshold | Low | Simple flag, consistent with MCP parameter |

---

## Anti-Features

Things to explicitly not build in this milestone. These patterns look appealing but create more problems than they solve.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **SSE streaming for MCP `trigger_import`** | MCP tools return a result object, not a stream. Streaming import progress over MCP adds protocol complexity for no benefit — the agent doesn't need real-time progress. | Return synchronous result after import completes. If import is slow, agent can poll `trigger_import` result. |
| **New data computation not in web UI** | If the web UI doesn't compute it, the MCP tool shouldn't either. Drift between surfaces creates confusion ("the UI shows 2h but the tool shows 2.3h"). | Surface exactly what `/api/timeline` computes. Add new computations to the shared route layer, not to MCP-specific code. |
| **Authentication/API keys on MCP endpoint** | This is a local tool. The MCP server runs on localhost, same machine as the user's Claude agent. Adding auth means configuration friction for zero security benefit. | No auth — localhost only. Document this clearly. |
| **NDJSON streaming for sessions list** | Sessions lists are bounded (dozens per day, rarely hundreds). NDJSON streaming is for truly large datasets. | Return full JSON array. If performance is ever an issue, add pagination. |
| **MCP resources or prompts primitives** | MCP supports resources (data) and prompts (templates) in addition to tools. These are unnecessary for this use case — the agent calls tools, reads results, and decides what to log. | Implement only tools. Skip resources and prompts. |
| **`--format` flag with multiple output modes** | Human-readable table output for CLI is not useful here — the whole point is machine-readable JSON for scripts and agents. | Default to JSON on stdout. Use `--verbose` for human-readable progress to stderr only. |
| **Per-fork working time in MCP output** | Fork segment data is visual sugar for the Gantt chart. An agent logging time to Harvest doesn't need to know about fork branches within a session. | Omit `forkSegments` and `idleGaps` from MCP/CLI output. Include `realForkCount` as metadata only. |
| **Session mutation via MCP** | The PATCH /api/sessions/:id endpoint lets users set labels and tickets. Exposing this as an MCP tool makes the agent a data editor, not a data reader. Agents calling logging tools shouldn't mutate local session metadata. | Read-only MCP tools only. Session editing stays UI-only. |
| **Date range queries** | "Give me all sessions from March 1–25" seems useful but requires UI support to be meaningful (date range picker doesn't exist yet). MCP tools on a single-day contract are simpler and consistent with the web UI. | Single-day queries only. Date range is a future milestone. |

---

## Feature Dependencies

```
Existing /api/timeline route (sessions with working time)
    |
    +---> get_day_summary MCP tool (new aggregation on top)
    |
    +---> get_sessions MCP tool (reshapes timeline output)
    |
    +---> summary CLI subcommand (calls same logic)
    |
    +---> sessions CLI subcommand (calls same logic)

Existing importAll() function
    |
    +---> trigger_import MCP tool (thin wrapper)
    |
    +---> import CLI subcommand (thin wrapper, progress → stderr)

Existing /api/sessions/:id/messages route
    |
    +---> get_session_messages MCP tool (thin wrapper)

MCP server registration
    |
    +---> @modelcontextprotocol/sdk (new dependency)
    |
    +---> Streamable HTTP transport on existing Fastify server (new route /mcp)
    |     OR
    +---> stdio transport for local Claude agent use (simpler, no port needed)
```

**Transport decision:** The MCP SDK supports both stdio (local process) and Streamable HTTP (HTTP endpoint). For this tool:
- **stdio is simpler** for local agent use — no port conflict, no separate process management
- **Streamable HTTP on the existing Fastify server** enables connecting any MCP client while the web UI is already running
- **Recommended:** Implement stdio transport first (lower complexity, covers primary workflow), add HTTP as opt-in later

---

## MVP Recommendation

Prioritize in order:

1. **`get_day_summary` MCP tool** — highest value for the logging workflow; agent needs ticket-grouped totals first
2. **`get_sessions` MCP tool** — agent fall-through when summary is insufficient
3. **`trigger_import` MCP tool** — agent must be able to refresh data before querying
4. **`summary` + `sessions` + `import` CLI subcommands** — thin wrappers, low effort once query logic is extracted
5. **`get_session_messages` MCP tool** — lower priority; existing route handles it, agent can work without it in many cases

Defer to post-MVP:
- **Streamable HTTP transport:** Implement stdio first; add HTTP if agents connect remotely
- **Date range queries:** Requires UI date range feature first for consistency
- **Session mutation tools:** Out of scope per project constraints

---

## Sources

- Codebase analysis: `src/server/routes/timeline.js`, `src/server/routes/messages.js`, `src/server/routes/import.js`, `src/importer/index.js`
- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture) — tool/resource/prompt primitives, transport options (HIGH confidence)
- [MCP Tool Concepts](https://modelcontextprotocol.info/docs/concepts/tools/) — tool definition structure, input schema, error handling (HIGH confidence)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — `server.registerTool()` pattern, Streamable HTTP setup (HIGH confidence)
- [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — new transport standard (March 2025), replaces SSE (HIGH confidence)
- [CLI Tools for AI Agents](https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no) — JSON stdout, exit codes, idempotency, non-interactive conventions (MEDIUM confidence)
- [Harvest MCP Server](https://github.com/southleft/harvest-mcp) — real-world time-tracking MCP tool naming and structure reference (MEDIUM confidence)
- [CLI Best Practices](https://clig.dev/) — stdout/stderr separation, machine-readable output conventions (MEDIUM confidence)
