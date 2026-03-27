# Phase 28: Service Layer - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract existing query and import logic from Fastify route handlers into `src/services/` modules. Both CLI (Phase 30) and MCP (Phase 31) depend on this layer. No behavior change for the existing web UI — routes become thin wrappers calling services.

</domain>

<decisions>
## Implementation Decisions

### Service API shape
- Services return two projections: UI-optimized (current timeline shape with idle gaps, fork segments, clamping) and reporting-optimized (ticket-grouped totals + session detail)
- MCP `get_day_summary` returns both levels: a summary section (ticket-grouped totals) and a detail section (individual sessions) so the agent can pick which to use
- `get_sessions` returns the session-level detail (similar to current timeline sessions but without UI-only fields like idleGaps, forkSegments, continuesFromPrevDay)

### Import service interface
- Import tool uses block-and-return pattern: runs full import, returns final result. No streaming progress for MCP.
- CLI import shows line-by-line progress on stderr ("Importing: 5/120 files..."), JSON result on stdout when done
- Service accepts a progress callback (existing pattern) — route wires to SSE, CLI wires to stderr, MCP ignores it
- Import rejection includes PID and start time: "Import already running (PID 12345, started 2m ago)"

### Module boundaries, utility placement, statement management, and route residue

Claude's Discretion — Claude has flexibility to decide:
- How many service files and how to split them (per-domain vs per-consumer-need)
- Whether services own their prepared statements or receive db and prepare per call
- Whether utility functions (computeWorkingTime, getDisplayName) stay in services or move to shared utils
- Whether the sessions PATCH route gets a service or stays inline (based on whether MCP/CLI would ever need updates)
- How thin route handlers become — pure passthrough vs HTTP-concerns-only (param validation, status codes)
- Where SSE streaming logic lives (expected: stays in route, service takes progress callback)

</decisions>

<specifics>
## Specific Ideas

- Current timeline route returns UI-optimized data: idleGaps, forkSegments, continuesFromPrevDay/NextDay, schemaMigrated — these are noise for an agent logging time
- Agent cares about: date, project, ticket, branch, working time, summary
- The import concurrency guard (currently in-memory boolean) needs to become DB-based in Phase 29 — design the service interface so it can be swapped without changing callers

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-service-layer*
*Context gathered: 2026-03-26*
