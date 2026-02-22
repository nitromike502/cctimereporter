# Transcript-DB Project Status

**Last Updated:** 2026-02-20
**Schema Version:** 2
**Status:** Working time with session span, HTML timeline visualization added

## Overview

Transcript-DB imports Claude Code session transcripts into a SQLite database for
time tracking and analysis. It parses the JSONL transcript files that Claude Code
stores in `~/.claude/projects/` and makes them queryable. Zero external dependencies
— uses Python's built-in `sqlite3` module.

## What's Built

### Core Scripts

| Script | Purpose |
|--------|---------|
| `scripts/db_utils.py` | Shared database utilities (open, query, execute) |
| `scripts/create_db.py` | Creates the SQLite database, runs schema migrations |
| `scripts/import_transcripts.py` | Imports JSONL transcripts with ticket and fork detection |
| `scripts/query.py` | Query tool: sessions, tickets, stats, working-time calculation |
| `scripts/timeline.py` | HTML visual timeline generator (color-coded by project) |

### Database Schema (v2)

Located in `sql/schema.sql`. Tables:

| Table | Status | Description |
|-------|--------|-------------|
| **projects** | Complete | Registered project paths and transcript directories |
| **sessions** | Complete | Sessions with metadata, fork counts, ticket assignment |
| **messages** | Complete | All messages with fork-branch marking |
| **tickets** | Complete | Ticket references by source (branch, content, slash_command) |
| **fork_points** | Complete | Fork point metadata with branch analysis |
| **tool_uses** | Schema only | Extracted tool invocations (not yet populated by import) |
| **import_log** | Complete | Tracks import operations |

### Views

| View | Description |
|------|-------------|
| `v_session_time_summary` | Wall-clock duration per session |
| `v_daily_ticket_summary` | Aggregated daily time by ticket |

### Documentation

| File | Description |
|------|-------------|
| `README.md` | Project overview, setup, usage, design decisions |
| `docs/PROJECT-STATUS.md` | This file — implementation status and roadmap |
| `docs/claude-transcript-schema.md` | Comprehensive JSONL transcript format reference (684 lines) |

## Recent Changes (2026-02-20)

### 1. Default Idle Threshold Changed to 10 Minutes

**Problem:** The 5-minute threshold undercounted working time by ~30%. Comparing tracker
output against actual time logs showed that reading code, reviewing PRs, and thinking
between Claude prompts creates 5-10 minute gaps that were incorrectly classified as idle.

**Change:** `DEFAULT_IDLE_THRESHOLD_MINUTES` changed from 5 to 10 in both `query.py` and
`timeline.py`. The `--threshold` flag still allows per-query override.

### 2. Session Span Added to Working Time Report

**Problem:** No way to tell if missing time was spent on the ticket outside Claude or on
something else entirely. A session showing 30min working time could span 30min or 3hrs.

**Changes to `query.py`:**
- Computes `span_seconds` (wall-clock first→last message) per session
- Aggregates `total_span` per task group
- Displays `Session Span: Xh Ym (X.XX hrs)` in task summaries
- Displays `Span: Xh Ym` in session detail lines

### 3. HTML Visual Timeline (`timeline.py`)

New script generating a self-contained HTML timeline. No external dependencies.

**Features:**
- Color-coded by project (AILA, NLCL, Personal, etc.)
- Sessions grouped under project headers with colored borders
- Row labels show branch name or ticket (not session ID)
- Unknown sessions get derived titles from first meaningful user message `content_preview`
- Solid bars = active periods, faded bars = idle gaps
- Hover tooltips with session ID, branch, ticket, working/span hours, message count
- Legend with per-project working/span totals
- Auto-copies output to Windows Downloads for WSL environments

**Usage:** `python3 timeline.py <date> [--threshold=<minutes>]`

**Title derivation for unknown sessions:**
- Checks `sessions.summary` and `sessions.custom_title` first
- Falls back to first meaningful user message `content_preview`
- Strips XML/HTML tags, markdown formatting, command noise
- Truncates at sentence boundary or ~50 chars

---

## Previous Changes (2026-02-09)

### 1. Fixed `/prep-ticket` Detection and Scoring

**Problem:** The `/prep-ticket` slash command was never detected because the regex
pattern (`/prep-ticket\s+AILASUP-\d+`) didn't match the actual XML transcript format:

```xml
<command-name>/prep-ticket</command-name>
<command-args>AILASUP-348</command-args>
```

Additionally, the `tickets_seen` dedup set prevented multiple sources from being
recorded for the same ticket — only the first-detected source (usually `branch`) was stored.

**Changes:**
- Added `PREP_TICKET_XML_PATTERN` regex matching the XML format
- `detect_ticket_from_message()` checks both inline and XML patterns
- Changed `tickets_seen` from `Set[str]` to `Set[Tuple[str, str]]` tracking `(ticket_key, source)`
- Updated tickets UNIQUE constraint to `(session_id, ticket_key, source)`
- Increased slash_command score from 50 to **500**, with +200 first-message bonus (total 700)

**Scoring system now:**

| Source | Score | Notes |
|--------|-------|-------|
| `/prep-ticket` slash command | 500 per detection | Inline or XML format |
| `/prep-ticket` in first user message | +200 bonus | Combined 700 = decisive winner |
| Working branch pattern | 100 base + 5 per message | `{username}-AILASUP-{number}` |
| Content mention | 10 per mention | Raw `AILASUP-XXX` in text |

### 2. Fork Detection During Import

**Problem:** When users "go back" in a Claude Code session and take a different path,
both branches represent valid work. The database had no fork-awareness.

**Schema additions (v2):**
- `sessions.fork_count` — total forks detected (including progress noise)
- `sessions.real_fork_count` — real conversation forks only
- `messages.is_fork_branch` — marks secondary fork branch messages
- `fork_points` table — fork metadata with primary/secondary branch analysis

**Import changes:**
- After parsing, builds `parentUuid -> [childUuids]` tree
- Identifies fork points (parents with >1 child)
- Classifies as `real` (conversation fork) or `progress` (noise from progress/snapshot children)
- Primary branch = most descendants; secondary branch marked `is_fork_branch = 1`
- Fork metadata stored in `fork_points` table

**Migration:** `python3 scripts/create_db.py --migrate` applies ALTER TABLE and creates
new table for existing databases. Handles view dependencies correctly.

### 3. Working Time Calculation

**Problem:** Session time was calculated as wall-clock `last_message - first_message`,
inflating duration for sessions with idle gaps or spanning midnight.

**Solution:** New `--working-time` command in `query.py`:

```bash
python3 scripts/query.py --working-time 2026-02-05
python3 scripts/query.py --working-time 2026-02-05 --threshold=10
```

**Algorithm:**
1. Query message timestamps filtered by `DATE(timestamp) = ?`
2. Group by session, sort within each session
3. Gap <= threshold (default 5 min) = working time; gap > threshold = idle
4. Group sessions by `primary_ticket` or `working_branch`
5. Output per-task and total working time

**Why this handles overnight correctly:** Filtering by `DATE(timestamp)` means a session
from 20:00 Jan 5 to 02:00 Jan 6 only includes Jan 5 messages when querying Jan 5.

**Why this handles forks correctly:** All messages have unique UUIDs — timestamps from
both fork branches are included but not duplicated. The idle threshold handles gaps
between working on branch A and forking to branch B.

## How It Works

### Transcript Location Discovery

```
Project path: /home/aila/httpdocs
    -> Transcript dir: ~/.claude/projects/-home-aila-httpdocs/
```

### Import Pipeline

```
JSONL file
  -> parse_transcript()     # Extract messages, summary, metadata
  -> detect_forks()         # Build tree, find fork points, mark branches
  -> determine_working_branch()  # Most common non-skip branch
  -> determine_primary_ticket()  # Scoring system across all sources
  -> INSERT sessions, messages, tickets, fork_points
```

### Working Time Query Pipeline

```
--working-time <date>
  -> SELECT timestamps WHERE DATE(timestamp) = ?
  -> Group by session_id
  -> Calculate working vs idle per session (threshold-based)
  -> Group sessions by task (ticket or branch)
  -> Output per-task and grand totals
```

## Usage

```bash
cd ~/personal/projects/transcript-db

# First-time setup
python3 scripts/create_db.py

# Migrate existing DB to latest schema
python3 scripts/create_db.py --migrate

# Import all projects
python3 scripts/import_transcripts.py --all --verbose

# Re-import everything (after code changes)
python3 scripts/import_transcripts.py --all --force --verbose

# Working time for a date
python3 scripts/query.py --working-time 2026-02-05

# Sessions for a date
python3 scripts/query.py --sessions 2026-02-05

# All tickets with sources
python3 scripts/query.py --tickets

# Database stats
python3 scripts/query.py --stats

# Raw SQL
python3 scripts/query.py "SELECT source, COUNT(*) as cnt FROM tickets GROUP BY source"
```

## Verification Queries

After a fresh import, verify all features work:

```bash
# Verify prep-ticket fix (slash_command source should appear)
python3 scripts/query.py "SELECT source, COUNT(*) as cnt FROM tickets GROUP BY source"

# Verify fork detection
python3 scripts/query.py "SELECT COUNT(*) as forks FROM fork_points WHERE fork_type = 'real'"

# Verify working time (should show per-ticket breakdown, no overnight inflation)
python3 scripts/query.py --working-time 2026-02-05
```

## What's Remaining

### High Priority

1. **Node Package Conversion**
   User wants to turn the HTML timeline into a distributable node package. Considerations:
   - Current stack is Python with zero deps — decide whether to rewrite in JS/TS or wrap Python
   - The timeline HTML generation is self-contained (no external deps), translates well to JS
   - The SQLite DB layer (`db_utils.py`, `create_db.py`, `import_transcripts.py`) would need
     `better-sqlite3` or similar
   - Package scope: just the timeline visualization, or the full import+query+timeline pipeline?
   - Consider making the timeline a standalone tool that reads from any SQLite DB with the
     expected schema

2. **Unknown Session Attribution**
   Sessions without a branch or ticket fall into "unknown" bucket. Current workaround:
   timeline derives titles from first user message `content_preview`. Better solutions:
   - Store derived title in `sessions.custom_title` during import when no branch/ticket found
   - Allow manual labeling via a new command (`/time-tracker label <session-id> <title>`)
   - Use project path as fallback grouping key in working-time reports (not just timeline)

3. **"Unknown" in Working Time Report**
   The `query.py --working-time` report still groups branchless sessions as "unknown".
   Should apply the same project-aware grouping and title derivation that `timeline.py` uses.

### Medium Priority

4. **Tool Uses Table Population**
   Schema exists but import doesn't populate it yet. Would extract `tool_use` blocks
   from assistant messages and track tool execution times from progress messages.

5. **Incremental Import Optimization**
   Currently re-parses entire file on each import. Could track last message UUID and
   only parse new lines for large active sessions.

6. **Time Log Export Format**
   Add output format suitable for pasting into time tracking systems (Harvest, Jira).
   The data is there via `--working-time`, but formatting for copy-paste would help.

### Low Priority / Future

7. **Plugin Conversion**
   Convert to Claude Code plugin for `/transcript-db` commands. Already uses zero
   dependencies, so portable.

8. **CSV/JSON Export**
   Add `--format csv` or `--format json` to query.py for spreadsheet/integration use.

## Known Issues

1. **Branch vs ticket mismatch** — Session `fcaf1c01` has branch `meckert-ailasup-490`
   but primary ticket `AILASUP-556` due to heavy content mentions of 556. The new
   scoring system (500 for slash_command, 100 for branch) should reduce these cases
   after re-import.

2. **tool_uses table** — Schema exists but is not populated by the import script.
   Tracked as a medium-priority remaining item.

## File Locations

| Item | Path |
|------|------|
| Database | `~/.claude/transcripts.db` |
| Raw transcripts | `~/.claude/projects/{encoded-path}/` |
| Skill directory | `~/personal/skills/time-tracker/` |
| Slash command | `~/personal/.claude/commands/time-tracker.md` |
| Scripts | `~/personal/skills/time-tracker/scripts/` |
| Reference docs | `~/personal/skills/time-tracker/references/` |
| Original project | `~/personal/projects/transcript-db/` (archived) |
| Original time script | `~/personal/scripts/transcript-time-log.js` |

## History

- **2026-02-05** — Initial build. Python scripts (create_db, import_transcripts, query),
  schema v1, ticket detection with scoring, incremental import.
- **2026-02-09** — Schema v2. Fixed /prep-ticket regex (XML format), fixed ticket dedup
  to allow multiple sources, increased slash_command scoring. Added fork detection
  (fork_points table, is_fork_branch marking). Added `--working-time` command with
  idle-gap-based calculation. Added `--migrate` to create_db.py. Converted to Claude Code
  skill (`~/personal/skills/time-tracker/`) with `/time-tracker` slash command.
- **2026-02-20** — Changed default idle threshold from 5 to 10 minutes after comparing
  tracker output against actual time logs. Added session span (wall-clock time) to working
  time reports. Added `timeline.py` HTML visual timeline with project color-coding,
  branch labels, and derived titles for unknown sessions.
