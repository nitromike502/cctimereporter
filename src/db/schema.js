/**
 * Database schema DDL and version constant.
 * v2 schema — full import pipeline tables: tickets, import_log, and
 * additional columns on sessions and messages for fork detection.
 */

export const SCHEMA_VERSION = 2;

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path    TEXT NOT NULL UNIQUE,
  transcript_dir  TEXT NOT NULL,
  last_import_at  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(project_path);

CREATE TABLE IF NOT EXISTS sessions (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id              TEXT NOT NULL UNIQUE,
  project_id              INTEGER NOT NULL,
  file_path               TEXT NOT NULL,
  file_size               INTEGER,
  file_modified_at        TEXT,
  working_branch          TEXT,
  primary_ticket          TEXT,
  summary                 TEXT,
  custom_title            TEXT,
  slug                    TEXT,
  first_message_at        TEXT,
  last_message_at         TEXT,
  last_updated_at         TEXT,
  message_count           INTEGER DEFAULT 0,
  user_message_count      INTEGER DEFAULT 0,
  assistant_message_count INTEGER DEFAULT 0,
  tool_use_count          INTEGER DEFAULT 0,
  fork_count              INTEGER DEFAULT 0,
  real_fork_count         INTEGER DEFAULT 0,
  is_compacted            BOOLEAN DEFAULT 0,
  has_subagents           BOOLEAN DEFAULT 0,
  imported_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_first_message ON sessions(first_message_at);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ticket ON sessions(primary_ticket);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  type            TEXT NOT NULL,
  subtype         TEXT,
  timestamp       TEXT NOT NULL,
  parent_uuid     TEXT,
  git_branch      TEXT,
  is_meta         BOOLEAN DEFAULT 0,
  is_sidechain    BOOLEAN DEFAULT 0,
  is_fork_branch  BOOLEAN DEFAULT 0,
  UNIQUE(session_id, uuid),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

CREATE TABLE IF NOT EXISTS tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  ticket_key   TEXT NOT NULL,
  source       TEXT NOT NULL,
  detected_at  TEXT,
  is_primary   BOOLEAN DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  UNIQUE(session_id, ticket_key, source)
);

CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(session_id);
CREATE INDEX IF NOT EXISTS idx_tickets_key ON tickets(ticket_key);

CREATE TABLE IF NOT EXISTS import_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT,
  file_path   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  status      TEXT NOT NULL,
  error_msg   TEXT,
  UNIQUE(file_path)
);
`;

/**
 * ALTER TABLE / CREATE TABLE statements to migrate an existing v1 database to v2.
 * Each ALTER TABLE is wrapped in a try/catch in migrateV1toV2() since SQLite
 * has no ALTER TABLE ADD COLUMN IF NOT EXISTS.
 */
export const MIGRATION_V1_TO_V2 = `
ALTER TABLE sessions ADD COLUMN file_size INTEGER;
ALTER TABLE sessions ADD COLUMN assistant_message_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN fork_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN real_fork_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN is_compacted BOOLEAN DEFAULT 0;
ALTER TABLE sessions ADD COLUMN has_subagents BOOLEAN DEFAULT 0;
ALTER TABLE sessions ADD COLUMN last_updated_at TEXT;
ALTER TABLE sessions ADD COLUMN custom_title TEXT;
ALTER TABLE sessions ADD COLUMN slug TEXT;
ALTER TABLE messages ADD COLUMN parent_uuid TEXT;
ALTER TABLE messages ADD COLUMN subtype TEXT;
ALTER TABLE messages ADD COLUMN is_meta BOOLEAN DEFAULT 0;
ALTER TABLE messages ADD COLUMN is_fork_branch BOOLEAN DEFAULT 0;
CREATE TABLE IF NOT EXISTS tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  ticket_key   TEXT NOT NULL,
  source       TEXT NOT NULL,
  detected_at  TEXT,
  is_primary   BOOLEAN DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  UNIQUE(session_id, ticket_key, source)
);
CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(session_id);
CREATE INDEX IF NOT EXISTS idx_tickets_key ON tickets(ticket_key);
CREATE TABLE IF NOT EXISTS import_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT,
  file_path   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  status      TEXT NOT NULL,
  error_msg   TEXT,
  UNIQUE(file_path)
);
`;
