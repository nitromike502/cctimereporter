# MCP tools reference

*Last updated: 2026-03-27*
*Version: 0.7.0*

## Overview

CC Time Reporter exposes 8 tools via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP)
for programmatic access from Claude Code and other MCP-compatible clients. The server
communicates over stdio using the `@modelcontextprotocol/sdk` transport.

## Starting the MCP server

```bash
node bin/cli.js --mcp
```

The `--mcp` flag activates stdio MCP mode. The process stays alive until stdin
closes (the MCP host disconnects). All stderr output is suppressed in MCP mode
because stdio is owned by the protocol.

The MCP server opens the same SQLite database as the web UI (`~/.cctimereporter/data.db`)
and applies any pending schema migrations on startup.

## Claude Code configuration

Add the following to your project's `.mcp.json` file:

```json
{
  "mcpServers": {
    "cctimereporter": {
      "command": "node",
      "args": ["/path/to/cctimereporter/bin/cli.js", "--mcp"]
    }
  }
}
```

Or, if installed globally or via npx:

```json
{
  "mcpServers": {
    "cctimereporter": {
      "command": "npx",
      "args": ["cctimereporter", "--mcp"]
    }
  }
}
```

## Query tools

Read-only tools for retrieving session data. These never modify the database.

---

### `get_day_summary`

Get ticket-grouped working time summary for a date. Returns per-ticket working
time totals and session counts.

#### Input parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | `string` | Yes | Date in `YYYY-MM-DD` format (regex: `^\d{4}-\d{2}-\d{2}$`) |
| `idle_threshold_min` | `integer` | No | Idle gap threshold in minutes. Range: 1-120. Default: `10` |

#### Return format

Returns a JSON object with the same shape as
[`cctimereporter summary`](CLI-COMMANDS.md#summary), including enriched
`workingTime` strings.

```json
{
  "date": "2026-03-27",
  "workingTimeMs": 5400000,
  "workingTime": "1h 30m",
  "byTicket": [
    {
      "ticket": "PROJ-123",
      "workingTimeMs": 3600000,
      "workingTime": "1h",
      "sessionCount": 2,
      "projects": ["my-project"],
      "sessions": [
        {
          "sessionId": "abc-def-123",
          "project": "my-project",
          "ticket": "PROJ-123",
          "branch": "feat/PROJ-123-new-feature",
          "workingTimeMs": 2400000,
          "workingTime": "40m",
          "summary": "Implemented new feature",
          "startTime": "2026-03-27T09:00:00.000Z",
          "endTime": "2026-03-27T09:40:00.000Z",
          "userLabel": null,
          "userTicket": null
        }
      ]
    }
  ],
  "unticketedSessions": []
}
```

#### Error conditions

None specific. Returns empty `byTicket` and `unticketedSessions` arrays for
dates with no session data.

#### Example call

```json
{
  "name": "get_day_summary",
  "arguments": {
    "date": "2026-03-27",
    "idle_threshold_min": 15
  }
}
```

---

### `get_sessions`

Get all sessions for a date grouped by project. Returns detailed session info
including start/end times, tickets, branches, summaries, and working time.

#### Input parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | `string` | Yes | Date in `YYYY-MM-DD` format (regex: `^\d{4}-\d{2}-\d{2}$`) |
| `idle_threshold_min` | `integer` | No | Idle gap threshold in minutes. Range: 1-120. Default: `10` |

#### Return format

Returns a JSON array of project objects. Each project contains its sessions with
full detail including fork segments and idle gaps.

```json
[
  {
    "projectId": 1,
    "projectPath": "/home/user/projects/my-project",
    "displayName": "my-project",
    "sessions": [
      {
        "sessionId": "abc-def-123",
        "startTime": "2026-03-27T09:00:00.000Z",
        "endTime": "2026-03-27T09:40:00.000Z",
        "continuesFromPrevDay": false,
        "continuesIntoNextDay": false,
        "workingTimeMs": 2400000,
        "elapsedTimeMs": 2400000,
        "idleGaps": [],
        "forkSegments": [],
        "ticket": "PROJ-123",
        "branch": "feat/PROJ-123-new-feature",
        "summary": "Implemented new feature",
        "firstPrompt": "Let's implement the new feature",
        "customTitle": null,
        "userLabel": null,
        "userTicket": null,
        "messageCount": 24,
        "userMessageCount": 12,
        "forkCount": 0,
        "realForkCount": 0
      }
    ]
  }
]
```

#### Project fields

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | `number` | Internal project ID |
| `projectPath` | `string` | Filesystem path of the project |
| `displayName` | `string` | Short display name derived from the path |
| `sessions` | `array` | Sessions in this project for the queried date |

#### Session fields

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Session UUID |
| `startTime` | `string` | ISO 8601 UTC timestamp (clamped to day boundary for overnight sessions) |
| `endTime` | `string` | ISO 8601 UTC timestamp (clamped to day boundary for overnight sessions) |
| `continuesFromPrevDay` | `boolean` | `true` if the session started before this date |
| `continuesIntoNextDay` | `boolean` | `true` if the session extends past this date |
| `workingTimeMs` | `number` | Active working time (milliseconds), excluding idle gaps |
| `elapsedTimeMs` | `number` | Wall-clock elapsed time (milliseconds) |
| `idleGaps` | `array` | Periods of inactivity exceeding the idle threshold |
| `forkSegments` | `array` | Fork branch segments within this session |
| `ticket` | `string \| null` | Detected ticket identifier |
| `branch` | `string \| null` | Working branch name |
| `summary` | `string \| null` | Session summary from Claude |
| `firstPrompt` | `string \| null` | First user message in the session |
| `customTitle` | `string \| null` | Title set via `/rename` command |
| `userLabel` | `string \| null` | User-assigned label (from web UI) |
| `userTicket` | `string \| null` | User-assigned ticket override |
| `messageCount` | `number` | Messages on this date |
| `userMessageCount` | `number` | User messages in the session |
| `forkCount` | `number` | Total fork branches |
| `realForkCount` | `number` | Fork branches with substantive content |

#### Error conditions

None specific. Returns an empty array for dates with no session data.

#### Example call

```json
{
  "name": "get_sessions",
  "arguments": {
    "date": "2026-03-27"
  }
}
```

---

### `get_session_messages`

Get messages for a specific session. Returns first and last messages with a skip
count for long sessions.

#### Input parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | `string` | Yes | Session ID (UUID) |
| `fork_branch_id` | `string` | No | Fork branch ID to filter messages. Omit for primary branch. |

#### Return format

Returns a JSON object with head messages, tail messages, and a skip count for
messages in the middle.

```json
{
  "head": [
    {
      "uuid": "msg-001",
      "type": "user",
      "content": "Let's implement the new feature",
      "timestamp": "2026-03-27T09:00:00.000Z",
      "isForkBranch": false,
      "forkBranchId": null
    },
    {
      "uuid": "msg-002",
      "type": "assistant",
      "content": "I'll start by reviewing the codebase...",
      "timestamp": "2026-03-27T09:00:15.000Z",
      "isForkBranch": false,
      "forkBranchId": null
    }
  ],
  "tail": [],
  "skipped": 0
}
```

#### Message fields

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Message UUID |
| `type` | `string` | `"user"` or `"assistant"` |
| `content` | `string \| null` | Message text content (`null` for tool-only messages) |
| `timestamp` | `string` | ISO 8601 UTC timestamp |
| `isForkBranch` | `boolean` | Whether this message is on a fork branch |
| `forkBranchId` | `string \| null` | Fork branch identifier |

#### Error conditions

| Condition | Response |
|-----------|----------|
| Session not found | `isError: true` with `{ "error": "not_found", "message": "Session not found" }` |

#### Example call

```json
{
  "name": "get_session_messages",
  "arguments": {
    "session_id": "abc-def-123"
  }
}
```

With a fork branch:

```json
{
  "name": "get_session_messages",
  "arguments": {
    "session_id": "abc-def-123",
    "fork_branch_id": "fork-456"
  }
}
```

---

### `get_dates`

Get all dates that have session data. Useful for discovering which dates to
query with the other tools.

#### Input parameters

None.

#### Return format

Returns a JSON object with a `dates` array sorted in descending chronological order.

```json
{
  "dates": [
    "2026-03-27",
    "2026-03-26",
    "2026-03-25",
    "2026-03-24"
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `dates` | `string[]` | Distinct dates (`YYYY-MM-DD`) with at least one session, descending |

#### Error conditions

None. Returns `{ "dates": [] }` if the database has no sessions.

#### Example call

```json
{
  "name": "get_dates",
  "arguments": {}
}
```

## Action tools

Tools that modify state: importing data and managing the web server.

---

### `trigger_import`

Trigger a data import from Claude Code session files. Returns import stats on
success or an error if an import is already running.

#### Input parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_age_days` | `integer` | No | Max age of sessions to import in days. Range: 1-365. Default: `2` |

#### Return format

On success:

```json
{
  "ok": true,
  "projectsFound": 5,
  "filesProcessed": 42,
  "filesSkipped": 3,
  "totalMessages": 1250,
  "errors": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `boolean` | Always `true` on success |
| `projectsFound` | `number` | Number of projects discovered |
| `filesProcessed` | `number` | Number of JSONL files imported |
| `filesSkipped` | `number` | Number of files skipped (already up to date) |
| `totalMessages` | `number` | Total messages processed |
| `errors` | `string[]` | Non-fatal error messages |

#### Error conditions

| Condition | Response |
|-----------|----------|
| Import already running | `isError: true` with `{ "error": "already_running", "message": "Import already running (PID ... via ..., started ...)" }` |

#### Example call

```json
{
  "name": "trigger_import",
  "arguments": {
    "max_age_days": 7
  }
}
```

---

### `start_server`

Start the cctimereporter web server. Returns the URL of an existing server if
one is already running, or starts a new one bound to port 3847 (with fallback
to 3848-3856).

#### Input parameters

None.

#### Return format

Already running (this MCP process or another):

```json
{
  "status": "already_running",
  "url": "http://127.0.0.1:3847",
  "pid": 12345
}
```

Newly started:

```json
{
  "status": "started",
  "url": "http://127.0.0.1:3847"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"already_running"` or `"started"` |
| `url` | `string` | Web UI URL |
| `pid` | `number` | Present only when another process owns the server |

#### Error conditions

| Condition | Response |
|-----------|----------|
| Server failed to start | `isError: true` with `{ "error": "start_failed", "message": "..." }` |

#### Example call

```json
{
  "name": "start_server",
  "arguments": {}
}
```

---

### `stop_server`

Stop the cctimereporter web server. Stops any running instance regardless of how
it was started (web UI, MCP, or CLI). If the MCP process owns the server, it
closes Fastify gracefully. If another process owns the server, it sends SIGTERM.

#### Input parameters

None.

#### Return format

Server was running and stopped:

```json
{
  "status": "stopped",
  "was_pid": 12345
}
```

No server was running:

```json
{
  "status": "not_running"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"stopped"` or `"not_running"` |
| `was_pid` | `number` | PID of the stopped process (only present when `status` is `"stopped"`) |

#### Error conditions

None. Stale locks are cleaned up automatically.

#### Example call

```json
{
  "name": "stop_server",
  "arguments": {}
}
```

---

### `server_status`

Check if the cctimereporter web server is running. Verifies that the lock-holding
process is still alive and cleans up stale locks.

#### Input parameters

None.

#### Return format

Server is running:

```json
{
  "running": true,
  "url": "http://127.0.0.1:3847",
  "pid": 12345,
  "source": "web"
}
```

Server is not running:

```json
{
  "running": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `running` | `boolean` | Whether the server is currently running |
| `url` | `string` | Web UI URL (only when running) |
| `pid` | `number` | Server process PID (only when running) |
| `source` | `string` | How the server was started: `"web"`, `"mcp"`, or `"cli"` (only when running) |

#### Error conditions

None.

#### Example call

```json
{
  "name": "server_status",
  "arguments": {}
}
```
