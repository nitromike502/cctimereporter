# Feature Landscape: Fork Visualization in Gantt Timeline

**Domain:** Branched conversation visualization in a time-based Gantt chart
**Researched:** 2026-03-20
**Confidence:** HIGH (based on direct codebase analysis + git visualization UX patterns)

---

## Context: What We're Working With

The existing data model and its constraints shape every feature decision here.

**What exists in the DB today:**
- `sessions.fork_count` — total fork points (including progress forks)
- `sessions.real_fork_count` — meaningful conversation branches only
- `messages.is_fork_branch` — boolean flag on messages that are on secondary branches
- `messages.parent_uuid` — the tree linkage
- `messages.timestamp` — when each message occurred

**The hard constraint:** The messages table has `is_fork_branch` (boolean, "secondary branch yes/no") but no `fork_branch_id`. Individual fork branches are not identified — you can't distinguish "branch A" from "branch B" without re-running the fork detector logic on the message tree.

**The scale constraint:** Sessions can have up to 1042 forks. The vast majority are `progress` or `file_history_snapshot` type — already classified as non-real by `detectForks()`. Real forks are far fewer, but the number is session-dependent and unknown without querying.

**The timeline model:** Sessions are positioned as horizontal bars by `startTime`/`endTime` with percentage-based CSS. The swimlane (`GanttSwimlane.vue`) already handles overlap stacking via a greedy sub-row algorithm. Bar height is 28px, row pitch is 36px.

---

## How Git Tools Approach This (Reference Patterns)

Git visualization tools — GitKraken, `git log --graph`, Mermaid gitgraph — all follow the same pattern:

- **Each branch gets its own horizontal lane** (column in git graph, row in timeline)
- **Branch point is the visual origin** of the divergent lane
- **Lane only exists for the branch's duration** — from fork point to last commit
- **Merges are shown as convergence lines**

The key insight from these tools: they work with *identified* branches (named refs). The challenge here is that fork branches are anonymous — they're identified only by their message UUIDs, not by names or stable IDs.

---

## Table Stakes

Features that must exist for fork visualization to be useful at all.

| Feature | Why Required | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Show fork indicator on session bar** | Sessions with `real_fork_count > 0` need visual distinction from simple sessions. Without this, the feature is invisible to users who don't know to look. | Low | `real_fork_count` already in API response |
| **Fork count badge/tooltip** | "3 real forks" is meaningful context. Users need to know what they're looking at. | Low | `real_fork_count` in session object |
| **Filter: show/hide fork indicators** | Sessions with many forks create visual noise. Users need escape hatch. | Low | Toggle in toolbar or detail panel |
| **Fork sub-bars start at fork point** | A fork branch that starts before the fork point is a lie. The sub-bar must start at the timestamp of the first fork-branch message. | Medium | Requires API: first timestamp of fork-branch messages per session |

---

## Differentiators

Features that go beyond the baseline and make the visualization genuinely useful.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Fork branch as 50% height sub-row** | User's stated vision. Visually intuitive — branch hangs below parent bar, starts at fork point. Matches git visualization mental model. | Medium | API must return fork branch time segments; GanttBar needs height prop |
| **Fork branch duration from message timestamps** | Group `is_fork_branch=1` messages by contiguous time segments. Show the segment duration, not a single dot. | Medium-High | New API query: fork-branch message timestamps grouped into time spans |
| **Distinguish multiple fork branches** | When a session has 3 real forks, show 3 distinct sub-bars at different y-offsets. Each is a separate conversation branch worth seeing. | High | Requires fork branch identity (fork_branch_id not in schema) — needs either schema addition or runtime re-detection |
| **Fork branch click → detail** | Clicking a fork sub-bar shows what that branch was about (its messages, duration). | High | Requires sessions/:id/messages to support fork-branch-specific queries |
| **Visual connector line** | Thin vertical line from parent bar to fork sub-bar at the fork point timestamp. Makes the temporal relationship explicit. | Medium | Requires fork point timestamp in API response |

---

## Anti-Features

Things to deliberately not build. These patterns look appealing but create more problems than they solve.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Show all 1042 forks as visual elements** | Even if 95% are progress forks (already filtered), rendering hundreds of sub-bars destroys the timeline. Sessions become indistinguishable towers of bars. | Filter to `real_fork_count` only; default-hide if count exceeds a threshold (e.g., >5 real forks) |
| **Re-run fork detection in the frontend** | The full message tree reconstruction needed for fork identity is DB-intensive. It's already done at import time. | Surface pre-computed fork data via API; avoid client-side tree reconstruction |
| **Named fork branches** | Claude Code forks don't have names. Inventing labels ("Branch A", "Fork 2") adds cognitive overhead without meaning. | Show duration and message count only; let users click through to messages if curious |
| **Merge lines / convergence indicators** | Git graphs show merges because merges matter. Claude Code forks rarely re-merge into main branch — the primary branch just wins by descendant count. Showing phantom merges would be misleading. | Omit merge indicators entirely |
| **Inline fork expansion (accordion)** | Expanding a session bar vertically on click to reveal fork sub-rows changes the layout under the user's cursor. Existing zoom/pan interaction would need renegotiation. | Render fork sub-rows always-visible when the toggle is on, at fixed height offset below parent |
| **Per-fork idle gap calculation** | Fork branches may have their own idle patterns. Computing idle gaps for fork sub-bars is O(n) per fork branch per session. For sessions with many forks, this is expensive and the result is rarely meaningful. | Show fork sub-bar as a simple solid span from first to last fork-branch message |

---

## Feature Dependencies

```
real_fork_count (sessions table) — already available
    |
    v
Fork indicator badge on GanttBar — LOW complexity, unblocked
    |
    v
Fork sub-row rendering in GanttSwimlane — MEDIUM complexity
    |
    requires
    |
    v
API: fork branch time segments per session
    (new query: SELECT timestamp FROM messages WHERE session_id=? AND is_fork_branch=1 ORDER BY timestamp)
    |
    optional extension
    |
    v
Fork branch identity (schema addition: fork_branch_id on messages)
    |
    enables
    v
Multiple distinct fork sub-bars (one per branch)
```

**The branch identity gap is the key decision point.** Without `fork_branch_id` on messages, you can group `is_fork_branch=1` messages into a single time span (start of first fork-branch message → end of last), but you cannot distinguish separate branches from each other. That gives you "there was fork activity in this window" rather than "there were 3 distinct branches."

---

## MVP Recommendation for Fork Visualization

Prioritize in order:

1. **Fork count badge on session bar** — surface `real_fork_count > 0` with a small indicator. Unblocked, low effort, immediately useful.
2. **Single fork activity span as sub-row** — query min/max timestamp of `is_fork_branch=1` messages, render as 50% height bar below parent. No schema change needed.
3. **Toggle show/hide fork sub-rows** — toolbar or settings checkbox. Required to keep timeline usable for sessions with many forks.

Defer to post-MVP:

- **Multiple distinct fork sub-bars**: Requires `fork_branch_id` schema addition and migration. Worth a dedicated phase once the basic visualization proves its value.
- **Fork branch detail on click**: Depends on fork branch identity; defer with multiple sub-bars.
- **Visual connector lines**: Nice polish, low information value; do after core layout is stable.

---

## Sources

- Codebase analysis: `/home/claude/cctimereporter/src/importer/fork-detector.js`, `src/db/schema.js`, `src/server/routes/timeline.js`, `src/client/components/GanttSwimlane.vue`, `src/client/components/GanttBar.vue`
- [GitKraken Commit Graph](https://www.gitkraken.com/features/commit-graph) — branch lane visualization patterns
- [Mermaid GitGraph Diagrams](https://mermaid.ai/open-source/syntax/gitgraph.html) — declarative branch/commit timeline layout
- [Graphite: stacked branch visualization](https://graphite.com/blog/visualize-stacked-branches-in-git) — DAG branch lane UX
- [Git log --graph visualization](https://dev.to/ruqaiya_beguwala/day-2230-git-log-graph-oneline-all-visualize-branch-history-3pnc) — column-per-branch convention
