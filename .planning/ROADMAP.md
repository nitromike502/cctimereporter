# Roadmap: CC Time Reporter

## Overview

A working Python proof-of-concept is the foundation — the Node.js port moves layer by layer from database to services to server/CLI to component library to full Gantt UI. Each phase delivers a verified, independently runnable artifact that the next phase builds on. The component library phase gates the visualization phase: no UI components reach features without first being approved in the preview page.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - npm package skeleton, node:sqlite database layer, schema DDL
- [x] **Phase 2: Import Pipeline** - JSONL parsing, fork detection, ticket scoring, idempotent import
- [x] **Phase 3: Server and CLI** - Fastify API, npx entry point, browser launch
- [ ] **Phase 4: Component Library** - Custom component system, preview page, approved component set
- [ ] **Phase 5: Timeline UI** - Gantt visualization, date navigation, project filtering, import trigger

## Phase Details

### Phase 1: Foundation
**Goal**: A publishable npm package skeleton exists with a working database layer that eliminates the native binary failure risk on day one
**Depends on**: Nothing (first phase)
**Requirements**: DIST-02
**Success Criteria** (what must be TRUE):
  1. Running `node bin/cli.js` exits cleanly (no errors) with a help message or version output
  2. `npm pack --dry-run` output is under 15MB and contains no `node_modules/`, no Vite build tooling in the production file list
  3. The SQLite database initializes at `~/.cctimereporter/data.db` with all schema tables present
  4. Node version check at startup rejects Node < 22 with a clear error message
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Package skeleton, CLI entry point, and node:sqlite database layer with minimal v1 schema

---

### Phase 2: Import Pipeline
**Goal**: JSONL transcripts are fully imported into SQLite with correct fork detection, ticket scoring, and idempotent re-import behavior — validated against the Python PoC output
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. Running the importer against `~/.claude/projects/` populates `sessions` and `messages` tables with records matching what `scripts/import_transcripts.py --all` produces for the same files
  2. Re-running the importer a second time produces no duplicate sessions (idempotent — same row counts as after first run)
  3. A session with a `/prep-ticket AILASUP-123` slash command is assigned that ticket as its primary ticket (verifiable via SQLite query)
  4. A JSONL file that has not changed since last import is skipped (verified by log output or import_log table mtime check)
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Schema migration v1->v2 and database writer module
- [x] 02-02-PLAN.md — JSONL parser, fork detector, and ticket scorer
- [x] 02-03-PLAN.md — Project discovery and import orchestrator

---

### Phase 3: Server and CLI
**Goal**: `npx cctimereporter` starts a local server, opens the browser, and exposes working API routes — the full invocation flow works end-to-end
**Depends on**: Phase 2
**Requirements**: DIST-01
**Success Criteria** (what must be TRUE):
  1. Running `npx cctimereporter` (or `node bin/cli.js`) starts a server, prints the URL to stdout, and opens the browser to `http://localhost:<port>/timeline?date=<today>`
  2. If the default port is occupied, the server starts on the next available port and prints the new URL (no crash)
  3. `curl http://localhost:<port>/api/timeline?date=<date>` returns a valid JSON response with session data for any date that has imported data
  4. `curl http://localhost:<port>/api/projects` returns a JSON list of known project directories
  5. `curl -X POST http://localhost:<port>/api/import` triggers an import and returns a progress/completion response
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Fastify server factory and API routes (timeline, projects, import)
- [x] 03-02-PLAN.md — CLI entry point wiring (port fallback, browser open, graceful shutdown)

---

### Phase 4: Component Library
**Goal**: A custom component system exists with every v1-needed component documented in a live preview page — no component reaches a feature page without passing through the library
**Depends on**: Phase 3
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. Navigating to `/components` in the running app shows a preview page with every component and all its variants/states rendered visually
  2. The preview page includes working examples of: Button, DatePicker, Checkbox, Tooltip, ProgressBar, and Badge/Tag
  3. All components share consistent design tokens (colors, spacing, typography) defined in one place — changing a token updates all components
  4. Each component renders correctly in its disabled, loading, and error states (where applicable), visible on the preview page
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

---

### Phase 5: Timeline UI
**Goal**: A user can run one command and see a clear, interactive Gantt timeline of their Claude Code sessions for any date — the product works
**Depends on**: Phase 4
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, DATA-05
**Success Criteria** (what must be TRUE):
  1. The timeline page shows session bars on a time-of-day horizontal axis, with idle gaps rendered as faded/lighter segments within each bar
  2. Each session bar is labeled with the primary ticket ID, falling back to git branch, falling back to the first 5 words of the initial prompt
  3. Sessions are grouped by Claude project directory, each group has a distinct color, and a legend shows the color-to-project mapping
  4. Hovering a session bar shows a tooltip with: session ID, ticket, branch, working time, wall-clock span, and message count
  5. The user can navigate to previous/next day, jump to Today or Yesterday via shortcuts, and the URL updates to `/timeline?date=YYYY-MM-DD` at each step
  6. The user can show or hide individual projects using a filter control, and those selections persist during the session
  7. Clicking an "Import" button in the UI triggers a fresh import and shows visible progress feedback while it runs
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

---

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/1 | Complete | 2026-02-25 |
| 2. Import Pipeline | 3/3 | Complete | 2026-02-26 |
| 3. Server and CLI | 2/2 | Complete | 2026-02-26 |
| 4. Component Library | 0/TBD | Not started | - |
| 5. Timeline UI | 0/TBD | Not started | - |
