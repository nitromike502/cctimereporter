# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** A user runs one command and immediately see a clear visual timeline of their Claude Code sessions for any given day
**Current focus:** v1.1.0 Token Usage Tracking & Visualization

## Current Position

Phase: 36 — Tokens Chart Message Drill-Down
Plan: 02 of 2 in phase
Status: Phase 36 complete — 2/2 plans done
Last activity: 2026-04-11 — Completed Phase 36 (tokens chart message drill-down)

Progress: v1.1.0 in progress ░░░░░░█████░░░░
Overall:  Phases 1-31 complete (v1.0 through v0.8.2 shipped). Phase 32 complete (1 plan). Phase 33 complete (2 plans). Phase 34 complete (1 plan). Phase 35 complete (2 plans). Phase 36 complete (2 plans).

## Performance Metrics

**v0.8.0 Velocity:**
- Total plans completed: 7 (Phases 28-31)
- Phases: 4
- Timeline: 4 days (2026-03-26 → 2026-03-30)

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

**v1.1.0 Key Decisions:**
- Token columns on messages table (not sessions) — import raw, derive at query time; avoids repeating the dead tool_use_count mistake
- chart.js 4.5.1 + vue-chartjs 5.3.3 as devDependencies only — bundled by Vite, not runtime npm deps; avoids inflating CLI node_modules
- Sidechain exclusion (is_sidechain=0) as default for all token aggregates — parent-only totals prevent 2-5x double-count for subagent users
- Fork branch exclusion (is_fork_branch=0) for "actual spend" totals — abandoned branches had real API calls but should not count as user spend
- Re-import via import_log deletion for last 30 days during v10 migration — automatic backfill without blocking startup or forcing --all on heavy users
- Numeric message index as x-axis (not time-based) — avoids chartjs-adapter-date-fns dependency for initial implementation
- NULL not 0 for non-assistant token columns (32-01) — avoids misleading zero aggregates in downstream queries
- Ephemeral cache tiers at usage.cache_creation.ephemeral_* not top-level (32-01) — matches actual JSONL schema
- Agent sidechain messages also extract token data (32-01) — preserves actual spend tracking for subagent users
- Shared project color utility in src/client/utils/project-colors.js (35-01) — extracted from TimelinePage, ensures consistent colors across Timeline and Tokens pages
- App.vue persistent nav excludes /components route (35-01) — dev tool, not user-facing navigation
- createTokensService factory pattern (33-01) — prepared statements at factory time, same as timeline/sessions services
- SQLite aggregate null detection (33-01) — aggregate queries always return 1 row; check all individual columns null to detect "no data" vs "no session"
- Supplementary fetch pattern (33-02) — token fetch is fire-and-forget alongside timeline fetch; failures silently null out tokenData, never propagate to timeline
- formatTokenCount null/zero returns em dash in detail panel, null in DaySummary (conditional render vs em dash display) (33-02)
- sessionId stripped from tokens sub-object in CLI/MCP session responses (34-01) — redundant since sessionId is already on the parent session object
- CLI lazy import pattern for token service (34-01) — createTokensService imported inside .action() handler alongside timeline service, defers prepared-statement setup until command runs
- mapRowWithTokens variant for time-range path (36-01) — separate mapper prevents outputTokens leaking into existing response shape; no risk of breaking existing callers
- No from/to validation in HTTP layer (36-01) — invalid ISO strings safely return 0 rows from SQLite timestamp comparison; validation adds complexity for no safety gain
- Native dblclick + getElementsAtEventForMode for chart drill-down (36-02) — Chart.js has no built-in onDblClick; native event with mode detection is the correct pattern
- timelineBucketState computed exposes bucketStarts/bucketMap (36-02) — single source of truth for both chart rendering and double-click handler without recalculation
- isBucketView API flag guards token display in modal (36-02) — API is authoritative about whether token data was fetched; prop presence alone is insufficient

### Pending Todos

None.

### Roadmap Evolution

- Phase 36 added: Click point on Tokens line chart and view messages inside the selected interval (2026-04-10)

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 002 | Fix schema migration banner stuck after reimport | 2026-03-30 | 3454d51 | [002-fix-schema-migration-banner-stuck](./quick/002-fix-schema-migration-banner-stuck/) |
| 003 | Fix fork display bugs (empty forks + overnight bleed) | 2026-03-30 | f6ddb8d | [003-fix-fork-display-bugs](./quick/003-fix-fork-display-bugs/) |
| 004 | Fork message modal context zones | 2026-04-06 | 993fc2c | [004-fork-message-modal-context-zones](./quick/004-fork-message-modal-context-zones/) |

## Session Continuity

Last session: 2026-04-11
Stopped at: Phase 36 complete — tokens chart message drill-down verified
Resume file: None
