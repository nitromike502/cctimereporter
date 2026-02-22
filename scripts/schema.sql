-- Claude Code Transcript Database Schema
-- SQLite database for querying session transcripts
-- Location: ~/.claude/transcripts.db

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================
-- Tracks imported projects and their transcript directories

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path TEXT NOT NULL UNIQUE,           -- Original path: /home/aila/httpdocs
    transcript_dir TEXT NOT NULL,                 -- Encoded path: -home-aila-httpdocs
    full_transcript_path TEXT NOT NULL,           -- Full path: ~/.claude/projects/-home-aila-httpdocs
    last_import_at TEXT,                          -- Last import timestamp (ISO 8601)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(project_path);

-- ============================================================================
-- SESSIONS TABLE
-- ============================================================================
-- One row per Claude Code session with computed metadata

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,              -- UUID from filename
    project_id INTEGER NOT NULL,                  -- FK to projects

    -- File metadata
    file_path TEXT NOT NULL,                      -- Full path to .jsonl file
    file_size INTEGER,                            -- File size in bytes
    file_modified_at TEXT,                        -- File modification time

    -- Computed session metadata
    working_branch TEXT,                          -- Primary branch (meckert-AILASUP-XXX preferred)
    primary_ticket TEXT,                          -- Computed primary ticket
    summary TEXT,                                 -- From summary message type
    custom_title TEXT,                            -- From custom-title message type
    slug TEXT,                                    -- Human-readable identifier

    -- Time bounds
    first_message_at TEXT,                        -- Earliest message timestamp
    last_message_at TEXT,                         -- Latest message timestamp

    -- Counts
    message_count INTEGER DEFAULT 0,
    user_message_count INTEGER DEFAULT 0,
    assistant_message_count INTEGER DEFAULT 0,
    tool_use_count INTEGER DEFAULT 0,

    -- Fork metadata
    fork_count INTEGER DEFAULT 0,                  -- Total forks detected (including progress)
    real_fork_count INTEGER DEFAULT 0,             -- Real conversation forks (excluding progress)

    -- Flags
    is_compacted BOOLEAN DEFAULT 0,               -- Has compact_boundary
    has_subagents BOOLEAN DEFAULT 0,              -- Contains agent conversations

    -- Import tracking
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_working_branch ON sessions(working_branch);
CREATE INDEX IF NOT EXISTS idx_sessions_primary_ticket ON sessions(primary_ticket);
CREATE INDEX IF NOT EXISTS idx_sessions_first_message ON sessions(first_message_at);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
-- All transcript messages with key fields extracted

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,                           -- Message UUID
    session_id TEXT NOT NULL,                     -- FK to sessions.session_id
    parent_uuid TEXT,                             -- Parent message UUID (tree structure)

    -- Message classification
    type TEXT NOT NULL,                           -- user, assistant, progress, system, etc.
    subtype TEXT,                                 -- For system messages (turn_duration, api_error, etc.)

    -- Timing
    timestamp TEXT NOT NULL,                      -- ISO 8601 timestamp

    -- Context at time of message
    git_branch TEXT,                              -- Branch active during this message
    cwd TEXT,                                     -- Working directory
    version TEXT,                                 -- Claude Code version

    -- Message flags
    is_meta BOOLEAN DEFAULT 0,                    -- Meta message (not for Claude)
    is_sidechain BOOLEAN DEFAULT 0,               -- Sub-agent conversation
    is_compact_summary BOOLEAN DEFAULT 0,         -- Compaction summary

    -- Agent info
    agent_id TEXT,                                -- Agent identifier for sub-agent messages

    -- Content (optional - can be large)
    content_preview TEXT,                         -- First 500 chars of content
    content_length INTEGER,                       -- Full content length

    -- Fork tracking
    is_fork_branch BOOLEAN DEFAULT 0,             -- Message is on secondary fork branch

    -- For tool results
    source_tool_assistant_uuid TEXT,              -- Links tool result to assistant

    -- Unique constraint: uuid should be unique within a session
    UNIQUE(session_id, uuid)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(DATE(timestamp));
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(git_branch);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_uuid);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);

-- ============================================================================
-- FORK_POINTS TABLE
-- ============================================================================
-- Tracks conversation fork points within sessions

CREATE TABLE IF NOT EXISTS fork_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,                     -- FK to sessions.session_id
    fork_uuid TEXT NOT NULL,                      -- UUID of the parent message at fork point
    fork_type TEXT NOT NULL,                      -- 'real' or 'progress'
    primary_child_uuid TEXT,                      -- Child on primary branch (most descendants)
    secondary_child_uuid TEXT,                    -- Child on secondary branch
    primary_descendants INTEGER DEFAULT 0,        -- Count of descendants on primary branch
    secondary_descendants INTEGER DEFAULT 0,      -- Count of descendants on secondary branch

    FOREIGN KEY (session_id) REFERENCES sessions(session_id),
    UNIQUE(session_id, fork_uuid)
);

CREATE INDEX IF NOT EXISTS idx_fork_points_session ON fork_points(session_id);
CREATE INDEX IF NOT EXISTS idx_fork_points_type ON fork_points(fork_type);

-- ============================================================================
-- TOOL_USES TABLE
-- ============================================================================
-- Extracted tool invocations from assistant messages

CREATE TABLE IF NOT EXISTS tool_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_use_id TEXT NOT NULL,                    -- Tool use ID (toolu_01ABC...)
    session_id TEXT NOT NULL,                     -- FK to sessions.session_id
    assistant_message_uuid TEXT NOT NULL,         -- Assistant message containing tool call
    result_message_uuid TEXT,                     -- User message with tool result

    -- Tool details
    tool_name TEXT NOT NULL,                      -- Bash, Read, Edit, mcp__server__tool, etc.
    tool_category TEXT,                           -- builtin, mcp, task

    -- Input summary
    input_preview TEXT,                           -- First 500 chars of input JSON

    -- Result summary
    result_preview TEXT,                          -- First 500 chars of result
    is_error BOOLEAN DEFAULT 0,                   -- Tool returned error

    -- Timing
    started_at TEXT,                              -- From assistant message timestamp
    completed_at TEXT,                            -- From result message timestamp
    duration_ms INTEGER,                          -- Computed duration

    -- For Task tool (sub-agents)
    subagent_type TEXT,                           -- Agent type for Task tool
    subagent_id TEXT,                             -- Agent ID if Task tool

    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_uses_tool ON tool_uses(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_uses_started ON tool_uses(started_at);

-- ============================================================================
-- TICKETS TABLE
-- ============================================================================
-- Ticket references found in sessions

CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,                     -- FK to sessions.session_id
    ticket_key TEXT NOT NULL,                     -- AILASUP-556, etc.

    -- Detection source
    source TEXT NOT NULL,                         -- 'branch', 'content', 'slash_command'
    detected_at TEXT,                             -- Timestamp when first detected

    -- Confidence
    is_primary BOOLEAN DEFAULT 0,                 -- Primary ticket for session

    FOREIGN KEY (session_id) REFERENCES sessions(session_id),
    UNIQUE(session_id, ticket_key, source)
);

CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(session_id);
CREATE INDEX IF NOT EXISTS idx_tickets_key ON tickets(ticket_key);
CREATE INDEX IF NOT EXISTS idx_tickets_primary ON tickets(is_primary);

-- ============================================================================
-- IMPORT_LOG TABLE
-- ============================================================================
-- Tracks import operations for debugging and incremental updates

CREATE TABLE IF NOT EXISTS import_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    files_processed INTEGER DEFAULT 0,
    files_skipped INTEGER DEFAULT 0,
    messages_imported INTEGER DEFAULT 0,
    errors TEXT,                                  -- JSON array of error messages

    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Time tracking view: summarizes work per session for a given date
CREATE VIEW IF NOT EXISTS v_session_time_summary AS
SELECT
    s.session_id,
    p.project_path,
    s.working_branch,
    s.primary_ticket,
    s.summary,
    DATE(s.first_message_at) as work_date,
    TIME(s.first_message_at) as start_time,
    TIME(s.last_message_at) as end_time,
    s.user_message_count,
    s.assistant_message_count,
    s.tool_use_count,
    -- Duration in minutes (wall clock)
    ROUND((julianday(s.last_message_at) - julianday(s.first_message_at)) * 24 * 60, 1) as duration_minutes
FROM sessions s
JOIN projects p ON s.project_id = p.id
WHERE s.first_message_at IS NOT NULL;

-- Daily work summary by ticket
CREATE VIEW IF NOT EXISTS v_daily_ticket_summary AS
SELECT
    p.project_path,
    t.ticket_key,
    DATE(s.first_message_at) as work_date,
    MIN(TIME(s.first_message_at)) as first_start,
    MAX(TIME(s.last_message_at)) as last_end,
    COUNT(DISTINCT s.session_id) as session_count,
    SUM(s.user_message_count) as total_user_messages,
    SUM(s.tool_use_count) as total_tool_uses
FROM tickets t
JOIN sessions s ON t.session_id = s.session_id
JOIN projects p ON s.project_id = p.id
WHERE t.is_primary = 1
GROUP BY p.project_path, t.ticket_key, DATE(s.first_message_at);

-- ============================================================================
-- METADATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (2);
