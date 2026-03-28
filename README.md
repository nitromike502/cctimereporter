# CC Time Reporter

A visual timeline of your Claude Code sessions. Run one command and see a Gantt-style chart of when you were coding, which projects you worked on, and which tickets you touched.

## Quick Start

Requires **Node.js 22** or later (uses the built-in `node:sqlite` module).

```bash
npx cctimereporter
```

This starts a local server and opens your browser to today's timeline. On first run, click **Import** to scan your Claude Code transcripts.

## What It Does

CC Time Reporter reads the JSONL transcript files that Claude Code stores under `~/.claude/projects/`, imports them into a local SQLite database, and serves an interactive web UI.

### Timeline View

The timeline page (`/timeline?date=YYYY-MM-DD`) shows:

- **Session bars** on a 24-hour horizontal axis
- **Idle gaps** rendered as faded segments within each bar (gaps > configurable threshold)
- **Project grouping** with color-coded swim lanes and a legend
- **Session labels** using a fallback chain: ticket ID, git branch, or first words of the initial prompt
- **Click-to-detail panel** showing session name, session ID, ticket, branch, project, working time, wall-clock span, message count, and idle gap count
- **Session editing** from the detail panel — users can edit session names and ticket IDs, and edits persist across re-imports
- **Message preview modal** showing the first messages of a session conversation

### Navigation

- Previous / Next day buttons
- Today and Yesterday quick shortcuts
- Date picker for jumping to any date
- URL updates to `/timeline?date=YYYY-MM-DD` (bookmarkable)
- Project filter checkboxes to show/hide individual projects

### Import

Clicking **Import** shows a progress bar with file counts as transcripts are processed. The import streams progress via Server-Sent Events so you can see exactly how many files remain.

### Import Pipeline

The import pipeline:

1. **Discovers** all projects from `~/.claude.json` and `~/.claude/projects/`
2. **Parses** JSONL transcript files with streaming readline
3. **Detects forks** (parent-child tree, real vs progress forks)
4. **Scores tickets** using a multi-source system (slash commands, branch patterns, content mentions, git commits, MCP tool calls, session summaries)
5. **Writes to SQLite** with idempotent upserts (re-importing is safe and skips unchanged files)

## CLI Subcommands

In addition to the default web server, cctimereporter provides CLI subcommands that output JSON to stdout for scripting and automation.

```bash
# Day summary (ticket-grouped working time)
npx cctimereporter summary
npx cctimereporter summary --date 2026-03-25 --pretty

# Session list for a date
npx cctimereporter sessions --date 2026-03-25 --pretty

# Trigger import from CLI
npx cctimereporter import              # 2-day rolling window (default)
npx cctimereporter import --all        # Full history import
npx cctimereporter import --days 7     # Custom window
```

All subcommands accept `--pretty` for human-readable JSON output and `--idle <minutes>` (where applicable) to configure the idle threshold.

## MCP Server

cctimereporter includes a stdio MCP server for programmatic data access from AI assistants (e.g., Claude Code).

```bash
npx cctimereporter --mcp
```

This starts a [Model Context Protocol](https://modelcontextprotocol.io/) server on stdio. Available tools:

| Tool | Description |
|------|-------------|
| `get_day_summary` | Ticket-grouped working time for a date |
| `get_sessions` | Project-grouped session details for a date |
| `get_session_messages` | Messages for a specific session |
| `get_dates` | All dates that have session data |
| `trigger_import` | Run the import pipeline |
| `start_server` | Start the web server (or return URL of running instance) |
| `stop_server` | Stop a running web server |
| `server_status` | Check if the web server is running |

To use with Claude Code, add to your MCP configuration:

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

## Configuration

- **Database location:** `~/.cctimereporter/data.db` (created automatically)
- **Default port:** 3847 (falls back to next available if occupied)
- **Idle threshold:** Configurable in the UI (default 10 minutes)
- **Ticket pattern:** Generic `[A-Z]{2,8}-\d+` (matches JIRA-style ticket IDs)

## Development

```bash
git clone <repo-url>
cd cctimereporter
npm install

# Run the Vue dev server (hot reload)
npm run dev:client

# Build the production frontend
npm run build

# Start the full app (server + built frontend)
npm start
```

### Project Structure

```
bin/cli.js                 CLI entry point (Commander dispatch, --mcp flag)
src/
  cli/                     CLI subcommands (summary, sessions, import) + format utils
  mcp/                     MCP server factory and tool registrations (query + action)
  services/                Business logic (timeline, sessions, import, coordination)
  db/                      SQLite database layer (schema v9, migrations, open/close)
  importer/                Import pipeline (parser, fork detector, ticket scorer, discovery)
  server/                  Fastify server and API routes (thin HTTP wrappers)
  utils/                   Shared utilities (config, XML parser, timeline computation)
  client/                  Vue 3 frontend
    components/            Reusable components (Gantt chart, toolbar, detail panel)
    pages/                 Page components (TimelinePage, ComponentsPage)
    router/                Vue Router configuration
    styles/                Design tokens (CSS custom properties)
scripts/                   Python proof-of-concept (reference implementation)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/timeline?date=YYYY-MM-DD` | Sessions grouped by project for a date, with idle gaps and working time |
| GET | `/api/projects` | List of all known projects |
| POST | `/api/import` | Trigger a full import (409 if already running) |
| GET | `/api/import/progress` | Trigger import with SSE progress streaming (409 if already running) |
| GET | `/api/sessions/:id/messages` | First messages of a session for preview |
| PATCH | `/api/sessions/:id` | Update user-editable fields (user_label, user_ticket) |

### Tech Stack

- **Runtime:** Node.js 22+ with built-in `node:sqlite`
- **Server:** Fastify 5
- **CLI:** Commander 14
- **MCP:** @modelcontextprotocol/sdk with Zod schema validation
- **Frontend:** Vue 3 + Vue Router + Vite
- **UI primitives:** Reka UI (checkbox, tooltip, progress bar)
- **Date picker:** @vuepic/vue-datepicker
- **Database:** SQLite (WAL mode, foreign keys enabled, busy_timeout=5000)

## License

ISC
