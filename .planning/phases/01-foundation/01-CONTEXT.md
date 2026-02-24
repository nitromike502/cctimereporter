# Phase 1: Foundation - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

npm package skeleton with node:sqlite database layer, schema DDL, and build/publish infrastructure. This phase delivers a working package structure that all subsequent phases build on — database, CLI entry point stub, and validated npm packaging.

</domain>

<decisions>
## Implementation Decisions

### Database location & identity
- Database lives at `~/.cctimereporter/data.db` — own path, isolated from the Python PoC
- The database is a cache, not a source of truth — JSONL transcripts are the source
- If schema mismatch or corruption is detected, auto-recreate the database (drop and rebuild) — safe because data is always re-importable

### Schema scope
- Minimal schema for v1 — only tables the v1 UI actually queries
- Do NOT port the full PoC schema; add tables when features need them
- No migration system for v1 — just create tables fresh; users can wipe and reimport while it's early

### Claude's Discretion
- Package name and bin command details
- Project directory structure (monorepo layout for server + UI)
- How the Python PoC scripts coexist in the repo (reference-only vs removed)
- Specific minimal table set (derive from v1 requirements: what does the timeline API need to query?)

</decisions>

<specifics>
## Specific Ideas

- The PoC's `scripts/schema.sql` is a reference for table design, but the Node app should only implement what v1 needs
- The PoC has a `schema_version` table and `--migrate` flag — skip this complexity for now

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-23*
