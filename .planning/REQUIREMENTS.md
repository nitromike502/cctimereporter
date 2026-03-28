# Requirements: CC Time Reporter v0.8.0

**Defined:** 2026-03-25
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v0.8.0 Requirements

### Service Layer

- [ ] **SVC-01**: Timeline query logic extracted from route handlers into `src/services/` modules callable by routes, CLI, and MCP
- [ ] **SVC-02**: Import orchestration extracted into service layer with progress callback support
- [ ] **SVC-03**: DB-based server ownership coordination — process registers PID/port in SQLite, other processes detect and defer
- [ ] **SVC-04**: DB-based import lock — process registers import-in-progress in SQLite, other processes reject concurrent imports with clear message

### MCP Server

- [ ] **MCP-01**: `npx cctimereporter --mcp` starts a stdio MCP server (using @modelcontextprotocol/sdk)
- [ ] **MCP-02**: `get_day_summary` tool returns sessions grouped by project with working time, tickets, and branches for a given date
- [ ] **MCP-03**: `get_sessions` tool returns full session list with start/end, ticket, branch, project, working time, and idle gaps for a given date
- [ ] **MCP-04**: `get_session_messages` tool returns message content for a specific session ID
- [ ] **MCP-05**: `trigger_import` tool runs import with optional maxAgeDays parameter, respects DB-based import lock
- [ ] **MCP-06**: `start_server` tool starts Fastify web server if not already running; returns URL if already running from another session (with notice)
- [ ] **MCP-07**: `stop_server` tool stops the web server — kills owning process if stuck, clears stale ownership
- [ ] **MCP-08**: `server_status` tool reports whether web server is running, which PID owns it, and on what port

### CLI Subcommands

- [ ] **CLI-01**: `npx cctimereporter summary --date YYYY-MM-DD` outputs JSON day summary to stdout
- [ ] **CLI-02**: `npx cctimereporter sessions --date YYYY-MM-DD` outputs JSON session list to stdout
- [ ] **CLI-03**: `npx cctimereporter import [--days N]` runs import without starting server, respects DB lock, progress to stderr
- [ ] **CLI-04**: `npx cctimereporter` with no subcommand starts web server and opens browser (backward compatible)

### Multi-Instance Coordination

- [ ] **COORD-01**: Multiple MCP server instances can read from the same SQLite database concurrently without conflict
- [ ] **COORD-02**: Only one web server instance runs at a time — first to claim port wins, others detect and report existing URL
- [ ] **COORD-03**: Only one import runs at a time across all instances — DB lock with PID and timestamp, stale lock detection
- [ ] **COORD-04**: Stale process detection — if owning PID is dead, ownership/lock is automatically reclaimed

## Future Requirements

### Plugin Integration

- **PLUG-01**: Claude Code plugin with `.mcp.json` that auto-registers the stdio MCP server
- **PLUG-02**: Plugin skill documenting CLI commands and MCP tools for agent context

### Extended MCP Tools

- **MCP-09**: `get_date_range_summary` tool for multi-day time reporting
- **MCP-10**: `search_sessions` tool for finding sessions by ticket, branch, or keyword

## Out of Scope

| Feature | Reason |
|---------|--------|
| HTTP/SSE MCP transport | Stdio is standard for npx-launched MCP servers; HTTP adds complexity without benefit |
| MCP session management (stateful) | Stateless tools sufficient for query/import operations |
| Web UI changes | This milestone is programmatic access only — UI unchanged |
| Harvest/Jira integration | Separate milestone — this provides the data layer those integrations consume |
| Plugin creation | Separate task after MCP server is stable |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SVC-01 | Phase 28 | Complete |
| SVC-02 | Phase 28 | Complete |
| SVC-03 | Phase 29 | Complete |
| SVC-04 | Phase 29 | Complete |
| MCP-01 | Phase 31 | Complete |
| MCP-02 | Phase 31 | Complete |
| MCP-03 | Phase 31 | Complete |
| MCP-04 | Phase 31 | Complete |
| MCP-05 | Phase 31 | Complete |
| MCP-06 | Phase 31 | Complete |
| MCP-07 | Phase 31 | Complete |
| MCP-08 | Phase 31 | Complete |
| CLI-01 | Phase 30 | Complete |
| CLI-02 | Phase 30 | Complete |
| CLI-03 | Phase 30 | Complete |
| CLI-04 | Phase 30 | Complete |
| COORD-01 | Phase 29 | Complete |
| COORD-02 | Phase 29 | Complete |
| COORD-03 | Phase 29 | Complete |
| COORD-04 | Phase 29 | Complete |

**Coverage:**
- v0.8.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 — traceability mapped after roadmap creation*
