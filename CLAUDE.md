# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CC Time Reporter is a Node.js CLI tool that reads Claude Code JSONL session transcripts, imports them into a local SQLite database, and serves a Vue-based web UI showing Gantt-style session timelines grouped by project. It runs via `npx cctimereporter` and requires Node.js 22+ (uses the built-in `node:sqlite` module).

A Python proof-of-concept in `scripts/` validates the core parsing, import, and timeline logic. The Node.js app reimplements this logic — the Python scripts are reference, not runtime dependency.

## Running the App

```bash
# Start the app (builds frontend if needed, starts server, opens browser)
npm start
# or
node bin/cli.js

# Development: Vue dev server with hot reload
npm run dev:client

# Build the production frontend
npm run build
```

## Running Python PoC Scripts

The original Python proof-of-concept scripts are in `scripts/` and must be run from that directory. These use a separate database at `~/.claude/transcripts.db` (not the Node.js app's database).

```bash
cd /home/claude/cctimereporter/scripts
python3 import_transcripts.py --all --verbose     # Import all projects
python3 query.py --working-time 2026-02-05         # Working time for date
python3 timeline.py 2026-02-05                     # Generate HTML timeline
```

## Architecture

### Node.js App (src/)

```
bin/cli.js                     Entry point: version check, DB open, Fastify start, browser open
src/db/schema.js               Schema DDL v6, migration constants
src/db/index.js                openDatabase() with auto-migration (v1→v2→v3→v4→v5→v6)
src/importer/                  Import pipeline
  discovery.js                 Project discovery from ~/.claude.json + filesystem
  parser.js                    Async JSONL streaming parser
  fork-detector.js             Fork detection (parent→children tree, real vs progress)
  ticket-scorer.js             Multi-source ticket scoring
  db-writer.js                 SQLite upsert/insert functions
  index.js                     importAll() orchestrator
src/server/index.js            Fastify server factory with static file serving
src/server/routes/timeline.js  GET /api/timeline — sessions with idle gaps and working time
src/server/routes/projects.js  GET /api/projects — project list
src/server/routes/import.js    POST /api/import + GET /api/import/progress (SSE streaming)
src/server/routes/messages.js  GET /api/sessions/:id/messages — session message preview
src/server/routes/sessions.js  PATCH /api/sessions/:id — user-editable session fields
src/utils/parse-command-xml.js Slash command XML tag parser
src/client/                    Vue 3 frontend
  main.js                      App entry: tokens.css, router, createApp
  router/index.js              Routes: /timeline (main), /components (preview), / (redirect)
  styles/tokens.css            Design tokens (CSS custom properties)
  pages/TimelinePage.vue       Main timeline page with Gantt chart
  pages/ComponentsPage.vue     Component library preview page
  components/                  Reusable components (Gantt*, App*, Timeline*, SessionDetail*, SessionMessagesModal)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/timeline?date=YYYY-MM-DD` | Sessions grouped by project, with idle gaps and working time |
| GET | `/api/projects` | List of all known projects |
| POST | `/api/import` | Trigger full import, return JSON result (409 if already running) |
| GET | `/api/import/progress` | Trigger import with SSE progress streaming (409 if already running) |
| GET | `/api/sessions/:id/messages` | First messages of a session (up to 10, stops at first tool_use) |
| PATCH | `/api/sessions/:id` | Update user-editable fields (user_label, user_ticket) |

### Import Pipeline

Two-pass architecture: discovery pass collects all files and counts totals, then import pass processes files with progress callbacks.

```
Pass 1 — Discovery:
  discoverProjects() → findTranscriptFiles() → skip checks → collect work items + total count

Pass 2 — Import (with onProgress callback for SSE streaming):
  JSONL files (~/.claude/projects/*/…/*.jsonl)
    → parseTranscript()          — async readline streaming
    → detectForks()              — builds parent→children tree, classifies real vs progress forks
    → determineWorkingBranch()   — frequency + ticket pattern preference
    → scoreTickets()             — multi-source scoring system (with MIN_TICKET_SCORE threshold)
    → upsertSession/insertMessages/upsertTickets  — SQLite writes
    → onProgress({ phase, processed, total, currentFile })
```

### Ticket Detection Scoring

Primary ticket is determined by a scoring system across 6 sources:
- `/prep-ticket` slash command: 500 points (700 if in first message)
- Working branch pattern: 100 base + 5/message
- Git commit message: 100 base + 10/additional commit
- MCP tool call input: 100 base + 10/additional call
- Session summary/title: 25 points flat
- Content mentions: 10/mention
- Ticket pattern: generic `[A-Z]{2,8}-\d+`

### Working Time Calculation

Messages are grouped by session per date. Consecutive message gaps <= idle threshold (default 10 min, configurable in UI) count as working time; larger gaps are excluded. Overnight sessions are clipped to day boundaries server-side.

### Database

- **Location:** `~/.cctimereporter/data.db`
- **Schema version:** 6 (auto-migrates from v1 through v5)
- **Core tables:** `projects`, `sessions`, `messages`, `tickets`, `import_log`
- **Features:** WAL mode, foreign keys enabled, prepared statement caching

### Frontend Component Library

Custom component library with design tokens in `tokens.css`. All components live in `src/client/components/` and are previewed at `/components`. Components use Reka UI primitives for accessibility (checkbox, tooltip, progress bar) and @vuepic/vue-datepicker for the date picker.

## Key Constants

- `DEFAULT_IDLE_THRESHOLD_MIN`: 10 (in `src/server/routes/timeline.js`)
- `SCHEMA_VERSION`: 6 (in `src/db/schema.js`)
- `DEFAULT_PORT`: 3847 (in `bin/cli.js`)
- `CLAUDE_PROJECTS_DIR`: `~/.claude/projects` (in `src/importer/discovery.js`)
- Database path: `~/.cctimereporter/data.db` (in `src/db/index.js`)

## Dependencies

- **Runtime:** fastify, @fastify/static, driver.js, vue, vue-router, reka-ui, @vuepic/vue-datepicker
- **Dev:** vite, @vitejs/plugin-vue
- **Built-in:** `node:sqlite` (Node 22+), `node:readline`, `node:fs`, `node:path`

## File Layout

- `README.md` — Project overview, quick start, and development guide
- `CHANGELOG.md` — Version history
- `references/claude-transcript-schema.md` — JSONL transcript format reference
- `scripts/` — Python proof-of-concept (reference implementation, separate database)
