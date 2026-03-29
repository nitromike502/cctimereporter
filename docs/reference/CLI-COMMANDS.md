# CLI commands reference

*Last updated: 2026-03-27*
*Version: 0.7.0*

## Overview

CC Time Reporter provides a CLI via `cctimereporter` (or `npx cctimereporter`).
When invoked without a subcommand, it starts the web server and opens a browser.
Subcommands provide programmatic access to timeline data and import functionality.

Requires Node.js 22+ (uses the built-in `node:sqlite` module).
The process exits with code 1 and a diagnostic message if the Node.js version is below 22.

## Global options

| Option | Argument | Description |
|--------|----------|-------------|
| `--version` | *(none)* | Print the package version and exit |
| `--mcp` | *(none)* | Start a stdio MCP server instead of the web UI (see [MCP-TOOLS.md](MCP-TOOLS.md)) |
| `--debug-import` | `on` \| `off` \| *(none)* | Toggle or query import debug logging |
| `--help` | *(none)* | Print help text and exit |

### `--debug-import` behavior

| Argument | Effect |
|----------|--------|
| `on` | Enables import debug logging; prints config and log file paths |
| `off` | Disables import debug logging; prints config path |
| *(omitted)* | Prints current enabled/disabled status |

Config file: `~/.cctimereporter/config.json`
Log file (when enabled): `~/.cctimereporter/import.log`

The `--debug-import` flag is handled before any other processing and always exits immediately (code 0).

## Default behavior (serve)

When no subcommand is given, `cctimereporter` runs the `serve` command:

1. Opens the SQLite database at `~/.cctimereporter/data.db` (creates and migrates if needed)
2. Starts a Fastify HTTP server on port 3847 (falls back to 3848-3856 if the port is in use)
3. Claims a process lock; if another instance is already running, prints its URL and exits (code 0)
4. Opens the default browser to `http://127.0.0.1:<port>/timeline?date=<today>`
5. Runs until interrupted with Ctrl+C or SIGTERM

```bash
# These are equivalent
cctimereporter
cctimereporter serve
```

Output to stdout:

```
cctimereporter running at http://127.0.0.1:3847
Press Ctrl+C to stop.
```

## Subcommands

### `summary`

Print a JSON day summary to stdout, grouped by ticket.

```
cctimereporter summary [options]
```

#### Options

| Option | Argument | Default | Description |
|--------|----------|---------|-------------|
| `--date` | `YYYY-MM-DD` | Today | Date to summarize |
| `--idle` | Minutes (integer) | `10` | Idle gap threshold in minutes |
| `--pretty` | *(none)* | Off | Pretty-print JSON with 2-space indentation |

#### Output schema

The command writes a single JSON object to stdout. The object has the same shape
as the `getTimelineReport()` service output, enriched with human-readable
`workingTime` strings alongside every `workingTimeMs` field.

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
          "summary": "Implemented new feature",
          "startTime": "2026-03-27T09:00:00.000Z",
          "endTime": "2026-03-27T09:40:00.000Z",
          "userLabel": null,
          "userTicket": null,
          "workingTime": "40m"
        }
      ]
    }
  ],
  "unticketedSessions": [
    {
      "sessionId": "xyz-789",
      "project": "another-project",
      "ticket": null,
      "branch": "main",
      "workingTimeMs": 1800000,
      "summary": "Quick fix",
      "startTime": "2026-03-27T14:00:00.000Z",
      "endTime": "2026-03-27T14:30:00.000Z",
      "userLabel": null,
      "userTicket": null,
      "workingTime": "30m"
    }
  ]
}
```

#### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `date` | `string` | Queried date in `YYYY-MM-DD` format |
| `workingTimeMs` | `number` | Total working time across all sessions (milliseconds) |
| `workingTime` | `string` | Human-readable total working time (e.g. `"2h 15m"`) |
| `byTicket` | `array` | Ticket groups sorted by `workingTimeMs` descending |
| `unticketedSessions` | `array` | Sessions with no detected or assigned ticket |

#### Ticket group fields (`byTicket[]`)

| Field | Type | Description |
|-------|------|-------------|
| `ticket` | `string` | Ticket identifier (e.g. `"PROJ-123"`) |
| `workingTimeMs` | `number` | Total working time for this ticket (milliseconds) |
| `workingTime` | `string` | Human-readable working time |
| `sessionCount` | `number` | Number of sessions for this ticket |
| `projects` | `string[]` | Distinct project display names |
| `sessions` | `array` | Individual sessions in this ticket group |

#### Session fields (`byTicket[].sessions[]` and `unticketedSessions[]`)

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Session UUID |
| `project` | `string` | Project display name |
| `ticket` | `string \| null` | Detected or user-assigned ticket |
| `branch` | `string \| null` | Working branch name |
| `workingTimeMs` | `number` | Working time (milliseconds) |
| `workingTime` | `string` | Human-readable working time |
| `summary` | `string \| null` | Session summary from Claude |
| `startTime` | `string` | ISO 8601 UTC timestamp |
| `endTime` | `string` | ISO 8601 UTC timestamp |
| `userLabel` | `string \| null` | User-assigned label (from web UI) |
| `userTicket` | `string \| null` | User-assigned ticket override (from web UI) |

#### `workingTime` format

The `formatWorkingTime()` function converts milliseconds to a compact string:

| Condition | Format | Example |
|-----------|--------|---------|
| Hours and minutes | `Xh Ym` | `2h 15m` |
| Hours only (0 minutes) | `Xh` | `3h` |
| Minutes only (0 hours) | `Ym` | `45m` |
| Zero | `0m` | `0m` |

#### Example

```bash
# Today's summary, pretty-printed
cctimereporter summary --pretty

# Specific date with 15-minute idle threshold
cctimereporter summary --date 2026-03-15 --idle 15

# Pipe compact JSON to another tool
cctimereporter summary --date 2026-03-27 | jq '.workingTime'
```

---

### `sessions`

Print a flat JSON array of sessions to stdout, sorted by start time ascending.

```
cctimereporter sessions [options]
```

#### Options

| Option | Argument | Default | Description |
|--------|----------|---------|-------------|
| `--date` | `YYYY-MM-DD` | Today | Date to list sessions for |
| `--idle` | Minutes (integer) | `10` | Idle gap threshold in minutes |
| `--pretty` | *(none)* | Off | Pretty-print JSON with 2-space indentation |

#### Output schema

The command writes a JSON array to stdout. Sessions are collected from both
ticketed and unticketed groups, enriched with a `workingTime` string, and sorted
by `startTime` ascending.

```json
[
  {
    "sessionId": "abc-def-123",
    "project": "my-project",
    "ticket": "PROJ-123",
    "branch": "feat/PROJ-123-new-feature",
    "workingTimeMs": 2400000,
    "summary": "Implemented new feature",
    "startTime": "2026-03-27T09:00:00.000Z",
    "endTime": "2026-03-27T09:40:00.000Z",
    "userLabel": null,
    "userTicket": null,
    "workingTime": "40m"
  }
]
```

#### Session fields

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Session UUID |
| `project` | `string` | Project display name |
| `ticket` | `string \| null` | Detected or user-assigned ticket |
| `branch` | `string \| null` | Working branch name |
| `workingTimeMs` | `number` | Working time (milliseconds) |
| `workingTime` | `string` | Human-readable working time (see format table above) |
| `summary` | `string \| null` | Session summary from Claude |
| `startTime` | `string` | ISO 8601 UTC timestamp |
| `endTime` | `string` | ISO 8601 UTC timestamp |
| `userLabel` | `string \| null` | User-assigned label |
| `userTicket` | `string \| null` | User-assigned ticket override |

#### Example

```bash
# Today's sessions, pretty-printed
cctimereporter sessions --pretty

# Count sessions for a date
cctimereporter sessions --date 2026-03-15 | jq 'length'

# List session IDs and tickets
cctimereporter sessions | jq '.[] | {sessionId, ticket, workingTime}'
```

---

### `import`

Import Claude Code session transcripts from `~/.claude/projects/` into the local database.

```
cctimereporter import [options]
```

#### Options

| Option | Argument | Default | Description |
|--------|----------|---------|-------------|
| `--days` | Integer | `2` | Import window in days (sessions modified within this window) |
| `--all` | *(none)* | Off | Import all history (overrides `--days`) |
| `--pretty` | *(none)* | Off | Pretty-print JSON result |

#### Progress output (stderr)

Progress is written to stderr so it doesn't interfere with the JSON result on stdout.

In a TTY, import progress uses `\r` for in-place updates.
In a non-TTY (piped), each progress line ends with `\n`.

```
Discovering files...
Importing: 1/42...
Importing: 2/42...
...
Importing: 42/42...
```

#### Result output (stdout)

On success, the command writes a JSON object to stdout:

```json
{
  "projectsFound": 5,
  "filesProcessed": 42,
  "filesSkipped": 3,
  "totalMessages": 1250,
  "errors": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `projectsFound` | `number` | Number of projects discovered |
| `filesProcessed` | `number` | Number of JSONL files imported |
| `filesSkipped` | `number` | Number of files skipped (already up to date) |
| `totalMessages` | `number` | Total messages processed across all files |
| `errors` | `string[]` | Non-fatal error messages (empty on clean import) |

#### Example

```bash
# Import recent sessions (last 2 days)
cctimereporter import

# Import all history, pretty-printed
cctimereporter import --all --pretty

# Import last 7 days, capture result
result=$(cctimereporter import --days 7)
echo "$result" | jq '.filesProcessed'
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error (invalid arguments, runtime failure, Node.js version too low) |
| `2` | Import conflict (another import is already running) |

The `serve` command exits with code 0 on SIGINT/SIGTERM or when another instance is already running.

## Environment

| Item | Value |
|------|-------|
| Database | `~/.cctimereporter/data.db` |
| Config | `~/.cctimereporter/config.json` |
| Debug log | `~/.cctimereporter/import.log` |
| Session source | `~/.claude/projects/` |
| Default port | `3847` |
| Required runtime | Node.js 22+ |
