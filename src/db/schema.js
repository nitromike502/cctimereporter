/**
 * Database schema DDL and version constant.
 * Minimal v1 schema — only the tables the v1 timeline UI actually queries.
 * Additional tables will be added in later phases when features need them.
 */

export const SCHEMA_VERSION = 1;

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
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT NOT NULL UNIQUE,
  project_id          INTEGER NOT NULL,
  file_path           TEXT NOT NULL,
  file_modified_at    TEXT,
  working_branch      TEXT,
  primary_ticket      TEXT,
  summary             TEXT,
  first_message_at    TEXT,
  last_message_at     TEXT,
  message_count       INTEGER DEFAULT 0,
  user_message_count  INTEGER DEFAULT 0,
  tool_use_count      INTEGER DEFAULT 0,
  imported_at         TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_first_message ON sessions(first_message_at);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ticket ON sessions(primary_ticket);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid          TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  type          TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  git_branch    TEXT,
  is_sidechain  BOOLEAN DEFAULT 0,
  UNIQUE(session_id, uuid),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
`;
