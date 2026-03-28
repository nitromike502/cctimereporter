# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day
**Current focus:** v0.8.0 Programmatic Data Access — Phase 30: CLI Subcommands

## Current Position

Phase: 30 of 31 (CLI Subcommands) — In progress
Plan: 1 of 2 in current phase
Status: In progress — 30-01 complete, ready for 30-02
Last activity: 2026-03-28 — Completed 30-01-PLAN.md (CLI command handler modules + format utilities)

Progress: [███████████████████████████░] 96% (30/31 phases complete... plan-level: 30 of ~33 plans)
Overall:  Phases 1-29 complete, Phase 30 in progress

## Performance Metrics

**v0.7.0 Velocity:**
- Total plans completed: 6 (Phases 22-27)
- Phases: 6
- Timeline: 5 days (2026-03-20 → 2026-03-24)

**v0.8.0 Velocity (in progress):**
- Phase 28: 1 plan in ~3 min

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- [v0.8.0 planning]: MCP server uses stdio transport (not HTTP on Fastify) — simpler, standard for npx-launched MCP servers
- [v0.8.0 planning]: Service layer extracted first — both CLI and MCP depend on it; refactor must be isolated for regression safety
- [v0.8.0 planning]: CLI before MCP — validates service layer with zero new dependencies before protocol complexity is added
- [v0.8.0 planning]: Coordination locks (SVC-03, SVC-04, COORD-*) grouped in Phase 29 — DB concern, closely coupled to service singleton
- [Phase 28]: Factory pattern for DB-bound services — createXxxService(db) called at plugin registration, DB handle bound in closure
- [Phase 28]: Dynamic IN clause fork queries stay inside getTimelineUI() — variable placeholder count prevents pre-preparation
- [Phase 28]: Import service uses module-level state (not factory) — concurrency guard is process-wide, not DB-bound
- [Phase 28]: getTimelineReport uses userTicket ?? ticket as grouping key (user override preferred)
- [Phase 29-01]: busy_timeout = 5000ms placed before SCHEMA_DDL so DDL execution benefits from timeout
- [Phase 29-01]: UNIQUE constraint race in claimLock: re-SELECT winner on conflict (no retry loop)
- [Phase 29-01]: ImportConflictError handles both string (DB datetime) and epoch number (in-memory) startedAt formats
- [Phase 29-01]: 409 response body uses err.message directly — detailed message flows through automatically
- [Phase 29-02]: Lock claimed AFTER listen() — port bind determines port, DB lock determines ownership; port-fallback loop preserved for non-cctimereporter conflicts
- [Phase 29-02]: exit(0) on server conflict — second instance detecting a live server is not an error condition
- [Phase 30-01]: Dynamic import for services inside action handlers — defers module loading until command actually runs
- [Phase 30-01]: importCommand uses instanceof ImportConflictError for exit code 2 vs general error exit code 1
- [Phase 30-01]: Command factory pattern — xyzCommand(db) returns new Command(...) with .action() bound to db; all four leaf modules ready for Plan 02 wiring

### Pending Todos

None.

### Blockers/Concerns

- [Phase 31]: MCP SDK transport API is MEDIUM confidence — `handleRequest` signature and session Map lifecycle should be verified against actual installed package before writing tool definitions. Allow iteration time.
- [Phase 31]: Resolve stateless vs stateful transport baseline during Phase 31 planning — start stateless, upgrade only if `trigger_import` needs streaming (per research, synchronous result is sufficient).

## Session Continuity

Last session: 2026-03-28
Stopped at: Completed 30-01-PLAN.md — CLI command handler modules (format, summary, sessions, import) with commander@14
Resume file: None
