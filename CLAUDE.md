# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CC Time Reporter is a Python 3 utility that imports Claude Code JSONL session transcripts into a SQLite database (`~/.claude/transcripts.db`) for analyzing working time, detecting tickets, and generating visual timelines. It has **zero external dependencies** — only Python stdlib is used.

## Running Scripts

All scripts must be run from the `scripts/` directory:

```bash
cd /home/claude/cctimereporter/scripts

# Database setup
python3 create_db.py                              # Initialize database
python3 create_db.py --migrate                    # Migrate schema v1 → v2
python3 create_db.py --force                      # Drop and recreate all tables

# Import transcripts
python3 import_transcripts.py --all --verbose     # Import all projects
python3 import_transcripts.py --all --force        # Re-import everything
python3 import_transcripts.py <project-path>       # Import single project

# Query
python3 query.py --working-time 2026-02-05         # Working time for date
python3 query.py --sessions 2026-02-05             # Sessions for date
python3 query.py --tickets                         # All tickets
python3 query.py --stats                           # Database stats
python3 query.py "SELECT ..."                      # Raw SQL

# Timeline
python3 timeline.py 2026-02-05                     # Generate HTML timeline
python3 timeline.py today
python3 timeline.py yesterday --threshold=10
```

There is no build step, no linting, and no test suite.

## Architecture

### Import Pipeline

```
JSONL files (~/.claude/projects/*/…/*.jsonl)
  → parse_transcript()
  → detect_forks() — builds parent→children tree, classifies real vs progress forks
  → determine_working_branch()
  → determine_primary_ticket() — multi-source scoring system
  → INSERT into SQLite
```

### Ticket Detection Scoring

Primary ticket is determined by a scoring system across sources:
- `/prep-ticket` slash command: 500 points (700 if in first message)
- Working branch pattern (`meckert-AILASUP-\d+`): 100 base + 5/message
- Content mentions (`AILASUP-\d+`): 10/mention

### Working Time Calculation

Messages are grouped by session per date. Consecutive message gaps ≤ idle threshold (default 10 min) count as working time; larger gaps are excluded. This handles overnight sessions, forks, and idle periods correctly.

### Database Schema (v2)

Core tables: `projects`, `sessions`, `messages`, `tickets`, `fork_points`, `tool_uses` (not yet populated), `import_log`, `schema_version`. Two views: `v_session_time_summary` and `v_daily_ticket_summary`. Schema defined in `scripts/schema.sql`.

### Key Constants

- `TICKET_PATTERN`: `AILASUP-\d+` (in `import_transcripts.py`)
- `USERNAME`: `meckert` (for branch pattern matching)
- `DEFAULT_IDLE_THRESHOLD_MINUTES`: 10 (in `query.py` and `timeline.py`)
- `CLAUDE_PROJECTS_DIR`: `~/.claude/projects`
- Database path: `~/.claude/transcripts.db`

## File Layout

- `SKILL.md` — Primary documentation and usage workflows
- `references/PROJECT-STATUS.md` — Implementation status, roadmap, known issues
- `references/claude-transcript-schema.md` — JSONL transcript format reference
- `scripts/db_utils.py` — Shared database utilities (`open_database()`, query helpers)
- `scripts/schema.sql` — SQLite schema definition
- `scripts/create_db.py` — Database initialization and migration
- `scripts/import_transcripts.py` — JSONL parsing, fork detection, ticket scoring
- `scripts/query.py` — Query tool with working time calculation
- `scripts/timeline.py` — Self-contained HTML timeline generator
