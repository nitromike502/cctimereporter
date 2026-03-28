# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day
**Current focus:** v0.8.0 Programmatic Data Access — Phase 31: MCP Server

## Current Position

Phase: 31 of 31 (MCP Server — FINAL PHASE)
Plan: 1 of 2 in current phase
Status: In progress — Plan 01 complete, Plan 02 (action tools + import trigger) pending
Last activity: 2026-03-28 — Completed 31-01-PLAN.md (MCP server factory + 4 query tools)

Progress: [█████████████████████████████] 99% (plan-level: 33 of ~34 plans)
Overall:  Phases 1-30 complete, Phase 31 Plan 01 complete

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
- [Phase 30-02]: Dynamic imports for node:fs/url/path in cli.js to avoid static import hoisting over Node version check
- [Phase 30-02]: serve.action() loads Fastify lazily — CLI subcommands complete in ~70ms with no server overhead
- [Phase 30-02]: serve as default command via addCommand(serve, { isDefault: true }) preserves backward-compatible no-args behavior
- [Phase 30-02]: process.on('exit') db.close() for CLI subcommand cleanup; SIGINT/SIGTERM handlers for serve path
- [Phase 31-01]: server.connect(transport) resolves immediately (non-blocking) — process kept alive by stdin.on('close') listener, not by awaiting connect
- [Phase 31-01]: isMcpMode else-branch wraps entire Commander section — MCP mode skips Commander setup entirely
- [Phase 31-01]: registerTool inputSchema is ZodRawShape (plain object of zod schemas) NOT z.object()
- [Phase 31-01]: registerActionTools wrapped in try/catch dynamic import in server.js — Plan 01 works standalone before Plan 02 creates action.js

### Pending Todos

None.

### Blockers/Concerns

- [Phase 31]: MCP SDK transport API is MEDIUM confidence — `handleRequest` signature and session Map lifecycle should be verified against actual installed package before writing tool definitions. Allow iteration time.
- [Phase 31]: Resolve stateless vs stateful transport baseline during Phase 31 planning — start stateless, upgrade only if `trigger_import` needs streaming (per research, synchronous result is sufficient).

## Session Continuity

Last session: 2026-03-28
Stopped at: Completed 31-01-PLAN.md — MCP server factory + 4 query tools; Phase 31 Plan 01 complete
Resume file: None
