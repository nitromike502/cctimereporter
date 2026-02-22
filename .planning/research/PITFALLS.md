# Pitfalls Research

**Domain:** npx-distributed Node.js CLI tool with local web UI, SQLite storage, Gantt visualization
**Researched:** 2026-02-22
**Confidence:** MEDIUM — all critical pitfalls verified via official docs or multiple sources; some UX pitfalls are MEDIUM/LOW where no single authoritative source exists

---

## Critical Pitfalls

### Pitfall 1: better-sqlite3 Native Binary Breaks on Node Version Mismatch

**What goes wrong:**
`better-sqlite3` compiles a native C++ addon. When the user's Node.js version differs from the version the prebuilt binary was compiled for, the module fails with `Error: better-sqlite3 was compiled against a different Node.js version`. This is a hard crash at startup — no graceful fallback.

**Why it happens:**
Native Node modules are tied to `NODE_MODULE_VERSION`, which changes with every new Node.js major release. `better-sqlite3` ships prebuilt binaries for popular LTS versions but lags on newly released versions (e.g., Node 24 and 25 had no prebuilt binaries for several weeks in 2025). Users with bleeding-edge Node installs hit this immediately on `npx` install.

**How to avoid:**
- Declare a strict `engines` field in `package.json`: `"engines": { "node": ">=18 <25" }` — target supported LTS versions only
- Warn users on startup if `process.version` is outside the tested range
- Consider `node-sqlite3-wasm` or `@libsqlite3/sqlite3` as pure-JS fallback alternatives if native compilation is unacceptable
- Test on Node 18, 20, and 22 LTS as minimum matrix

**Warning signs:**
- CI only tests one Node version
- No `engines` field in `package.json`
- Users on `nvm` frequently switching versions

**Phase to address:** Database layer phase (Phase 1 or 2). Lock the supported Node range before any code is written.

---

### Pitfall 2: npx Cold-Start Downloads Package Every Invocation

**What goes wrong:**
`npx cctimereporter` without a prior local install re-downloads the full package and all dependencies on every invocation when no version is cached. With `better-sqlite3` pulling in native compilation deps, first-run can be 30–60 seconds. Users abandon tools that feel slow before they open.

**Why it happens:**
npx caches packages but uses a fresh install for unversioned invocations. If the package includes many transitive dependencies (Vite dev deps, test tools inadvertently included), the install footprint explodes. Bundling the Vite frontend into the npm package's `dist/` directory as prebuilt static files is required — shipping Vite as a production dependency causes a ~40MB package.

**How to avoid:**
- Move all Vite, Vue dev tooling to `devDependencies` — they must NOT appear in `dependencies`
- Pre-build the Vue frontend and commit `dist/` to the npm package (include in `files` array in `package.json`)
- Use `@vercel/ncc` or `esbuild` to bundle the CLI entry point into a single file, eliminating transitive dependency resolution at runtime
- Target `< 10MB` unpacked install size as a hard gate
- Recommend `npm install -g cctimereporter` for regular users in the README; `npx` is for first-time-only discovery

**Warning signs:**
- `npm pack --dry-run` shows > 20MB
- Vite appears in `dependencies` instead of `devDependencies`
- Install takes > 15 seconds on fast internet

**Phase to address:** Build/packaging phase. Verify package size as part of the first publishable milestone — not an afterthought.

---

### Pitfall 3: Port Conflict Silently Fails or Crashes

**What goes wrong:**
Starting the local server on port 3000 (or any hardcoded port) fails with `EADDRINUSE` if something else is already on that port. Unhandled, this crashes the process with an ugly Node.js stack trace. The user sees nothing useful and assumes the tool is broken.

**Why it happens:**
Express/http.listen throws an `EADDRINUSE` error event if the address is in use. If no `error` handler is attached to the server, Node.js crashes. Even with a handler, most implementations just print the error and exit without suggesting a fix.

**How to avoid:**
- Attach an `error` event handler to the HTTP server that catches `EADDRINUSE` specifically
- Auto-retry on the next available port (try 3000, 3001, 3002… up to a limit of 5 attempts)
- Print a clear human message: "Port 3000 in use, trying 3001... Server started at http://localhost:3001"
- Use `server.listen(0)` to request an OS-assigned port as a last resort, then print the actual port
- Avoid hardcoding the port entirely; use `PORT` env var with a default

**Warning signs:**
- No `server.on('error', ...)` handler in the server startup code
- Port is a hardcoded numeric literal
- No test with a port already occupied

**Phase to address:** Server setup phase. Handle this before the UI is built — it affects the dev loop constantly.

---

### Pitfall 4: Cross-Platform Path Handling — `~` and Backslash Bugs

**What goes wrong:**
`~/.claude/projects` is not expanded automatically by Node.js. `path.join('~', '.claude')` produces a literal tilde path that `fs.readdir` cannot resolve on any platform. Separately, hardcoded forward slashes fail on Windows, and `__dirname` behaves differently when a package is run via `npx` versus a local install.

**Why it happens:**
Shell tilde expansion is a shell feature, not a Node.js feature. Developers test on the same machine they develop on (macOS/Linux) and never notice the tilde issue. Windows path separators only surface during Windows testing, which often doesn't happen.

**How to avoid:**
- Never use `~` in code: resolve it explicitly as `path.join(os.homedir(), '.claude', 'projects')`
- Always use `path.join()` or `path.resolve()` — never string concatenation for paths
- Use `path.sep` and `path.normalize()` when dealing with user-provided paths
- Test on Windows (or WSL in native Windows mode) before first release
- The `open` npm package handles cross-platform browser opening including WSL correctly — use it instead of rolling your own

**Warning signs:**
- Any occurrence of a tilde literal in path strings in source
- `path.join('~', ...)` anywhere in code
- String concatenation with `/` for paths

**Phase to address:** File scanning phase (early). Every JSONL file path touched by the importer goes through this logic.

---

### Pitfall 5: Auto-Open Browser Fails Silently in WSL

**What goes wrong:**
`child_process.exec('open http://localhost:3000')` works on macOS. `xdg-open` works on some Linux distros. Neither works in WSL2 by default unless `wslu` is installed and configured. The server starts, the URL is never opened, the user sees a blank terminal and wonders if the tool hung.

**Why it happens:**
WSL is a common environment for this tool's target users (developer tooling on Windows). Browser open commands are environment-specific and WSL is not a standard Linux environment — it runs a Linux kernel but the desktop is Windows. The `open` npm package handles this correctly by detecting WSL and using `cmd.exe /c start`, but rolling a custom implementation almost always gets WSL wrong.

**How to avoid:**
- Use the `open` npm package (maintained, WSL-aware) rather than spawning `open`/`xdg-open` directly
- Always print the URL regardless of whether browser auto-open succeeded: `Server running at http://localhost:3000`
- Treat browser auto-open as best-effort — catch and log failures instead of crashing
- Allow `--no-open` flag to suppress browser launch for users in headless/CI environments

**Warning signs:**
- Bare `child_process.exec('open ...')` or `exec('xdg-open ...')` in source
- No URL printed to stdout after server starts
- No `--no-open` flag

**Phase to address:** Server startup phase. Include WSL testing in cross-platform acceptance criteria.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Sync file I/O for JSONL scanning | Simpler code | Blocks event loop; hangs UI for thousands of files | Never in the hot import path |
| Hardcode port 3000 | One less config option | Breaks when port is occupied; hard to multi-instance | Never |
| `JSON.parse` whole JSONL file at once | Simple implementation | OOM crash for large files (> 100MB); Claude sessions can grow large | Never — stream line by line |
| Store Vue dist in `src/` without a build step | Skip build infrastructure | Cannot tree-shake; ships all Vite tooling as dependencies | Never |
| Skip WAL mode for SQLite | Zero setup | Concurrent reads from UI and imports cause lock contention | Never |
| No `engines` field in `package.json` | One less line | Users on incompatible Node versions hit cryptic native module errors | Never |
| Use `__dirname` for resolving user home path | Works locally | Breaks in some bundled/npx environments | Never — use `os.homedir()` |
| No transaction wrapping for bulk inserts | Simpler import loop | 100x slower; importing 1000 files becomes unusably slow | Never in batch import |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Vite + Express | Shipping Vite as a runtime dependency | Pre-build Vue app; serve `dist/` as static files from Express; Vite in `devDependencies` only |
| better-sqlite3 | Forgetting WAL mode for concurrent UI + import access | Run `db.pragma('journal_mode = WAL')` immediately after opening the database |
| JSONL files | `JSON.parse(fs.readFileSync(...))` — treating multi-line JSONL as single JSON | Read line-by-line with a readline interface; each line is independent JSON |
| `~/.claude/projects` | Using `path.join('~', ...)` expecting shell expansion | `path.join(os.homedir(), '.claude', 'projects')` |
| `npx` distribution | Forgetting to set `files` in `package.json` | Without `files`, `npm pack` includes everything including `node_modules`, Vite source, test files |
| Port auto-open | `open http://localhost:3000` via exec | Use the `open` npm package — handles macOS, Linux, Windows, WSL consistently |
| SQLite in npx context | Database created in `process.cwd()` by default | Explicitly resolve to `path.join(os.homedir(), '.claude', 'transcripts.db')` — never rely on CWD |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Reading every JSONL line into memory before inserting | Import hangs at 80% for large projects; Node process OOM | Stream each file line-by-line; INSERT inside a transaction per file, not per line | At ~500 session files or any single file > 50MB |
| One INSERT per message outside a transaction | Import of 10k messages takes minutes, not seconds | Wrap all inserts for a single file/session in a `db.transaction(...)` call | Noticeable at ~1000 messages; severe at 10k+ |
| Scanning all files on every import run without checking mtime/hash | Re-import takes same time as first import even with no changes | Track `last_imported_mtime` or file content hash in `import_log`; skip unchanged files | First run at ~200 files; re-import always |
| DOM-rendering all Gantt bars without virtualization | Browser tab freezes when viewing a month with 500+ sessions | Use windowed/virtual rendering; only render visible time range | ~100 concurrent bars in a day view |
| Serving Vue build assets without cache headers | Browser re-downloads all JS/CSS on each page load | Set `Cache-Control: max-age=31536000, immutable` for hashed asset filenames | Every page load; compounds over time |
| Global `fs.readdirSync` recursion for JSONL discovery | Scans entire `~/.claude` tree synchronously; blocks event loop for seconds | Use async `fs.readdir` with explicit depth limit; avoid recursing into non-project directories | At ~1000 files in the directory tree |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Serving arbitrary file paths from the local server | Any page the browser opens while the server is running can read files via `localhost` cross-origin requests | Never expose a `/files?path=...` endpoint; serve only the pre-built Vue app and the API |
| Accepting unvalidated SQL in a `/query` API endpoint | Local privilege escalation — attacker page can read the entire SQLite database | Validate and parameterize all queries; never pass user-supplied strings into raw SQL |
| Binding server to `0.0.0.0` instead of `127.0.0.1` | Anyone on the local network can access Claude session data | Always bind to `127.0.0.1` (loopback only); make this the default, not `0.0.0.0` |
| Storing sensitive file paths in localStorage or URL | Session data leaks via browser history or shared URLs | Keep session context in server-side state; URLs should use IDs, not file paths |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during import of thousands of files | User thinks tool crashed during 30-second first import | Stream progress to terminal: `Scanning... 245/1820 files` with a simple counter |
| Crashing on malformed JSONL lines | One corrupt session file aborts import of all other files | Skip unparseable lines with a warning; never abort an entire import for one bad file |
| Opening the browser before the server is ready | Browser shows `ERR_CONNECTION_REFUSED`; user refreshes, sometimes misses the window | Wait for the `listening` event before calling `open()` |
| Displaying raw session IDs in the UI when no label is available | Illegible timeline — UUIDs everywhere | Apply the label fallback chain (ticket → branch → first message snippet → truncated ID) server-side, never expose raw IDs |
| Date-range picker with no default selection | Users open a blank Gantt chart and don't know what to do | Default to last 30 days of activity; show empty-state message with "Import data" call-to-action if database is empty |
| Silent failure when `~/.claude/projects` doesn't exist | Tool starts, imports nothing, user sees empty UI with no explanation | Check for directory existence at startup; print a clear error: "Claude projects directory not found at ~/.claude/projects. Have you used Claude Code?" |

---

## "Looks Done But Isn't" Checklist

- [ ] **npx install:** Verify `npm pack --dry-run` shows < 15MB unpacked and `devDependencies` are not included
- [ ] **Cross-platform paths:** Test `~` resolution and path joining on Windows (or WSL) explicitly
- [ ] **Port conflict:** Test startup with port already occupied — must retry or report cleanly
- [ ] **Large JSONL:** Test import with a file > 5MB — must not load entirely into memory
- [ ] **Re-import idempotency:** Import same files twice — row counts must not double; no duplicate sessions
- [ ] **Empty database:** Open the app before any import — must show a useful empty state, not an error
- [ ] **Ctrl+C cleanup:** Kill the server mid-import — database must not be left in inconsistent state
- [ ] **WSL browser open:** Verify `open()` succeeds in WSL2 or degrades gracefully with URL printed
- [ ] **Node version range:** Test on Node 18 and Node 22 at minimum; verify `engines` field matches reality
- [ ] **SQLite WAL mode:** Confirm WAL pragma is set; run a parallel read query during an import — must not deadlock

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Native binary mismatch at release | HIGH | Rebuild and re-publish package; communicate min/max Node version in README and npm description |
| Database corruption from interrupted import | LOW | Delete `transcripts.db` and re-import; the source JSONL files are read-only and always re-importable |
| Package bloat discovered post-publish | MEDIUM | Audit `npm pack` output; remove incorrectly placed dev deps; re-publish patch version |
| Port conflict UX regression | LOW | Add error handler; release patch version |
| Broken WSL browser open | LOW | Switch to `open` npm package; release patch version |
| Import duplication bug (rows doubled) | MEDIUM | Add UNIQUE constraint migration to schema; write a deduplication query; re-import |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Native binary version mismatch | Phase 1: Project setup | `engines` field present; README documents Node version; CI tests Node 18 + 22 |
| npx cold-start bloat | Phase 2: Build pipeline | `npm pack --dry-run` shows < 15MB; Vite not in `dependencies` |
| Port conflict crash | Phase 2: Server scaffold | Manual test: start two instances; second instance retries cleanly |
| Cross-platform path bugs | Phase 1: File scanning | Test suite includes path resolution on Windows-style paths; `os.homedir()` used throughout |
| WSL browser open failure | Phase 2: Server startup | WSL acceptance test: URL printed even if browser open fails |
| Memory OOM on large JSONL | Phase 3: Import pipeline | Stream test with synthetic 20MB JSONL file; memory profile stays flat |
| Slow bulk inserts (no transactions) | Phase 3: Import pipeline | Benchmark: import 1000 sessions in < 5 seconds |
| Re-import duplication | Phase 3: Import pipeline | Import same project twice; row count identical; `import_log` checked |
| Gantt rendering freeze | Phase 4: UI/Gantt | Render test with 500 session bars; no jank on scroll |
| SQLite binding to 0.0.0.0 | Phase 2: Server scaffold | Default bind address verified as 127.0.0.1 in code review |

---

## Sources

- [GitHub: lirantal/nodejs-cli-apps-best-practices](https://github.com/lirantal/nodejs-cli-apps-best-practices) — cross-platform CLI pitfalls, distribution, UX anti-patterns (MEDIUM confidence — community-maintained, widely cited)
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) — WAL mode, checkpoint starvation, transaction patterns (HIGH confidence — official)
- [better-sqlite3 GitHub issues: Node 24 binary failures](https://github.com/WiseLibs/better-sqlite3/issues/1384) — native binary version mismatch (HIGH confidence — official issue tracker)
- [better-sqlite3 GitHub issues: NODE_MODULE_VERSION mismatch on Node 21](https://github.com/WiseLibs/better-sqlite3/issues/1437) — version mismatch pattern (HIGH confidence)
- [npm `open` package](https://www.npmjs.com/package/open) — WSL-aware browser open (HIGH confidence — official npm page)
- [Node.js CLI best practices: path handling](https://gist.github.com/domenic/2790533) — `path.join`, `os.homedir()`, `process.cwd()` vs `__dirname` (MEDIUM confidence — widely cited community guide)
- [Express graceful shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) — SIGTERM handling, `server.close()` (HIGH confidence — official Express docs)
- [Vite: Building for Production](https://vite.dev/guide/build) — pre-building assets, `files` packaging (HIGH confidence — official Vite docs)
- [bcoe/awesome-cross-platform-nodejs](https://github.com/bcoe/awesome-cross-platform-nodejs) — curated cross-platform Node.js issues (MEDIUM confidence — community-maintained)

---

*Pitfalls research for: npx CLI tool with local Vue UI, SQLite, Gantt visualization*
*Researched: 2026-02-22*
