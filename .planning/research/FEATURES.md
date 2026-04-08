# Feature Landscape: Token Usage Visualization

**Domain:** Token usage tracking and visualization for an AI coding assistant time tracker  
**Researched:** 2026-04-06  
**Milestone context:** Adding token usage to CC Time Reporter (a Gantt-style Claude Code session tracker)

---

## Data Available from JSONL

Every `assistant` message in Claude Code transcripts carries a `usage` object:

```json
{
  "input_tokens": 1500,
  "output_tokens": 500,
  "cache_creation_input_tokens": 10000,
  "cache_read_input_tokens": 5000,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 10000,
    "ephemeral_1h_input_tokens": 0
  },
  "service_tier": "standard"
}
```

Token type semantics (sourced from Anthropic official pricing docs, HIGH confidence):

| Field | Cost multiplier vs base input | Notes |
|---|---|---|
| `input_tokens` | 1.0x | Uncached new context sent to the model |
| `cache_creation_input_tokens` | 1.25x (5m) or 2.0x (1h) | Content written to cache this turn |
| `cache_read_input_tokens` | 0.1x | Cache hit — 90% cheaper than uncached input |
| `output_tokens` | ~4x base input (median across models) | Tokens Claude generated in response |

`service_tier` is `"standard"` (default, best-effort availability) or `"priority"` (premium, minimizes overload
errors). Priority tier exists but exact pricing multiplier was not confirmed in research — LOW confidence
on whether it changes per-token cost vs just availability.

---

## Table Stakes

Features users expect from any token usage tool. Missing any of these makes the feature feel incomplete.

| Feature | Why Expected | Complexity | Dependencies on existing features |
|---|---|---|---|
| Total tokens per session (input + output + cache) | Every existing tool shows this aggregate | Low | Schema migration to store usage fields |
| Input / Output / Cache breakdown per session | Users know cache reads are cheap; they expect the split. ccusage, Claude Console, and the Usage Monitor all surface this | Low | Schema migration |
| Session token totals in session detail panel | Token summary belongs alongside other session metadata (branch, times, message count) | Low | Existing session detail panel |
| Day total tokens in day summary | Parallel to existing working-time day summary already in the UI | Low | Aggregate query over stored usage fields |
| Cache hit rate per session | Cache efficiency is the primary optimization target for Claude Code users; surfacing it as a ratio (`cache_read / total_input`) is immediately actionable | Low | Computed from stored fields, no extra storage |
| Token counts in CLI `summary` and `sessions` output | CLI already outputs structured JSON; token totals belong in that output | Low | Existing CLI command handlers in `src/cli/commands/` |
| Token counts in MCP tool responses | `get_day_summary` and `get_sessions` already exist; completeness requires token data | Low | Existing MCP tool handlers in `src/mcp/tools/` |
| Line chart: token usage over messages in a session | The planned `/tokens` page. Time-series view is the standard chart type for per-session token growth | Medium | New page + chart component (no existing chart component) |
| Cumulative vs per-message toggle on the line chart | Both views answer different questions (trend vs per-turn cost). Toggle is a standard pattern in monitoring tools like Grafana and Langfuse | Low | Chart data transformation only |
| Multiple session lines + aggregate on chart | Show one line per session plus a combined aggregate line, same as multi-series dashboards in Langfuse/Grafana | Medium | Multi-series chart composition |

**Confidence:** HIGH. All table stakes verified against ccusage, Claude Code Usage Monitor, Anthropic Console,
and observability platform patterns (Langfuse, Grafana).

---

## Differentiators

Features that would make this implementation stand out. Not expected by default, but valued by users who
encounter them.

| Feature | Value Proposition | Complexity | Dependencies |
|---|---|---|---|
| Cache efficiency ratio with plain-language label | Show `cache_read_tokens / total_input_tokens` as a percentage with a label ("Great / OK / Poor"). Most tools show raw counts; few interpret the ratio | Low | Stored usage fields + formula |
| Ephemeral cache tier breakdown (5m vs 1h) | The JSONL stores `cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` as separate sub-fields. No known tool surfaces this distinction — understanding which tier is in use affects cost math | Medium | Store the nested `cache_creation` sub-fields; requires extra columns |
| Token cost estimate per session and day | Multiply token counts by published per-token rates to show a USD estimate. ccusage does this; useful for API users to see relative cost weight by session | Medium | Hardcode or configure per-model pricing; requires "model" field per message or per session |
| Compaction event markers on the line chart | The JSONL already records `compact_boundary` with `preTokens`. Marking compaction points on the chart shows where context resets happened and how they affect per-message token counts afterward | Medium | Compaction boundaries are already parsed; need to join with per-message chart data |
| Session-level model breakdown | `message.model` is on every `assistant` message. Surfacing which model was used (e.g., Sonnet vs Opus) alongside token counts is useful when sessions used multiple models or when comparing session costs | Medium | Store model per assistant message |
| Subagent / worktree token rollup | Worktree sessions are already grouped at query-time for the timeline. Showing aggregate token counts for the entire worktree group (not just individual sessions) connects token cost to project-level work | Medium | Extension of existing worktree grouping query |
| Token overlay on Gantt bars | Encode token weight as visual intensity on existing timeline bars (color saturation or width modifier) — connects time with cost at a glance without leaving the main timeline view | High | Gantt component modification; joins session token data with Gantt rendering |

**Confidence:** MEDIUM for ephemeral tier breakdown (field verified in JSONL schema, but user awareness of the
5m vs 1h distinction is currently low). MEDIUM for cost estimation (pricing verified from official docs;
complexity depends on plan type — see anti-features). LOW for Gantt overlay (no precedent in surveyed tools;
considered novel).

---

## Anti-Features

Features to deliberately not build. Common traps in the token analytics domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| Real-time / live token counter | CC Time Reporter reads completed transcripts — it is a retrospective analytics tool, not a live monitor. A live counter would require watching JSONL files mid-session and competes directly with Claude Code's own `/cost` command and the Claude Code Usage Monitor | Stick to post-session analytics; data is available after import |
| Dollar cost as the primary metric | Claude Code Max subscribers pay a flat monthly subscription; the raw dollar figure derived from per-token API pricing is misleading or meaningless for them. Most users of this local tool are Max subscribers. If cost is shown, it must be clearly labeled as an API-rate estimate | Show tokens as the primary metric; cost is opt-in or secondary, with explicit disclaimer |
| ML-based usage predictions / burn rate forecasts | Claude Code Usage Monitor already does this for the active session. CC Time Reporter operates on historical completed sessions — projections from historical JSONL would be speculative without knowing the user's billing window or upcoming workload | Surface historical trends; leave live prediction to tools built for it |
| Budget alerts and spend caps | Budget alerts require persistent background monitoring, notification infrastructure, and user configuration — far outside scope of a local analytics tool. Enterprise teams needing this use Anthropic Console or platform observability tools | Document that Console and ccusage handle this for API users |
| Per-tool-call token attribution | The JSONL `usage` field is on the assistant message (which may contain multiple tool_use blocks). Attributing tokens to individual tool calls within a message would require inference or heuristics with no reliable source data | Per-message is the correct and accurate granularity |
| Model comparison benchmarking | Some platforms compare token efficiency across different models or providers. This app has one data source (the user's own sessions) and no way to run the same prompt on different models for comparison | Surface model as session metadata only |
| Token analytics page completely disconnected from the timeline | A standalone `/tokens` page that has no way to navigate to a session's detail or timeline context creates a silo. Users need the connection between "this session used a lot of tokens" and "this is what that session was doing" | Link from the chart page back to the session detail panel; consider adding a token summary to the existing session detail panel first |

**Confidence:** HIGH for avoiding live monitoring (design philosophy, not a technical constraint). HIGH for
cost-as-primary anti-feature — confirmed by Max plan structure and user base assumption. MEDIUM for the
disconnected-page anti-feature (UX opinion, no external source).

---

## Feature Dependencies

```
Schema migration (v10): add usage columns to messages table
  ├── Session token totals in session detail panel     [Low]
  ├── Day total tokens in day summary                  [Low]
  ├── Cache hit rate per session                       [Low — computed]
  ├── Token counts in CLI outputs                      [Low]
  ├── Token counts in MCP tools                        [Low]
  └── /tokens page line chart                          [Medium]
        ├── Cumulative vs per-message toggle           [Low — data transform]
        ├── Multiple sessions + aggregate line         [Medium]
        └── Compaction event markers on chart          [Medium]
              └── Compaction boundaries already parsed in import pipeline

Store model per assistant message (or per session)
  └── Session-level model breakdown                    [Medium]

Store ephemeral tier sub-fields
  └── Ephemeral cache tier breakdown (5m vs 1h)        [Medium]
```

The entire feature set gates on the schema migration and import pipeline change to store `usage` fields.
No feature can ship without that foundation.

---

## MVP Recommendation

For the first milestone increment, prioritize:

1. **Schema migration and import pipeline** — Add columns for the 4 primary usage fields (`input_tokens`,
   `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) to `messages`. Store
   per-message (not session aggregates only) so the line chart has the data it needs without re-processing
   JSONL later. Compute session-level aggregates in the `sessions` table at import time.

2. **Session token totals in the detail panel** — Highest surface area, lowest complexity. Input / output /
   cache read / cache write breakdown with cache hit rate ratio.

3. **Day summary token totals** — Simple aggregate query; feeds both UI and CLI/MCP immediately.

4. **CLI and MCP token fields** — Add token counts to existing `summary`/`sessions` CLI output and
   `get_day_summary`/`get_sessions` MCP tools.

5. **`/tokens` page with line chart** — Per-message cumulative + per-message toggle, one line per session
   with an aggregate line.

Defer to later increments:

- **Ephemeral cache tier breakdown** — Low user awareness of 5m vs 1h distinction currently.
- **Cost estimation in USD** — Needs explicit decision on Max vs API user targeting and pricing table
  maintenance.
- **Compaction event markers** — Useful but adds chart annotation complexity; do after the base chart ships.
- **Token overlay on Gantt bars** — High implementation cost relative to marginal gain; validate chart page
  first.
- **Subagent / worktree token rollup** — Requires grouping query extension; do after core features are stable.
- **Session model breakdown** — Requires additional storage; lower priority than usage counts.

---

## Competitive Landscape Summary

Tools surveyed and their token display patterns (MEDIUM confidence; sources: WebSearch + ccusage docs):

| Tool | What it shows | Where CC Time Reporter differs |
|---|---|---|
| **ccusage** | Daily/session/weekly tables: input, output, cache create, cache read, cost USD | No timeline integration, no per-message chart, no connection to Gantt context |
| **Claude Code Usage Monitor** | Real-time terminal: live usage, burn rate, predictions, progress bars | Retrospective history only via tables; no session-level time-series chart |
| **Anthropic Console** | Monthly/daily by API key/workspace/model; cost by service tier | API users only; no local JSONL; no session-level granularity |
| **Grafana + Prometheus + OTLP** | Full time-series, custom dashboards, multi-metric | Requires infrastructure; not local-first |
| **Claude Code `/cost` command** | Current session totals in CLI during active session | Active session only; no historical access |

CC Time Reporter's positioning: **local-first retrospective analytics integrated with the session timeline
the user already uses to understand their work patterns.** Token data augments the Gantt chart and session
detail panel rather than living in a separate tool.

---

## Sources

- [Anthropic Pricing — official token cost multipliers](https://platform.claude.com/docs/en/about-claude/pricing) — HIGH confidence
- [Anthropic Prompt Caching docs — cache write/read pricing](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — HIGH confidence
- [Service Tiers — Claude API docs](https://platform.claude.com/docs/en/api/service-tiers) — HIGH confidence
- [ccusage session/daily report columns and JSON output](https://ccusage.com/guide/session-reports) — MEDIUM confidence (via WebSearch; WebFetch blocked)
- [ccusage GitHub — feature list](https://github.com/ryoppippi/ccusage) — MEDIUM confidence
- [Claude Code Usage Monitor — GitHub](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) — MEDIUM confidence
- [Traceloop — per-user token tracking UX patterns](https://www.traceloop.com/blog/from-bills-to-budgets-how-to-track-llm-token-usage-and-cost-per-user) — MEDIUM confidence
- [Langfuse — token and cost tracking patterns](https://langfuse.com/docs/observability/features/token-and-cost-tracking) — MEDIUM confidence
- [Claude Code costs page — /cost command and usage display](https://code.claude.com/docs/en/costs) — HIGH confidence
- `references/claude-transcript-schema.md` — CC Time Reporter JSONL schema reference (defines the `usage` object) — HIGH confidence
