# System Architecture

*Last updated: 2026-03-27*

## Overview

CC Time Reporter reads Claude Code JSONL session transcripts from the local filesystem, imports them into a SQLite database, and presents Gantt-style session timelines grouped by project. It runs entirely on the user's machine with no network services, authentication, or external dependencies beyond Node.js 22+.

The system serves three access layers -- a web UI, a CLI, and an MCP server -- all sharing a common service layer backed by a single SQLite database. This architecture lets users view their Claude Code work history through whichever interface suits their workflow: a browser for visual exploration, the terminal for scripted queries, or an MCP host (like Claude Desktop) for AI-assisted time reporting.

## Key concepts

### Session

A session corresponds to one Claude Code conversation, stored as a single JSONL file under `~/.claude/projects/`. Each session has a message tree (with potential forks), a detected working branch, and an optional primary ticket. Sessions span time ranges and may cross midnight boundaries.

### Working time

Working time is the sum of consecutive message gaps that fall at or below an idle threshold (default 10 minutes). Gaps exceeding the threshold represent idle periods and are excluded. This distinguishes actual interaction time from elapsed clock time.

### Ticket scoring

The system identifies the primary ticket for a session using a weighted scoring algorithm across six detection sources. This enables automatic grouping of work by ticket without manual tagging.

### Fork detection

Claude Code sessions have a tree-structured message history. When a user edits a previous message, the conversation forks. The system distinguishes "real" forks (user-initiated conversation branches) from "progress" forks (system-generated progress/snapshot nodes), and tracks which messages belong to which branch.

## System components

```
                    Access Layers
    +-----------+  +-----------+  +-----------+
    |  Web UI   |  |    CLI    |  |    MCP    |
    | (Vue SPA) |  | (Command) |  |  (stdio)  |
    +-----------+  +-----------+  +-----------+
         |              |              |
         v              v              v
    +------------------------------------------+
    |           Service Layer                   |
    |  timeline.js  |  coordination.js  | ...   |
    +------------------------------------------+
         |
         v
    +------------------------------------------+
    |         SQLite Database (WAL)             |
    |        ~/.cctimereporter/data.db          |
    +------------------------------------------+
         ^
         |
    +------------------------------------------+
    |          Import Pipeline                  |
    |  discovery -> parser -> fork-detector     |
    |  -> ticket-scorer -> db-writer            |
    +------------------------------------------+
         ^
         |
    +------------------------------------------+
    |     Claude Code JSONL Transcripts         |
    |        ~/.claude/projects/*/              |
    +------------------------------------------+
```

### Entry point (`bin/cli.js`)

The CLI entry point dispatches to one of three modes:

- **`--mcp` flag**: Starts a stdio MCP server and blocks until the host disconnects. All stderr output is suppressed since stdio is owned by the MCP protocol.
- **Subcommands** (`summary`, `sessions`, `import`): Runs the specified CLI command against the database, then exits.
- **Default** (`serve`): Starts a Fastify web server, claims a process lock, opens the browser, and waits for shutdown signals.

All three modes share the same `openDatabase()` call, which handles creation and auto-migration.

### Web UI access layer

A Fastify server serves both the REST API and a pre-built Vue 3 SPA from `dist/`. The API endpoints expose timeline data, project lists, session details, and import triggers. The SPA catch-all handler serves `index.html` for any non-API route, enabling client-side routing.

The server attempts port 3847, falling back through 10 consecutive ports on `EADDRINUSE`. After binding, it claims a `server` process lock to prevent duplicate instances.

### CLI access layer

CLI subcommands (`summary`, `sessions`, `import`) provide terminal-friendly output for the same data the web UI displays. They call the service layer directly without starting a web server, avoiding the Fastify startup cost.

### MCP access layer

The MCP server exposes query and action tools over the Model Context Protocol's stdio transport. This lets MCP hosts like Claude Desktop query session timelines and trigger imports programmatically. The server uses `@modelcontextprotocol/sdk` for protocol handling.

### Service layer

The service layer (`src/services/`) contains business logic shared across all access layers:

- **`timeline.js`**: Queries sessions overlapping a date, computes working time, idle gaps, fork segments, and groups results by project (UI projection) or by ticket (report projection). Worktree sessions are merged under their parent project at query time.
- **`coordination.js`**: Manages DB-based process locks with PID liveness checks. Handles stale lock cleanup (dead PID detection via `process.kill(pid, 0)`) and race conditions (UNIQUE constraint guard on concurrent claims).

### Import pipeline

The import pipeline transforms raw JSONL transcript files into structured database records. It runs either on demand (via API, CLI, or MCP) or automatically when the web server starts after a schema migration.

## Data flow

```
~/.claude.json + ~/.claude/projects/
        |
        v
  discoverProjects()          -- Merge two sources: config file + filesystem scan
        |
        v
  findTranscriptFiles()       -- Filter to .jsonl files, exclude agent-* files
  findAgentFiles()             -- Discover subagent transcripts in UUID/subagents/
        |
        v
  [Skip checks]               -- Size-match, rolling window, first-timestamp peek
        |
        v
  parseTranscript()            -- Async readline streaming, extract messages + metadata
        |
        v
  detectForks()                -- Build parent->children tree, classify real vs progress
        |
        v
  determineWorkingBranch()     -- Frequency counting with ticket-pattern preference
        |
        v
  scoreTickets()               -- Multi-source scoring (see below)
        |
        v
  upsertSession / insertMessages / upsertTickets / updateImportLog
        |
        v
  SQLite database
        |
        v
  Service layer (timeline queries, grouping, working time computation)
        |
        v
  API / CLI / MCP response
        |
        v
  Vue frontend (Gantt chart rendering)
```

### Two-pass import architecture

The import runs in two passes to enable progress reporting:

1. **Discovery pass**: Iterates all projects, collects transcript files, applies skip checks (size-match, rolling window cutoff, first-timestamp peek for new files), and builds a work list with total file count.

2. **Import pass**: Processes each file with progress callbacks (`onProgress`) that power SSE streaming in the web UI. Each file goes through parse, fork detection, ticket scoring, and database writes.

This separation means the UI can display "Importing 42/156 files" with an accurate total from the start.

### Skip logic

Three levels of skip checks avoid re-processing unchanged files:

| Check | Condition | Cost |
|-------|-----------|------|
| Size-match | `file.size === cached.fileSize` | Free (in-memory lookup) |
| Rolling window | `cached.lastMessageAt < cutoffDate` | Free (in-memory lookup) |
| First-timestamp peek | Synchronous read of first 8 KB | Low (one `readSync` call) |

Files that fail the peek check are recorded as `skipped_old` in the import log so subsequent runs skip them instantly via the rolling window check.

### Subagent handling

Three patterns of subagent sessions are handled:

- **Pattern A** (tool-invoked agents): Agent JSONL files in `<sessionDir>/subagents/agent-*.jsonl` have their messages merged into the parent session record. No new session is created.
- **Pattern B** (team-based agents): Sessions with `teamName` + `agentName` on regular messages from the start are flagged `is_subagent=1` and excluded from timeline queries.
- **Pattern C** (worktree-based agents): Projects matching `-tmp-` or `/.claude/worktrees/` path patterns are flagged `is_subagent=1` and grouped under their parent project at query time.

## Ticket scoring algorithm

The primary ticket for a session is determined by a weighted scoring system across six detection sources. All ticket keys are normalized to uppercase before scoring. A ticket must score at least 15 points (`MIN_TICKET_SCORE`) to be selected.

| Source | Points | Details |
|--------|--------|---------|
| `/prep-ticket` slash command | 500 (700 if first message) | Explicit user intent; highest weight |
| Working branch pattern | 100 base + 5/message | Branch name containing `[A-Z]{2,8}-\d{1,6}` |
| Git commit message | 100 base + 10/additional commit | Ticket found in `tool_result` commit output |
| MCP tool call input | 100 base + 10/additional call | Ticket in Atlassian/Linear/GitHub MCP inputs |
| Session summary/title | 25 flat | Ticket in summary or custom title text |
| Content mention | 10/mention | Ticket pattern in user message text |

The generic ticket pattern `[A-Z]{2,8}-\d{1,6}` supports any project's ticket system (Jira, Linear, GitHub Issues, etc.). A denylist filters false positives from color names, framework names, encoding identifiers, and other non-ticket patterns.

## Working time calculation

Working time computation follows this algorithm:

1. Query all user and assistant message timestamps for a session.
2. Filter to timestamps within the target date's UTC boundaries (day clamping for overnight sessions).
3. Walk consecutive timestamp pairs. If the gap between two consecutive messages is at or below the idle threshold (default 10 minutes, configurable), add it to working time. Otherwise, record it as an idle gap.
4. Return the sum of non-idle gaps as total working time in milliseconds.

This approach means a 3-hour session with a 45-minute lunch break reports approximately 2h15m of working time rather than 3h00m of elapsed time.

Overnight sessions are clamped to day boundaries: if a session spans midnight, only the messages falling within the target date contribute to that day's working time. The session appears on both days with appropriate clamping.

## Multi-instance coordination

The `process_locks` table provides database-level coordination for concurrent instances. When the web server starts, it attempts to claim the `server` lock:

1. **No existing lock**: INSERT succeeds, server starts normally.
2. **Existing lock, live PID**: Server prints the existing instance's URL and exits cleanly. PID liveness is checked via `process.kill(pid, 0)`.
3. **Existing lock, dead PID**: Stale row is deleted (with `AND pid = ?` guard against TOCTOU races), then a new INSERT is attempted. If a concurrent claimer wins the INSERT race, the UNIQUE constraint fires and the loser re-reads the winner's row.

Locks are released on SIGINT/SIGTERM shutdown. Import operations also use coordination to prevent concurrent imports (409 Conflict if already running).

## Design principles

### Local-only, no auth

The application runs entirely on localhost. There is no authentication, no remote API calls, and no data leaves the machine. The database is a local cache that can be deleted and rebuilt from the JSONL source files at any time.

### Import raw, derive at query time

Raw data is imported as faithfully as possible. Derived views (worktree grouping, display names, working time calculations) are computed at query time rather than stored. This means the import pipeline does not need to understand presentation concerns, and changing how data is displayed does not require re-importing.

For example, worktree sessions create separate project directories in the database, but the timeline service merges them under their parent project using path pattern matching at query time.

### Database as cache

The SQLite database is treated as a disposable cache. It can be deleted at any time and fully rebuilt by re-running the import against the source JSONL files. Schema migrations that cannot be applied cleanly cause the database to be dropped and recreated. This simplifies the migration story: forward-only migrations are sufficient, and there is no need for rollback logic.

### User edits survive re-import

The `user_label` and `user_ticket` columns on sessions are deliberately excluded from the import upsert. When a session is re-imported (because the source file changed), all machine-derived fields are overwritten, but user-supplied values are preserved.

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Node.js built-in `node:sqlite` | Zero native dependencies, simple deployment via npx | Requires Node.js 22+, limiting adoption |
| Single SQLite file | No database server to install or configure | Single-writer limitation, no concurrent imports |
| Two-pass import | Accurate progress reporting from the start | Scans filesystem twice (discovery + import) |
| Query-time worktree grouping | Import stays simple, grouping logic is centralized | Slightly more work per query; pattern matching can miss edge cases |
| Generic ticket pattern | Works with any ticket system | More false positives requiring a denylist |
| Idle threshold as parameter | Users can tune for their work style | No single "correct" value; results vary by threshold |
| WAL mode + busy_timeout | Better read concurrency during imports | WAL files persist on disk; slightly more complex recovery |

## Related documents

- [Database Schema](../technical/DATABASE-SCHEMA.md) -- complete table and column reference
