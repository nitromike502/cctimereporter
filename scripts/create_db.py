#!/usr/bin/env python3
"""
Create the Claude Code transcript database.

Usage:
    python create_db.py [--force]
    python create_db.py --migrate

Options:
    --force    Drop and recreate all tables (WARNING: destroys data)
    --migrate  Apply schema migrations to existing database
"""

import sys
from pathlib import Path

from db_utils import (
    open_database,
    database_exists,
    delete_database,
    get_db_path,
    query_all,
    query_one,
    execute,
    executescript
)

SCHEMA_PATH = Path(__file__).parent / 'schema.sql'


def migrate_to_v2(conn):
    """Migrate schema from v1 to v2: add fork detection columns and tables."""
    print('  Migrating to v2: fork detection...')

    # Add columns to sessions table
    try:
        execute(conn, 'ALTER TABLE sessions ADD COLUMN fork_count INTEGER DEFAULT 0')
        print('    Added sessions.fork_count')
    except Exception:
        print('    sessions.fork_count already exists')

    try:
        execute(conn, 'ALTER TABLE sessions ADD COLUMN real_fork_count INTEGER DEFAULT 0')
        print('    Added sessions.real_fork_count')
    except Exception:
        print('    sessions.real_fork_count already exists')

    # Add column to messages table
    try:
        execute(conn, 'ALTER TABLE messages ADD COLUMN is_fork_branch BOOLEAN DEFAULT 0')
        print('    Added messages.is_fork_branch')
    except Exception:
        print('    messages.is_fork_branch already exists')

    # Create fork_points table
    execute(conn, '''
        CREATE TABLE IF NOT EXISTS fork_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            fork_uuid TEXT NOT NULL,
            fork_type TEXT NOT NULL,
            primary_child_uuid TEXT,
            secondary_child_uuid TEXT,
            primary_descendants INTEGER DEFAULT 0,
            secondary_descendants INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id),
            UNIQUE(session_id, fork_uuid)
        )
    ''')
    execute(conn, 'CREATE INDEX IF NOT EXISTS idx_fork_points_session ON fork_points(session_id)')
    execute(conn, 'CREATE INDEX IF NOT EXISTS idx_fork_points_type ON fork_points(fork_type)')
    print('    Created fork_points table')

    # Drop and recreate tickets unique constraint to allow (session_id, ticket_key, source)
    # SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate the table
    # Must drop dependent views first, then recreate them after
    try:
        # Drop views that reference tickets
        execute(conn, 'DROP VIEW IF EXISTS v_daily_ticket_summary')
        execute(conn, 'DROP VIEW IF EXISTS v_session_time_summary')

        execute(conn, '''
            CREATE TABLE IF NOT EXISTS tickets_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                ticket_key TEXT NOT NULL,
                source TEXT NOT NULL,
                detected_at TEXT,
                is_primary BOOLEAN DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                UNIQUE(session_id, ticket_key, source)
            )
        ''')
        execute(conn, '''
            INSERT OR IGNORE INTO tickets_new (session_id, ticket_key, source, detected_at, is_primary)
            SELECT session_id, ticket_key, source, detected_at, is_primary FROM tickets
        ''')
        execute(conn, 'DROP TABLE tickets')
        execute(conn, 'ALTER TABLE tickets_new RENAME TO tickets')
        execute(conn, 'CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(session_id)')
        execute(conn, 'CREATE INDEX IF NOT EXISTS idx_tickets_key ON tickets(ticket_key)')
        execute(conn, 'CREATE INDEX IF NOT EXISTS idx_tickets_primary ON tickets(is_primary)')

        # Recreate views
        execute(conn, '''
            CREATE VIEW IF NOT EXISTS v_session_time_summary AS
            SELECT
                s.session_id, p.project_path, s.working_branch, s.primary_ticket,
                s.summary, DATE(s.first_message_at) as work_date,
                TIME(s.first_message_at) as start_time, TIME(s.last_message_at) as end_time,
                s.user_message_count, s.assistant_message_count, s.tool_use_count,
                ROUND((julianday(s.last_message_at) - julianday(s.first_message_at)) * 24 * 60, 1) as duration_minutes
            FROM sessions s JOIN projects p ON s.project_id = p.id
            WHERE s.first_message_at IS NOT NULL
        ''')
        execute(conn, '''
            CREATE VIEW IF NOT EXISTS v_daily_ticket_summary AS
            SELECT
                p.project_path, t.ticket_key, DATE(s.first_message_at) as work_date,
                MIN(TIME(s.first_message_at)) as first_start, MAX(TIME(s.last_message_at)) as last_end,
                COUNT(DISTINCT s.session_id) as session_count,
                SUM(s.user_message_count) as total_user_messages,
                SUM(s.tool_use_count) as total_tool_uses
            FROM tickets t
            JOIN sessions s ON t.session_id = s.session_id
            JOIN projects p ON s.project_id = p.id
            WHERE t.is_primary = 1
            GROUP BY p.project_path, t.ticket_key, DATE(s.first_message_at)
        ''')
        print('    Recreated tickets table with updated unique constraint')
    except Exception as e:
        print(f'    Warning: tickets table migration: {e}')

    # Update schema version
    execute(conn, 'DELETE FROM schema_version')
    execute(conn, 'INSERT INTO schema_version (version) VALUES (2)')
    conn.commit()
    print('  Migration to v2 complete.')


def run_migrations(conn):
    """Run any pending schema migrations."""
    current = query_one(conn, 'SELECT MAX(version) as v FROM schema_version')
    current_version = current['v'] if current else 0
    print(f'Current schema version: {current_version}')

    if current_version < 2:
        migrate_to_v2(conn)

    final = query_one(conn, 'SELECT MAX(version) as v FROM schema_version')
    print(f'Schema version after migration: {final["v"]}')


def main():
    force = '--force' in sys.argv
    migrate = '--migrate' in sys.argv
    db_path = get_db_path()

    # Check if database exists
    db_exists = database_exists()

    # Handle --migrate
    if migrate:
        if not db_exists:
            print(f'Database not found: {db_path}', file=sys.stderr)
            print('Run without --migrate to create a new database.', file=sys.stderr)
            sys.exit(1)

        print(f'Migrating database at: {db_path}')
        conn = open_database()
        run_migrations(conn)
        conn.close()
        print('\nMigration complete!')
        return

    if db_exists and not force:
        print(f'Database already exists at: {db_path}')
        print('Use --force to drop and recreate (WARNING: destroys data)')
        print('Use --migrate to apply schema migrations')

        # Show current stats
        try:
            conn = open_database(readonly=True)
            projects = query_one(conn, 'SELECT COUNT(*) as count FROM projects')
            sessions = query_one(conn, 'SELECT COUNT(*) as count FROM sessions')
            messages = query_one(conn, 'SELECT COUNT(*) as count FROM messages')
            print(f'\nCurrent database stats:')
            print(f'  Projects: {projects["count"]}')
            print(f'  Sessions: {sessions["count"]}')
            print(f'  Messages: {messages["count"]}')
            conn.close()
        except Exception:
            # Tables might not exist yet
            pass
        return

    # Read schema
    if not SCHEMA_PATH.exists():
        print(f'Schema file not found: {SCHEMA_PATH}', file=sys.stderr)
        sys.exit(1)

    schema = SCHEMA_PATH.read_text()

    # Create/recreate database
    if force and db_exists:
        print('Dropping existing database...')
        delete_database()

    print(f'Creating database at: {db_path}')
    conn = open_database()

    # Execute schema
    print('Applying schema...')
    executescript(conn, schema)
    conn.commit()

    # Verify tables created
    tables = query_all(conn, """
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """)

    print(f'\nCreated {len(tables)} tables:')
    for t in tables:
        print(f'  - {t["name"]}')

    # Verify views created
    views = query_all(conn, """
        SELECT name FROM sqlite_master
        WHERE type='view'
        ORDER BY name
    """)

    print(f'\nCreated {len(views)} views:')
    for v in views:
        print(f'  - {v["name"]}')

    # Verify indexes created
    indexes = query_all(conn, """
        SELECT name FROM sqlite_master
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """)

    print(f'\nCreated {len(indexes)} indexes')

    conn.close()
    print('\nDatabase created successfully!')
    print('\nNext step: Import transcripts with:')
    print('  python scripts/import_transcripts.py /path/to/project')


if __name__ == '__main__':
    main()
