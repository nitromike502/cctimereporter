#!/usr/bin/env python3
"""
Quick query tool for the transcript database.

Usage:
    python query.py <sql>
    python query.py --sessions <date>     # Show sessions for a date
    python query.py --tickets             # List all tickets
    python query.py --stats               # Database stats
    python query.py --working-time <date> [--threshold=<minutes>]
"""

import sys
from collections import defaultdict
from datetime import date, datetime

from db_utils import (
    open_database,
    database_exists,
    get_db_path,
    query_all,
    query_one
)

DEFAULT_IDLE_THRESHOLD_MINUTES = 10


def main():
    args = sys.argv[1:]

    if not args:
        print('Usage: python query.py <sql>', file=sys.stderr)
        print('       python query.py --sessions <date>', file=sys.stderr)
        print('       python query.py --tickets', file=sys.stderr)
        print('       python query.py --stats', file=sys.stderr)
        print('       python query.py --working-time <date> [--threshold=<minutes>]', file=sys.stderr)
        sys.exit(1)

    if not database_exists():
        print(f'Database not found: {get_db_path()}', file=sys.stderr)
        sys.exit(1)

    conn = open_database(readonly=True)

    # Parse --threshold from anywhere in args
    threshold_minutes = DEFAULT_IDLE_THRESHOLD_MINUTES
    remaining_args = []
    for arg in args:
        if arg.startswith('--threshold='):
            try:
                threshold_minutes = int(arg.split('=')[1])
            except ValueError:
                print('Error: threshold must be an integer', file=sys.stderr)
                sys.exit(1)
        else:
            remaining_args.append(arg)

    try:
        if remaining_args[0] == '--sessions':
            date_str = remaining_args[1] if len(remaining_args) > 1 else date.today().isoformat()
            query_sessions(conn, date_str)
        elif remaining_args[0] == '--tickets':
            query_tickets(conn)
        elif remaining_args[0] == '--stats':
            query_stats(conn)
        elif remaining_args[0] == '--working-time':
            date_str = remaining_args[1] if len(remaining_args) > 1 else date.today().isoformat()
            query_working_time(conn, date_str, threshold_minutes)
        else:
            # Raw SQL query
            sql = ' '.join(remaining_args)
            rows = query_all(conn, sql)
            if not rows:
                print('(no results)')
            else:
                print_table(rows)
    except Exception as e:
        print(f'Query error: {e}', file=sys.stderr)
        sys.exit(1)

    conn.close()


def print_table(rows):
    """Print rows as a formatted table."""
    if not rows:
        return

    # Get column names from first row
    columns = list(rows[0].keys())

    # Calculate column widths
    widths = {col: len(col) for col in columns}
    for row in rows:
        for col in columns:
            val = str(row[col]) if row[col] is not None else ''
            widths[col] = max(widths[col], len(val))

    # Print header
    header = ' | '.join(col.ljust(widths[col]) for col in columns)
    print(header)
    print('-' * len(header))

    # Print rows
    for row in rows:
        line = ' | '.join(
            (str(row[col]) if row[col] is not None else '').ljust(widths[col])
            for col in columns
        )
        print(line)


def query_sessions(conn, date_str):
    """Show sessions for a specific date."""
    print(f'\nSessions for {date_str}:\n')

    rows = query_all(conn, """
        SELECT
            s.primary_ticket,
            s.working_branch,
            TIME(s.first_message_at) as start_time,
            TIME(s.last_message_at) as end_time,
            s.user_message_count as user_msgs,
            ROUND((julianday(s.last_message_at) - julianday(s.first_message_at)) * 24 * 60, 1) as span_min,
            COALESCE(s.summary, s.custom_title, '') as summary
        FROM sessions s
        WHERE DATE(s.first_message_at) <= ? AND DATE(s.last_message_at) >= ?
        ORDER BY s.first_message_at
    """, (date_str, date_str))

    if not rows:
        print('No sessions found for this date.')
        return

    for row in rows:
        ticket = row['primary_ticket'] or '(no ticket)'
        branch = row['working_branch'] or '(no branch)'
        summary = (row['summary'] or '')[:60]
        span = row['span_min'] or 0

        print(f"  {ticket:16} {row['start_time']} - {row['end_time']}  {span:6.1f}m  {summary}")
        if row['working_branch'] and row['working_branch'] != row['primary_ticket']:
            print(f"{'':18}Branch: {branch}")

    print(f'\n  Total: {len(rows)} sessions')


def query_tickets(conn):
    """List all tickets."""
    print('\nAll tickets:\n')

    rows = query_all(conn, """
        SELECT
            t.ticket_key,
            COUNT(DISTINCT t.session_id) as sessions,
            MIN(s.first_message_at) as first_seen,
            MAX(s.last_message_at) as last_seen,
            GROUP_CONCAT(DISTINCT t.source) as sources
        FROM tickets t
        JOIN sessions s ON t.session_id = s.session_id
        GROUP BY t.ticket_key
        ORDER BY t.ticket_key
    """)

    print_table(rows)


def query_stats(conn):
    """Show database statistics."""
    print('\nDatabase Statistics:\n')

    projects = query_one(conn, 'SELECT COUNT(*) as count FROM projects')
    sessions = query_one(conn, 'SELECT COUNT(*) as count FROM sessions')
    messages = query_one(conn, 'SELECT COUNT(*) as count FROM messages')
    tickets = query_one(conn, 'SELECT COUNT(DISTINCT ticket_key) as count FROM tickets')
    date_range = query_one(conn, """
        SELECT MIN(DATE(first_message_at)) as earliest, MAX(DATE(last_message_at)) as latest
        FROM sessions
    """)

    print(f"  Projects:  {projects['count']}")
    print(f"  Sessions:  {sessions['count']}")
    print(f"  Messages:  {messages['count']}")
    print(f"  Tickets:   {tickets['count']}")
    print(f"  Date range: {date_range['earliest']} to {date_range['latest']}")


def format_duration(total_seconds):
    """Format seconds as Xh Ym."""
    total_minutes = round(total_seconds / 60)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0:
        return f'{hours}h {minutes}m'
    return f'{minutes}m'


def format_hours_decimal(total_seconds):
    """Format seconds as decimal hours."""
    return f'{total_seconds / 3600:.2f}'


def query_working_time(conn, date_str, threshold_minutes):
    """Calculate working time for a date using idle-gap threshold."""
    threshold_seconds = threshold_minutes * 60

    print(f'\n{"=" * 70}')
    print(f'Working Time Report - {date_str}')
    print(f'Idle threshold: {threshold_minutes} minutes')
    print(f'{"=" * 70}\n')

    # Get all message timestamps for the date, grouped by session
    rows = query_all(conn, """
        SELECT
            m.session_id,
            m.timestamp,
            s.primary_ticket,
            s.working_branch
        FROM messages m
        JOIN sessions s ON m.session_id = s.session_id
        WHERE DATE(m.timestamp) = ?
          AND m.type IN ('user', 'assistant')
        ORDER BY m.session_id, m.timestamp
    """, (date_str,))

    if not rows:
        print('No activity found for this date.')
        return

    # Group timestamps by session
    sessions = defaultdict(lambda: {'timestamps': [], 'ticket': None, 'branch': None})
    for row in rows:
        sid = row['session_id']
        sessions[sid]['timestamps'].append(row['timestamp'])
        if row['primary_ticket']:
            sessions[sid]['ticket'] = row['primary_ticket']
        if row['working_branch']:
            sessions[sid]['branch'] = row['working_branch']

    # Calculate working time per session
    session_results = []
    for sid, data in sessions.items():
        timestamps = sorted(data['timestamps'])
        parsed = [datetime.fromisoformat(t.replace('Z', '+00:00')) for t in timestamps]

        working_seconds = 0
        idle_seconds = 0
        active_periods = 1

        for i in range(1, len(parsed)):
            gap = (parsed[i] - parsed[i - 1]).total_seconds()
            if gap <= threshold_seconds:
                working_seconds += gap
            else:
                idle_seconds += gap
                active_periods += 1

        # Session span = wall-clock time from first to last message
        span_seconds = (parsed[-1] - parsed[0]).total_seconds()

        # Determine task key: prefer ticket, fall back to branch
        task_key = data['ticket'] or data['branch'] or 'unknown'

        session_results.append({
            'session_id': sid,
            'task_key': task_key,
            'ticket': data['ticket'],
            'branch': data['branch'],
            'working_seconds': working_seconds,
            'idle_seconds': idle_seconds,
            'span_seconds': span_seconds,
            'message_count': len(timestamps),
            'active_periods': active_periods,
            'start_time': parsed[0],
            'end_time': parsed[-1],
        })

    # Group by task
    tasks = defaultdict(lambda: {
        'sessions': [],
        'total_working': 0,
        'total_idle': 0,
        'total_span': 0,
        'ticket': None,
        'branch': None,
        'earliest_start': None,
        'latest_end': None,
    })

    for sr in session_results:
        tk = sr['task_key']
        tasks[tk]['sessions'].append(sr)
        tasks[tk]['total_working'] += sr['working_seconds']
        tasks[tk]['total_idle'] += sr['idle_seconds']
        tasks[tk]['total_span'] += sr['span_seconds']
        if sr['ticket']:
            tasks[tk]['ticket'] = sr['ticket']
        if sr['branch']:
            tasks[tk]['branch'] = sr['branch']
        if tasks[tk]['earliest_start'] is None or sr['start_time'] < tasks[tk]['earliest_start']:
            tasks[tk]['earliest_start'] = sr['start_time']
        if tasks[tk]['latest_end'] is None or sr['end_time'] > tasks[tk]['latest_end']:
            tasks[tk]['latest_end'] = sr['end_time']

    # Sort tasks by earliest start
    sorted_tasks = sorted(tasks.items(), key=lambda x: x[1]['earliest_start'])

    # Print per-task summary
    print(f'{"─" * 70}')
    print('TIME LOG SUMMARY')
    print(f'{"─" * 70}\n')

    grand_total_working = 0
    grand_total_idle = 0

    for task_key, data in sorted_tasks:
        label = data['ticket'] or task_key
        start_str = data['earliest_start'].strftime('%H:%M')
        end_str = data['latest_end'].strftime('%H:%M')

        print(f'TASK: {label}')
        if data['branch'] and data['branch'] != label:
            print(f'  Branch: {data["branch"]}')
        print(f'  Time Range: {start_str} - {end_str}')
        print(f'  Session Span: {format_duration(data["total_span"])} ({format_hours_decimal(data["total_span"])} hrs)')
        print(f'  Working Time: {format_duration(data["total_working"])} ({format_hours_decimal(data["total_working"])} hrs)')
        print(f'  Idle Time: {format_duration(data["total_idle"])} (excluded)')
        print(f'  Sessions: {len(data["sessions"])}')
        print()

        grand_total_working += data['total_working']
        grand_total_idle += data['total_idle']

    # Grand total
    print(f'{"─" * 70}')
    print('TOTALS')
    print(f'{"─" * 70}')
    print(f'  Total Working Time: {format_duration(grand_total_working)} ({format_hours_decimal(grand_total_working)} hrs)')
    print(f'  Total Idle Time: {format_duration(grand_total_idle)} (excluded)')
    print(f'  Tasks: {len(sorted_tasks)}')
    print(f'  Sessions: {len(session_results)}')
    print()

    # Session details
    print(f'{"─" * 70}')
    print('SESSION DETAILS')
    print(f'{"─" * 70}\n')

    for sr in sorted(session_results, key=lambda x: x['start_time']):
        start_str = sr['start_time'].strftime('%H:%M')
        end_str = sr['end_time'].strftime('%H:%M')
        print(f'Session: {sr["session_id"][:8]}...')
        print(f'  Branch: {sr["branch"] or "N/A"}')
        print(f'  Ticket: {sr["ticket"] or "None"}')
        print(f'  Time: {start_str} - {end_str}')
        print(f'  Span: {format_duration(sr["span_seconds"])} | Working: {format_duration(sr["working_seconds"])} | Idle: {format_duration(sr["idle_seconds"])}')
        print(f'  Messages: {sr["message_count"]} | Active Periods: {sr["active_periods"]}')
        print()


if __name__ == '__main__':
    main()
