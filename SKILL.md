---
name: Time Tracker
description: >
  This skill should be used when the user asks to "track time", "log working time",
  "show working hours", "import transcripts", "query transcripts", "check time for a date",
  "how much time did I spend", "working time report", "time-tracker", mentions transcript
  database operations, or invokes the /time-tracker command. Manages a SQLite database of
  Claude Code session transcripts for accurate working-time calculation and ticket-based
  time tracking.
---

# Time Tracker

Calculate accurate working time from Claude Code session transcripts. Import JSONL transcript
files into a SQLite database, detect tickets and conversation forks, and query working time
grouped by ticket or branch with idle-gap exclusion.

## Core Concepts

- **Working time** = sum of consecutive message gaps <= threshold (default 10 min)
- **Idle time** = gaps > threshold, excluded from working time
- **Date-bounded** = queries filter by `DATE(timestamp)`, so overnight sessions only count
  time within the queried date
- **Fork-aware** = conversation forks are detected; all branches count as valid work with
  unique message UUIDs preventing double-counting

## Scripts

All scripts are in `scripts/` within this skill directory. They use Python's built-in
`sqlite3` module with zero external dependencies. The database is stored at
`~/.claude/transcripts.db`.

### Script Inventory

| Script | Purpose |
|--------|---------|
| `scripts/db_utils.py` | Shared database utilities (open, query, execute) |
| `scripts/create_db.py` | Database creation and schema migration |
| `scripts/import_transcripts.py` | Parse and import JSONL transcripts |
| `scripts/query.py` | Query tool: sessions, tickets, stats, working time |
| `scripts/timeline.py` | HTML visual timeline generator (color-coded by project) |
| `scripts/schema.sql` | SQLite schema definition (v2) |

### Running Scripts

All scripts must be run from the `scripts/` directory so that `db_utils` imports work:

```bash
cd <skill-directory>/scripts
python3 create_db.py              # Create database
python3 create_db.py --migrate    # Migrate existing DB to latest schema
python3 import_transcripts.py --all --verbose          # Import all projects
python3 import_transcripts.py --all --force --verbose   # Re-import everything
python3 query.py --working-time 2026-02-05             # Working time for a date
python3 query.py --working-time 2026-02-05 --threshold=10
python3 query.py --sessions 2026-02-05                 # Sessions for a date
python3 query.py --tickets                              # All tickets
python3 query.py --stats                                # Database stats
python3 query.py "SELECT ..."                           # Raw SQL
```

## Workflows

### First-Time Setup

1. Run `python3 scripts/create_db.py` to create the database
2. Run `python3 scripts/import_transcripts.py --all --verbose` to import all projects

### Daily Working Time Query

Run `python3 scripts/query.py --working-time <date>` to get a per-ticket breakdown of
working hours with idle time excluded. Default idle threshold is 5 minutes.

### After Code Changes

1. Run `python3 scripts/create_db.py --migrate` if schema changed
2. Run `python3 scripts/import_transcripts.py --all --force --verbose` to re-import

### Verification

After a fresh import, verify all features:

```bash
# Verify ticket detection sources
python3 scripts/query.py "SELECT source, COUNT(*) as cnt FROM tickets GROUP BY source"

# Verify fork detection
python3 scripts/query.py "SELECT COUNT(*) as forks FROM fork_points WHERE fork_type = 'real'"

# Verify working time
python3 scripts/query.py --working-time 2026-02-05
```

## Working Time Algorithm

1. Query individual message timestamps: `SELECT timestamp FROM messages WHERE DATE(timestamp) = ? AND type IN ('user', 'assistant')`
2. Group by session, sort timestamps within each session
3. For each consecutive pair: gap <= threshold = working time; gap > threshold = idle time
4. Group sessions by `primary_ticket` or `working_branch`
5. Output per-task and total working time in decimal hours

## Ticket Detection Scoring

Primary ticket per session is determined by scoring:

| Source | Score | Detection |
|--------|-------|-----------|
| `/prep-ticket` slash command | 500 per hit | XML format in transcripts |
| `/prep-ticket` in first message | +200 bonus | Combined 700, decisive |
| Working branch pattern | 100 base + 5/msg | `{username}-AILASUP-{number}` |
| Content mention | 10 per mention | `AILASUP-XXX` in text |

## Database Schema (v2)

| Table | Description |
|-------|-------------|
| `projects` | Registered project paths and transcript directories |
| `sessions` | Sessions with metadata, fork counts, ticket assignment |
| `messages` | All messages with fork-branch marking |
| `tickets` | Ticket references by source (branch, content, slash_command) |
| `fork_points` | Fork point metadata with primary/secondary branch analysis |
| `tool_uses` | Schema only — not yet populated |
| `import_log` | Tracks import operations |

## Additional Resources

### Reference Files

For detailed documentation, consult:
- **`references/PROJECT-STATUS.md`** — Full implementation status, design decisions, history, remaining work
- **`references/claude-transcript-schema.md`** — Comprehensive JSONL transcript format reference (684 lines): message types, properties, relationships, edge cases
