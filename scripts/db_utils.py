#!/usr/bin/env python3
"""
Shared database utilities for transcript-db.

Uses Python's built-in sqlite3 module - zero external dependencies.
"""

import os
import sqlite3
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

DB_PATH = Path.home() / '.claude' / 'transcripts.db'


def get_db_path() -> Path:
    """Get the database file path."""
    return DB_PATH


def database_exists() -> bool:
    """Check if the database file exists."""
    return DB_PATH.exists()


def delete_database() -> None:
    """Delete the database file if it exists."""
    if DB_PATH.exists():
        DB_PATH.unlink()


def open_database(readonly: bool = False) -> sqlite3.Connection:
    """
    Open the database connection.

    Args:
        readonly: If True, open in read-only mode.

    Returns:
        sqlite3.Connection with row_factory set to sqlite3.Row
    """
    # Ensure parent directory exists
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    if readonly:
        uri = f'file:{DB_PATH}?mode=ro'
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(DB_PATH)

    # Enable foreign keys
    conn.execute('PRAGMA foreign_keys = ON')

    # Use Row factory for dict-like access
    conn.row_factory = sqlite3.Row

    return conn


def query_all(conn: sqlite3.Connection, sql: str, params: Tuple = ()) -> List[Dict[str, Any]]:
    """
    Execute a query and return all results as list of dicts.

    Args:
        conn: Database connection
        sql: SQL query string
        params: Query parameters

    Returns:
        List of dictionaries, one per row
    """
    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]


def query_one(conn: sqlite3.Connection, sql: str, params: Tuple = ()) -> Optional[Dict[str, Any]]:
    """
    Execute a query and return the first result as dict.

    Args:
        conn: Database connection
        sql: SQL query string
        params: Query parameters

    Returns:
        Dictionary for the first row, or None if no results
    """
    cursor = conn.execute(sql, params)
    row = cursor.fetchone()
    return dict(row) if row else None


def execute(conn: sqlite3.Connection, sql: str, params: Tuple = ()) -> sqlite3.Cursor:
    """
    Execute a statement (INSERT, UPDATE, DELETE).

    Args:
        conn: Database connection
        sql: SQL statement
        params: Statement parameters

    Returns:
        Cursor with lastrowid and rowcount available
    """
    return conn.execute(sql, params)


def executemany(conn: sqlite3.Connection, sql: str, params_list: List[Tuple]) -> sqlite3.Cursor:
    """
    Execute a statement with multiple parameter sets.

    Args:
        conn: Database connection
        sql: SQL statement
        params_list: List of parameter tuples

    Returns:
        Cursor
    """
    return conn.executemany(sql, params_list)


def executescript(conn: sqlite3.Connection, sql: str) -> None:
    """
    Execute multiple SQL statements (for schema, etc.).

    Args:
        conn: Database connection
        sql: SQL script with multiple statements
    """
    conn.executescript(sql)
