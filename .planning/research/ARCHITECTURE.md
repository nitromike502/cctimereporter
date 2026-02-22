# Architecture Research

**Domain:** Node.js npx CLI tool — local web UI serving Vue frontend with SQLite backend
**Researched:** 2026-02-22
**Confidence:** HIGH (patterns are well-established; specific tradeoffs verified via search)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  npx cctimereporter  (CLI entry point: bin/cli.js)              │
│  • Parse CLI args                                                │
│  • Find free port                                               │
│  • Start Express server                                         │
│  • Open browser via `open` package                             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                    Express HTTP Server (src/server/)             │
├──────────────────────────────┬──────────────────────────────────┤
│   REST API  (/api/*)         │   Static File Serving            │
│   • GET /api/timeline        │   • express.static(dist/)        │
│   • GET /api/projects        │   • SPA fallback → index.html    │
│   • POST /api/import         │   (Vue build bundled in package) │
│   • GET /api/index           │                                  │
├──────────────────────────────┴──────────────────────────────────┤
│                    Service Layer (src/services/)                 │
│   • TranscriptIndexer — lightweight first/last timestamp scan   │
│   • TranscriptImporter — full JSONL parse + SQLite insert       │
│   • TimelineService — query SQLite, format for API              │
│   • TicketDetector — scoring engine (ported from PoC)           │
│   • ForkDetector — parent→children tree (ported from PoC)      │
├─────────────────────────────────────────────────────────────────┤
│                    Database Layer (src/db/)                      │
│   • schema.js — DDL: CREATE TABLE / CREATE VIEW                 │
│   • db.js — better-sqlite3 connection singleton                 │
│   • migrations.js — schema version tracking                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Vue Frontend (ui/src/)                        │
│   • TimelinePage.vue — Gantt bars, date navigation              │
│   • ProjectFilter.vue — show/hide project groups                │
│   • ImportButton.vue — trigger /api/import, poll status         │
│   • composables/useTimeline.js — fetch + state management       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    File System                                   │
│   ~/.claude/projects/<encoded-path>/*.jsonl  ← read-only       │
│   ~/.claude/transcripts.db                   ← read/write      │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `bin/cli.js` | Parse args, start server, open browser | Commander.js or minimal arg parsing; `open` package for browser |
| `src/server/index.js` | Express setup, route registration, static serving | Express 4.x; `express.static(path.join(__dirname, '../ui/dist'))` |
| `src/server/routes/` | Map HTTP routes to service calls | Thin controllers — no business logic |
| `src/services/TranscriptIndexer` | Scan all JSONL files for first/last timestamps without full parse | Read first+last line of each JSONL; cache in DB index table |
| `src/services/TranscriptImporter` | Full JSONL parse, fork detection, ticket scoring, SQLite insert | Port of Python `import_transcripts.py`; runs on-demand |
| `src/services/TimelineService` | Query sessions/messages from SQLite, compute working time intervals | Port of Python `query.py` + `timeline.py` logic |
| `src/db/db.js` | SQLite connection, schema init | `better-sqlite3` synchronous API; singleton |
| `ui/` | Vue SPA — timeline visualization | Vite build; compiled to `ui/dist/` which is bundled in npm package |

## Recommended Project Structure

```
cctimereporter/
├── bin/
│   └── cli.js                  # Shebang entry: #!/usr/bin/env node
│                               # Start server, open browser
├── src/
│   ├── server/
│   │   ├── index.js            # Express app factory
│   │   └── routes/
│   │       ├── timeline.js     # GET /api/timeline?date=YYYY-MM-DD
│   │       ├── projects.js     # GET /api/projects
│   │       └── import.js       # POST /api/import
│   ├── services/
│   │   ├── TranscriptIndexer.js   # Fast first/last timestamp scan
│   │   ├── TranscriptImporter.js  # Full import pipeline
│   │   ├── TimelineService.js     # Query + working time calc
│   │   ├── TicketDetector.js      # Scoring engine
│   │   └── ForkDetector.js        # Parent→children tree
│   └── db/
│       ├── db.js               # better-sqlite3 singleton
│       ├── schema.js           # CREATE TABLE statements
│       └── migrations.js       # Schema version management
├── ui/                         # Vue frontend (separate build context)
│   ├── src/
│   │   ├── App.vue
│   │   ├── pages/
│   │   │   └── TimelinePage.vue
│   │   ├── components/
│   │   │   ├── GanttRow.vue
│   │   │   ├── ProjectGroup.vue
│   │   │   └── ImportButton.vue
│   │   └── composables/
│   │       └── useTimeline.js  # API fetch + reactive state
│   ├── vite.config.js
│   └── package.json            # UI-only deps (vue, vite)
├── package.json                # Main package: bin, dependencies (express, better-sqlite3, open)
└── .npmignore                  # Exclude ui/src/, ui/node_modules/; include ui/dist/
```

### Structure Rationale

- **`bin/` vs `src/`:** The shebang entry point in `bin/` stays minimal — it only starts the server and opens the browser. All logic lives in `src/` where it's importable and testable.
- **`src/services/` separation:** Each service maps to a distinct PoC script. This makes porting incremental and boundaries clear. `TranscriptIndexer` is new (no PoC equivalent) and should be built first to validate the fast-scan approach.
- **`ui/` as a subdirectory:** The Vue frontend has its own `package.json` and `vite.config.js` but lives in the same repo. Its build output (`ui/dist/`) is committed or pre-built before `npm publish`, then served by Express at runtime. This avoids monorepo tooling complexity for a two-package project.
- **`src/db/` isolation:** Database connection is a singleton. Routes never import `better-sqlite3` directly — they go through service layer. This allows swapping the DB layer in isolation if `node:sqlite` stabilizes.

## Architectural Patterns

### Pattern 1: Pre-built Frontend in Package

**What:** The Vue app is built (`vite build`) before `npm publish`. The `ui/dist/` folder is included in the published npm package. Express serves it with `express.static()`. Users never run `vite build` — they just get the compiled output.

**When to use:** Any time the frontend and backend are co-distributed as a single npx package.

**Trade-offs:**
- Pro: Zero build step for end users; clean `npx cctimereporter` experience
- Pro: No Vite or Vue devtools needed at runtime
- Con: Developer must run `npm run build:ui` before publishing; stale dist/ is a footgun
- Con: `ui/dist/` must be excluded from `.gitignore` or tracked in git (pick one — recommend tracking dist in git for simpler publish)

**Example:**
```javascript
// src/server/index.js
const path = require('path');
const express = require('express');

function createServer() {
  const app = express();

  // Serve compiled Vue app (bundled in the npm package)
  const uiDist = path.join(__dirname, '../../ui/dist');
  app.use(express.static(uiDist));

  // API routes
  app.use('/api/timeline', require('./routes/timeline'));
  app.use('/api/projects', require('./routes/projects'));
  app.use('/api/import', require('./routes/import'));

  // SPA fallback — Vue Router in history mode needs this
  app.get('*', (req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'));
  });

  return app;
}
```

### Pattern 2: Synchronous SQLite with better-sqlite3

**What:** Use `better-sqlite3` (synchronous API) rather than async `sqlite3`. All DB calls are blocking but fast — no callback hell or async/await chains for simple queries.

**When to use:** Local CLI tools where the SQLite file is on the same machine. Synchronous code is simpler to reason about; for local I/O the performance difference from async is negligible.

**Trade-offs:**
- Pro: Dramatically simpler code — no `.then()` chains or `await` in routes
- Pro: Prepared statements are cached, performance is excellent for local reads
- Con: Native addon — requires prebuilt binaries per platform/Node version (see Pitfalls)
- Con: Node 24 currently has known build issues (prebuilds lag new Node releases)
- Alternative: `node:sqlite` is built-in but still experimental as of Node 22/24 in 2025; not recommended for production yet

**Example:**
```javascript
// src/db/db.js
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

let _db = null;

function getDb() {
  if (!_db) {
    const dbPath = path.join(os.homedir(), '.claude', 'transcripts.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');  // Better concurrent read performance
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

module.exports = { getDb };
```

### Pattern 3: Lightweight Index Before Full Import

**What:** Before importing full JSONL content, do a fast indexing pass: read only the first and last line of each JSONL file to capture session date ranges. Store in a lightweight `file_index` table. When a date is requested, only fully import files whose date ranges overlap that date.

**When to use:** Required for this project — users may have months/years of transcript history. Full parsing on every launch is too slow.

**Trade-offs:**
- Pro: Fast first launch even with large transcript histories
- Pro: Makes on-demand import viable
- Con: Index can go stale if files grow after indexing (mitigate: re-index if file mtime changed)
- Con: Adds a new table and two-phase import complexity

**Example:**
```javascript
// src/services/TranscriptIndexer.js
const fs = require('fs');

function indexFile(filePath) {
  // Read first and last line only — never parse full JSONL
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const first = JSON.parse(lines[0]);
  const last = JSON.parse(lines[lines.length - 1]);
  return {
    filePath,
    firstTimestamp: first.timestamp,
    lastTimestamp: last.timestamp,
    fileMtime: fs.statSync(filePath).mtimeMs,
  };
}
```

### Pattern 4: Dynamic Port with Browser Open

**What:** Pick a port dynamically (starting from a preferred port, incrementing if occupied). Once the server is ready, call the `open` package to open the browser.

**When to use:** Any `npx` local server tool — users may have other services on the same port.

**Trade-offs:**
- Pro: Never fails with "port in use"
- Con: URL changes between runs — minor UX annoyance (mitigate: persist last port in config, or always use consistent preferred port with fallback)

**Example:**
```javascript
// bin/cli.js
#!/usr/bin/env node
const { createServer } = require('../src/server/index');
const open = require('open');

const PREFERRED_PORT = 3847;  // Obscure port to avoid collisions

async function findFreePort(start) {
  // Try preferred, then increment
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(start, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findFreePort(start + 1)));
  });
}

async function main() {
  const port = await findFreePort(PREFERRED_PORT);
  const app = createServer();
  app.listen(port, () => {
    const url = `http://localhost:${port}/timeline`;
    console.log(`CC Time Reporter running at ${url}`);
    open(url);
  });
}

main();
```

## Data Flow

### Primary Flow: First Launch

```
npx cctimereporter
    ↓
bin/cli.js: find free port → start Express → open browser
    ↓
Browser loads: GET / → Express serves ui/dist/index.html
    ↓
Vue mounts: useTimeline.js → GET /api/timeline?date=today
    ↓
TimelineRoute → TimelineService.getTimeline(date)
    ↓
TranscriptIndexer.indexAll() — fast first/last scan of all JSONL files
    ↓ (only files overlapping requested date)
TranscriptImporter.importFile(filePath) — full parse + SQLite insert
    ↓
TimelineService.query(date) → SQLite SELECT → working time calc
    ↓
JSON response → Vue renders Gantt bars
```

### On-Demand Import Flow

```
User clicks "Refresh Import"
    ↓
Vue: POST /api/import { date, forceRefresh }
    ↓
ImportRoute → TranscriptImporter.importForDate(date)
    ↓
Re-check file index (mtime changed?) → re-import if needed
    ↓
Return { importedCount, sessionCount }
    ↓
Vue: re-fetch /api/timeline?date=...
```

### JSONL Parse Pipeline (mirrors Python PoC)

```
JSONL file (one JSON object per line)
    ↓
TranscriptImporter.parseTranscript(filePath)
    ├── Extract messages, summary, metadata
    └── Build message array with uuid, parentUuid, timestamp, type, content
    ↓
ForkDetector.detectForks(messages)
    ├── Build parentUuid → [childUuids] tree
    ├── Find fork points (parents with >1 child)
    ├── Classify: real fork vs progress fork
    └── Mark is_fork_branch on secondary branch messages
    ↓
TicketDetector.determineTicket(messages, branches)
    ├── Score /prep-ticket slash commands (500pts, +200 if first message)
    ├── Score branch pattern matches (100 base + 5/message)
    └── Score content mentions (10/mention)
    ↓
db.insertSession(session, messages, tickets, forkPoints)
```

### Key Data Flows Summary

1. **File discovery:** `~/.claude/projects/` → directory walk → JSONL file list
2. **Index → selective import:** Index stores first/last timestamp per file; import only overlapping files
3. **JSONL → SQLite:** Parse → fork detection → ticket scoring → bulk insert
4. **SQLite → API:** Query by date → working time calculation → JSON
5. **API → Vue:** JSON timeline data → Gantt component rendering

## Scaling Considerations

This is a single-user local tool. Scaling means "handles large personal transcript history without becoming slow."

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-6 months of transcripts (~100 files) | Default approach works — index + selective import is fast |
| 1-2 years (~500-1000 files) | Index becomes critical; ensure re-index only runs on mtime change |
| 5+ years (thousands of files) | Consider chunked indexing; lazy-load historical dates on demand |

### Scaling Priorities

1. **First bottleneck — import time:** Full JSONL parse is CPU-bound. The index-first pattern (Pattern 3) directly addresses this. Build it early and validate that first launch stays under 5 seconds for a typical user.
2. **Second bottleneck — SQLite query time:** For many months of data, ensure indexes on `messages(DATE(timestamp))` and `sessions(first_message_at)`. These are already in the PoC schema.

## Anti-Patterns

### Anti-Pattern 1: Parse All Files on Every Launch

**What people do:** Scan and fully parse all JSONL files at startup to "ensure the database is fresh."

**Why it's wrong:** With months of transcripts, this takes tens of seconds. The first-run experience becomes painful enough that users stop using the tool.

**Do this instead:** Build a lightweight file index (first/last timestamp + mtime). Only re-parse files whose mtime has changed or whose date range overlaps the requested date. This is Pattern 3.

### Anti-Pattern 2: Bundle Vite Dev Server at Runtime

**What people do:** Include `vite` as a runtime dependency and serve the Vue app in development mode from the npm package.

**Why it's wrong:** Adds hundreds of MB to the installed package, forces users to wait for Vite's dev server startup, and ships development tooling with a production tool.

**Do this instead:** Build the Vue app (`vite build`) before publishing. Include only `ui/dist/` in the npm package. At runtime, Express serves the compiled static files. Vite is a devDependency only.

### Anti-Pattern 3: Async SQLite for a Local CLI

**What people do:** Use `sqlite3` (async) or `@databases/sqlite` for familiarity with async patterns.

**Why it's wrong:** Adds unnecessary complexity (callbacks, promise chains) for a tool where the SQLite file is local. All reads are sub-millisecond; async adds no throughput benefit.

**Do this instead:** Use `better-sqlite3` with its synchronous API. Routes read like direct function calls. Reserve async for actual I/O that benefits from it (file system reads during import).

### Anti-Pattern 4: Serving API and Frontend on Separate Ports

**What people do:** Start a Vite dev server on port 5173 and an Express API on port 3000 separately, with CORS or proxy configuration.

**Why it's wrong:** Two processes, CORS configuration, two ports to open — unnecessary for a local tool. This is a dev pattern that leaks into production.

**Do this instead:** Build the Vue app once. Serve both API (`/api/*`) and static files (`*`) from the same Express server on one port. No CORS needed — same origin.

### Anti-Pattern 5: Writing to ~/.claude/projects/

**What people do:** Store derived data (labels, preferences) alongside the source JSONL files.

**Why it's wrong:** That directory is Claude Code's territory. Writing there risks confusing Claude Code or being overwritten.

**Do this instead:** Store all application data in `~/.claude/transcripts.db` (the existing PoC convention) and a config file in `~/.config/cctimereporter/` or `~/.cctimereporter.json`. Never write to `~/.claude/projects/`.

## Integration Points

### External Services

None — this tool is intentionally entirely local. No network calls outside localhost.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI → Server | Direct function call (`createServer()`) | Not HTTP — same process |
| Vue UI → Express API | HTTP fetch over localhost | Same origin, no CORS needed |
| Express routes → Services | Direct function calls (synchronous) | No event bus needed |
| Services → DB | `getDb()` singleton, synchronous calls | All better-sqlite3 prepared statements |
| Services → File System | Node.js `fs` module | Read-only access to `~/.claude/projects/` |
| DB → File System | better-sqlite3 manages file at `~/.claude/transcripts.db` | WAL mode recommended |

### Build-Time Boundary (important for distribution)

| Boundary | Mechanism | Notes |
|----------|-----------|-------|
| Vue source → compiled dist | `npm run build:ui` (Vite) | Must run before `npm publish`; output committed to git or built in CI |
| npm package → end user | `npx cctimereporter` | `bin/cli.js` is the entry; `ui/dist/` is included; `better-sqlite3` prebuilds download on install |

## Suggested Build Order

The component dependencies dictate this implementation sequence:

1. **DB layer first** (`src/db/`) — Everything else depends on it. Port the PoC SQL schema to JS. Validate with a test insert.

2. **Services layer, port-by-port** — Each service maps directly to a PoC script:
   - `ForkDetector.js` (from `import_transcripts.py` `detect_forks()`)
   - `TicketDetector.js` (from `import_transcripts.py` `determine_primary_ticket()`)
   - `TranscriptImporter.js` (full parse pipeline — depends on above two)
   - `TranscriptIndexer.js` (new — fast first/last scan; validate performance before full import)
   - `TimelineService.js` (from `query.py` + `timeline.py`)

3. **Express server** (`src/server/`) — Wire services to routes. Test with curl before building Vue.

4. **CLI entry point** (`bin/cli.js`) — Server start + browser open. Validate the full `npx` flow.

5. **Vue frontend** (`ui/`) — Build against the working API. Timeline rendering is the last piece because the API contract must be stable first.

## Sources

- Node.js `node:sqlite` status (experimental, Node 22/24, still requires flag): https://nodejs.org/api/sqlite.html — HIGH confidence
- `better-sqlite3` Node 24 compatibility issues (prebuilds lag): https://github.com/WiseLibs/better-sqlite3/issues/1384 — HIGH confidence (GitHub issue)
- `better-sqlite3` Node 22 LTS prebuilds work; Node 24 N-API 137 prebuilds missing as of early 2025: search-verified, MEDIUM confidence
- `open` package for cross-platform browser launch (ESM only, uses `xdg-open`/`start`/`open` per platform): https://github.com/sindresorhus/open — HIGH confidence
- Express `express.static()` + SPA fallback pattern: https://expressjs.com/en/starter/static-files.html — HIGH confidence
- `vite-express` integration pattern for dev/prod unified serving: https://github.com/szymmis/vite-express — MEDIUM confidence (useful reference but overkill for this tool — simpler to just serve `ui/dist/` directly in production)
- npx `bin` field distribution pattern: https://docs.npmjs.com/cli/v7/configuring-npm/package-json/ — HIGH confidence

---
*Architecture research for: CC Time Reporter — npx CLI + Vue frontend + SQLite backend*
*Researched: 2026-02-22*
