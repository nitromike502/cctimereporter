# Project Research Summary

**Project:** CC Time Reporter
**Domain:** npx-distributed Node.js CLI tool — local Vue 3 web UI with SQLite storage and Gantt-style session timeline visualization
**Researched:** 2026-02-22
**Confidence:** MEDIUM-HIGH

## Executive Summary

CC Time Reporter is a local developer tooling project that converts an existing Python 3 CLI utility into an `npx`-launchable Node.js tool with a Vue 3 Gantt timeline UI. The product has a working Python proof-of-concept covering transcript parsing, fork detection, ticket scoring, and an HTML timeline generator — the primary work is a port, not a greenfield build. Experts building this class of tool (local npx CLI + embedded SPA + SQLite) follow a clear pattern: pre-build the frontend into a `dist/` folder included in the npm package, serve it alongside a minimal REST API from the same process, and open the browser automatically. The user experience goal is a single command with zero setup.

The recommended stack is Node.js 22 LTS with the built-in `node:sqlite` module, Fastify 5, Vue 3 + Vite 7, Pinia 3, Vue Router 5, and `hy-vue-gantt` for Gantt rendering. The pivotal decision is using `node:sqlite` instead of `better-sqlite3` — this eliminates the category of native binary distribution failures that are the most common cause of `npx` tool breakage in the wild, and is well-documented in the research. The constraint is Node 22 minimum, which is the Active LTS version as of 2026 and a reasonable baseline to document in the `engines` field.

The key risks are all well-understood and preventable: native binary distribution failures (eliminated by choosing `node:sqlite`), slow first-run from package bloat (prevented by keeping build tools in `devDependencies` and pre-building `dist/`), port conflicts (handled with dynamic port allocation and graceful retry), and cross-platform path bugs (`os.homedir()` instead of tilde literals, `path.join()` throughout). There is no novel technical territory here — the patterns are well-established and the pitfalls are enumerated with specific prevention steps.

## Key Findings

### Recommended Stack

The stack is Node.js 22 LTS + Fastify 5 + Vue 3 + Vite 7 + `node:sqlite`. The most impactful single decision is `node:sqlite` over `better-sqlite3`. Multiple real-world GitHub issues document `better-sqlite3` failing in exactly the `npx` distribution context this project uses — ARM64 macOS, Node 24, Python-venv environments. The built-in `node:sqlite` (stable since Node 22.13.0, no experimental flag) provides an equivalent synchronous API for this local single-user use case. The Gantt library choice (`hy-vue-gantt`) carries MEDIUM confidence — it is the only actively maintained Vue 3 Composition API Gantt component (the original `vue-ganttastic` was abandoned), but its npm version was not directly verified.

See `/home/claude/cctimereporter/.planning/research/STACK.md` for full rationale and alternative analysis.

**Core technologies:**
- Node.js 22 LTS: Runtime — Active LTS, required for `node:sqlite`; declare `"engines": { "node": ">=22.12.0" }`
- `node:sqlite` (built-in): Database — eliminates native binary distribution failures that break npx tools
- Fastify 5: HTTP server — serves both the Vue `dist/` build and the JSON API; lighter than Express
- Vue 3.5 + Vite 7: Frontend SPA — user-specified; Composition API, pre-built to `dist/` before publish
- `hy-vue-gantt`: Gantt visualization — active fork of abandoned `vue-ganttastic`; Vue 3 Composition API native
- Pinia 3 + Vue Router 5: Frontend state and routing — official Vue replacements for Vuex/Vue Router 4
- `open` package: Cross-platform browser launch — WSL-aware; handles macOS/Linux/Windows correctly

### Expected Features

The feature set is almost fully determined by the existing Python implementation. The port must not regress any current capability. No direct competitor exists for Claude Code session visualization — the value proposition is privacy-first, local-only, Claude-specific context (tickets, forks) in a zero-setup single command.

See `/home/claude/cctimereporter/.planning/research/FEATURES.md` for full feature matrix and priority table.

**Must have (v1 table stakes):**
- Single `npx cctimereporter [date]` command that imports, serves, and opens browser — zero setup
- Gantt bars per session with idle gap visualization (faded segments) and configurable threshold
- Three-tier session label: ticket ID (AILASUP-NNN) → branch name → first-5-words fallback
- Date navigation: prev/next day buttons and keyboard arrows; "Today"/"Yesterday" shortcuts
- Hover tooltip: session ID, ticket, branch, working time, wall-clock span, message count
- Project grouping with color-coding and per-project working/span totals in legend
- Project filter (show/hide individual projects)
- On-demand import from JSONL transcripts with progress feedback

**Should have (v1.x after validation):**
- Rolling 30-day view with sparse-day handling (weekends/days off should not get equal width)
- Fork visualization as sub-rows or visual indicators
- Configurable idle threshold in UI (not just CLI flag)
- Static HTML export for sharing

**Defer (v2+):**
- Arbitrary date range picker
- Ticket-based cross-day view (multi-day ticket summary)
- CSV/JSON data export (Python `query.py` covers this currently)
- AI-powered insights, manual time editing, team sharing — explicitly out of scope

### Architecture Approach

The architecture is a single-process Node.js application: `bin/cli.js` starts a Fastify server, serves the pre-built Vue `dist/` as static files alongside `/api/*` routes, and opens the browser via the `open` package. There is no separate process for the frontend. The service layer ports the Python proof-of-concept scripts into distinct classes: `ForkDetector`, `TicketDetector`, `TranscriptIndexer` (fast first/last timestamp scan), `TranscriptImporter` (full parse), and `TimelineService` (query + working time calculation). A two-phase import (index first, then selective full parse) is required to keep first-launch time acceptable as transcript history grows.

See `/home/claude/cctimereporter/.planning/research/ARCHITECTURE.md` for full data flow diagrams and anti-pattern catalog.

**Major components:**
1. `bin/cli.js` — CLI entry point: parse args, find free port, start server, open browser
2. `src/server/` — Fastify app: static file serving (`ui/dist/`), REST API routes (`/api/timeline`, `/api/projects`, `/api/import`)
3. `src/services/TranscriptIndexer` — fast first/last timestamp scan per JSONL file; cache in `file_index` table
4. `src/services/TranscriptImporter` — full JSONL parse → fork detection → ticket scoring → SQLite insert
5. `src/services/TimelineService` — SQLite query → working time intervals → JSON for API
6. `src/db/` — `node:sqlite` singleton, schema DDL, migration tracking
7. `ui/` — Vue 3 SPA with `hy-vue-gantt`: `TimelinePage.vue`, `GanttRow.vue`, `ProjectFilter.vue`

### Critical Pitfalls

See `/home/claude/cctimereporter/.planning/research/PITFALLS.md` for full details, technical debt patterns, and recovery strategies.

1. **Native SQLite binary failures** — Use `node:sqlite` (built-in) instead of `better-sqlite3`; document `engines: { node: ">=22.12.0" }` in `package.json`; add startup version check
2. **npx cold-start bloat** — All Vite/Vue build tooling in `devDependencies`; pre-build `dist/` before publish; verify `npm pack --dry-run` shows under 15MB
3. **Cross-platform path bugs** — Never use tilde literals; always `path.join(os.homedir(), '.claude', ...)` throughout; avoid `__dirname` for home resolution
4. **Port conflict crash** — Dynamic port allocation with auto-retry; attach `EADDRINUSE` error handler; always print URL to stdout regardless of browser-open result
5. **Memory OOM on large JSONL** — Stream JSONL line-by-line via `readline`; never `JSON.parse(fs.readFileSync(...))` a whole JSONL file; wrap batch inserts in transactions
6. **Re-import duplication** — Track `last_imported_mtime` per file in `import_log`; skip files unchanged since last import; add UNIQUE constraints to prevent duplicate sessions

## Implications for Roadmap

Based on combined research, the natural phase structure follows the component dependency chain in ARCHITECTURE.md: database layer → services layer → server → CLI → frontend. Each phase produces a runnable artifact that validates the next phase's dependencies.

### Phase 1: Project Setup and Database Layer

**Rationale:** Everything else depends on the database layer. This phase eliminates the highest-severity pitfall (native binary failures) at day one by establishing `node:sqlite` as the foundation, and sets up the build/publish infrastructure before any features are built on top of it.

**Delivers:** Working npm package skeleton with `package.json` (`engines`, `files`, `bin`), `node:sqlite` connection singleton, schema DDL ported from `scripts/schema.sql`, migration tracking, and a validated `npm pack` output under 15MB.

**Addresses:** Pitfall 1 (native binary), Pitfall 2 (package bloat). Establishes path handling conventions (`os.homedir()`) used by all later phases.

**Avoids:** Starting on frontend before database contract is stable; distributing a package with Vite in `dependencies`.

### Phase 2: Service Layer — Import Pipeline

**Rationale:** The import pipeline is the direct port of the most complex existing Python code (`import_transcripts.py`). Building it before the server or UI means the data layer is independently testable. This order also surfaces performance characteristics (import speed, large file handling) before the UI creates assumptions about data availability.

**Delivers:** `ForkDetector`, `TicketDetector`, `TranscriptIndexer`, and `TranscriptImporter` — the full JSONL-to-SQLite pipeline. Validated by running imports against the real `~/.claude/projects/` directory and inspecting the SQLite database.

**Addresses:** On-demand import (P1 feature), import progress feedback, re-import idempotency. Avoids memory OOM by establishing readline streaming pattern here.

**Avoids:** Pitfall 5 (memory OOM), Pitfall 6 (re-import duplication). Validates that the two-phase index approach keeps import time acceptable.

### Phase 3: Service Layer — Query and Timeline Data

**Rationale:** `TimelineService` (the port of `query.py` + `timeline.py` working time calculation) depends on correctly imported data from Phase 2. Building this as a separate phase validates data correctness before any rendering code is written.

**Delivers:** `TimelineService` with working time calculation, idle gap detection (configurable threshold), and a JSON-serializable timeline data structure that the API will serve. Validated by comparing output against the Python `query.py` and `timeline.py` for the same dates.

**Addresses:** Working time vs wall-clock distinction (table stakes), idle gap calculation, three-tier session label derivation.

**Avoids:** Discovering working time calculation bugs after the UI is built against wrong data.

### Phase 4: Server and CLI Entry Point

**Rationale:** With the full data layer working, the server is thin wiring — routes call services, static files serve from `ui/dist/`. Building the server before the Vue frontend establishes the API contract that the frontend will fetch against. The CLI entry point (dynamic port, browser open) completes the `npx` invocation flow.

**Delivers:** Working `npx cctimereporter` that starts a Fastify server, serves a placeholder `index.html`, exposes `/api/timeline`, `/api/projects`, `/api/import`, handles port conflicts gracefully, and opens the browser. Testable end-to-end with `curl`.

**Addresses:** Port conflict (Pitfall 4), WSL browser open (cross-platform), always-print-URL behavior, `--no-open` flag.

**Avoids:** Building the Vue UI against a moving API target; CORS configuration mistakes (single-origin, single server).

### Phase 5: Vue Frontend and Gantt Visualization

**Rationale:** With a stable API contract and working import pipeline, the Vue frontend is the last piece. This order means every API call the frontend makes will return real data, not mocked responses. `hy-vue-gantt` integration risk is isolated to this phase.

**Delivers:** Full Vue 3 SPA with Gantt bars, idle gap visualization, session labels, hover tooltips, date navigation, project grouping, color-coding, project filter, and import trigger with progress feedback. Pre-built `dist/` committed to the repository.

**Addresses:** All P1 features from FEATURES.md: Gantt bars, idle gaps, session labels, date navigation, tooltips, project grouping/filter, import feedback.

**Avoids:** Pitfall: Gantt rendering freeze with 500+ bars — validate `hy-vue-gantt` virtual scrolling behavior early in this phase before building the full UI around it.

### Phase 6: Polish, v1.x Features, and Publish

**Rationale:** Once the daily-driver replacement is working (Phase 5), add the v1.x features (rolling 30-day view, fork visualization, static HTML export) and publish.

**Delivers:** Published npm package; rolling window view; fork sub-row or indicator; configurable threshold in UI; `npm publish` with correct `files`, `engines`, and `bin` fields validated.

**Addresses:** P2 features: rolling 30-day view, fork visualization, threshold UI control, static HTML export.

**Avoids:** Publishing before validating `npm pack --dry-run` output and end-to-end `npx` install test.

### Phase Ordering Rationale

- Database before services before server before UI is dictated by component dependencies — each layer depends on the one below.
- The two-phase service split (import pipeline then query) isolates data-writing concerns from data-reading concerns; bugs in each are found independently.
- Server before Vue frontend establishes the API contract as a fixed target; otherwise the frontend and backend co-evolve and create integration bugs.
- Python proof-of-concept parity should be validated at Phase 3 (query output) and Phase 5 (visual output) before adding any new features.
- The `hy-vue-gantt` MEDIUM confidence risk is scoped to Phase 5. If the library is unsuitable, the fallback (D3 custom or Frappe Gantt) does not affect Phases 1-4.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 5 (Gantt frontend):** `hy-vue-gantt` API details and configuration for custom bar rendering (idle gap fading, sub-rows for forks) are not fully documented from research. Needs a spike/prototype early in this phase before committing to the component API design.
- **Phase 2 (Import pipeline):** The two-phase index approach (TranscriptIndexer fast scan) is novel — no direct PoC equivalent. Performance characteristics with real data need validation before the architecture decision is locked in.

Phases with standard patterns (research not needed):

- **Phase 1 (Project setup):** `package.json` configuration, `node:sqlite` setup, and npm packaging are fully documented in official sources.
- **Phase 4 (Server/CLI):** Fastify static file serving, dynamic port allocation, and `open` package usage are well-documented standard patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core stack (Node 22, `node:sqlite`, Fastify, Vue 3, Vite 7) is HIGH confidence from official sources. `hy-vue-gantt` is MEDIUM — active fork verified on GitHub but npm version not directly confirmed. Pinia 3 / Vue Router 5 are MEDIUM from WebSearch. |
| Features | MEDIUM | Table stakes derived from inspection of existing Python implementation (HIGH confidence) plus analogues (WakaTime, TMetric — LOW confidence). No direct competitor exists. Feature list is stable and the MVP is well-defined. |
| Architecture | HIGH | Patterns (pre-built SPA, single-port server, synchronous SQLite, two-phase import) are well-established with official documentation. Component structure maps directly to existing Python scripts. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (native binary failures, package bloat, path bugs, port conflicts) are documented with official sources or specific GitHub issues. UX pitfalls are MEDIUM where no authoritative source exists. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **`hy-vue-gantt` API completeness:** The library's ability to render faded idle-gap segments within bars (not just solid bars) needs validation with a prototype. If it cannot, D3.js custom SVG bars are the fallback. Address in Phase 5 planning.
- **Node 22 adoption baseline:** Research assumes Node 22 is acceptable as the minimum. If target users are on Node 20 LTS, the `node:sqlite` decision requires revisiting (fallback: `better-sqlite3` with documented limitations). Validate with any known user population before Phase 1 commit.
- **Rolling window date axis design:** The 30-day view with sparse-day handling (proportional time axis vs. collapsed empty days) has no resolved design decision. Both approaches have tradeoffs. Address during Phase 6 planning.
- **`TranscriptIndexer` performance:** The fast first/last-line scan assumes JSONL files have consistent structure (first line and last line are both valid JSON with a `timestamp` field). Real-world malformed files or mid-write files may not satisfy this. Validate against actual transcript data during Phase 2.

## Sources

### Primary (HIGH confidence)
- Node.js SQLite docs (nodejs.org/api/sqlite.html) — `node:sqlite` stability, API, Node version requirements
- `better-sqlite3` GitHub issues #1367, #1382, #1384 — native binary distribution failures
- `claude-flow` GitHub issue #360 — `better-sqlite3` ARM64 failure in npx context
- Vite 7 release blog (vite.dev/blog/announcing-vite7) — Node version requirements, build output
- Vue 3.5 blog (blog.vuejs.org/posts/vue-3-5) — stability, memory improvements, Composition API status
- Express static file serving docs (expressjs.com) — SPA fallback pattern
- `open` npm package (sindresorhus/open) — WSL-aware browser launch
- Fastify v5 GA (openjsf.org) — stability, Node 20+ requirement
- `better-sqlite3` performance docs — WAL mode, transaction patterns
- Existing Python implementation (`scripts/timeline.py`, `scripts/import_transcripts.py`, `references/PROJECT-STATUS.md`) — current feature set and architecture

### Secondary (MEDIUM confidence)
- HyVueGantt GitHub (github.com/Xeyos88/HyVueGantt) — active fork status, Vue 3 Composition API support
- Vue 2025 in review (vueschool.io) — Pinia 3, Vue Router 5 ecosystem status
- lirantal/nodejs-cli-apps-best-practices — cross-platform CLI pitfalls
- bcoe/awesome-cross-platform-nodejs — path handling, `os.homedir()` patterns

### Tertiary (LOW confidence)
- WakaTime, TMetric product overviews — used only for table stakes feature inference; this project has no direct competitor
- Gantt interactivity patterns blog (anychart.com) — hover/tooltip UX conventions
- Date filter UI patterns (evolvingweb.com) — date navigation UX conventions

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
