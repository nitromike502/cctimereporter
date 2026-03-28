# Roadmap: CC Time Reporter

## Milestones

- SHIPPED **v1.0 MVP** — Phases 1-6 (shipped 2026-03-01)
- SHIPPED **v0.2.0 UX and Insights** — Phases 7-11 (shipped 2026-03-04)
- SHIPPED **v0.3.0 Session Polish** — Phases 12-16 (shipped 2026-03-05)
- SHIPPED **v0.4.0 Session Intelligence** — Phases 17-18 (shipped 2026-03-08)
- SHIPPED **v0.5.0 Import Performance** — Ad-hoc (shipped 2026-03-12, no GSD phases)
- SHIPPED **v0.6.0 Gantt Chart Zoom** — Phases 19-21 (shipped 2026-03-19)
- SHIPPED **v0.7.0 Fork Visualization + Stored Messages** — Phases 22-27 (shipped 2026-03-24)
- ACTIVE **v0.8.0 Programmatic Data Access** — Phases 28-31 (in progress)

---

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-01</summary>

- [x] Phase 1: Foundation (1/1 plans) — completed 2026-02-25
- [x] Phase 2: Import Pipeline (3/3 plans) — completed 2026-02-26
- [x] Phase 3: Server and CLI (2/2 plans) — completed 2026-02-26
- [x] Phase 4: Component Library (3/3 plans) — completed 2026-02-27
- [x] Phase 5: Timeline UI (3/3 plans) — completed 2026-02-28
- [x] Phase 6: Timeline Polish (2/2 plans) — completed 2026-02-28

See: `.planning/milestones/v1-ROADMAP.md` for full details.

</details>

<details>
<summary>v0.2.0 UX and Insights (Phases 7-11) — SHIPPED 2026-03-04</summary>

- [x] Phase 7: Rolling Import and Onboarding (3/3 plans) — completed 2026-03-03
- [x] Phase 8: Session Context (2/2 plans) — completed 2026-03-04
- [x] Phase 9: Day Summary (1/1 plans) — completed 2026-03-04
- [x] Phase 10: Theming and Tour (2/2 plans) — completed 2026-03-04
- [x] Phase 11: Bug Fixes (3/3 plans) — completed 2026-03-04

See: `.planning/milestones/v0.2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>v0.3.0 Session Polish (Phases 12-16) — SHIPPED 2026-03-05</summary>

- [x] Phase 12: Tour Enhancements (1/1 plans) — completed 2026-03-04
- [x] Phase 13: Summary Parser (1/1 plans) — completed 2026-03-04
- [x] Phase 14: Session Message Modal (1/1 plans) — completed 2026-03-04
- [x] Phase 15: Session Naming (1/1 plans) — completed 2026-03-05
- [x] Phase 16: Import Progress Indicator (2/2 plans) — completed 2026-03-05

</details>

<details>
<summary>v0.4.0 Session Intelligence (Phases 17-18) — SHIPPED 2026-03-08</summary>

- [x] Phase 17: Session Editing (2/2 plans) — completed 2026-03-07
- [x] Phase 18: Ticket Detection Pipeline (2/2 plans) — completed 2026-03-07

See: `.planning/milestones/v0.4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>v0.6.0 Gantt Chart Zoom (Phases 19-21) — SHIPPED 2026-03-19</summary>

- [x] Phase 19: Layout Restructure (1/1 plans) — completed 2026-03-19
- [x] Phase 20: Core Zoom Mechanic (2/2 plans) — completed 2026-03-19
- [x] Phase 21: Zoom Polish (1/1 plans) — completed 2026-03-19

See: `.planning/milestones/v0.6.0-ROADMAP.md` for full details.

</details>

<details>
<summary>v0.7.0 Fork Visualization + Stored Messages (Phases 22-27) — SHIPPED 2026-03-24</summary>

- [x] Phase 22: Schema and Import (1/1 plans) — completed 2026-03-22
- [x] Phase 23: Backend Fork Segments (1/1 plans) — completed 2026-03-22
- [x] Phase 24: Gantt Fork Bar Rendering (1/1 plans) — completed 2026-03-22
- [x] Phase 25: Interaction and Detail Panel (1/1 plans) — completed 2026-03-24
- [x] Phase 26: Store Message Content (1/1 plans) — completed 2026-03-23
- [x] Phase 27: Messages Modal from DB (1/1 plans) — completed 2026-03-24

See: `.planning/milestones/v0.7.0-ROADMAP.md` for full details.

</details>

---

### v0.8.0 Programmatic Data Access (In Progress)

**Milestone Goal:** Expose session data through a stdio MCP server and CLI subcommands so Claude agents and scripts can pull time and session data programmatically. Both surfaces are thin wrappers over a shared service layer extracted from existing route handlers.

- [x] **Phase 28: Service Layer** — Extract query and import logic into `src/services/` shared by routes, CLI, and MCP
- [x] **Phase 29: Multi-Instance Coordination** — DB-based locks for server ownership and import exclusivity across processes
- [ ] **Phase 30: CLI Subcommands** — Non-interactive `summary`, `sessions`, and `import` subcommands with JSON stdout
- [ ] **Phase 31: MCP Server** — stdio MCP server with six tools for programmatic data access and server management

#### Phase 28: Service Layer

**Goal:** Timeline query and import logic lives in `src/services/` modules callable by routes, CLI, and MCP — no behavior change for existing web UI
**Depends on:** Phase 27 (complete codebase baseline)
**Requirements:** SVC-01, SVC-02
**Success Criteria** (what must be TRUE):
  1. All existing API routes (`/api/timeline`, `/api/sessions/:id/messages`, `/api/import`) produce identical responses after refactoring — no regression
  2. `src/services/timeline.js` and `src/services/sessions.js` export plain functions that accept a `db` argument and return plain JS objects
  3. `src/services/import.js` exports a function that accepts a `db` and progress callback, callable without starting a web server
  4. `src/services`, `src/cli`, and `src/mcp` appear in `package.json` `files` array so npx distribution is not broken
**Plans:** 1 plan

Plans:
- [ ] 28-01-PLAN.md — Extract service modules, shared utilities, and thin route wrappers

#### Phase 29: Multi-Instance Coordination

**Goal:** Multiple processes (web server, CLI, MCP instances) share one SQLite database safely — only one web server runs at a time and only one import runs at a time, with automatic stale-process recovery
**Depends on:** Phase 28 (service layer, shared import-state singleton)
**Requirements:** SVC-03, SVC-04, COORD-01, COORD-02, COORD-03, COORD-04
**Success Criteria** (what must be TRUE):
  1. Running `npx cctimereporter import` while the web server is already running import does not corrupt data — the second process receives a clear "import already in progress" rejection
  2. Starting a second web server instance returns the URL of the already-running server instead of failing or binding a second port
  3. If the process that owned the server or import lock is no longer alive (dead PID), the next process automatically reclaims ownership without manual intervention
  4. Multiple MCP server instances can query the database simultaneously without errors or lock timeouts
**Plans:** 2 plans

Plans:
- [ ] 29-01-PLAN.md — Schema migration, coordination service, and import lock integration
- [ ] 29-02-PLAN.md — Server ownership claim and conflict detection in CLI

#### Phase 30: CLI Subcommands

**Goal:** Users and scripts can call `npx cctimereporter summary`, `sessions`, and `import` from the terminal and receive machine-readable JSON output — the default no-argument invocation continues to open the browser as before
**Depends on:** Phase 28 (service layer), Phase 29 (coordination locks)
**Requirements:** CLI-01, CLI-02, CLI-03, CLI-04
**Success Criteria** (what must be TRUE):
  1. `npx cctimereporter summary --date 2026-03-25` prints a JSON day summary to stdout and exits with code 0, nothing else on stdout
  2. `npx cctimereporter sessions --date 2026-03-25` prints a JSON session list to stdout and exits cleanly
  3. `npx cctimereporter import --days 7` runs import without starting a web server, prints progress to stderr, exits with code 0 on success and non-zero on failure
  4. `npx cctimereporter` with no subcommand starts the web server and opens the browser — identical behavior to v0.7.0
**Plans:** 2 plans

Plans:
- [ ] 30-01-PLAN.md — Format utility and command handler modules (summary, sessions, import)
- [ ] 30-02-PLAN.md — Commander integration in bin/cli.js and package.json updates

#### Phase 31: MCP Server

**Goal:** `npx cctimereporter --mcp` starts a stdio MCP server with six tools (`get_day_summary`, `get_sessions`, `get_session_messages`, `trigger_import`, `start_server`, `stop_server`, `server_status`) usable by Claude agents
**Depends on:** Phase 28 (service layer), Phase 29 (coordination locks), Phase 30 (mode dispatch established)
**Requirements:** MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08
**Success Criteria** (what must be TRUE):
  1. A Claude agent can call `get_day_summary` for a date and receive ticket-grouped working time totals in structured JSON
  2. A Claude agent can call `trigger_import` and receive a success or "already running" result without crashing or hanging
  3. `start_server` returns the URL of an already-running web server if one exists, or starts a new one and returns its URL — the agent never needs to check first
  4. `stop_server` terminates the web server (including if it is owned by a different process) and clears stale ownership from the DB
  5. Running multiple `npx cctimereporter --mcp` instances simultaneously does not produce errors — reads are concurrent-safe via WAL mode
**Plans:** TBD

Plans:
- [ ] 31-01: MCP server setup — stdio transport, tool registration scaffold, mode dispatch
- [ ] 31-02: Query tools — `get_day_summary`, `get_sessions`, `get_session_messages`
- [ ] 31-03: Action tools — `trigger_import`, `start_server`, `stop_server`, `server_status`

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 1/1 | Complete | 2026-02-25 |
| 2. Import Pipeline | v1.0 | 3/3 | Complete | 2026-02-26 |
| 3. Server and CLI | v1.0 | 2/2 | Complete | 2026-02-26 |
| 4. Component Library | v1.0 | 3/3 | Complete | 2026-02-27 |
| 5. Timeline UI | v1.0 | 3/3 | Complete | 2026-02-28 |
| 6. Timeline Polish | v1.0 | 2/2 | Complete | 2026-02-28 |
| 7. Rolling Import and Onboarding | v0.2.0 | 3/3 | Complete | 2026-03-03 |
| 8. Session Context | v0.2.0 | 2/2 | Complete | 2026-03-04 |
| 9. Day Summary | v0.2.0 | 1/1 | Complete | 2026-03-04 |
| 10. Theming and Tour | v0.2.0 | 2/2 | Complete | 2026-03-04 |
| 11. Bug Fixes | v0.2.0 | 3/3 | Complete | 2026-03-04 |
| 12. Tour Enhancements | v0.3.0 | 1/1 | Complete | 2026-03-04 |
| 13. Summary Parser | v0.3.0 | 1/1 | Complete | 2026-03-04 |
| 14. Session Message Modal | v0.3.0 | 1/1 | Complete | 2026-03-04 |
| 15. Session Naming | v0.3.0 | 1/1 | Complete | 2026-03-05 |
| 16. Import Progress Indicator | v0.3.0 | 2/2 | Complete | 2026-03-05 |
| 17. Session Editing | v0.4.0 | 2/2 | Complete | 2026-03-07 |
| 18. Ticket Detection Pipeline | v0.4.0 | 2/2 | Complete | 2026-03-07 |
| 19. Layout Restructure | v0.6.0 | 1/1 | Complete | 2026-03-19 |
| 20. Core Zoom Mechanic | v0.6.0 | 2/2 | Complete | 2026-03-19 |
| 21. Zoom Polish | v0.6.0 | 1/1 | Complete | 2026-03-19 |
| 22. Schema and Import | v0.7.0 | 1/1 | Complete | 2026-03-22 |
| 23. Backend Fork Segments | v0.7.0 | 1/1 | Complete | 2026-03-22 |
| 24. Gantt Fork Bar Rendering | v0.7.0 | 1/1 | Complete | 2026-03-22 |
| 25. Interaction and Detail Panel | v0.7.0 | 1/1 | Complete | 2026-03-24 |
| 26. Store Message Content | v0.7.0 | 1/1 | Complete | 2026-03-23 |
| 27. Messages Modal from DB | v0.7.0 | 1/1 | Complete | 2026-03-24 |
| 28. Service Layer | v0.8.0 | 1/1 | Complete | 2026-03-26 |
| 29. Multi-Instance Coordination | v0.8.0 | 2/2 | Complete | 2026-03-27 |
| 30. CLI Subcommands | v0.8.0 | 0/2 | Not started | - |
| 31. MCP Server | v0.8.0 | 0/3 | Not started | - |
