#!/usr/bin/env python3
"""
Import Claude Code transcripts into the database.

Usage:
    python import_transcripts.py <project-path>     # Import single project
    python import_transcripts.py --all              # Import all projects
    python import_transcripts.py --list             # List known projects

Options:
    --force    Re-import all files (ignore last import time)
    --verbose  Show detailed progress
    --dry-run  Parse files but don't write to database
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Any, Tuple

from db_utils import (
    open_database,
    database_exists,
    get_db_path,
    query_all,
    query_one,
    execute,
    executemany
)

# Configuration
CLAUDE_PROJECTS_DIR = Path.home() / '.claude' / 'projects'

# Username for branch detection (customize as needed)
USERNAME = 'meckert'

# Branch patterns to skip (not primary working branches)
SKIP_BRANCH_PATTERNS = [
    re.compile(r'^project-'),
    re.compile(r'^target-version-'),
    re.compile(r'^staging$'),
    re.compile(r'^main$'),
    re.compile(r'^master$'),
    re.compile(r'^develop$'),
    re.compile(r'^dev$'),
]

# Ticket pattern (case-insensitive)
TICKET_PATTERN = re.compile(r'AILASUP-\d+', re.IGNORECASE)

# Slash command pattern for prep-ticket (inline format)
PREP_TICKET_PATTERN = re.compile(r'/prep-ticket\s+(AILASUP-\d+)', re.IGNORECASE)

# Slash command pattern for prep-ticket (XML format in transcripts)
# Matches: <command-name>/prep-ticket</command-name> ... <command-args>AILASUP-348</command-args>
PREP_TICKET_XML_PATTERN = re.compile(
    r'<command-name>/prep-ticket</command-name>.*?<command-args>(AILASUP-\d+)</command-args>',
    re.IGNORECASE | re.DOTALL
)

# Working branch pattern (username-ticket or username-ticket-description)
WORKING_BRANCH_PATTERN = re.compile(rf'^{USERNAME}-(AILASUP-\d+)(?:-.*)?$', re.IGNORECASE)


def parse_args() -> Dict[str, Any]:
    """Parse command line arguments."""
    args = sys.argv[1:]
    options = {
        'project_path': None,
        'all': False,
        'list': False,
        'force': False,
        'verbose': False,
        'dry_run': False,
    }

    for arg in args:
        if arg == '--all':
            options['all'] = True
        elif arg == '--list':
            options['list'] = True
        elif arg == '--force':
            options['force'] = True
        elif arg == '--verbose':
            options['verbose'] = True
        elif arg == '--dry-run':
            options['dry_run'] = True
        elif not arg.startswith('-'):
            options['project_path'] = arg

    return options


def path_to_transcript_dir(project_path: str) -> str:
    """Convert project path to transcript directory name."""
    return project_path.replace('/', '-')


def get_transcript_path(project_path: str) -> Path:
    """Get full transcript directory path."""
    transcript_dir = path_to_transcript_dir(project_path)
    return CLAUDE_PROJECTS_DIR / transcript_dir


def should_skip_branch(branch: Optional[str]) -> bool:
    """Check if a branch should be skipped."""
    if not branch:
        return True
    return any(pattern.search(branch) for pattern in SKIP_BRANCH_PATTERNS)


def detect_ticket_from_message(msg: Dict) -> List[Dict]:
    """Detect ticket references from a message."""
    results = []

    # Check for /prep-ticket slash command (highest priority)
    if msg.get('type') == 'user' and msg.get('message', {}).get('content'):
        content = msg['message']['content']
        if isinstance(content, list):
            content = json.dumps(content)

        # Try both inline and XML patterns for /prep-ticket
        prep_match = PREP_TICKET_PATTERN.search(content) or PREP_TICKET_XML_PATTERN.search(content)
        if prep_match:
            results.append({
                'ticket': prep_match.group(1).upper(),
                'source': 'slash_command',
                'priority': 1
            })

        # Check for ticket mentions in content
        for match in TICKET_PATTERN.finditer(content):
            results.append({
                'ticket': match.group(0).upper(),
                'source': 'content',
                'priority': 2
            })

    # Check branch for ticket pattern
    if msg.get('gitBranch'):
        branch_match = WORKING_BRANCH_PATTERN.search(msg['gitBranch'])
        if branch_match:
            results.append({
                'ticket': branch_match.group(1).upper(),
                'source': 'branch',
                'priority': 3
            })

    return results


def determine_working_branch(messages: List[Dict]) -> Optional[str]:
    """Determine the primary working branch for a session."""
    branch_counts: Dict[str, int] = {}

    for msg in messages:
        branch = msg.get('gitBranch')
        if branch and not should_skip_branch(branch):
            branch_counts[branch] = branch_counts.get(branch, 0) + 1

    # Prefer branches matching working pattern (username-ticket)
    for branch in branch_counts:
        if WORKING_BRANCH_PATTERN.search(branch):
            return branch

    # Fall back to most common non-skipped branch
    if branch_counts:
        return max(branch_counts, key=branch_counts.get)

    return None


def determine_primary_ticket(messages: List[Dict], working_branch: Optional[str]) -> Optional[str]:
    """Determine primary ticket for a session."""
    ticket_scores: Dict[str, int] = {}

    # Score from working branch (high priority)
    if working_branch:
        branch_match = WORKING_BRANCH_PATTERN.search(working_branch)
        if branch_match:
            ticket = branch_match.group(1).upper()
            ticket_scores[ticket] = ticket_scores.get(ticket, 0) + 100

    # Scan messages for ticket references
    # Find the first non-meta user message for bonus scoring
    first_user_msg = None
    for msg in messages:
        if msg.get('type') == 'user' and not msg.get('isMeta', False):
            first_user_msg = msg
            break

    for msg in messages:
        for detection in detect_ticket_from_message(msg):
            score = {1: 500, 2: 10, 3: 5}.get(detection['priority'], 5)
            # Bonus: +200 if /prep-ticket is in the first non-meta user message
            if detection['priority'] == 1 and first_user_msg and msg.get('uuid') == first_user_msg.get('uuid'):
                score += 200
            ticket_scores[detection['ticket']] = ticket_scores.get(detection['ticket'], 0) + score

    # Return highest scoring ticket
    if ticket_scores:
        return max(ticket_scores, key=ticket_scores.get)
    return None


def parse_transcript(file_path: Path, verbose: bool = False) -> Dict:
    """Parse a single JSONL transcript file."""
    messages = []
    summary = None
    custom_title = None
    slug = None
    has_compact_boundary = False
    has_subagents = False

    line_num = 0
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line_num += 1
            line = line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)

                # Extract summary
                if msg.get('type') == 'summary' and msg.get('summary'):
                    summary = msg['summary']

                # Extract custom title
                if msg.get('type') == 'custom-title' and msg.get('customTitle'):
                    custom_title = msg['customTitle']

                # Extract slug
                if msg.get('slug') and not slug:
                    slug = msg['slug']

                # Check for compaction
                if msg.get('type') == 'system' and msg.get('subtype') == 'compact_boundary':
                    has_compact_boundary = True

                # Check for sub-agents
                if msg.get('isSidechain') or msg.get('agentId'):
                    has_subagents = True

                # Store message data
                messages.append({
                    'uuid': msg.get('uuid') or f'line-{line_num}',
                    'type': msg.get('type'),
                    'subtype': msg.get('subtype'),
                    'timestamp': msg.get('timestamp'),
                    'parentUuid': msg.get('parentUuid'),
                    'gitBranch': msg.get('gitBranch'),
                    'cwd': msg.get('cwd'),
                    'version': msg.get('version'),
                    'isMeta': msg.get('isMeta', False),
                    'isSidechain': msg.get('isSidechain', False),
                    'isCompactSummary': msg.get('isCompactSummary', False),
                    'agentId': msg.get('agentId'),
                    'sourceToolAssistantUuid': msg.get('sourceToolAssistantUUID'),
                    'rawMessage': msg,
                })
            except json.JSONDecodeError as e:
                if verbose:
                    print(f'  Warning: Failed to parse line {line_num}: {e}', file=sys.stderr)

    return {
        'messages': messages,
        'summary': summary,
        'custom_title': custom_title,
        'slug': slug,
        'has_compact_boundary': has_compact_boundary,
        'has_subagents': has_subagents,
    }


def detect_forks(messages: List[Dict]) -> Dict:
    """Detect fork points in a session's message tree.

    Returns dict with:
        - fork_points: list of fork point dicts
        - fork_branch_uuids: set of UUIDs on secondary (non-primary) fork branches
        - fork_count: total forks (including progress)
        - real_fork_count: real conversation forks only
    """
    # Build parent_uuid -> [child_uuids] map
    children_map: Dict[str, List[str]] = {}
    msg_by_uuid: Dict[str, Dict] = {}

    for msg in messages:
        uuid = msg.get('uuid')
        parent = msg.get('parentUuid')
        if uuid:
            msg_by_uuid[uuid] = msg
        if parent and uuid:
            if parent not in children_map:
                children_map[parent] = []
            children_map[parent].append(uuid)

    # Find fork points (parents with >1 child)
    fork_points = []
    fork_branch_uuids: Set[str] = set()

    for parent_uuid, child_uuids in children_map.items():
        if len(child_uuids) < 2:
            continue

        # Determine fork type: progress/file-history-snapshot children aren't real forks
        parent_msg = msg_by_uuid.get(parent_uuid, {})
        is_progress_fork = all(
            msg_by_uuid.get(c, {}).get('type') in ('progress', 'file_history_snapshot')
            for c in child_uuids[1:]  # Check non-first children
        )
        fork_type = 'progress' if is_progress_fork else 'real'

        # Count descendants for each child branch
        def count_descendants(start_uuid: str) -> int:
            count = 0
            stack = [start_uuid]
            while stack:
                current = stack.pop()
                count += 1
                stack.extend(children_map.get(current, []))
            return count

        branch_info = []
        for child_uuid in child_uuids:
            desc_count = count_descendants(child_uuid)
            branch_info.append((child_uuid, desc_count))

        # Sort by descendant count (primary = most descendants)
        branch_info.sort(key=lambda x: x[1], reverse=True)

        primary_child, primary_desc = branch_info[0]
        secondary_child, secondary_desc = branch_info[1] if len(branch_info) > 1 else (None, 0)

        fork_points.append({
            'fork_uuid': parent_uuid,
            'fork_type': fork_type,
            'primary_child_uuid': primary_child,
            'secondary_child_uuid': secondary_child,
            'primary_descendants': primary_desc,
            'secondary_descendants': secondary_desc,
        })

        # Mark secondary branch UUIDs (all non-primary children and their descendants)
        if fork_type == 'real':
            for child_uuid, _ in branch_info[1:]:
                stack = [child_uuid]
                while stack:
                    current = stack.pop()
                    fork_branch_uuids.add(current)
                    stack.extend(children_map.get(current, []))

    fork_count = len(fork_points)
    real_fork_count = sum(1 for fp in fork_points if fp['fork_type'] == 'real')

    return {
        'fork_points': fork_points,
        'fork_branch_uuids': fork_branch_uuids,
        'fork_count': fork_count,
        'real_fork_count': real_fork_count,
    }


def extract_content_preview(msg: Dict, max_length: int = 500) -> Optional[str]:
    """Extract content preview from a message."""
    content = msg.get('rawMessage', {}).get('message', {}).get('content')
    if not content:
        return None

    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        text_blocks = [b.get('text', '') for b in content if b.get('type') == 'text']
        text = '\n'.join(text_blocks)
    else:
        text = json.dumps(content)

    return text[:max_length] if len(text) > max_length else text


def extract_content_length(msg: Dict) -> int:
    """Extract content length from a message."""
    content = msg.get('rawMessage', {}).get('message', {}).get('content')
    if not content:
        return 0

    if isinstance(content, str):
        return len(content)
    elif isinstance(content, list):
        return len(json.dumps(content))
    return 0


def import_project(conn, project_path: str, options: Dict) -> Dict:
    """Import a single project's transcripts."""
    force = options['force']
    verbose = options['verbose']
    dry_run = options['dry_run']

    transcript_dir = path_to_transcript_dir(project_path)
    full_path = get_transcript_path(project_path)

    if not full_path.exists():
        print(f'Transcript directory not found: {full_path}', file=sys.stderr)
        return {'success': False, 'error': 'Directory not found'}

    print(f'\nImporting: {project_path}')
    print(f'  Transcript dir: {full_path}')

    # Get or create project record
    project = query_one(conn, 'SELECT * FROM projects WHERE project_path = ?', (project_path,))

    if not project and not dry_run:
        execute(conn, '''
            INSERT INTO projects (project_path, transcript_dir, full_transcript_path)
            VALUES (?, ?, ?)
        ''', (project_path, transcript_dir, str(full_path)))
        conn.commit()
        project = query_one(conn, 'SELECT * FROM projects WHERE project_path = ?', (project_path,))

    project_id = project['id'] if project else 0
    last_import = None
    if project and project['last_import_at']:
        last_import = datetime.fromisoformat(project['last_import_at'].replace('Z', '+00:00'))

    # Find transcript files
    files = []
    for f in full_path.iterdir():
        if f.suffix == '.jsonl' and not f.name.startswith('agent-'):
            stat = f.stat()
            files.append({
                'name': f.name,
                'path': f,
                'session_id': f.stem,
                'size': stat.st_size,
                'mtime': datetime.fromtimestamp(stat.st_mtime),
            })

    print(f'  Found {len(files)} transcript files')

    # Filter to files that need importing
    if force:
        to_import = files
    else:
        to_import = [f for f in files if not last_import or f['mtime'] > last_import]

    if not to_import:
        print('  No new files to import')
        return {'success': True, 'files_processed': 0, 'files_skipped': len(files)}

    print(f'  Processing {len(to_import)} files ({len(files) - len(to_import)} skipped)')

    # Create import log entry
    import_log_id = None
    if not dry_run:
        cursor = execute(conn, 'INSERT INTO import_log (project_id) VALUES (?)', (project_id,))
        import_log_id = cursor.lastrowid
        conn.commit()

    files_processed = 0
    messages_imported = 0
    errors = []

    for file_info in to_import:
        if verbose:
            print(f"  Parsing {file_info['session_id'][:8]}... ", end='', flush=True)

        try:
            data = parse_transcript(file_info['path'], verbose)

            # Filter to messages with timestamps
            timed_messages = [m for m in data['messages'] if m['timestamp']]
            user_messages = [m for m in timed_messages if m['type'] == 'user' and not m['isMeta']]
            assistant_messages = [m for m in timed_messages if m['type'] == 'assistant']

            # Determine working branch and primary ticket
            working_branch = determine_working_branch(data['messages'])
            primary_ticket = determine_primary_ticket(data['messages'], working_branch)

            # Calculate time bounds
            timestamps = sorted([datetime.fromisoformat(m['timestamp'].replace('Z', '+00:00'))
                                for m in timed_messages])
            first_message = timestamps[0].isoformat() if timestamps else None
            last_message = timestamps[-1].isoformat() if timestamps else None

            # Count tool uses
            tool_use_count = 0
            for msg in data['messages']:
                if msg['type'] == 'assistant':
                    content = msg.get('rawMessage', {}).get('message', {}).get('content', [])
                    if isinstance(content, list):
                        tool_use_count += sum(1 for b in content if b.get('type') == 'tool_use')

            # Detect forks
            fork_data = detect_forks(data['messages'])

            if not dry_run:
                # Insert session
                execute(conn, '''
                    INSERT OR REPLACE INTO sessions (
                        session_id, project_id, file_path, file_size, file_modified_at,
                        working_branch, primary_ticket, summary, custom_title, slug,
                        first_message_at, last_message_at,
                        message_count, user_message_count, assistant_message_count, tool_use_count,
                        fork_count, real_fork_count,
                        is_compacted, has_subagents, last_updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ''', (
                    file_info['session_id'],
                    project_id,
                    str(file_info['path']),
                    file_info['size'],
                    file_info['mtime'].isoformat(),
                    working_branch,
                    primary_ticket,
                    data['summary'],
                    data['custom_title'],
                    data['slug'],
                    first_message,
                    last_message,
                    len(data['messages']),
                    len(user_messages),
                    len(assistant_messages),
                    tool_use_count,
                    fork_data['fork_count'],
                    fork_data['real_fork_count'],
                    1 if data['has_compact_boundary'] else 0,
                    1 if data['has_subagents'] else 0,
                ))

                # Insert messages
                for msg in data['messages']:
                    is_fork = 1 if msg.get('uuid') in fork_data['fork_branch_uuids'] else 0
                    execute(conn, '''
                        INSERT OR IGNORE INTO messages (
                            uuid, session_id, parent_uuid, type, subtype, timestamp,
                            git_branch, cwd, version, is_meta, is_sidechain, is_compact_summary,
                            agent_id, content_preview, content_length, source_tool_assistant_uuid,
                            is_fork_branch
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        msg['uuid'],
                        file_info['session_id'],
                        msg['parentUuid'],
                        msg['type'],
                        msg['subtype'],
                        msg['timestamp'],
                        msg['gitBranch'],
                        msg['cwd'],
                        msg['version'],
                        1 if msg['isMeta'] else 0,
                        1 if msg['isSidechain'] else 0,
                        1 if msg['isCompactSummary'] else 0,
                        msg['agentId'],
                        extract_content_preview(msg),
                        extract_content_length(msg),
                        msg['sourceToolAssistantUuid'],
                        is_fork,
                    ))
                    messages_imported += 1

                # Insert fork points
                for fp in fork_data['fork_points']:
                    execute(conn, '''
                        INSERT OR IGNORE INTO fork_points (
                            session_id, fork_uuid, fork_type,
                            primary_child_uuid, secondary_child_uuid,
                            primary_descendants, secondary_descendants
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        file_info['session_id'],
                        fp['fork_uuid'],
                        fp['fork_type'],
                        fp['primary_child_uuid'],
                        fp['secondary_child_uuid'],
                        fp['primary_descendants'],
                        fp['secondary_descendants'],
                    ))

                # Insert ticket references
                # Track (ticket_key, source) to allow all sources to be recorded
                tickets_seen: Set[Tuple[str, str]] = set()
                for msg in data['messages']:
                    for detection in detect_ticket_from_message(msg):
                        ticket = detection['ticket']
                        source = detection['source']
                        key = (ticket, source)
                        if key not in tickets_seen:
                            tickets_seen.add(key)
                            execute(conn, '''
                                INSERT OR IGNORE INTO tickets (session_id, ticket_key, source, detected_at, is_primary)
                                VALUES (?, ?, ?, ?, ?)
                            ''', (
                                file_info['session_id'],
                                ticket,
                                source,
                                msg['timestamp'],
                                1 if ticket == primary_ticket else 0,
                            ))

                conn.commit()

            files_processed += 1
            if verbose:
                print(f"{len(data['messages'])} messages, branch: {working_branch or 'none'}, ticket: {primary_ticket or 'none'}")

        except Exception as e:
            errors.append(f"{file_info['name']}: {e}")
            if verbose:
                print(f'ERROR: {e}')

    # Update import log
    if not dry_run and import_log_id:
        execute(conn, '''
            UPDATE import_log
            SET completed_at = datetime('now'),
                files_processed = ?,
                files_skipped = ?,
                messages_imported = ?,
                errors = ?
            WHERE id = ?
        ''', (
            files_processed,
            len(files) - len(to_import),
            messages_imported,
            json.dumps(errors) if errors else None,
            import_log_id,
        ))

        # Update project last import time
        execute(conn, 'UPDATE projects SET last_import_at = datetime("now") WHERE id = ?', (project_id,))
        conn.commit()

    print(f'  Completed: {files_processed} files, {messages_imported} messages')
    if errors:
        print(f'  Errors: {len(errors)}')

    return {
        'success': True,
        'files_processed': files_processed,
        'files_skipped': len(files) - len(to_import),
        'messages_imported': messages_imported,
        'errors': errors,
    }


def discover_projects() -> List[Dict]:
    """Discover all projects with transcripts."""
    if not CLAUDE_PROJECTS_DIR.exists():
        return []

    projects = []
    for entry in CLAUDE_PROJECTS_DIR.iterdir():
        if entry.is_dir():
            # Convert back to project path
            project_path = entry.name.replace('-', '/', 1).replace('-', '/')
            if entry.name.startswith('-'):
                project_path = '/' + project_path[1:]
            projects.append({
                'transcript_dir': entry.name,
                'project_path': project_path,
                'full_path': entry,
            })

    return projects


def main():
    options = parse_args()

    # Handle --list
    if options['list']:
        projects = discover_projects()
        print(f'Found {len(projects)} projects with transcripts:\n')
        for p in projects:
            file_count = sum(1 for f in p['full_path'].iterdir() if f.suffix == '.jsonl')
            print(f"  {p['project_path']}")
            print(f'    Files: {file_count}')
        return

    # Validate arguments
    if not options['all'] and not options['project_path']:
        print('Usage: python import_transcripts.py <project-path>', file=sys.stderr)
        print('       python import_transcripts.py --all', file=sys.stderr)
        print('       python import_transcripts.py --list', file=sys.stderr)
        print('\nOptions:', file=sys.stderr)
        print('  --force    Re-import all files', file=sys.stderr)
        print('  --verbose  Show detailed progress', file=sys.stderr)
        print('  --dry-run  Parse files but don\'t write to database', file=sys.stderr)
        sys.exit(1)

    # Check database exists
    if not database_exists():
        print(f'Database not found: {get_db_path()}', file=sys.stderr)
        print('Run: python scripts/create_db.py', file=sys.stderr)
        sys.exit(1)

    # Open database
    conn = open_database()

    try:
        # Import projects
        if options['all']:
            projects = discover_projects()
            print(f'Importing {len(projects)} projects...')

            for p in projects:
                import_project(conn, p['project_path'], options)
        else:
            import_project(conn, options['project_path'], options)

    except Exception as e:
        print(f'Import failed: {e}', file=sys.stderr)
        if options['verbose']:
            import traceback
            traceback.print_exc()
        sys.exit(1)

    # Show summary
    if not options['dry_run']:
        projects = query_one(conn, 'SELECT COUNT(*) as count FROM projects')
        sessions = query_one(conn, 'SELECT COUNT(*) as count FROM sessions')
        messages = query_one(conn, 'SELECT COUNT(*) as count FROM messages')
        tickets = query_one(conn, 'SELECT COUNT(DISTINCT ticket_key) as count FROM tickets')

        print('\n=== Database Summary ===')
        print(f"  Projects: {projects['count']}")
        print(f"  Sessions: {sessions['count']}")
        print(f"  Messages: {messages['count']}")
        print(f"  Unique tickets: {tickets['count']}")

    conn.close()
    print('\nImport complete!')


if __name__ == '__main__':
    main()
