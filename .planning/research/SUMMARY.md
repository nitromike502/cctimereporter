# Project Research Summary

**Project:** CC Time Reporter — v1.1.0 Token Usage Tracking & Visualization
**Domain:** Token usage analytics integrated into an existing local-first session timeline tool
**Researched:** 2026-04-06
**Confidence:** HIGH

## Executive Summary

CC Time Reporter is an existing, well-structured Node.js/Vue 3/SQLite tool that visualizes Claude Code sessions as Gantt charts. The v1.1.0 milestone adds token usage tracking as a first-class feature: store per-message usage fields from JSONL, expose them in the session detail panel, day summary, CLI, MCP outputs, and a new `/tokens` visualization page. The architecture is a clean layered pipeline (JSONL → importer → SQLite → services → routes/CLI/MCP → Vue), and token data slots into every layer with minimal disruption. Every layer has a defined, mechanical extension point, and build order is strictly dictated by data dependencies: schema first, then importer, then service, then API, then frontend.

The recommended stack addition is **chart.js 4.5.1 + vue-chartjs 5.3.3** (~68KB gzipped total), added as `devDependencies` and bundled by Vite into `dist/` at build time — not installed as runtime npm dependencies. This is a meaningful first charting dependency for the project but appropriate for a dedicated visualization page. The architecture research initially suggested SVG-only to avoid the dependency; the stack research overrides this with a concrete library recommendation. chart.js wins on Vue 3 integration quality, built-in dataset visibility toggle API, and ecosystem adoption (35M downloads/month, 67K GitHub stars) at a bundle size that is well-understood and measurable.

The two most critical risks are: (1) **silent NULL token history** after schema migration — existing sessions have no token data until re-imported, and SQLite shows no error; and (2) **double-counting subagent tokens** — sidechain messages (`is_sidechain = 1`) must be excluded from parent session totals or numbers inflate 2–5x for heavy subagent users. Both risks are preventable with explicit filtering in aggregation queries and a documented re-import step. Neither requires architectural redesign — they require defensive coding at precisely identified locations in the existing codebase.

---

## Key Findings

### Recommended Stack

The existing stack (Node.js 22+, Fastify, Vue 3, Vite, Reka UI, node:sqlite) is not changing. Two new packages are required: `chart.js` and `vue-chartjs`. Both go into `devDependencies` — Vite bundles them into `dist/assets/` at build time. Users who `npx cctimereporter` download the pre-built bundle; the chart library is never installed as a runtime npm dependency. This keeps the CLI/MCP startup path free of chart library cost and avoids the Pitfall 13 trap of inflating `node_modules` for CLI-only workflows.

If a time-based x-axis is used on the line chart, `chartjs-adapter-date-fns` + `date-fns` are also required. The alternative — using numeric message indices as the x-axis with manually formatted labels — avoids this dependency entirely and is recommended for the initial implementation to minimize bundle weight. The `chartjs-plugin-zoom` package (zoom/pan) should be deferred until multi-session or multi-day views are added.

**Core technology additions:**

- **chart.js 4.5.1**: Canvas-based charting engine — dominant ecosystem choice (35M downloads/month, 67K GitHub stars), ~65KB gzipped, built-in dataset visibility toggle via `setDatasetVisibility()`, actively maintained (last commit 2026-04-07)
- **vue-chartjs 5.3.3**: Thin Vue 3 wrapper — provides reactive `<Line>` component, exposes raw chart instance via `ref`, watches `data` and `options` reactively for automatic re-render on theme change, ~3KB additional gzip cost
- **devDependencies only**: Both packages bundled by Vite at build time; absent from the published runtime package

**Rejected alternatives:**

- ECharts: 150–200KB gzipped even with tree-shaking — 2–3x heavier than chart.js, overkill for a single chart page
- ApexCharts: ~90–100KB, no tree-shaking path
- lightweight-charts: Smallest bundle (~35KB) but financial OHLC API, no Vue 3 wrapper, wrong domain fit
- D3.js: Requires building chart primitives from scratch
- uPlot: Smaller bundle but no Vue integration, legend toggle requires manual implementation

### Expected Features

The entire feature set is gated on the schema migration (v9→v10) and import pipeline changes. No token feature ships without that foundation. Per-message storage (not session-level aggregates) is required so the line chart has the granularity it needs without re-processing JSONL later.

**Must have (table stakes):**

- Input / output / cache-read / cache-write breakdown per session in the session detail panel — users expect the split; all comparable tools (ccusage, Console) surface it
- Cache hit rate ratio per session — primary optimization signal for Claude Code users; computable from stored fields at no additional storage cost
- Day total token summary in the UI — parallel to the existing working-time day summary
- Token counts in `summary` and `sessions` CLI subcommand output — CLI already outputs structured JSON; tokens belong there
- Token counts in `get_day_summary` and `get_sessions` MCP tool responses — completeness for AI assistants querying usage data
- `/tokens` page with line chart — cumulative vs per-message toggle, one line per session plus an aggregate line

**Should have (differentiators):**

- Cache efficiency ratio with plain-language label ("Great / OK / Poor") — few tools interpret the ratio; most show raw counts without context
- Compaction event markers on the line chart — compaction boundaries already parsed by the importer; marking them on the chart shows context resets in relation to token growth curves
- Subagent / worktree token rollup — extends existing worktree query-time grouping to the token dimension

**Defer to v1.2+:**

- Ephemeral cache tier breakdown (5m vs 1h) — low user awareness of distinction currently; the flat `cache_creation_input_tokens` field captures the total; nested breakdown is a future migration
- Cost estimation in USD — Max subscribers pay a flat subscription, so API-rate cost estimates are misleading for the majority of likely users; requires pricing table maintenance and explicit disclaimer infrastructure
- Token overlay on Gantt bars — high implementation cost relative to marginal gain; validate the `/tokens` page before modifying the Gantt component
- Session-level model breakdown — requires storing `model` per assistant message; lower priority than usage counts

**Anti-features (deliberately not built):**

- Real-time / live token counter — CC Time Reporter is a retrospective analytics tool; live monitoring competes with Claude Code's own `/cost` command and the Claude Code Usage Monitor
- Dollar cost as primary metric — misleading for Max subscribers; tokens are the correct primary metric
- Budget alerts / spend caps — requires persistent background monitoring and notification infrastructure, far outside scope
- Per-tool-call token attribution — usage field is per assistant message (not per tool_use block); attribution would require unreliable heuristics

### Architecture Approach

Token data is 1:1 with `assistant` messages and belongs on the `messages` table — no separate table, no denormalized session-level aggregates. The project's stated philosophy is "import raw data, derive at query time," and token aggregates are `SUM()` queries in the service layer. This is the direct lesson from the existing dead `tool_use_count` column on `sessions` (computed at import time, never queried — explicitly acknowledged in codebase memory). Token aggregates stored at import time would repeat that mistake and become stale after fork reclassification or import logic changes.

Every integration point was verified by direct codebase inspection. The `rawMessage: msg` reference is already attached to each parsed message in `parser.js` — the usage object is present in memory during import, it is simply never extracted or stored today. Adding token storage is a mechanical extension at each layer.

**New and modified components:**

1. **Schema v9→v10** (`src/db/schema.js`, `src/db/index.js`) — four `ALTER TABLE messages ADD COLUMN` INTEGER statements for the four flat usage fields; additive and safe on existing databases
2. **Import pipeline** (`src/importer/db-writer.js`, `src/importer/index.js`) — extract usage from `msg.rawMessage?.message?.usage` in both the `messagesForDb` and `agentMessages` mappings; guard with `type === 'assistant'`; write NULL for all other message types (never write `0`)
3. **Token service** (`src/services/tokens.js`) — new dedicated service; factory pattern identical to existing services (`createTokensService(db)`); four query functions: day summary, per-session, date-range trend, single-session detail; all queries filter `type = 'assistant' AND is_sidechain = 0 AND is_fork_branch = 0` for accurate "actual spend" totals
4. **API route** (`src/server/routes/tokens.js`) — `GET /api/tokens?date=YYYY-MM-DD` and `GET /api/tokens?from=&to=`; thin wrapper, delegates to service; registered in `src/server/index.js`
5. **MCP tool** (`src/mcp/tools/query.js`) — add `get_token_summary` to `registerQueryTools()`; calls tokens service; follows identical pattern to existing tools
6. **Vue page + components** (`src/client/pages/TokensPage.vue`, three new components) — reuses `TimelineToolbar.vue` for date navigation; fetches from `/api/tokens`; token detail panel fetched on-demand when session bar is clicked (not eagerly on timeline load)

**Build order is strictly layered:** schema → importer → service → API → CLI/MCP → Vue. Each layer is independently verifiable (SQL query, curl, JSON output) before the next layer is built.

### Critical Pitfalls

1. **Silent NULL token history after migration** — `ALTER TABLE ADD COLUMN` leaves all existing rows as NULL. Historical sessions show zero tokens with no error. The schema migration completes cleanly; the import skip logic (size-based) will skip unchanged files on next normal import, leaving those rows permanently NULL. Prevention: delete import_log entries for the last 30 days during the v10 migration so the next normal import re-processes them; document in CHANGELOG; do NOT silently force `--all` import on startup (can take minutes for heavy users).

2. **Double-counting subagent tokens** — Sidechain messages (`is_sidechain = 1`) are merged into the parent session for timeline display but carry their own usage data from separate Anthropic API calls. Summing all messages without filtering inflates parent session totals 2–5x for heavy agent team users. Prevention: filter `WHERE is_sidechain = 0` in all aggregation queries for parent-only totals; subagent tokens are correctly attributable to their own sessions separately.

3. **Fork branch tokens counted for abandoned work** — Messages from abandoned fork branches (`is_fork_branch = 1`) have valid usage data from API calls made during discarded conversation branches. Prevention: filter `WHERE is_fork_branch = 0` for "actual spend" totals; decide the default view before any UI numbers are shown (changing it later creates a confusing UX shift for users who have built mental models around the numbers).

4. **Three-place update trap** — Adding token columns requires synchronized changes in three files: `schema.js` (DDL), `db-writer.js` (INSERT statement), and `importer/index.js` (field mapping). Missing any one means data is parsed but silently not persisted — all token queries return NULL with no error because the upsert's `ON CONFLICT DO UPDATE SET` clause silently ignores missing fields. Prevention: update all three in a single commit; verify immediately with `SELECT input_tokens FROM messages WHERE type='assistant' LIMIT 5` after import.

5. **Chart dark mode incompatibility** — chart.js renders to `<canvas>`, so CSS custom properties from `tokens.css` do not apply to chart elements (grid lines, axis labels, tooltip backgrounds). Hardcoded hex colors will be invisible or fail contrast in dark mode. Prevention: read `document.documentElement.dataset.theme` via a computed Vue property or MutationObserver; pass theme-appropriate color values in reactive `chartOptions`; test dark mode rendering on `/components` preview page before wiring real data.

---

## Implications for Roadmap

Based on the dependency graph in ARCHITECTURE.md and the phase-specific pitfall warnings in PITFALLS.md, four phases are recommended. Each phase is independently verifiable and releasable. A milestone could ship Phase 1+2 as a complete backend feature before Phase 3+4 are built.

### Phase 1: Data Foundation (Schema + Importer)

**Rationale:** Every downstream feature is blocked on this. No token UI, no CLI output, no MCP tool can ship without token data in the database. Isolating this phase also surfaces the NULL-history pitfall immediately — in isolation, before any UI exists to display misleading zeros.

**Delivers:** Token data stored per-message in SQLite for all newly imported sessions, with correct NULL handling for non-assistant messages. Verified via SQL: `SELECT SUM(input_tokens) FROM messages WHERE type='assistant'`.

**Addresses:** Schema migration v9→v10; `db-writer.js` INSERT update (three-place update done atomically); `importer/index.js` usage extraction for both main and agent message paths.

**Must avoid:** Silent NULL history (document re-import path and add CHANGELOG note); writing `0` instead of NULL for non-assistant messages; double-counting nested `cache_creation` subobject against flat `cache_creation_input_tokens` field (use flat field only).

**Research flag:** Standard patterns — the migration ladder pattern is verbatim in this codebase. No additional research needed.

---

### Phase 2: Service + API

**Rationale:** Backend-complete before any frontend work. The API is independently testable with curl. This phase also resolves the subagent and fork-branch filtering decisions at the SQL level — before any UI display format commits to what "total tokens" means.

**Delivers:** `GET /api/tokens?date=` and `GET /api/tokens?from=&to=` endpoints returning correct, filtered token aggregates. Verified via `curl "localhost:3847/api/tokens?date=2026-04-06"`.

**Uses:** `src/services/tokens.js` (new, follows `createXService(db)` factory pattern identical to `sessions.js` and `timeline.js`); `src/server/routes/tokens.js` (thin wrapper, follows `timeline.js` pattern); registration in `src/server/index.js`.

**Must avoid:** Denormalizing totals to `sessions` table (repeats the `tool_use_count` dead-data mistake); bloating the timeline API response with token data (separate endpoint); subagent and fork-branch double-counting in SQL aggregation queries.

**Research flag:** Standard patterns — service factory and route thin-wrapper patterns are identical to existing code. SQL queries are provided in ARCHITECTURE.md. No additional research needed.

---

### Phase 3: CLI + MCP Extension

**Rationale:** Additive to existing outputs. No breaking changes. Extends the AI assistant interface before building the visual interface, so token data is queryable via MCP tools during frontend development — useful for self-testing and for existing MCP consumers.

**Delivers:** Token totals in `summary` CLI output; `get_token_summary` MCP tool; token fields added to `get_day_summary` and `get_sessions` MCP responses.

**Uses:** Updates to `src/cli/commands/summary.js`; additions to `src/mcp/tools/query.js` (follows `registerQueryTools()` pattern exactly). All changes are additive — existing consumers receive new fields and can ignore them.

**Must avoid:** Breaking existing CLI/MCP consumers; `tokenTotals` as a separate top-level object in existing tool responses (additive, not replacement).

**Research flag:** Standard patterns — identical to existing CLI and MCP handler patterns. No additional research needed.

---

### Phase 4: Vue Frontend (/tokens page + session detail)

**Rationale:** Final layer; depends on Phase 2 API. Components built bottom-up — stateless display components first, previewed on `/components`, then page-level wiring with API calls.

**Delivers:** `/tokens` page with line chart (cumulative/per-message toggle, per-session lines + aggregate); token summary in session detail panel (on-demand fetch when session bar is clicked, not eager on timeline load); `TokenSummaryCard.vue` summary cards; `TokenBreakdownTable.vue` per-session table; router update.

**Uses:** chart.js 4.5.1 + vue-chartjs 5.3.3 (added as `devDependencies`, bundled by Vite); `TimelineToolbar.vue` reused for date navigation (existing component, same `@navigate` event and `selectedDate` state pattern as `TimelinePage.vue`).

**Must avoid:**
- Adding chart.js to `dependencies` instead of `devDependencies` (inflates CLI `node_modules` for all users)
- Hardcoded chart colors that break dark mode (use reactive `chartOptions` computed from theme state)
- Fetching token data eagerly for all sessions on timeline load (fetch on-demand in detail panel)
- Too many data points in a single chart render (default to session or daily aggregates for the trend view; per-message granularity only for single-session drill-down)
- Separate `/tokens` page disconnected from session context (link from chart back to session detail panel)

**Research flag:** chart.js dark mode integration (~20-line reactive options pattern) and dataset toggle API are fully documented in STACK.md. No additional research needed. Chart.js `setDatasetVisibility(index, bool)` + `chart.update()` is confirmed in chart.js 4 official docs.

---

### Phase Ordering Rationale

- Phases 1→2→3→4 follow strict data dependencies: you cannot query what is not stored; you cannot display what is not queryable.
- Phase 1 is verifiable in isolation via SQL query — no service, no frontend, no curl needed.
- Phase 2 resolves the subagent and fork-branch filtering decisions at the SQL level before any UI commits to a display format that implies those decisions. Changing "what total tokens means" after the UI ships creates a confusing UX shift.
- Phase 3 (CLI/MCP) before Phase 4 (Vue) makes token data queryable via AI assistants during frontend development — useful for self-testing with `get_token_summary` during Phase 4 work.
- Phase 2 is fully complete before Phase 4 starts, so the frontend always has a real API to call during development — no mocking needed.

### Research Flags

All phases use standard, well-documented patterns from the existing codebase or official library docs. No phase requires `/gsd:research-phase`.

- **Phase 1:** Schema migration ladder is verbatim in `src/db/index.js`; three-place update locations are explicitly identified in PITFALLS.md.
- **Phase 2:** Service factory and route thin-wrapper patterns are direct copies of existing files. SQL queries are provided in full in ARCHITECTURE.md.
- **Phase 3:** CLI and MCP extension patterns are identical to `src/cli/commands/summary.js` and `src/mcp/tools/query.js`.
- **Phase 4:** chart.js integration pattern — including dark mode composable, dataset toggle, and multi-series setup — is fully specified in STACK.md with working code examples.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | chart.js 4.5.1 and vue-chartjs 5.3.3 verified against npm registry 2026-04-06; bundle size from Bundlephobia (chart.js) and official TradingView blog (lightweight-charts); adoption data from npm downloads API and GitHub API; all five candidate libraries evaluated |
| Features | HIGH | Table stakes verified against ccusage, Claude Code Usage Monitor, Anthropic Console, and Langfuse; JSONL usage object field names confirmed in `references/claude-transcript-schema.md`; token cost multipliers from official Anthropic pricing docs |
| Architecture | HIGH | All integration points verified by direct source inspection of actual codebase files: `parser.js`, `db-writer.js`, `importer/index.js`, `schema.js`, `db/index.js`, `timeline.js`, `sessions.js`, `routes/timeline.js`, `mcp/tools/query.js`, `client/router/index.js` |
| Pitfalls | HIGH | Critical pitfalls sourced from direct codebase inspection + SQLite official docs + Claude Code GitHub issues on subagent token reporting; one LOW confidence note on ApexCharts gzip size (rejected library, not relevant to implementation) |

**Overall confidence:** HIGH

### Gaps to Address

- **Chart x-axis strategy**: ARCHITECTURE.md recommends SVG-only (no chart library) while STACK.md recommends chart.js. Resolution: **chart.js wins.** The SVG recommendation was a conservative default; the stack research evaluated five alternatives with concrete bundle size and API data. The conflict is resolved in this summary — chart.js at ~65KB gzipped is the correct call.

- **Re-import mechanism for NULL history**: PITFALLS.md identifies three options for handling existing rows with NULL token data: (a) delete import_log entries for a window, (b) expose a UI prompt, or (c) document and let users run `--all`. The recommended approach is (a): delete import_log entries for the last 30 days during the v10 migration so the next normal import re-processes them automatically without blocking startup. Exact implementation decision for Phase 1.

- **Subagent "inclusive" view toggle**: PITFALLS.md recommends `is_sidechain = 0` (parent-only) as the default for token totals. Whether a toggle for "including subagents" is exposed in the UI is a UX decision for Phase 4. The service layer should support both query modes; the UI defaults to parent-only with the option deferred.

- **ApexCharts gzip estimate LOW confidence**: The ~90–100KB figure cited in STACK.md was derived from unpackedSize ratio, not a direct measurement. Irrelevant since ApexCharts is rejected, but noted for completeness.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `src/importer/parser.js`, `src/importer/db-writer.js`, `src/importer/index.js`, `src/db/schema.js`, `src/db/index.js`, `src/services/timeline.js`, `src/services/sessions.js`, `src/server/routes/timeline.js`, `src/mcp/tools/query.js`, `src/client/router/index.js` — architecture patterns and integration points
- `references/claude-transcript-schema.md` — JSONL usage object field names and structure
- npm registry API (`npm view chart.js version`, `npm view vue-chartjs version`, all candidates) — verified versions 2026-04-06
- npm downloads API — chart.js 35.2M/month, vue-chartjs 3.4M/month verified 2026-04-06
- GitHub API — star counts for all charting candidates verified 2026-04-06
- Anthropic official pricing docs — token cost multipliers (input, output, cache create 1.25x/2.0x, cache read 0.1x)
- Anthropic Prompt Caching docs — cache tier structure and pricing
- chart.js official docs (chartjs.org) — `setDatasetVisibility`, `isDatasetVisible`, `chart.update()`, `chart.update('none')` API
- TradingView blog — lightweight-charts v5 "35kB base bundle, 16% reduction from v4" (official source)
- SQLite official docs — `ALTER TABLE ADD COLUMN` behavior (schema-only change, no data back-fill)

### Secondary (MEDIUM confidence)

- Bundlephobia (via WebSearch) — chart.js ~65KB gzip estimate; could not fetch Bundlephobia directly
- ccusage GitHub and docs — feature comparison and token display columns
- Claude Code Usage Monitor GitHub — real-time feature scope and live counter anti-pattern confirmation
- Claude Code GitHub issues #22625 and #43198 — subagent token double-reporting patterns (community-confirmed)
- Langfuse docs — token and cost tracking UX patterns, cumulative/per-message toggle convention
- Grafana observability patterns — multi-series chart conventions
- ECharts tree-shaking bundle estimate (150–200KB) — no exact figure; derived from community reports

### Tertiary (LOW confidence)

- ApexCharts gzip estimate (~90–100KB) — derived from 9MB unpackedSize ratio; no direct gzip measurement; rejected library
- Priority service tier pricing multiplier — tier exists per official docs; per-token cost impact vs standard tier not confirmed

---

*Research completed: 2026-04-06*
*Ready for roadmap: yes*
