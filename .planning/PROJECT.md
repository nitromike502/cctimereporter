# CC Time Reporter

## What This Is

A Node.js CLI tool (run via `npx`) that gives Claude Code users a visual, interactive timeline of their coding sessions. It reads Claude Code JSONL transcript files, imports them into a local SQLite database, and serves a Vue-based web UI showing Gantt-style session timelines grouped by project. Built on top of a working Python proof-of-concept that validates the core parsing, import, and timeline logic.

## Core Value

A user can run one command and immediately see a clear visual timeline of their Claude Code sessions for any given day.

## Requirements

### Validated

- ✓ JSONL transcript parsing (fork detection, session grouping) — existing PoC
- ✓ Ticket detection via multi-source scoring system — existing PoC
- ✓ Working time calculation with idle gap exclusion — existing PoC
- ✓ SQLite schema for sessions, messages, tickets, fork points — existing PoC
- ✓ HTML timeline generation (static, single-day) — existing PoC

### Active

- [ ] `npx cctimereporter` launches local server and opens browser
- [ ] Vue frontend with Gantt-style horizontal bar timeline
- [ ] Sessions displayed as bars spanning wall-clock time, with idle gaps visually indicated (lighter color)
- [ ] Sessions grouped by Claude project directory (~/.claude/projects/<path>)
- [ ] Session labels: ticket number → git branch → first 5 words of initial prompt (fallback chain)
- [ ] Date navigation — browse to any historical date
- [ ] Opens to today's date by default
- [ ] URL structure: `/timeline?date=YYYY-MM-DD` (root `/` reserved for future dashboard)
- [ ] Lightweight file index: scan all JSONL files for first/last message timestamps without full parsing
- [ ] Index-driven import: only full-import files whose date ranges overlap the requested date
- [ ] Default rolling window: import last 30 days on first launch
- [ ] On-demand import refresh via UI button
- [ ] Auto-discover all projects under ~/.claude/projects/
- [ ] Project filtering (exclude specific projects from view)
- [ ] SQLite database transparent to user (managed behind the scenes)

### Out of Scope

- Dashboard/landing page — URL reserved but not built for MVP
- User accounts or authentication — local tool only
- Remote/cloud storage — SQLite only, local machine
- Real-time updates — manual refresh via UI button
- Mobile-responsive design — desktop browser tool
- Custom themes or styling options — functional UI first

## Context

**Existing PoC (Python):** The `scripts/` directory contains a working proof-of-concept that handles JSONL parsing, SQLite import, working time calculation, and static HTML timeline generation. This code is tested and validated. The Node.js app will reimplement this logic (not wrap the Python scripts).

**Transcript location:** Claude Code stores session transcripts as JSONL files under `~/.claude/projects/<project-path>/`. Files aren't organized by date — a single file can span multiple days.

**Key PoC patterns to preserve:**
- Fork detection (parent→children tree, real vs progress forks)
- Ticket scoring (slash commands: 500pts, branch pattern: 100+5/msg, content mentions: 10/mention)
- Working time: consecutive gaps ≤ 10min = working; larger gaps excluded
- Ticket pattern: `AILASUP-\d+` (will need to be configurable for other users)

**Scale concern:** Users may accumulate months or years of transcripts. A lightweight indexing pass (first/last timestamps per file) will be built first to validate that on-demand importing is viable before committing to the full import architecture.

## Constraints

- **Distribution**: Must work as `npx` package — zero local setup for users
- **Dependencies**: Node.js runtime required; SQLite via bundled library (e.g., better-sqlite3)
- **Data location**: All data stays local (~/.claude/ directory)
- **PoC reference**: Node.js reimplements PoC logic; Python scripts are reference, not runtime dependency
- **Frontend**: Vue.js for the web UI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + npx distribution | Zero-install experience for users | — Pending |
| Vue.js frontend | User preference, good fit for interactive SPA | — Pending |
| SQLite for storage | Proven in PoC, zero-config, local-only | — Pending |
| Lightweight index before full import | Validate performance before committing architecture | — Pending |
| Rolling 30-day default window | Fast first launch, lean database | — Pending |
| Reimplement PoC logic in JS (not wrap Python) | Single runtime, cleaner distribution | — Pending |

---
*Last updated: 2026-02-22 after initialization*
