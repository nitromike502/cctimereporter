# Requirements: CC Time Reporter v1.1.0

**Defined:** 2026-04-07
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v1.1.0 Requirements

Requirements for token usage tracking and visualization. Each maps to roadmap phases.

### Data Storage

- [ ] **DATA-01**: Store input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens per assistant message in schema v10
- [ ] **DATA-02**: Store ephemeral cache tier sub-fields (ephemeral_5m_input_tokens, ephemeral_1h_input_tokens) per assistant message
- [ ] **DATA-03**: Store model name per assistant message
- [ ] **DATA-04**: Schema auto-migrates from v9 to v10
- [ ] **DATA-05**: Historical sessions backfilled with token data via re-import

### Token Display

- [ ] **DISP-01**: Session detail panel shows input/output/cache token breakdown
- [ ] **DISP-02**: Session detail panel shows cache hit rate percentage
- [ ] **DISP-03**: Day summary panel shows total tokens for the day
- [ ] **DISP-04**: CLI `summary` command includes token totals in JSON output
- [ ] **DISP-05**: CLI `sessions` command includes per-session token totals
- [ ] **DISP-06**: MCP `get_day_summary` tool includes token totals
- [ ] **DISP-07**: MCP `get_sessions` tool includes per-session token totals

### Chart Page

- [ ] **CHART-01**: New `/tokens` page accessible via app navigation
- [ ] **CHART-02**: Date navigation on tokens page (reuse timeline toolbar pattern)
- [ ] **CHART-03**: Line chart with one line per session, x-axis is time of day
- [ ] **CHART-04**: Aggregate "all sessions" combined line on the chart
- [ ] **CHART-05**: Toggle between cumulative and per-message chart views
- [ ] **CHART-06**: User can show/hide individual session lines
- [ ] **CHART-07**: Compaction event markers displayed as vertical indicators on the chart

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Cost Estimation

- **COST-01**: Approximate USD cost per session using Anthropic pricing tiers
- **COST-02**: Day total cost in day summary

### Advanced Visualization

- **VIZ-01**: Token overlay on Gantt bars (color intensity by token weight)
- **VIZ-02**: Subagent/worktree token rollup (group under parent project)
- **VIZ-03**: Session-level model breakdown chart

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time / live token counter | CC Time Reporter is retrospective; competes with Claude Code `/cost` command |
| Dollar cost as primary metric | Most users are Max plan subscribers; API-rate pricing is misleading |
| Budget alerts and spend caps | Requires persistent monitoring infrastructure; use Anthropic Console |
| Per-tool-call token attribution | JSONL `usage` is per-message, not per-tool-call; no reliable source data |
| ML-based usage predictions | Historical tool; leave predictions to live monitors |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 32 | Pending |
| DATA-02 | Phase 32 | Pending |
| DATA-03 | Phase 32 | Pending |
| DATA-04 | Phase 32 | Pending |
| DATA-05 | Phase 32 | Pending |
| DISP-01 | Phase 33 | Pending |
| DISP-02 | Phase 33 | Pending |
| DISP-03 | Phase 33 | Pending |
| DISP-04 | Phase 34 | Pending |
| DISP-05 | Phase 34 | Pending |
| DISP-06 | Phase 34 | Pending |
| DISP-07 | Phase 34 | Pending |
| CHART-01 | Phase 35 | Pending |
| CHART-02 | Phase 35 | Pending |
| CHART-03 | Phase 35 | Pending |
| CHART-04 | Phase 35 | Pending |
| CHART-05 | Phase 35 | Pending |
| CHART-06 | Phase 35 | Pending |
| CHART-07 | Phase 35 | Pending |

**Coverage:**
- v1.1.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-06 — traceability filled in after roadmap creation*
