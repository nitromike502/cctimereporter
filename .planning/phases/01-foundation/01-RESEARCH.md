# Phase 1: Foundation - Research

**Researched:** 2026-02-23
**Domain:** npm package skeleton, node:sqlite, schema DDL, Node version enforcement
**Confidence:** HIGH

## Summary

Phase 1 establishes the package skeleton that every subsequent phase builds on. The three technical pillars are: (1) npm package structure with a working `bin/cli.js` entry point, (2) a `node:sqlite` database layer that opens/creates the database at `~/.cctimereporter/data.db`, and (3) a minimal schema DDL covering only the tables required for v1's timeline API.

The `node:sqlite` module is the locked technology choice. It was unflagged from its `--experimental-sqlite` requirement in Node.js 22.13.0 LTS (released January 7, 2025), making it importable without any flags on the minimum required runtime. Its stability is "1.1 - Active development" — not fully stable, but functional and API-frozen enough for this project. The API is synchronous only (`DatabaseSync`, `StatementSync`).

The package layout should be a flat single-package structure (no workspaces), with `src/` holding application code, `bin/cli.js` as the shebang entry point, and the Python PoC's `scripts/` left in place as a reference-only directory. The `files` field in `package.json` controls what npm packs, keeping the published artifact under the 15MB limit.

**Primary recommendation:** Use `node:sqlite` with synchronous `DatabaseSync` API. Open the database file, execute a WAL PRAGMA and schema DDL via `db.exec()`, and detect corruption by catching the thrown error on open — drop-and-recreate is safe because JSONL is the source of truth.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:sqlite` | Built-in (Node 22.13+) | SQLite database layer | Zero external dependency; eliminates native binary failures in npx context; locked decision |
| `node:fs` | Built-in | File system operations (mkdir, exists) | No external deps needed |
| `node:path` | Built-in | Path construction cross-platform | Built-in |
| `node:os` | Built-in | `os.homedir()` for `~` expansion | Built-in, correct cross-platform home dir |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No external runtime dependencies in Phase 1 |

Phase 1 has zero external dependencies. All needed capabilities (file system, sqlite, path manipulation, home directory resolution) are stdlib.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:sqlite` | `better-sqlite3` | better-sqlite3 requires native compilation; fails in npx; already ruled out |
| Manual version parse | `semver` npm package | semver is cleaner but adds a dependency; simple major-version comparison in stdlib is sufficient |
| `files` whitelist | `.npmignore` | `files` whitelist is safer — anything not listed is excluded by default |

### Installation
```bash
# No npm install needed for Phase 1 — zero runtime dependencies
npm init  # starts the package.json
```

## Architecture Patterns

### Recommended Project Structure
```
cctimereporter/
├── bin/
│   └── cli.js           # Shebang entry point — the "bin" target
├── src/
│   ├── db/
│   │   ├── index.js     # open_database() — returns DatabaseSync instance
│   │   └── schema.js    # DDL strings executed at open time
│   └── version-check.js # Node version guard, called first in cli.js
├── scripts/             # Python PoC — reference only, not published
├── package.json         # "files": ["bin", "src"], engines: {"node": ">=22.13.0"}
├── .npmignore           # Not needed if "files" is set
└── .planning/           # Planning docs — not published
```

### Pattern 1: CLI Entry Point with Shebang
**What:** `bin/cli.js` begins with the shebang line so npm/npx executes it with the correct Node binary
**When to use:** Every npm package that provides a CLI command
**Example:**
```javascript
#!/usr/bin/env node
// Source: npm docs + community standard

// Version check MUST be first — before any import that uses node:sqlite
// (node:sqlite import itself would throw on old Node, but we want a clear message)
import './src/version-check.js';
import { openDatabase } from './src/db/index.js';

const db = openDatabase();
// Phase 1 stub: print version/help and exit cleanly
console.log('cctimereporter v0.1.0');
process.exit(0);
```

### Pattern 2: Node Version Guard
**What:** Hard-fail at startup with a human-readable message when Node < 22
**When to use:** Any CLI tool with a runtime minimum requirement
**Example:**
```javascript
// src/version-check.js
// Source: process.version is always available, no imports needed

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(
    `cctimereporter requires Node.js 22 or later.\n` +
    `You are running Node.js ${process.versions.node}.\n` +
    `Please upgrade: https://nodejs.org/`
  );
  process.exit(1);
}
```

### Pattern 3: Database Open with Drop-and-Recreate
**What:** Open the database file, validate integrity, drop-and-recreate if corrupted or schema mismatch
**When to use:** When the database is a cache (data is always re-importable from JSONL)
**Example:**
```javascript
// src/db/index.js
// Source: node:sqlite official docs (nodejs.org/docs/latest-v22.x/api/sqlite.html)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCHEMA_DDL, SCHEMA_VERSION } from './schema.js';

const DB_DIR = join(homedir(), '.cctimereporter');
const DB_PATH = join(DB_DIR, 'data.db');

export function openDatabase() {
  mkdirSync(DB_DIR, { recursive: true });

  let db;
  try {
    db = new DatabaseSync(DB_PATH);
    // Verify database is readable and not corrupted
    db.exec('PRAGMA integrity_check');
    const version = db.prepare('PRAGMA user_version').get();
    if (version.user_version !== SCHEMA_VERSION) {
      // Schema mismatch — wipe and recreate
      db.close();
      unlinkSync(DB_PATH);
      db = new DatabaseSync(DB_PATH);
    }
  } catch {
    // Corruption or open failure — wipe and recreate
    if (db) { try { db.close(); } catch {} }
    if (existsSync(DB_PATH)) { unlinkSync(DB_PATH); }
    db = new DatabaseSync(DB_PATH);
  }

  // Apply performance PRAGMAs and create schema
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_DDL);
  db.prepare(`PRAGMA user_version = ${SCHEMA_VERSION}`).run();

  return db;
}
```

### Pattern 4: Schema DDL Module
**What:** Schema as a single exported string constant executed by `db.exec()`
**When to use:** Simple, no-migration setup
**Example:**
```javascript
// src/db/schema.js
export const SCHEMA_VERSION = 1;

export const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path  TEXT NOT NULL UNIQUE,
    transcript_dir TEXT NOT NULL,
    last_import_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid        TEXT NOT NULL,
    session_id  TEXT NOT NULL,
    type        TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    git_branch  TEXT,
    is_sidechain BOOLEAN DEFAULT 0,
    UNIQUE(session_id, uuid),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
`;
```

### Pattern 5: package.json Configuration
**What:** `files` whitelist + `engines` field + `bin` mapping
**When to use:** Every CLI package published to npm

```json
{
  "name": "cctimereporter",
  "version": "0.1.0",
  "description": "Visual timeline of Claude Code sessions",
  "type": "module",
  "bin": {
    "cctimereporter": "./bin/cli.js"
  },
  "files": [
    "bin",
    "src"
  ],
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "start": "node bin/cli.js",
    "pack:check": "npm pack --dry-run"
  }
}
```

### Anti-Patterns to Avoid
- **Checking `files` by listing directory manually:** Use `npm pack --dry-run` to verify published contents — the output is the ground truth
- **Opening database before version check:** Version check must run before any `import { DatabaseSync }` — on Node < 22 the import itself would throw a less helpful error
- **Using `PRAGMA user_version = N` as a prepared statement with `?`:** PRAGMA user_version cannot use parameter binding; interpolate the integer directly (safe — it's a constant, not user input)
- **Relying on `engines` field alone for version enforcement:** npm `engines` is advisory only during `npm install` — it does NOT stop the user from running the CLI directly with the wrong Node; always add a runtime check in `bin/cli.js`
- **`require()` instead of `import`:** Package uses `"type": "module"` — use ESM throughout; `node:sqlite` works with both but ESM is the forward-compatible choice

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Home directory expansion | `~/` string replacement | `os.homedir()` | Correct on Windows, macOS, Linux; handles edge cases |
| Recursive directory creation | Manual mkdir loop | `fs.mkdirSync(path, { recursive: true })` | Built-in since Node 10; handles race conditions |
| Schema versioning | Custom migration table | `PRAGMA user_version` | SQLite native, zero tables, already integer |
| npm package contents verification | Manual file listing | `npm pack --dry-run` | Canonical — shows exactly what would be published |
| WAL mode setup | Custom write locking | `PRAGMA journal_mode = WAL` | SQLite native; critical for concurrent reads during server use in later phases |

**Key insight:** In Phase 1, there is almost nothing to hand-roll — the stdlib covers every need. The main risk is adding external dependencies unnecessarily.

## Common Pitfalls

### Pitfall 1: node:sqlite Flag Requirements Confusion
**What goes wrong:** Documentation from mid-2024 states `--experimental-sqlite` is required, leading developers to add it to their CLI invocation or believe the module is unusable.
**Why it happens:** The flag requirement was removed in Node 22.13.0 (January 7, 2025) but older blog posts/docs don't reflect this.
**How to avoid:** The minimum Node requirement is `>=22.13.0` (not just `>=22.0.0`). Enforce this in the version check. On 22.13+, import works without any flags.
**Warning signs:** `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'node:sqlite'` — this means Node is < 22.5.0; a different error means another issue.

### Pitfall 2: npm pack Includes Unexpected Files
**What goes wrong:** `scripts/` (Python PoC), `.planning/`, `node_modules/` end up in the published package, bloating it past 15MB.
**Why it happens:** Without a `files` field, npm publishes everything not in `.npmignore`; `node_modules` is always excluded automatically, but source directories are not.
**How to avoid:** Use the `files` field in package.json as a whitelist. Verify with `npm pack --dry-run` before committing. The Python `scripts/` and `.planning/` dirs must NOT be in the `files` list.
**Warning signs:** `npm pack --dry-run` output shows `scripts/` or `references/` entries.

### Pitfall 3: PRAGMA in Prepared Statement
**What goes wrong:** `db.prepare('PRAGMA user_version = ?').run(SCHEMA_VERSION)` — SQLite throws an error because PRAGMA doesn't accept bound parameters.
**Why it happens:** Natural instinct to use parameterized queries for all SQL.
**How to avoid:** For `PRAGMA user_version = N`, the integer is a compile-time constant — interpolate directly: `` db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`) ``.
**Warning signs:** `SqliteError: near "?": syntax error` when setting user_version.

### Pitfall 4: Database Opened Before Directory Exists
**What goes wrong:** `new DatabaseSync(DB_PATH)` throws `SQLITE_CANTOPEN` because `~/.cctimereporter/` doesn't exist on first run.
**Why it happens:** SQLite will not create parent directories.
**How to avoid:** Always call `mkdirSync(DB_DIR, { recursive: true })` before `new DatabaseSync(DB_PATH)`. The `recursive: true` flag makes it a no-op if the directory already exists.
**Warning signs:** `SqliteError: unable to open database file` on first run.

### Pitfall 5: ESM Module Type and node:sqlite
**What goes wrong:** Package declares `"type": "module"` but `bin/cli.js` uses `require()`, causing a syntax error.
**Why it happens:** `#!/usr/bin/env node` scripts default to CommonJS unless `"type": "module"` is set.
**How to avoid:** With `"type": "module"`, all `.js` files use ESM. Use `import { DatabaseSync } from 'node:sqlite'`. If mixing is needed, name CommonJS files `.cjs`.
**Warning signs:** `SyntaxError: Cannot use import statement in a module` or `require is not defined in ES module scope`.

### Pitfall 6: Version Check Ordering
**What goes wrong:** Version check is placed after `import { DatabaseSync }` — on Node < 22 the import itself throws `ERR_MODULE_NOT_FOUND` before the version check runs.
**Why it happens:** ES module `import` statements are hoisted and evaluated before any code runs.
**How to avoid:** The version check must use `process.versions.node` in a IIFE or the very top of the entry file, before any async imports. In ESM, use a separate file and execute it via dynamic `import()` or restructure so the version-check module has no sqlite imports.
**Warning signs:** Users on old Node see `ERR_MODULE_NOT_FOUND: node:sqlite` instead of the helpful version error.

**Practical solution:** Put the version check in `bin/cli.js` itself before any other imports, using only `process.versions.node` (always available):
```javascript
#!/usr/bin/env node
// This check runs before any imports are resolved
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  process.stderr.write(`cctimereporter requires Node.js 22+. You have ${process.versions.node}.\n`);
  process.exit(1);
}
// All other imports below this point
import { openDatabase } from '../src/db/index.js';
```
Note: In strict ESM, `import` declarations are hoisted before execution. The version-check-before-import pattern requires the `--input-type=module` evaluation order understanding. **The safest ESM-compatible solution** is to not use top-level `import` for node:sqlite in the entry file — instead call a dynamic `import()` after the version check:
```javascript
#!/usr/bin/env node
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  process.stderr.write(`cctimereporter requires Node.js 22+. You have ${process.versions.node}.\n`);
  process.exit(1);
}
// Dynamic import ensures node:sqlite is not resolved until after version check
const { openDatabase } = await import('../src/db/index.js');
```
This works because `bin/cli.js` is an ES module (due to `"type": "module"`) and top-level `await` is supported in ES modules.

## Code Examples

Verified patterns from official sources:

### Opening a File-Backed Database
```javascript
// Source: https://nodejs.org/docs/latest-v22.x/api/sqlite.html
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync('/path/to/database.db');
// File is created if it doesn't exist
```

### Creating Tables
```javascript
// Source: https://nodejs.org/docs/latest-v22.x/api/sqlite.html
database.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE
  ) STRICT
`);
```

### WAL Mode + Foreign Keys
```javascript
// Source: SQLite pragma docs + node:sqlite exec pattern
database.exec('PRAGMA journal_mode = WAL');
database.exec('PRAGMA foreign_keys = ON');
```

### Reading PRAGMA user_version
```javascript
// Source: node:sqlite docs — prepare().get() returns first row as object
const { user_version } = database.prepare('PRAGMA user_version').get();
```

### npm pack Verification
```bash
# Source: npm docs
npm pack --dry-run
# Expected output: only bin/ and src/ entries, no scripts/, no .planning/
```

### Creating Data Directory
```javascript
// Source: Node.js fs docs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

mkdirSync(join(homedir(), '.cctimereporter'), { recursive: true });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `better-sqlite3` external package | `node:sqlite` built-in | Node 22.5.0 (Jul 2024), unflagged 22.13.0 (Jan 2025) | No native compilation needed; npx-safe |
| `--experimental-sqlite` flag required | No flag needed | Node 22.13.0 LTS (Jan 7, 2025) | Clean invocation, no wrapper scripts |
| `.npmignore` for excluding files | `files` whitelist in package.json | Long-standing best practice | Whitelist is safer than blacklist |

**Deprecated/outdated:**
- Articles/examples showing `node --experimental-sqlite` flag: outdated as of Node 22.13.0 — do not include flag in any scripts or docs

## Minimal v1 Schema

Based on what the timeline API (Phase 3) and visualization (Phase 5) actually query, the minimal schema needs:

**Required tables:**
- `projects` — maps project paths to IDs (needed for grouping sessions by project)
- `sessions` — session metadata with time bounds, ticket, branch (the core timeline data)
- `messages` — timestamps for working-time calculation (gaps between messages)

**NOT needed in Phase 1:**
- `tickets` (separate table) — the PoC has it but v1 only needs `primary_ticket` on sessions
- `fork_points` — fork visualization is a v1.x deferred feature
- `tool_uses` — PoC has it, not yet populated, not needed for v1 UI
- `import_log` — useful but not required for Phase 1 success criteria
- Views — can be added when Phase 3 API is built; not needed in Foundation

**Why messages table is needed even in Phase 1:** The working-time calculation (idle gap exclusion) requires iterating message timestamps within a session. Without `messages`, Phase 2 can't compute `working_minutes`.

## Open Questions

1. **ESM vs CommonJS for bin/cli.js**
   - What we know: `"type": "module"` means `.js` files are ESM; top-level `await` works
   - What's unclear: Whether any downstream tools (npx wrappers, shell scripts) have issues with ESM entry points
   - Recommendation: Use `"type": "module"` with ESM throughout; it's the forward-compatible choice and Node 22 fully supports it

2. **Package name availability on npm**
   - What we know: `cctimereporter` is the working name
   - What's unclear: Whether `cctimereporter` is taken on npm
   - Recommendation: Verify with `npm view cctimereporter` before committing; fallback `@username/cctimereporter` scoped package

3. **STRICT table mode**
   - What we know: SQLite `STRICT` tables enforce type checking (added SQLite 3.37.0)
   - What's unclear: Whether the node:sqlite bundled SQLite version supports STRICT
   - Recommendation: Check with `db.prepare('SELECT sqlite_version()').get()` — if >= 3.37.0, use STRICT; otherwise omit. Given Node 22 ships SQLite 3.45+, STRICT is available.

## Sources

### Primary (HIGH confidence)
- `https://nodejs.org/docs/latest-v22.x/api/sqlite.html` — node:sqlite API, stability status, import syntax, DatabaseSync/StatementSync methods, code examples
- `https://github.com/nodejs/node/pull/55890` — unflagging PR; confirms Node 22.13.0 as the version where flag was removed
- `https://sqlite.org/pragma.html` — PRAGMA user_version, journal_mode, integrity_check, foreign_keys

### Secondary (MEDIUM confidence)
- `https://betterstack.com/community/guides/scaling-nodejs/nodejs-sqlite/` — DatabaseSync usage patterns with file-backed databases; verified against official docs
- `https://docs.npmjs.com/cli/v7/configuring-npm/package-json/` — `files`, `bin`, `engines` field documentation

### Tertiary (LOW confidence)
- WebSearch results on CLI entry point best practices — consistent with npm docs, not individually verified

## Metadata

**Confidence breakdown:**
- node:sqlite API: HIGH — fetched directly from official Node.js docs; confirmed unflag version from PR
- npm package structure: HIGH — from npm official docs
- Schema design: HIGH — derived from PoC schema.sql + v1 requirements analysis
- Version guard pattern: HIGH — based on `process.versions.node` which is always available
- ESM/CommonJS interaction: MEDIUM — documented behavior but top-level await in bin/ scripts has edge cases worth testing

**Research date:** 2026-02-23
**Valid until:** 2026-05-23 (90 days; node:sqlite API is "active development" but stable enough; npm package.json conventions are very stable)
