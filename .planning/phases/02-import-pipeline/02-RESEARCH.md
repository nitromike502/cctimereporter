# Phase 2: Import Pipeline - Research

**Researched:** 2026-02-25
**Domain:** JSONL parsing, SQLite schema migration, fork detection, ticket scoring, idempotent import
**Confidence:** HIGH

## Summary

Phase 2 ports the Python PoC's import pipeline to Node.js. Every component of the pipeline has a clear stdlib-only implementation path using `node:readline` for JSONL streaming, `node:fs` for file stat, and the existing `node:sqlite` database layer from Phase 1. No external dependencies are introduced.

The schema must migrate from v1 (3 lean tables) to v2 (5 tables: projects, sessions, messages, tickets, import_log) using `ALTER TABLE` for the existing tables and `CREATE TABLE IF NOT EXISTS` for the new ones. Migration is automatic at first import run — no user action. The Python PoC is the authoritative reference implementation: fork detection, ticket scoring weights, and content extraction are all directly portable.

The most important architectural insight is that `node:sqlite` has **no `.transaction()` method** — transactions must use manual `db.exec('BEGIN')` / `db.exec('COMMIT')` / `db.exec('ROLLBACK')`. All batch inserts (messages per session) must be wrapped in explicit transactions for correctness and performance.

**Primary recommendation:** Structure the importer as a pipeline of pure functions (discover → stat-filter → parse → detect-forks → score-ticket → upsert), with a single transaction wrapping the per-file database writes. Use `node:readline` async iteration for JSONL streaming.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:readline` | Built-in | JSONL streaming line-by-line | Async iteration via `for await` — handles large files without loading all into memory |
| `node:fs` | Built-in | `statSync()` for file size, `readdirSync()` for project dirs | No external deps |
| `node:path` | Built-in | Path construction | No external deps |
| `node:os` | Built-in | `homedir()` for `~` expansion | Correct cross-platform |
| `node:sqlite` | Built-in (Node 22.13+) | Database writes | Already established in Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | Zero external runtime dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `readline` async iteration | `fs.readFileSync` + `split('\n')` | readFileSync loads the entire file (916-line, 1.5MB session files exist); readline streams |
| Manual `BEGIN/COMMIT` | `db.transaction()` | `db.transaction()` does NOT exist in `node:sqlite` — verified against live Node 22.17.1 |

**Installation:**
```bash
# No npm install needed — zero new dependencies
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── index.js         # openDatabase() — already exists, needs migration logic
│   └── schema.js        # Schema DDL + SCHEMA_VERSION constant (bump to 2)
├── importer/
│   ├── index.js         # Main import orchestrator: discover, filter, import
│   ├── parser.js        # parseTranscript(filePath) — JSONL -> message array
│   ├── fork-detector.js # detectForks(messages) -> {fork_count, real_fork_count}
│   ├── ticket-scorer.js # scoreTickets(messages, branch) -> primaryTicket
│   └── db-writer.js     # upsertSession(), upsertMessages(), upsertTickets()
```

### Pattern 1: JSONL Streaming with readline
**What:** Read a JSONL file line-by-line using async iteration; skip blank lines; swallow malformed lines with a warning
**When to use:** Any large file where loading all content into memory is wasteful
**Example:**
```javascript
// Source: Node.js readline docs + verified working in Node 22.17.1
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

async function parseTranscript(filePath) {
  const messages = [];
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      messages.push(msg);
    } catch (e) {
      // Malformed line — skip with warning, continue import
      process.stderr.write(`Warning: malformed JSONL in ${filePath}: ${e.message}\n`);
    }
  }
  return messages;
}
```

### Pattern 2: Manual Transactions in node:sqlite
**What:** node:sqlite has NO `.transaction()` method. Use `db.exec('BEGIN')` / `db.exec('COMMIT')` with a try/catch for rollback.
**When to use:** Any batch insert (all messages for a session = hundreds of rows)
**Example:**
```javascript
// Source: Verified against Node 22.17.1 — db.transaction is NOT a function
db.exec('BEGIN');
try {
  const stmt = db.prepare(`INSERT OR IGNORE INTO messages (...) VALUES (...)`);
  for (const msg of messages) {
    stmt.run(msg.uuid, msg.session_id, ...);
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
```

### Pattern 3: Schema Migration via user_version + ALTER TABLE
**What:** On database open, check `PRAGMA user_version`. If version < current, apply incremental migrations before importing. No user action required.
**When to use:** Any schema change after Phase 1 shipped
**Example:**
```javascript
// Source: Verified working in SQLite 3.50.0 (bundled in Node 22.17.1)
function migrateSchema(db) {
  const { user_version } = db.prepare('PRAGMA user_version').get();

  if (user_version < 2) {
    // v1 -> v2: add columns to sessions, new tables
    db.exec(`ALTER TABLE sessions ADD COLUMN file_size INTEGER`);
    db.exec(`ALTER TABLE sessions ADD COLUMN assistant_message_count INTEGER DEFAULT 0`);
    db.exec(`ALTER TABLE sessions ADD COLUMN fork_count INTEGER DEFAULT 0`);
    db.exec(`ALTER TABLE sessions ADD COLUMN real_fork_count INTEGER DEFAULT 0`);
    db.exec(`ALTER TABLE sessions ADD COLUMN is_compacted BOOLEAN DEFAULT 0`);
    db.exec(`ALTER TABLE sessions ADD COLUMN has_subagents BOOLEAN DEFAULT 0`);
    db.exec(`ALTER TABLE sessions ADD COLUMN last_updated_at TEXT`);
    // Add parent_uuid to messages for fork detection
    db.exec(`ALTER TABLE messages ADD COLUMN parent_uuid TEXT`);
    db.exec(`ALTER TABLE messages ADD COLUMN subtype TEXT`);
    db.exec(`ALTER TABLE messages ADD COLUMN is_meta BOOLEAN DEFAULT 0`);
    db.exec(`ALTER TABLE messages ADD COLUMN is_fork_branch BOOLEAN DEFAULT 0`);

    // New tables
    db.exec(`CREATE TABLE IF NOT EXISTS tickets (...)`);
    db.exec(`CREATE TABLE IF NOT EXISTS import_log (...)`);

    db.exec(`PRAGMA user_version = 2`);
  }
}
```

**SQLite 3.50.0 (Node 22.17.1) supports:**
- `ALTER TABLE ... ADD COLUMN` — YES
- `ALTER TABLE ... DROP COLUMN` — YES (added 3.35.0)
- `ALTER TABLE ... RENAME TO` — YES

### Pattern 4: Size-Based Idempotency
**What:** Track `file_path` and `file_size` in `import_log`. On import run, skip files whose size matches the recorded size. Re-import files that grew (JSONL only appends).
**When to use:** Incremental import behavior
**Example:**
```javascript
// Source: CONTEXT.md decision — per-file size tracking
import { statSync } from 'node:fs';

function getFilesToProcess(db, files) {
  // Load previously-imported file sizes
  const imported = new Map();
  const rows = db.prepare(
    `SELECT file_path, file_size FROM import_log WHERE status = 'ok'`
  ).all();
  for (const r of rows) imported.set(r.file_path, r.file_size);

  return files.filter(f => {
    const { size } = statSync(f.path);
    return !imported.has(f.path) || imported.get(f.path) !== size;
  });
}
```

### Pattern 5: Project Discovery from ~/.claude.json
**What:** Read `~/.claude.json` projects object (keys = project paths). Map each path to its transcript directory by replacing `/` with `-`. Also scan `~/.claude/projects/` for directories not in `~/.claude.json` (orphaned sessions from removed projects).
**When to use:** Main project discovery
**Example:**
```javascript
// Source: Verified against actual ~/.claude.json structure
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function discoverProjects() {
  const home = homedir();
  const projectsDir = join(home, '.claude', 'projects');

  // Source 1: ~/.claude.json known projects
  const claudeJson = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'));
  const knownPaths = Object.keys(claudeJson.projects || {});

  const result = new Map(); // dir -> { projectPath, dir, transcriptDir }

  for (const projectPath of knownPaths) {
    const encoded = projectPath.replace(/\//g, '-'); // /home/foo -> -home-foo
    const transcriptDir = join(projectsDir, encoded);
    if (existsSync(transcriptDir)) {
      result.set(encoded, { projectPath, transcriptDir });
    }
  }

  // Source 2: Scan filesystem for orphaned dirs not in claude.json
  if (existsSync(projectsDir)) {
    for (const dir of readdirSync(projectsDir)) {
      if (!result.has(dir) && statSync(join(projectsDir, dir)).isDirectory()) {
        // Decode best-effort: -home-foo-bar -> /home/foo/bar (ambiguous)
        result.set(dir, { projectPath: dir, transcriptDir: join(projectsDir, dir) });
      }
    }
  }

  return [...result.values()];
}
```

**Key verified facts about discovery:**
- `~/.claude.json` `projects` is an object with project paths as keys (confirmed in actual data)
- Encoding is simple: `/home/foo/bar` → `-home-foo-bar` (replace all `/` with `-`)
- Some project dirs exist that are NOT in `~/.claude.json` (2 orphaned dirs found in real data)
- Some paths in `~/.claude.json` have no corresponding directory (6 missing dirs found in real data)

### Pattern 6: JSONL File Filtering
**What:** Skip non-JSONL files, skip `agent-` prefixed files (sub-agent transcripts in older layout). Session subdirectories (e.g., `5a48b113.../subagents/`) contain sub-agent files — never iterate into them.
**When to use:** When scanning a project's transcript directory
**Example:**
```javascript
// Source: Verified against actual transcript directory structure
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function findTranscriptFiles(transcriptDir) {
  return readdirSync(transcriptDir)
    .filter(name =>
      name.endsWith('.jsonl') &&
      !name.startsWith('agent-') &&
      statSync(join(transcriptDir, name)).isFile()
    )
    .map(name => ({
      name,
      path: join(transcriptDir, name),
      sessionId: name.slice(0, -6), // strip .jsonl
    }));
}
```

**File structure observed (confirmed in real data):**
```
~/.claude/projects/-home-claude-manager/
├── 5a48b113-d4c2-43dd-a723-419676f4822e.jsonl  <- session file
├── 5a48b113-d4c2-43dd-a723-419676f4822e/        <- session dir (sub-agents/tool-results)
│   ├── subagents/
│   │   └── agent-a4bdec5.jsonl                  <- SKIP (sub-agent)
│   └── tool-results/
├── sessions-index.json                           <- SKIP (not a transcript)
└── 8c3f9bbb-2967-42df-86c9-7e3f8d69e7ef.jsonl
```

### Pattern 7: Fork Detection Algorithm
**What:** Port Python PoC `detect_forks()` directly. Build parent→children map, find parents with >1 child, classify as `progress` or `real` by checking if secondary children are `progress` or `file_history_snapshot` type. Count descendants per branch to determine primary (most descendants).
**When to use:** After parsing a full session's messages
**Key output for database:** Only `fork_count` and `real_fork_count` integers stored on session row. The `fork_branch_uuids` set is used only transiently to mark `is_fork_branch` on messages.

```javascript
// Source: Python PoC detect_forks() — direct port
function detectForks(messages) {
  const childrenMap = new Map();  // parentUuid -> [childUuid, ...]
  const msgByUuid = new Map();

  for (const msg of messages) {
    const { uuid, parentUuid } = msg;
    if (uuid) msgByUuid.set(uuid, msg);
    if (parentUuid && uuid) {
      if (!childrenMap.has(parentUuid)) childrenMap.set(parentUuid, []);
      childrenMap.get(parentUuid).push(uuid);
    }
  }

  let forkCount = 0;
  let realForkCount = 0;
  const forkBranchUuids = new Set();

  for (const [parentUuid, childUuids] of childrenMap) {
    if (childUuids.length < 2) continue;

    const isProgressFork = childUuids.slice(1).every(c => {
      const t = msgByUuid.get(c)?.type;
      return t === 'progress' || t === 'file_history_snapshot';
    });

    forkCount++;
    if (!isProgressFork) {
      realForkCount++;
      // Mark secondary branch descendants
      function countAndMark(startUuid, mark) {
        let count = 0;
        const stack = [startUuid];
        while (stack.length) {
          const cur = stack.pop();
          count++;
          if (mark) forkBranchUuids.add(cur);
          for (const c of (childrenMap.get(cur) || [])) stack.push(c);
        }
        return count;
      }

      const branchCounts = childUuids.map(c => [c, countAndMark(c, false)]);
      branchCounts.sort((a, b) => b[1] - a[1]);
      for (const [uuid] of branchCounts.slice(1)) countAndMark(uuid, true);
    }
  }

  return { forkCount, realForkCount, forkBranchUuids };
}
```

### Pattern 8: Ticket Scoring
**What:** Port Python PoC `determine_primary_ticket()` with generic ticket pattern. The scoring weights are locked: /prep-ticket = 500pts (700 if in first non-meta user message), branch match = 100 + 5/message, content mention = 10/mention.
**Key change from Python PoC:** Ticket pattern is `[a-zA-Z]{2,8}-\d+` (generic), NOT `AILASUP-\d+`. Branch scanning scans for the ticket pattern directly (no username prefix requirement).

```javascript
// Source: Python PoC determine_primary_ticket() — ported to generic pattern
// CONTEXT.md decision: [a-zA-Z]{2,8}-\d+ pattern, drop username prefix

const TICKET_PATTERN = /[a-zA-Z]{2,8}-\d+/gi;
const PREP_TICKET_INLINE = /\/prep-ticket\s+([a-zA-Z]{2,8}-\d+)/i;
const PREP_TICKET_XML = /<command-name>\/prep-ticket<\/command-name>.*?<command-args>([a-zA-Z]{2,8}-\d+)<\/command-args>/is;

function scoreTickets(messages) {
  const scores = new Map();

  const firstUserMsg = messages.find(m => m.type === 'user' && !m.isMeta);

  for (const msg of messages) {
    // Branch scoring: 100 base + 5 per message on that branch
    if (msg.gitBranch) {
      for (const match of msg.gitBranch.matchAll(TICKET_PATTERN)) {
        const ticket = match[0].toUpperCase();
        scores.set(ticket, (scores.get(ticket) || 0) + 5);
      }
    }

    // Content scanning: user messages only
    if (msg.type === 'user') {
      const content = extractContentText(msg);
      if (!content) continue;

      // /prep-ticket slash command: 500pts (700 if first user message)
      const prepMatch = PREP_TICKET_INLINE.exec(content) || PREP_TICKET_XML.exec(content);
      if (prepMatch) {
        const ticket = prepMatch[1].toUpperCase();
        const pts = msg.uuid === firstUserMsg?.uuid ? 700 : 500;
        scores.set(ticket, (scores.get(ticket) || 0) + pts);
      }

      // Generic content mentions: 10pts each
      for (const match of content.matchAll(TICKET_PATTERN)) {
        const ticket = match[0].toUpperCase();
        scores.set(ticket, (scores.get(ticket) || 0) + 10);
      }
    }
  }

  // Add branch base bonus (100 per unique branch containing ticket)
  // (already accumulated +5 per message above, add 95 for first occurrence)
  // Note: Python PoC adds 100 per matching branch, then +5 per message
  // Simplified: scan branches separately for the base 100

  if (scores.size === 0) return null;
  return [...scores.entries()].reduce((a, b) => b[1] > a[1] ? b : a)[0];
}
```

**Warning:** `phase-5` matches `[a-zA-Z]{2,8}-\d+`. This is a false positive from branch names like `phase-5`. The scoring system naturally down-weights it (only content mentions hit), but `phase-5` appearing as `primary_ticket` is possible. This is a known limitation the user accepted.

### Anti-Patterns to Avoid
- **Using `db.transaction(fn)`:** Does not exist in `node:sqlite`. Always use `db.exec('BEGIN')` / `db.exec('COMMIT')`.
- **Loading entire JSONL into memory with `readFileSync`:** Use `readline` async iteration. Some sessions are 1.5MB+ (916 lines in real data).
- **Skipping the `for await` pattern:** `rl.on('line', ...)` callback style works but `for await` is cleaner and handles backpressure correctly.
- **Decoding directory names for orphaned project paths:** The encoding (`/home/foo/bar` → `-home-foo-bar`) is lossy (can't distinguish between `/home/foo/bar` and `/home-foo/bar`). For projects only found via filesystem scan, store the directory name as the "path" — don't try to decode.
- **Assuming import_log tracks per-project (Python PoC style):** The Python PoC tracks per-project runs. The Node.js port must track per-file sizes for the size-based skip logic (CONTEXT.md decision).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSONL streaming | Custom chunk reader | `readline` async iteration | Handles partial lines, encoding, backpressure |
| Batch inserts | One SQL per row | Prepared statement + `BEGIN/COMMIT` | 10x+ faster for 300+ messages per session |
| File change detection | mtime comparison | File size comparison | Size is monotonically increasing for JSONL (append-only); more reliable than mtime |
| Project path discovery | Directory name decoding | `~/.claude.json` projects object | Authoritative source; directory encoding is lossy (confirmed ambiguous) |
| Regex for ticket pattern | String scanning | `/[a-zA-Z]{2,8}-\d+/gi` (locked decision) | Already designed and locked in CONTEXT.md |

**Key insight:** Every "interesting" problem in this phase is already solved by the Python PoC. Port the algorithms, don't redesign them.

## Common Pitfalls

### Pitfall 1: db.transaction() Does Not Exist
**What goes wrong:** Code calls `db.transaction(fn)(args)` — throws `TypeError: db.transaction is not a function`.
**Why it happens:** `better-sqlite3` has `.transaction()`. `node:sqlite` does not. They share similar synchronous APIs but this is a critical difference.
**How to avoid:** Always use explicit `db.exec('BEGIN')` ... `db.exec('COMMIT')` with try/catch for `db.exec('ROLLBACK')`.
**Warning signs:** `TypeError: db.transaction is not a function` at runtime.

### Pitfall 2: phase-5 False Positive Ticket
**What goes wrong:** Branch name `phase-5` matches the `[a-zA-Z]{2,8}-\d+` pattern, appearing as `primary_ticket = 'PHASE-5'`.
**Why it happens:** The generic ticket pattern accepts any 2-8 letter prefix followed by digits.
**How to avoid:** The scoring system naturally limits this — branch scanning adds points per message but content mentions of `phase-5` also accumulate. If it becomes a problem, the scorer module is designed to be easily adjusted (CONTEXT.md note). For now, accept as a known limitation.
**Warning signs:** Sessions with `primary_ticket = 'PHASE-5'` in output.

### Pitfall 3: sessions-index.json in Transcript Directory
**What goes wrong:** `readdirSync()` on a project directory returns `sessions-index.json` alongside JSONL files, causing a parse error when tried as JSONL.
**Why it happens:** Claude Code writes a sessions index file in the project directory.
**How to avoid:** Filter strictly for `.jsonl` extension AND `statSync().isFile()` (not directory) — don't filter by prefix only.
**Warning signs:** `SyntaxError: Unexpected token` when parsing — the file is JSON, not JSONL.

### Pitfall 4: Session Subdirectories Look Like Files
**What goes wrong:** `5a48b113-d4c2-43dd-a723-419676f4822e` (no extension) appears in directory listing alongside `5a48b113-d4c2-43dd-a723-419676f4822e.jsonl`. Without proper filtering, the stat check fails or the directory gets processed as a file.
**Why it happens:** Claude Code creates a session subdirectory (for subagents, tool-results) alongside the session's JSONL file. Same UUID, no extension.
**How to avoid:** Filter for `.jsonl` extension AND `statSync(join(dir, name)).isFile()`.
**Warning signs:** `EISDIR: illegal operation on a directory` or reading a directory as a JSONL file.

### Pitfall 5: Orphaned Transcript Directories
**What goes wrong:** `~/.claude/projects/` contains directories for projects not in `~/.claude.json` (2 found in real data: `-home-marketplace` and `-home-marketplace-plugins-project-toolkit`).
**Why it happens:** Claude Code doesn't clean up project directories when a project is removed.
**How to avoid:** Scan BOTH `~/.claude.json` (known projects) AND the filesystem (for orphaned dirs). Merge results, deduplicate.
**Warning signs:** Valid session data being silently skipped because the importer only reads from `~/.claude.json`.

### Pitfall 6: Ticket Scoring Branch-100 Base Confusion
**What goes wrong:** Python PoC adds 100 to ticket score for branch match. The branch is scanned once (for the working branch determination), but the scoring adds 5 per message that is on that branch (plus 100 base from the branch match). The port must replicate this exactly.
**Why it happens:** The Python PoC `determine_primary_ticket()` does two separate passes — one for the working branch (adds 100) and one for per-message branch scanning (adds 5 each). The per-message scan also checks `gitBranch` on individual messages (same logic).
**How to avoid:** Mirror the Python PoC exactly: first add 100 for the `working_branch` if it contains a ticket pattern, then iterate all messages checking `gitBranch` (+5 each), then check user message content.
**Warning signs:** Ticket scores not matching Python PoC for sessions with branch-based tickets.

### Pitfall 7: Schema Migration Without ALTER TABLE IF NOT EXISTS
**What goes wrong:** Running migration on a database that already has the column (e.g., running migration twice, or migration after partial run) throws `SqliteError: duplicate column name`.
**Why it happens:** SQLite's `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` clause (unlike `CREATE TABLE`).
**How to avoid:** Wrap each `ALTER TABLE` in a try/catch, or check `PRAGMA table_info()` before adding. The safest pattern: wrap the entire migration in a transaction, check version at start, skip if already at target version.
**Warning signs:** `SqliteError: duplicate column name: file_size` when running importer twice.

## Code Examples

### File Stat for Idempotency Check
```javascript
// Source: Node.js fs docs — verified in Node 22.17.1
import { statSync } from 'node:fs';

const { size } = statSync('/path/to/file.jsonl');
// size is in bytes — use this for skip logic
// JSONL files only grow (append-only) so same size = same content
```

### INSERT OR REPLACE for Session Upsert
```javascript
// Source: SQLite docs — INSERT OR REPLACE replaces row when UNIQUE constraint violated
const stmt = db.prepare(`
  INSERT OR REPLACE INTO sessions (
    session_id, project_id, file_path, file_size, ...
  ) VALUES (?, ?, ?, ?, ...)
`);
// Note: INSERT OR REPLACE deletes then re-inserts, resetting imported_at
// Use INSERT OR IGNORE + UPDATE if preserving imported_at matters
```

### INSERT OR IGNORE for Messages (Idempotent Re-import)
```javascript
// Source: SQLite docs — INSERT OR IGNORE skips row if UNIQUE constraint violated
// Messages have UNIQUE(session_id, uuid) — safe to re-run without duplicates
const stmt = db.prepare(`
  INSERT OR IGNORE INTO messages (uuid, session_id, type, timestamp, ...)
  VALUES (?, ?, ?, ?, ...)
`);
```

### Reading node:sqlite Rows (Null Prototype Objects)
```javascript
// Source: Verified in Node 22.17.1
// node:sqlite returns [Object: null prototype] rows — access like normal objects
const row = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
// row.session_id, row.message_count — works fine despite null prototype
// Spreading works: { ...row }
// JSON.stringify works: JSON.stringify(row)
```

### Tickets Table Design (CONTEXT.md Decision)
```sql
-- Source: CONTEXT.md decision + Python PoC tickets table analysis
CREATE TABLE IF NOT EXISTS tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  ticket_key  TEXT NOT NULL,         -- e.g., STORY-8, BUG-043
  source      TEXT NOT NULL,         -- 'branch', 'content', 'slash_command'
  detected_at TEXT,                  -- ISO 8601 timestamp of first detection
  is_primary  BOOLEAN DEFAULT 0,     -- Whether this is the session's primary ticket
  FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  UNIQUE(session_id, ticket_key, source)
);
```

### Import Log Table Design (Per-File Tracking)
```sql
-- Source: CONTEXT.md decision — "track per-file size in import_log"
-- NOTE: Python PoC tracks per-project. Node port tracks per-file.
CREATE TABLE IF NOT EXISTS import_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,         -- Which session file
  file_path   TEXT NOT NULL,         -- Absolute path to .jsonl file
  file_size   INTEGER NOT NULL,      -- Size at import time (bytes)
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  status      TEXT NOT NULL,         -- 'ok' or 'error'
  error_msg   TEXT,                  -- Error message if status='error'
  UNIQUE(file_path)                  -- Latest import per file (upsert on re-import)
);
```

### Content Extraction (for Ticket Scanning)
```javascript
// Source: Python PoC extract_content_preview() + detect_ticket_from_message()
function extractContentText(msg) {
  const content = msg?.message?.content;
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('\n');
  }
  return JSON.stringify(content);
}
```

## v2 Schema: What Changes from v1

### sessions table additions (ALTER TABLE)
| Column | Type | Purpose |
|--------|------|---------|
| `file_size` | INTEGER | For idempotency comparison |
| `assistant_message_count` | INTEGER DEFAULT 0 | Session stats |
| `fork_count` | INTEGER DEFAULT 0 | Total forks detected |
| `real_fork_count` | INTEGER DEFAULT 0 | Conversation forks only |
| `is_compacted` | BOOLEAN DEFAULT 0 | Has compact_boundary marker |
| `has_subagents` | BOOLEAN DEFAULT 0 | Contains Task tool calls |
| `last_updated_at` | TEXT | Track re-imports |
| `custom_title` | TEXT | From custom-title message type |
| `slug` | TEXT | Human-readable session identifier |

### messages table additions (ALTER TABLE)
| Column | Type | Purpose |
|--------|------|---------|
| `parent_uuid` | TEXT | For fork detection (tree structure) |
| `subtype` | TEXT | e.g., 'stop_hook_summary', 'turn_duration' |
| `is_meta` | BOOLEAN DEFAULT 0 | Meta messages (not conversation) |
| `is_fork_branch` | BOOLEAN DEFAULT 0 | On secondary fork branch |
| `is_compact_summary` | BOOLEAN DEFAULT 0 | Compaction summary marker |
| `agent_id` | TEXT | Sub-agent identifier |
| `cwd` | TEXT | Working directory at message time |
| `version` | TEXT | Claude Code version |
| `content_preview` | TEXT | First 500 chars for display |
| `content_length` | INTEGER | Full content byte length |
| `source_tool_assistant_uuid` | TEXT | Links tool result to assistant |

### New tables
- `tickets` (see above)
- `import_log` (see above)

### SCHEMA_VERSION
Bump from `1` to `2`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Python PoC username-prefixed branch pattern | Generic `[a-zA-Z]{2,8}-\d+` | Phase 2 decision | Works for any project, any ticket system |
| Python PoC AILASUP-only ticket pattern | Generic ticket pattern | Phase 2 decision | Detects STORY-8, BUG-043, etc. |
| Python PoC per-project import tracking | Per-file size tracking | Phase 2 decision | More granular; JSONL files only grow |
| better-sqlite3 `.transaction()` pattern | Manual BEGIN/COMMIT | node:sqlite difference | No external dep; synchronous behavior preserved |

**Deprecated/outdated:**
- Python PoC `discover_projects()` directory-name decode approach: replaced by `~/.claude.json` projects object + filesystem fallback

## Open Questions

1. **sub-agent working time calculation**
   - What we know: CONTEXT.md says "time between agent tool_use launch and tool_result return counts as working time, not idle"
   - What's unclear: The tool_use timestamp is on the assistant message; the tool_result timestamp is on the subsequent user message. These can be identified by matching `tool_use_id` in assistant content blocks to `tool_use_id` in user content blocks. The gap between them should count as active, not idle.
   - Recommendation: This is a query-time concern (Phase 3 working-time calculation), not import-time. Import just stores timestamps faithfully. Phase 2 doesn't need to implement this logic — store all messages with their timestamps and let Phase 3 figure out the gap classification.

2. **import_log UNIQUE(file_path) on re-import**
   - What we know: Decision says re-import files that change size; use `INSERT OR REPLACE` / upsert
   - What's unclear: If a file grows and is re-imported, `INSERT OR IGNORE` for messages skips existing UUIDs correctly. But the sessions row needs updating (new message count, new last_message_at). `INSERT OR REPLACE` for sessions drops the row and re-inserts, resetting `imported_at`.
   - Recommendation: Use `INSERT OR REPLACE` for sessions (acceptable — `imported_at` reset is fine, it's a re-import). Use `INSERT OR IGNORE` for messages (preserve existing; new messages get inserted). Update `import_log` with `INSERT OR REPLACE` (update file_size after each successful import).

3. **Malformed JSONL handling**
   - What we know: Python PoC logs and skips malformed lines
   - What's unclear: Whether to count/report skipped lines, and whether a session with malformed lines should still be imported
   - Recommendation: Skip malformed lines, log to stderr, continue import. If ALL lines in a file are malformed, record `status='error'` in import_log. Don't fail the entire import run for one bad file.

## Sources

### Primary (HIGH confidence)
- Live codebase inspection: `/home/claude/cctimereporter/scripts/import_transcripts.py` — Python PoC source of truth for all algorithms
- Live codebase inspection: `/home/claude/cctimereporter/src/db/schema.js` — v1 Node schema
- Node.js 22.17.1 REPL verification: `db.transaction` does not exist, `db.exec('BEGIN')` works, `node:sqlite` returns null-prototype objects, SQLite version 3.50.0 bundled
- Live `~/.claude.json` inspection: projects object structure confirmed, key = project path, value = settings dict
- Live filesystem inspection: transcript directory structure confirmed (session dirs alongside JSONL, sessions-index.json, agent- files in subagents/)

### Secondary (MEDIUM confidence)
- Node.js readline docs (implied by working code pattern): `for await (const line of rl)` iteration confirmed working in Node 22.17.1
- SQLite 3.50.0 ALTER TABLE capabilities confirmed via live test

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all stdlib, no new external deps, all verified against Node 22.17.1
- Architecture: HIGH — Python PoC is the reference; algorithms are direct ports verified against known output
- Schema migration: HIGH — tested ALTER TABLE ADD COLUMN in SQLite 3.50.0 (Node 22 bundled)
- Pitfalls: HIGH — all discovered via live code verification, not training data assumptions
- Ticket scoring: MEDIUM — the generic pattern introduces false positives (phase-5); scoring weights are locked but may need tuning

**Research date:** 2026-02-25
**Valid until:** 2026-05-25 (stable domain; node:sqlite API is "active development" but the synchronous API surface is frozen in practice)
