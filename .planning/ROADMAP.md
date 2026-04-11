# Roadmap: CC Time Reporter

## Milestones

- [x] **v1.0 MVP** — Phases 1-6 (shipped 2026-03-01)
- [x] **v0.8.0 Service Layer, CLI, MCP** — Phases 7-31 (shipped 2026-03-30)
- [ ] **v1.1.0 Token Usage Tracking & Visualization** — Phases 32-35 (in progress)

---

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-01</summary>

See `.planning/milestones/v1-ROADMAP.md` for full phase details.

Phases: Foundation, Import Pipeline, Server and CLI, Component Library, Timeline UI, Timeline Polish.

</details>

<details>
<summary>v0.8.0 Service Layer, CLI, MCP (Phases 7-31) — SHIPPED 2026-03-30</summary>

See `.planning/milestones/v0.2.0-ROADMAP.md` and phase directories 07-31 for full details.

Phases 28-31 delivered: service layer extraction, Commander CLI, MCP server (8 tools), multi-instance coordination (process_locks schema v9).

</details>

---

### v1.1.0 Token Usage Tracking & Visualization (In Progress)

**Milestone Goal:** Users can see token usage counts in the session detail panel, day summary, CLI output, MCP tools, and a new `/tokens` line chart page showing cumulative token spend over time per session.

**Phase Numbering:** Continues from Phase 31. New phases: 32-35.

#### Phase 32: Data Foundation

**Goal**: Token usage fields are stored in SQLite per assistant message, schema auto-migrates from v9 to v10, and historical sessions are backfilled via re-import so there is real data to verify at every downstream layer.
**Depends on**: Phase 31 (schema v9, import pipeline)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. After schema migration, `PRAGMA user_version` returns 10 on an existing v9 database without data loss.
  2. After re-import, `SELECT input_tokens, output_tokens FROM messages WHERE type='assistant' LIMIT 5` returns non-NULL integers for recently imported sessions.
  3. Non-assistant messages (type='human', type='tool_result') have NULL in all token columns — no zeros written for messages that carry no usage data.
  4. The model name column contains a non-NULL string (e.g. "claude-opus-4-5") for assistant messages after re-import.
  5. Existing non-token data (session names, tickets, fork detection) is unchanged after the migration and re-import.
**Plans**: 1 plan

Plans:
- [x] 32-01: Schema v10 migration (7 new columns on messages) and importer extraction (three-place update: schema.js, db-writer.js, importer/index.js)

---

#### Phase 33: Service, API, and Token Queries

**Goal**: Token aggregates are queryable via a dedicated backend service and a new API endpoint, with correct filtering to exclude sidechain and fork-branch messages — resolving "what total tokens means" at the SQL layer before any UI commits to a display format.
**Depends on**: Phase 32
**Requirements**: DISP-01, DISP-02, DISP-03
**Success Criteria** (what must be TRUE):
  1. `curl "localhost:3847/api/tokens?date=YYYY-MM-DD"` returns a JSON response with input_tokens, output_tokens, cache_creation_input_tokens, and cache_read_input_tokens broken down per session and as a day total.
  2. The cache hit rate percentage is present in the per-session response and is computed correctly (cache_read / (cache_read + input) × 100).
  3. Sidechain messages (is_sidechain=1) are excluded from parent session totals — heavy subagent sessions do not double-count.
  4. The session detail panel in the web UI shows the token breakdown and cache hit rate when a session bar is clicked.
  5. The day summary panel in the web UI shows total tokens for the selected date.
**Plans**: 2 plans

Plans:
- [ ] 33-01-PLAN.md — Token service factory and API route (service + endpoint + server registration)
- [ ] 33-02-PLAN.md — Vue frontend token display (TimelinePage fetch, SessionDetailPanel breakdown, DaySummary total)

---

#### Phase 34: CLI and MCP Extension

**Goal**: Token totals appear in structured CLI JSON output and MCP tool responses, extending existing outputs without breaking current consumers.
**Depends on**: Phase 33
**Requirements**: DISP-04, DISP-05, DISP-06, DISP-07
**Success Criteria** (what must be TRUE):
  1. `node bin/cli.js summary --date YYYY-MM-DD --pretty` JSON output includes a top-level `tokens` object with input, output, cache creation, and cache read totals for the day.
  2. `node bin/cli.js sessions --date YYYY-MM-DD --pretty` JSON output includes per-session token totals alongside existing session fields.
  3. The MCP `get_day_summary` tool response includes token totals without changing existing field names or structure.
  4. The MCP `get_sessions` tool response includes per-session token totals as additive fields — existing MCP consumers can ignore the new fields without error.
**Plans**: 1 plan

Plans:
- [ ] 34-01-PLAN.md — CLI and MCP token enrichment (summary, sessions, get_day_summary, get_sessions)

---

#### Phase 35: Tokens Chart Page

**Goal**: A new `/tokens` page is accessible from the app navigation and shows a line chart with one line per session and an aggregate line, with cumulative/per-message toggle, per-session line visibility toggle.
**Depends on**: Phase 33
**Requirements**: CHART-01, CHART-02, CHART-03, CHART-04, CHART-05, CHART-06
**Success Criteria** (what must be TRUE):
  1. User can navigate to `/tokens` from the main app navigation and the page loads with date navigation matching the timeline toolbar pattern.
  2. The chart displays one colored line per session for the selected date, with an "All Sessions" aggregate line, and the legend labels match session names.
  3. User can toggle between "Cumulative" and "Per Message" chart views — cumulative shows monotonically increasing token totals; per-message shows token count per individual assistant message.
  4. User can click a session name in the legend to show or hide that session's line without affecting other lines.
  5. The chart renders correctly in both light and dark themes, matching the Gantt bar color palette.
**Plans**: 2 plans

Plans:
- [ ] 35-01-PLAN.md — Install chart.js + vue-chartjs; TokensPage scaffold with date nav, app header nav, route registration
- [ ] 35-02-PLAN.md — Line chart implementation (per-session lines, aggregate line, toggle, legend, session detail on click, dark mode)

---

#### Phase 36: Tokens Chart Message Drill-Down

**Goal**: Double-clicking a point on the Per Message line chart opens a modal showing the messages from that session's time bucket, with token counts on assistant messages, enabling users to understand exactly what caused a token usage spike.
**Depends on**: Phase 35
**Plans**: 2 plans

Plans:
- [x] 36-01-PLAN.md — Backend: timestamp-range query mode for messages API (from/to params, output_tokens in response)
- [x] 36-02-PLAN.md — Frontend: double-click handler on line chart, bucket-to-timestamp resolution, SessionMessagesModal time-range mode with token display

---

## Progress

**Execution Order:** 32 → 33 → 35 (Phase 34 can run in parallel with or after 33; Phase 35 depends on 33 only)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6. v1.0 MVP | v1.0 | 14/14 | Complete | 2026-03-01 |
| 7-31. Service Layer, CLI, MCP | v0.8.0 | —/— | Complete | 2026-03-30 |
| 32. Data Foundation | v1.1.0 | 1/1 | Complete | 2026-04-08 |
| 33. Service, API, Token Queries | v1.1.0 | 0/2 | Not started | - |
| 34. CLI and MCP Extension | v1.1.0 | 0/1 | Not started | - |
| 35. Tokens Chart Page | v1.1.0 | 0/2 | Not started | - |
| 36. Tokens Chart Message Drill-Down | v1.1.0 | 2/2 | Complete | 2026-04-11 |
