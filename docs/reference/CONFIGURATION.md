# Configuration Reference

*Last updated: 2026-03-27*
*Version: 0.7.0*

## Overview

CC Time Reporter uses a combination of a JSON config file, CLI flags, and hardcoded defaults. All user data is stored under `~/.cctimereporter/`.

---

## File locations

| File | Path | Purpose |
|------|------|---------|
| Configuration | `~/.cctimereporter/config.json` | Application settings |
| Database | `~/.cctimereporter/data.db` | SQLite database (WAL mode) |
| Import log | `~/.cctimereporter/import.log` | Debug log (when enabled) |

The `~/.cctimereporter/` directory is created automatically on first run.

---

## Config file: `~/.cctimereporter/config.json`

Created and managed via the `--debug-import` CLI flag or programmatically via `readConfig()`/`writeConfig()` from `src/utils/config.js`. If the file is missing or invalid JSON, defaults are used.

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `importLog.enabled` | boolean | `false` | Enable import debug logging to `~/.cctimereporter/import.log` |
| `importLog.clearOnStart` | boolean | `false` | Truncate the log file at the start of each import run |

### Example

```json
{
  "importLog": {
    "enabled": true,
    "clearOnStart": false
  }
}
```

### Merge behavior

When reading config, stored values are merged with defaults. Unknown top-level properties are preserved. The `importLog` object is shallow-merged with defaults, so omitting `clearOnStart` still provides its default value.

---

## Server

| Setting | Default | Fallback | Source |
|---------|---------|----------|--------|
| Port | `3847` | Tries up to 10 consecutive ports (`3847`--`3856`) if the default is in use | `bin/cli.js` |
| Host | `127.0.0.1` | None (localhost only) | `bin/cli.js` |

The server prints the actual bound port to stdout on startup. If another CC Time Reporter instance is already running (detected via a database lock), the new instance prints the existing URL and exits.

---

## Idle threshold

| Setting | Default | Range | Source |
|---------|---------|-------|--------|
| Idle threshold | `10` minutes | 1--60 minutes | `src/services/timeline.js` |

The idle threshold determines the maximum gap between consecutive messages that still counts as "working time." Gaps exceeding this threshold are excluded from working time and rendered as idle gaps in the timeline.

The threshold is set per request via the `threshold` query parameter on `GET /api/timeline`. It is clamped server-side to the range 1--60. The frontend provides a UI control that persists the user's preference in the browser.

---

## Import settings

| Setting | Default | Source | Description |
|---------|---------|--------|-------------|
| `maxAgeDays` | `30` | `src/importer/index.js` | Only process transcript files modified within this many days |
| Transcript source | `~/.claude/projects/` | `src/importer/discovery.js` | Directory scanned for JSONL transcript files |
| Project list | `~/.claude.json` (`projects` property) | `src/importer/discovery.js` | Authoritative project list from the Claude app |
| Skip check | file size comparison | `src/importer/db-writer.js` | Files are skipped if their byte size matches the last successful import record |

The `maxAgeDays` parameter can be overridden per request via `POST /api/import` (body) or `GET /api/import/progress` (query param).

---

## CLI flags

| Flag | Arguments | Description |
|------|-----------|-------------|
| `--debug-import` | `on`, `off`, or none | Enable/disable import debug logging, or show current status |
| `--mcp` | *(none)* | Start stdio MCP server instead of web server |
| `--version` | *(none)* | Print version and exit |
| `--help` | *(none)* | Print help and exit |

### `--debug-import` behavior

| Invocation | Effect |
|------------|--------|
| `cctimereporter --debug-import on` | Sets `importLog.enabled = true` in config, prints confirmation |
| `cctimereporter --debug-import off` | Sets `importLog.enabled = false` in config, prints confirmation |
| `cctimereporter --debug-import` | Prints current status (`enabled` or `disabled`) and config path |

This flag exits the process immediately after updating or displaying the setting.

---

## Database

| Property | Value |
|----------|-------|
| Engine | SQLite via `node:sqlite` (Node.js 22+ built-in) |
| Location | `~/.cctimereporter/data.db` |
| Journal mode | WAL |
| Foreign keys | Enabled |
| Busy timeout | 5000 ms |
| Schema version | 9 (stored in `PRAGMA user_version`) |
| Auto-migration | Versions 1 through 8 are migrated forward automatically on open |
| Corruption recovery | Database is deleted and recreated (all data is re-importable from transcripts) |

---

## Environment assumptions

| Dependency | Requirement | Checked |
|------------|-------------|---------|
| Node.js | >= 22 | Yes, at startup in `bin/cli.js`; exits with error if unmet |
| Claude Code transcripts | `~/.claude/projects/` must exist with JSONL files | No; import returns zero results if missing |
| Claude app config | `~/.claude.json` must exist | No; discovery falls back to filesystem scan only |

---

## Related documents

- [API endpoints reference](api/ENDPOINTS.md)
