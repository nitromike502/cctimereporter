#!/usr/bin/env python3
"""
Generate an HTML visual timeline of Claude Code sessions for a given date.

Usage:
    python timeline.py <date>              # Generate timeline for date
    python timeline.py <date> --threshold=10  # Custom idle threshold
    python timeline.py yesterday           # Yesterday's timeline
    python timeline.py today               # Today's timeline
"""

import re
import sys
import webbrowser
from collections import defaultdict
from datetime import date, datetime, timedelta
from html import escape

from db_utils import open_database, database_exists, get_db_path, query_all

DEFAULT_IDLE_THRESHOLD_MINUTES = 10

# Distinct, colorblind-friendly palette for projects
COLORS = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
    '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
    '#6baed6', '#fd8d3c', '#74c476', '#9e9ac8', '#fdae6b',
]


def resolve_date(arg):
    if arg == 'today':
        return date.today().isoformat()
    elif arg == 'yesterday':
        return (date.today() - timedelta(days=1)).isoformat()
    return arg


def get_color(key, color_map):
    if key not in color_map:
        idx = len(color_map) % len(COLORS)
        color_map[key] = COLORS[idx]
    return color_map[key]


def hex_to_rgba(hex_color, alpha):
    h = hex_color.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f'rgba({r},{g},{b},{alpha})'


def project_short_name(project_path):
    """Extract a short display name from project path."""
    if not project_path:
        return 'unknown'
    # /home/aila/httpdocs -> AILA
    # /home/nlcl/httpdocs -> NLCL
    # /home/meckert/personal -> Personal
    # /home/tmux -> Tmux
    # /home/stulz -> Stulz
    # /home/orases/example -> Orases Example
    parts = project_path.strip('/').split('/')
    if len(parts) >= 2:
        base = parts[1]  # aila, nlcl, meckert, tmux, orases, etc.
        if base == 'meckert' and len(parts) >= 3:
            return parts[2].capitalize()
        elif base == 'mnt' and len(parts) >= 4:
            # /mnt/j/Aila/website -> AILA (Windows)
            return parts[3].upper()
        elif base == 'orases' and len(parts) >= 3:
            return f"Orases/{parts[2].capitalize()}"
        elif base in ('aila', 'nlcl'):
            return base.upper()
        else:
            return base.capitalize()
    return project_path


def derive_session_title(conn, session_id):
    """Try to derive a meaningful title for sessions without branch/ticket."""
    # Check summary and custom_title first
    rows = query_all(conn, """
        SELECT summary, custom_title
        FROM sessions WHERE session_id = ?
    """, (session_id,))
    if rows:
        if rows[0]['summary']:
            return rows[0]['summary'][:50]
        if rows[0]['custom_title']:
            return rows[0]['custom_title'][:50]

    # Look at first meaningful user message content_preview
    rows = query_all(conn, """
        SELECT content_preview
        FROM messages
        WHERE session_id = ? AND type = 'user'
          AND content_preview IS NOT NULL
          AND LENGTH(content_preview) > 10
        ORDER BY timestamp
        LIMIT 5
    """, (session_id,))

    for row in rows:
        preview = row['content_preview'] or ''
        # Strip XML/HTML command tags
        cleaned = re.sub(r'<[^>]+>', ' ', preview)
        # Collapse whitespace (newlines, tabs, multiple spaces)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        # Skip empty or very short results
        if len(cleaned) < 8:
            continue
        # Skip common non-descriptive messages and slash commands
        lower = cleaned.lower().strip()
        if lower in ('clear', 'y', 'yes', 'no', 'n', 'ok', 'okay', 'continue'):
            continue
        # Skip slash commands and their echoed names (e.g. "startup /startup", "/clear clear")
        if re.match(r'^/?[\w-]+\s+/?[\w-]+\s*$', lower):
            continue
        if re.match(r'^/[\w-]+\s*$', lower):
            continue
        # Skip messages that are just command names/args or framework noise
        if lower.startswith('caveat:') or lower.startswith('[request interrupted'):
            continue
        # Strip markdown formatting for cleaner display
        cleaned = re.sub(r'[*#`]', '', cleaned).strip()
        cleaned = re.sub(r'\s+', ' ', cleaned)
        # Take first sentence or first 50 chars
        # Try to cut at sentence boundary
        sentence_end = re.search(r'[.!?]\s', cleaned[:80])
        if sentence_end and sentence_end.start() > 15:
            return cleaned[:sentence_end.start() + 1]
        # Otherwise truncate at word boundary
        title = cleaned[:50]
        if len(cleaned) > 50:
            last_space = title.rfind(' ')
            if last_space > 20:
                title = title[:last_space]
            title += '...'
        return title

    return None


def build_timeline_data(conn, date_str, threshold_minutes):
    threshold_seconds = threshold_minutes * 60

    rows = query_all(conn, """
        SELECT
            m.session_id,
            m.timestamp,
            s.primary_ticket,
            s.working_branch,
            p.project_path
        FROM messages m
        JOIN sessions s ON m.session_id = s.session_id
        JOIN projects p ON s.project_id = p.id
        WHERE DATE(m.timestamp) = ?
          AND m.type IN ('user', 'assistant')
        ORDER BY m.session_id, m.timestamp
    """, (date_str,))

    if not rows:
        return None

    # Group timestamps by session
    sessions = defaultdict(lambda: {
        'timestamps': [], 'ticket': None, 'branch': None, 'project_path': None
    })
    for row in rows:
        sid = row['session_id']
        sessions[sid]['timestamps'].append(row['timestamp'])
        if row['primary_ticket']:
            sessions[sid]['ticket'] = row['primary_ticket']
        if row['working_branch']:
            sessions[sid]['branch'] = row['working_branch']
        if row['project_path']:
            sessions[sid]['project_path'] = row['project_path']

    # Build session data with active/idle periods
    timeline_sessions = []
    for sid, data in sessions.items():
        timestamps = sorted(data['timestamps'])
        parsed = [datetime.fromisoformat(t.replace('Z', '+00:00')) for t in timestamps]

        task_key = data['ticket'] or data['branch'] or 'unknown'
        project = project_short_name(data['project_path'])

        # Derive a display label for the row
        if data['ticket']:
            row_label = data['ticket']
        elif data['branch']:
            row_label = data['branch']
        else:
            # Try to derive from session content
            derived = derive_session_title(conn, sid)
            row_label = derived or f'{project} ({sid[:8]})'

        # Build periods (active vs idle)
        periods = []
        period_start = parsed[0]
        working_seconds = 0

        for i in range(1, len(parsed)):
            gap = (parsed[i] - parsed[i - 1]).total_seconds()
            if gap <= threshold_seconds:
                working_seconds += gap
            else:
                periods.append({
                    'start': period_start,
                    'end': parsed[i - 1],
                    'type': 'active',
                })
                periods.append({
                    'start': parsed[i - 1],
                    'end': parsed[i],
                    'type': 'idle',
                })
                period_start = parsed[i]

        # Final active period
        periods.append({
            'start': period_start,
            'end': parsed[-1],
            'type': 'active',
        })

        span_seconds = (parsed[-1] - parsed[0]).total_seconds()

        timeline_sessions.append({
            'session_id': sid[:8],
            'full_session_id': sid,
            'task_key': task_key,
            'ticket': data['ticket'],
            'branch': data['branch'],
            'project': project,
            'project_path': data['project_path'],
            'row_label': row_label,
            'start': parsed[0],
            'end': parsed[-1],
            'working_seconds': working_seconds,
            'span_seconds': span_seconds,
            'message_count': len(parsed),
            'periods': periods,
        })

    return timeline_sessions


def generate_html(sessions, date_str, threshold_minutes):
    # Find time bounds
    all_starts = [s['start'] for s in sessions]
    all_ends = [s['end'] for s in sessions]
    day_start_hour = min(s.hour for s in all_starts)
    day_end_hour = max(s.hour for s in all_ends) + 1

    # Color map by project
    project_color_map = {}
    # Assign colors to projects in order of first appearance
    for s in sorted(sessions, key=lambda x: x['start']):
        get_color(s['project'], project_color_map)

    # Group sessions by project, then sort within each project by start
    project_groups = defaultdict(list)
    for s in sessions:
        project_groups[s['project']].append(s)
    for proj in project_groups:
        project_groups[proj].sort(key=lambda x: x['start'])

    # Sort project groups by earliest start
    sorted_projects = sorted(project_groups.items(), key=lambda x: min(s['start'] for s in x[1]))

    # Build rows with project group headers
    rows_html = []
    row_index = 0

    for project_name, proj_sessions in sorted_projects:
        color = project_color_map[project_name]
        idle_color = hex_to_rgba(color, 0.25)

        # Project group header
        rows_html.append(f'''
            <div class="group-header" style="border-left: 4px solid {color};">
                <span class="group-name">{escape(project_name)}</span>
                <span class="group-count">{len(proj_sessions)} session(s)</span>
            </div>
        ''')

        for s in proj_sessions:
            bars = []
            for p in s['periods']:
                p_start_minutes = p['start'].hour * 60 + p['start'].minute + p['start'].second / 60
                p_end_minutes = p['end'].hour * 60 + p['end'].minute + p['end'].second / 60
                if p_end_minutes <= p_start_minutes:
                    p_end_minutes = p_start_minutes + 0.5

                left_pct = ((p_start_minutes - day_start_hour * 60) / ((day_end_hour - day_start_hour) * 60)) * 100
                width_pct = ((p_end_minutes - p_start_minutes) / ((day_end_hour - day_start_hour) * 60)) * 100
                width_pct = max(width_pct, 0.15)

                bar_color = color if p['type'] == 'active' else idle_color
                bar_class = 'active' if p['type'] == 'active' else 'idle'
                bars.append(
                    f'<div class="bar {bar_class}" style="left:{left_pct:.3f}%;width:{width_pct:.3f}%;background:{bar_color};"></div>'
                )

            working_hrs = s['working_seconds'] / 3600
            span_hrs = s['span_seconds'] / 3600
            start_str = s['start'].strftime('%H:%M')
            end_str = s['end'].strftime('%H:%M')
            branch_str = s['branch'] or 'N/A'
            ticket_str = s['ticket'] or 'None'

            tooltip = (
                f"Session: {s['session_id']}\\n"
                f"Project: {escape(s['project'])}\\n"
                f"Branch: {escape(branch_str)}\\n"
                f"Ticket: {escape(ticket_str)}\\n"
                f"Time: {start_str} - {end_str}\\n"
                f"Working: {working_hrs:.2f} hrs | Span: {span_hrs:.2f} hrs\\n"
                f"Messages: {s['message_count']}"
            )

            # Row label: branch or derived title, truncated
            label = s['row_label']
            if len(label) > 40:
                label = label[:37] + '...'
            label = escape(label)

            bg = '#f8f8f8' if row_index % 2 == 0 else '#ffffff'

            rows_html.append(f'''
                <div class="row" style="background:{bg};" title="{tooltip}">
                    <div class="label">{label}</div>
                    <div class="track">
                        {''.join(bars)}
                    </div>
                </div>
            ''')
            row_index += 1

    # Hour markers
    hour_markers = []
    for h in range(day_start_hour, day_end_hour + 1):
        left_pct = ((h - day_start_hour) / (day_end_hour - day_start_hour)) * 100
        display = f'{h:02d}:00'
        hour_markers.append(
            f'<div class="hour-mark" style="left:{left_pct:.2f}%;">'
            f'<div class="hour-line"></div>'
            f'<div class="hour-label">{display}</div>'
            f'</div>'
        )

    # Legend by project
    legend_items = []
    for project_name, proj_sessions in sorted_projects:
        color = project_color_map[project_name]
        total_working = sum(s['working_seconds'] for s in proj_sessions) / 3600
        total_span = sum(s['span_seconds'] for s in proj_sessions) / 3600
        legend_items.append(
            f'<div class="legend-item">'
            f'<div class="legend-swatch" style="background:{color};"></div>'
            f'<div class="legend-text">'
            f'<strong>{escape(project_name)}</strong>'
            f'<span class="legend-detail">Working: {total_working:.2f}h | Span: {total_span:.2f}h | {len(proj_sessions)} session(s)</span>'
            f'</div>'
            f'</div>'
        )

    total_working = sum(s['working_seconds'] for s in sessions) / 3600
    total_span = sum(s['span_seconds'] for s in sessions) / 3600

    html = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Session Timeline - {date_str}</title>
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #333; padding: 24px; }}
    h1 {{ font-size: 20px; margin-bottom: 4px; }}
    .subtitle {{ color: #666; font-size: 14px; margin-bottom: 20px; }}
    .totals {{ background: #f5f5f5; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 24px; font-size: 14px; }}
    .totals strong {{ color: #111; }}
    .timeline {{ border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }}
    .hour-axis {{ position: relative; height: 32px; background: #fafafa; border-bottom: 1px solid #e0e0e0; margin-left: 280px; }}
    .hour-mark {{ position: absolute; top: 0; height: 100%; }}
    .hour-line {{ position: absolute; left: 0; top: 0; width: 1px; height: 100%; background: #ddd; }}
    .hour-label {{ position: absolute; left: 4px; top: 8px; font-size: 11px; color: #888; white-space: nowrap; }}
    .group-header {{ display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #f0f4f8; font-size: 12px; font-weight: 600; border-bottom: 1px solid #e0e0e0; }}
    .group-name {{ color: #333; }}
    .group-count {{ color: #888; font-weight: 400; }}
    .row {{ display: flex; align-items: center; height: 28px; border-bottom: 1px solid #f0f0f0; cursor: default; }}
    .row:hover {{ background: #f0f7ff !important; }}
    .label {{ width: 280px; padding: 0 8px 0 20px; font-size: 11px; font-family: monospace; color: #555; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
    .track {{ position: relative; flex: 1; height: 100%; }}
    .bar {{ position: absolute; top: 4px; height: 20px; border-radius: 3px; min-width: 2px; }}
    .bar.active {{ opacity: 1; }}
    .bar.idle {{ opacity: 1; }}
    .legend {{ margin-top: 20px; display: flex; flex-wrap: wrap; gap: 16px; }}
    .legend-item {{ display: flex; align-items: center; gap: 8px; }}
    .legend-swatch {{ width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }}
    .legend-text {{ font-size: 13px; }}
    .legend-detail {{ color: #888; margin-left: 6px; }}
</style>
</head>
<body>
    <h1>Session Timeline &mdash; {date_str}</h1>
    <div class="subtitle">Idle threshold: {threshold_minutes} min &bull; {len(sessions)} sessions &bull; Solid = active, faded = idle</div>

    <div class="totals">
        <div><strong>Total Working:</strong> {total_working:.2f} hrs</div>
        <div><strong>Total Span:</strong> {total_span:.2f} hrs</div>
        <div><strong>Sessions:</strong> {len(sessions)}</div>
        <div><strong>Projects:</strong> {len(sorted_projects)}</div>
    </div>

    <div class="timeline">
        <div class="hour-axis">
            {''.join(hour_markers)}
        </div>
        {''.join(rows_html)}
    </div>

    <div class="legend">
        {''.join(legend_items)}
    </div>
</body>
</html>'''

    return html


def main():
    args = sys.argv[1:]
    if not args:
        print('Usage: python timeline.py <date> [--threshold=<minutes>]', file=sys.stderr)
        print('       python timeline.py today', file=sys.stderr)
        print('       python timeline.py yesterday', file=sys.stderr)
        sys.exit(1)

    if not database_exists():
        print(f'Database not found: {get_db_path()}', file=sys.stderr)
        sys.exit(1)

    # Parse args
    threshold_minutes = DEFAULT_IDLE_THRESHOLD_MINUTES
    date_arg = None
    for arg in args:
        if arg.startswith('--threshold='):
            try:
                threshold_minutes = int(arg.split('=')[1])
            except ValueError:
                print('Error: threshold must be an integer', file=sys.stderr)
                sys.exit(1)
        else:
            date_arg = arg

    date_str = resolve_date(date_arg or 'today')

    conn = open_database(readonly=True)
    sessions = build_timeline_data(conn, date_str, threshold_minutes)
    conn.close()

    if not sessions:
        print(f'No activity found for {date_str}.')
        sys.exit(0)

    html = generate_html(sessions, date_str, threshold_minutes)

    output_path = f'/tmp/timeline-{date_str}.html'
    with open(output_path, 'w') as f:
        f.write(html)

    print(f'Timeline written to {output_path}')

    # Copy to Windows-accessible path for WSL
    win_path = f'/mnt/c/Users/nitro/Downloads/timeline-{date_str}.html'
    try:
        import shutil
        shutil.copy2(output_path, win_path)
        print(f'Copied to {win_path}')
    except Exception:
        pass  # Not critical if Windows path isn't available


if __name__ == '__main__':
    main()
