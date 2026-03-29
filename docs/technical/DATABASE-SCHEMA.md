# Database Schema Specification

*Last updated: 2026-03-27*
*Schema version: 9*

## Overview

CC Time Reporter uses a single SQLite database at `~/.cctimereporter/data.db` to store imported session data. The database is treated as a disposable cache -- it can be deleted and rebuilt from source JSONL files at any time.

## Database configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Journal mode | WAL | Allows concurrent reads during writes |
| Foreign keys | ON | Enforces referential integrity |
| Busy timeout | 5000 ms | Waits up to 5 seconds for write locks before failing |
| Version tracking | `PRAGMA user_version` | Stores schema version for migration detection |

## Tables

### projects

Represents a Claude Code project directory discovered during import.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | -- | Auto-incrementing project identifier |
| `project_path` | TEXT | NOT NULL, UNIQUE | -- | Absolute filesystem path to the project, or encoded directory name for orphaned projects |
| `transcript_dir` | TEXT | NOT NULL | -- | Full path to the project's transcript directory under `~/.claude/projects/` |
| `last_import_at` | TEXT | -- | NULL | ISO8601 timestamp of the last completed import for this project |
| `created_at` | TEXT | NOT NULL | `datetime('now')` | Row creation timestamp |

**Indexes:**

| Name | Columns |
|------|---------|
| `idx_projects_path` | `project_path` |

---

### sessions

One row per Claude Code conversation session. Core entity for timeline display.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | -- | Auto-incrementing row identifier |
| `session_id` | TEXT | NOT NULL, UNIQUE | -- | UUID from the JSONL filename (without `.jsonl` extension) |
| `project_id` | INTEGER | NOT NULL, FK -> projects(id) | -- | Parent project reference |
| `file_path` | TEXT | NOT NULL | -- | Absolute path to the source JSONL file |
| `file_size` | INTEGER | -- | NULL | File size in bytes at last import (used for skip checks) |
| `file_modified_at` | TEXT | -- | NULL | File modification timestamp (not currently populated) |
| `working_branch` | TEXT | -- | NULL | Primary git branch detected via frequency + ticket pattern preference |
| `primary_ticket` | TEXT | -- | NULL | Highest-scoring ticket key from the scoring algorithm, or NULL if no ticket scores above threshold |
| `summary` | TEXT | -- | NULL | Session summary from session-index.json or JSONL `summary` entry |
| `custom_title` | TEXT | -- | NULL | User-assigned title from Claude Code `/rename` command (last value wins) |
| `slug` | TEXT | -- | NULL | Session slug from JSONL metadata |
| `first_message_at` | TEXT | -- | NULL | ISO8601 timestamp of the earliest message |
| `last_message_at` | TEXT | -- | NULL | ISO8601 timestamp of the latest message |
| `last_updated_at` | TEXT | -- | NULL | ISO8601 timestamp of the most recent import of this session |
| `message_count` | INTEGER | -- | 0 | Total number of messages (all types) |
| `user_message_count` | INTEGER | -- | 0 | Count of non-meta user messages with timestamps |
| `assistant_message_count` | INTEGER | -- | 0 | Count of assistant messages with timestamps |
| `tool_use_count` | INTEGER | -- | 0 | Count of `tool_use` content blocks across all assistant messages |
| `fork_count` | INTEGER | -- | 0 | Total fork points (parents with 2+ children) |
| `real_fork_count` | INTEGER | -- | 0 | Fork points after excluding progress-only branches |
| `is_compacted` | BOOLEAN | -- | 0 | 1 if the session contains a `compact_boundary` system message |
| `has_subagents` | BOOLEAN | -- | 0 | 1 if any message has `isSidechain` or `agentId` set |
| `is_subagent` | BOOLEAN | -- | 0 | 1 if this session is a team-member subagent or worktree-based agent |
| `team_name` | TEXT | -- | NULL | Team name from JSONL metadata (for team-based multi-agent sessions) |
| `agent_name` | TEXT | -- | NULL | Agent name from JSONL metadata |
| `first_prompt` | TEXT | -- | NULL | First non-meta user message text, truncated to 200 characters |
| `user_label` | TEXT | -- | NULL | User-editable label (set via UI, survives re-import) |
| `user_ticket` | TEXT | -- | NULL | User-editable ticket override (set via UI, survives re-import) |
| `imported_at` | TEXT | NOT NULL | `datetime('now')` | Row creation timestamp |

**Indexes:**

| Name | Columns |
|------|---------|
| `idx_sessions_first_message` | `first_message_at` |
| `idx_sessions_project` | `project_id` |
| `idx_sessions_ticket` | `primary_ticket` |

> **Note:** `user_label` and `user_ticket` are deliberately excluded from the import upsert so that user edits survive re-imports. `tool_use_count` is computed at import time but not currently queried by any server route or displayed in the frontend.

---

### messages

Individual messages within a session. Used for working time computation, fork visualization, and message preview.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | -- | Auto-incrementing row identifier |
| `uuid` | TEXT | NOT NULL | -- | Message UUID from the JSONL entry, or `line-N` for entries without a UUID |
| `session_id` | TEXT | NOT NULL, FK -> sessions(session_id) | -- | Parent session reference |
| `type` | TEXT | NOT NULL | -- | Message type: `user`, `assistant`, `system`, `progress`, `file_history_snapshot`, `summary`, `custom-title`, etc. |
| `subtype` | TEXT | -- | NULL | Message subtype (e.g., `compact_boundary` for system messages) |
| `timestamp` | TEXT | NOT NULL | -- | ISO8601 timestamp of the message |
| `parent_uuid` | TEXT | -- | NULL | UUID of this message's parent in the conversation tree |
| `git_branch` | TEXT | -- | NULL | Active git branch at the time of this message |
| `is_meta` | BOOLEAN | -- | 0 | 1 if this is a metadata-only message (e.g., version info) |
| `is_sidechain` | BOOLEAN | -- | 0 | 1 if this message is from a subagent sidechain |
| `is_fork_branch` | BOOLEAN | -- | 0 | 1 if this message belongs to a secondary (non-primary) fork branch |
| `fork_branch_id` | TEXT | -- | NULL | UUID of the first child message in this fork branch (stable identifier across re-imports). NULL for primary branch and non-fork messages. |
| `content` | TEXT | -- | NULL | Extracted and cleaned text content for user and assistant messages. Truncated at word boundary near 1000 characters. NULL for other message types. |

**Constraints:**

| Type | Definition |
|------|------------|
| UNIQUE | `(session_id, uuid)` |

**Indexes:**

| Name | Columns |
|------|---------|
| `idx_messages_session` | `session_id` |
| `idx_messages_timestamp` | `timestamp` |

> **Note:** Messages without timestamps (system metadata entries) are filtered out before insertion. The `content` column stores cleaned text with XML tags (slash commands, bash blocks, skill expansions) stripped from user messages.

---

### tickets

Ticket detections found across all messages in a session. Multiple rows per session are common (different tickets or same ticket from different sources).

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | -- | Auto-incrementing row identifier |
| `session_id` | TEXT | NOT NULL, FK -> sessions(session_id) | -- | Parent session reference |
| `ticket_key` | TEXT | NOT NULL | -- | Normalized ticket identifier (uppercase), e.g., `PROJ-123` |
| `source` | TEXT | NOT NULL | -- | Detection source: `slash_command`, `branch`, `git_commit`, `mcp_tool`, `summary`, or `content` |
| `detected_at` | TEXT | -- | NULL | ISO8601 timestamp of the message where detection occurred. NULL for summary-level detections. |
| `is_primary` | BOOLEAN | -- | 0 | 1 if this ticket is the session's primary ticket (highest scorer) |

**Constraints:**

| Type | Definition |
|------|------------|
| UNIQUE | `(session_id, ticket_key, source)` |

**Indexes:**

| Name | Columns |
|------|---------|
| `idx_tickets_session` | `session_id` |
| `idx_tickets_key` | `ticket_key` |

---

### import_log

Tracks the import status of each transcript file. Used for skip checks (size-based, rolling window) to avoid re-processing unchanged files.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | -- | Auto-incrementing row identifier |
| `session_id` | TEXT | -- | NULL | Session UUID for the imported file |
| `file_path` | TEXT | NOT NULL | -- | Absolute path to the transcript file |
| `file_size` | INTEGER | NOT NULL | -- | File size in bytes at import time |
| `imported_at` | TEXT | NOT NULL | `datetime('now')` | Timestamp of this import log entry |
| `status` | TEXT | NOT NULL | -- | Import result: `ok`, `error`, or `skipped_old` |
| `error_msg` | TEXT | -- | NULL | Error message if status is `error` |
| `first_message_at` | TEXT | -- | NULL | Earliest message timestamp in the file (for rolling window checks) |
| `last_message_at` | TEXT | -- | NULL | Latest message timestamp in the file (for rolling window checks) |

**Constraints:**

| Type | Definition |
|------|------------|
| UNIQUE | `(file_path)` |

---

### process_locks

Database-level coordination for multi-instance scenarios. Prevents duplicate web servers and concurrent imports.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `lock_name` | TEXT | PRIMARY KEY | -- | Named lock identifier (e.g., `server`, `import`) |
| `pid` | INTEGER | NOT NULL | -- | Process ID of the lock holder |
| `source` | TEXT | NOT NULL | -- | Access layer that claimed the lock: `web`, `cli`, or `mcp` |
| `port` | INTEGER | -- | NULL | Listening port (for `web` source, used to display URL of existing instance) |
| `started_at` | TEXT | NOT NULL | `datetime('now')` | Timestamp when the lock was claimed |

## Entity relationships

```
projects 1──────* sessions
                     |
                     |──────* messages
                     |
                     |──────* tickets

import_log (standalone, keyed by file_path)

process_locks (standalone, keyed by lock_name)
```

- `sessions.project_id` references `projects.id`
- `messages.session_id` references `sessions.session_id`
- `tickets.session_id` references `sessions.session_id`
- `import_log` and `process_locks` have no foreign key relationships

## Migration history

The database uses `PRAGMA user_version` to track schema version. On open, `openDatabase()` checks the version and applies migrations sequentially. Unknown versions cause the database to be dropped and recreated (safe because the database is a cache).

| Version | Migration | Changes |
|---------|-----------|---------|
| 0 -> 1 | Initial schema | `projects`, `sessions`, `messages` tables with basic columns |
| 1 -> 2 | `MIGRATION_V1_TO_V2` | Added `file_size`, `assistant_message_count`, `fork_count`, `real_fork_count`, `is_compacted`, `has_subagents`, `last_updated_at`, `custom_title`, `slug` to sessions. Added `parent_uuid`, `subtype`, `is_meta`, `is_fork_branch` to messages. Created `tickets` and `import_log` tables. |
| 2 -> 3 | `MIGRATION_V2_TO_V3` | Added `is_subagent`, `team_name`, `agent_name` to sessions (subagent classification) |
| 3 -> 4 | `MIGRATION_V3_TO_V4` | Added `first_message_at`, `last_message_at` to import_log (rolling window cache) |
| 4 -> 5 | `MIGRATION_V4_TO_V5` | Added `first_prompt` to sessions |
| 5 -> 6 | `MIGRATION_V5_TO_V6` | Added `user_label`, `user_ticket` to sessions (user-editable fields that survive re-import) |
| 6 -> 7 | `MIGRATION_V6_TO_V7` | Added `fork_branch_id` to messages (per-branch fork identification) |
| 7 -> 8 | `MIGRATION_V7_TO_V8` | Added `content` to messages (stored message text for DB-based display) |
| 8 -> 9 | `MIGRATION_V8_TO_V9` | Created `process_locks` table (multi-instance coordination) |

Each migration uses `ALTER TABLE ADD COLUMN` wrapped in try/catch since SQLite has no `ADD COLUMN IF NOT EXISTS`. Re-running migrations is safe -- duplicate column errors are silently ignored. Migrations run inside a transaction (`BEGIN`/`COMMIT` with `ROLLBACK` on unexpected errors).

## Database file location

| Item | Path |
|------|------|
| Database directory | `~/.cctimereporter/` |
| Database file | `~/.cctimereporter/data.db` |
| WAL file | `~/.cctimereporter/data.db-wal` (managed by SQLite) |
| SHM file | `~/.cctimereporter/data.db-shm` (managed by SQLite) |

The directory is created automatically on first run via `mkdirSync` with `{ recursive: true }`.

## Related documents

- [Architecture Overview](../architecture/OVERVIEW.md) -- system architecture and design principles
