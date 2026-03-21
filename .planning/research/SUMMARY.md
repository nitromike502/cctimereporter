# Project Research Summary

**Project:** CC Time Reporter v0.7.0 — Fork Branch Visualization
**Domain:** Timeline Gantt chart enhancement — visualizing branched conversation history
**Researched:** 2026-03-20
**Confidence:** HIGH

## Executive Summary

Fork visualization adds 50%-height sub-bars beneath parent session bars in the Gantt chart to represent time spent on secondary conversation branches in Claude Code sessions. The good news: all required data already exists in the database (`messages.is_fork_branch`, `messages.timestamp`), no new libraries are needed, and the existing CSS percentage-positioning model accommodates fork bars without architectural changes. The implementation is an additive extension to the existing pipeline: one new server-side helper function, one new frontend component, and targeted modifications to `GanttSwimlane.vue` and `timeline.js`.

The key design decision is fork identity. The `is_fork_branch` boolean in the messages table marks messages as "on a secondary branch" but cannot distinguish between Branch A and Branch B in a session with multiple forks. The research recommends a two-phase approach: ship an MVP that renders a single aggregated "fork activity" span (min/max timestamps of all `is_fork_branch=1` messages) — no schema change needed. Defer per-fork distinction to a follow-up that introduces a `fork_branch_id` column (schema v7 migration) enabling discrete per-branch bars.

The most dangerous pitfall is the duplicated sub-row height algorithm shared between `GanttSwimlane.vue` and `GanttChart.vue`. Any layout change that affects row height must be synchronized across both files or the pinned project label column will visually misalign from its swimlane rows. The research consensus is clear: if fork bars use the overlay approach (rendered in the lower half of the existing row rather than in a new expanded row), the lane height computation is untouched and `GanttChart.vue` requires no changes at all. This architectural choice eliminates the most critical pitfall.

## Key Findings

### Recommended Stack

No new libraries or dependencies are required. The existing Vue 3 + pure CSS percentage-positioning system is sufficient for fork bar rendering. The `timeToPercent()` function in `GanttBar.vue` already converts any ISO timestamp to a canvas percentage offset, and the absolute-positioning model already handles arbitrary overlapping elements. See [STACK.md](.planning/research/STACK.md) for full integration point analysis.

**Core technologies (unchanged):**
- Vue 3 (Composition API): frontend rendering — handles new `GanttForkBar.vue` component natively
- Pure CSS percentage layout: Gantt positioning — fork bars use identical positioning math as main bars
- Fastify + node:sqlite: backend query layer — new `forkMessageStmt` and `computeForkSegments()` helper added to `timeline.js`
- Existing schema v6: `messages.is_fork_branch` and `messages.timestamp` already populated at import time

**Optional schema addition (deferred):** `fork_branch_id INTEGER` on messages (schema v7 migration) enables per-branch bars. Not required for MVP.

### Expected Features

The feature scope breaks cleanly into MVP (no schema change) and post-MVP (schema change required). See [FEATURES.md](.planning/research/FEATURES.md) for full dependency graph.

**Must have (table stakes for v0.7.0):**
- Fork count indicator on session bar — surface `real_fork_count > 0` visually; already available in API response
- Fork activity sub-row — single span from first to last `is_fork_branch=1` message, rendered at 50% height below parent bar
- Toggle show/hide fork sub-rows — prevents visual noise on fork-heavy sessions; toolbar or settings checkbox

**Should have (differentiators, include if time allows):**
- Fork bar minimum width enforcement — short fork spans stay visible on 24h axis
- Visual distinction via opacity/color — fork bars clearly subordinate to main bars (lower opacity, same hue)

**Defer to post-MVP (require schema v7):**
- Multiple distinct fork sub-bars (one per branch): needs `fork_branch_id` on messages
- Fork branch detail on click: depends on fork identity; defer with multiple sub-bars
- Visual connector lines from parent bar to fork bar at fork point: cosmetic, low information value

**Anti-features (explicitly excluded):**
- Rendering progress forks (use `real_fork_count` only, not `fork_count`)
- Per-fork idle gap calculation (expensive, rarely meaningful)
- Named fork branches ("Branch A", "Fork 2") — adds cognitive overhead without meaning
- Inline accordion expansion (breaks zoom/pan interaction model)

### Architecture Approach

The recommended architecture uses an **overlay approach**: fork bars are rendered as absolutely-positioned siblings within the same lane row as the parent bar, occupying the lower 14px (50% of 28px bar height). This avoids any change to `laneHeight` in `GanttSwimlane.vue` and `laneHeights` in `GanttChart.vue`, which is the highest-risk part of the codebase. Fork segments are computed server-side in `timeline.js` following the same pattern as `computeIdleGaps()`, gated on `real_fork_count > 0` to skip the DB query for the common case. See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for pseudocode and the full data flow diagram.

**Major components:**
1. `timeline.js` (modified): New `forkMessageStmt` prepared statement + `computeForkSegments()` helper; `forkSegments: []` added to each session object in the API response
2. `GanttForkBar.vue` (new): Display-only component at 50% height; props `{ segment: { start, end }, date, color }`; uses same `timeToPercent` logic as `GanttBar`; no click interaction, no label, no idle-gap segments
3. `GanttSwimlane.vue` (modified): Imports and renders `GanttForkBar` instances after each main `GanttBar`, positioned at `top: rowIdx * BAR_ROW_HEIGHT + 14px`; no lane height changes needed
4. `GanttChart.vue` (no change): Overlay approach avoids the mirrored lane height recalculation entirely
5. `GanttBar.vue` (no change): Main bar unaffected

**Suggested build order:** API route first (independently testable), then `GanttForkBar.vue` (testable in `/components` preview), then `GanttSwimlane.vue` integration last.

### Critical Pitfalls

See [PITFALLS.md](.planning/research/PITFALLS.md) for full analysis with detection and prevention steps.

1. **Duplicated sub-row height algorithm breaks label alignment** — `GanttChart.vue` and `GanttSwimlane.vue` each independently compute lane heights. The overlay approach avoids this entirely: fork bars share existing row height, neither file's height computation changes. If the sub-row approach is chosen instead, both files must be updated together before any fork bars render.

2. **Fork identity not derivable from `is_fork_branch` alone** — `is_fork_branch=1` cannot distinguish Branch A from Branch B. MVP renders a single aggregated span (min/max timestamps). Per-fork bars require schema v7 (`fork_branch_id` column). Do not attempt per-fork rendering in v0.7.0 without the schema migration.

3. **Working time inflated by fork branch messages** — The existing `computeWorkingTime()` query does not filter `is_fork_branch`. Fork message timestamps may inflate session working time. This decision must be made explicitly before the fork UI ships: include or exclude fork time. Document the choice as a code comment in `timeline.js`.

4. **Fork bar click events must route through `GanttChart.onBarSelect`** — The drag-pan guard (`didScroll` check) only fires via `GanttChart`'s handler. If fork bars emit click events directly from `GanttSwimlane`, panning at zoom > 1x will accidentally trigger fork selection. Route all fork interactions through the existing event chain, or make fork bars display-only with no click handling (recommended for MVP).

5. **Per-session fork query doubles DB round-trips** — One extra query per session with `real_fork_count > 0`. The `real_fork_count > 0` guard limits impact. For days with many fork-heavy sessions, batch the fork query across all sessions using `WHERE session_id IN (...)` instead of a loop. Profile before optimizing.

## Implications for Roadmap

### Phase 1: Data Contract and Architecture Decisions

**Rationale:** Two architectural decisions must be locked before any code is written, and the backend data contract must be in place before frontend work begins. These decisions affect every subsequent phase.

**Delivers:** Working API that returns `forkSegments` per session; explicit policy on working time calculation; decision on overlay vs sub-row rendering approach; shared layout utility if sub-row approach is chosen

**Decisions to lock:**
- Working time policy: include or exclude `is_fork_branch=1` messages (document in code)
- Rendering approach: overlay (recommended) vs sub-row expansion (adds risk)
- MVP scope: single aggregated span (recommended) vs per-fork bars (requires schema v7)

**Addresses (from FEATURES.md):** Fork sub-row prerequisite (API data contract)
**Avoids (from PITFALLS.md):** Pitfall 2 (working time inflation), Pitfall 3 (fork data not available), Pitfall 4 (fork identity), Pitfall 1 (label alignment — via overlay approach choice)

**Research flag:** No additional research needed. All implementation patterns are fully specified in the research files.

---

### Phase 2: Backend Implementation

**Rationale:** API-first. Frontend components cannot be developed without the `forkSegments` data shape in the timeline response. This phase is independently testable via `curl /api/timeline`.

**Delivers:** `forkSegments: [{ start, end }]` in the timeline API response; `forkCount` badge data already present

**Implements (from ARCHITECTURE.md):**
- `computeForkSegments()` helper in `timeline.js`
- `forkMessageStmt` prepared statement (gated on `real_fork_count > 0`)
- Day-boundary clamping for fork timestamps (same as idle gaps)

**Avoids (from PITFALLS.md):** Pitfall 7 (per-session query overhead — use `real_fork_count` guard); Pitfall 9 (day-continuation flags not inherited by fork objects)

**Research flag:** Standard patterns. Mirrors existing `computeIdleGaps` implementation. No additional research needed.

---

### Phase 3: Frontend Components

**Rationale:** With the API contract settled and working, frontend components can be built bottom-up: new component first (isolated), then integration into swimlane.

**Delivers:** `GanttForkBar.vue` component; fork bars rendered in the timeline for sessions with `real_fork_count > 0`; show/hide toggle

**Implements (from ARCHITECTURE.md):**
- `GanttForkBar.vue`: display-only, 50% height, same positioning math as `GanttBar`
- `GanttSwimlane.vue` modification: render `GanttForkBar` instances after main bars
- Fork visibility toggle in toolbar or settings

**Addresses (from FEATURES.md):** Fork count indicator, fork activity sub-row, toggle show/hide

**Avoids (from PITFALLS.md):** Pitfall 1 (label alignment — overlay approach means no height changes); Pitfall 5 (14px bars are display-only, not click targets); Pitfall 6 (no click events needed for display-only bars); Pitfall 10 (explicit `z-index: 1` on fork bars)

**Research flag:** Standard patterns. Component structure mirrors existing Gantt components.

---

### Phase 4: Visual Polish (Optional for v0.7.0)

**Rationale:** Once fork bars render correctly, visual refinements can be done without risk to layout or data correctness.

**Delivers:** Fork bar color/opacity tuning; minimum width enforcement; tooltip showing fork duration; (optional) fork count badge on main bar

**Avoids (from PITFALLS.md):** Pitfall 8 is lower risk than initially flagged (0.03% minimum width = ~26 seconds, rarely an issue for fork spans)

**Research flag:** No research needed. Pure visual iteration.

---

### Phase 5: Per-Fork Identity (Post-v0.7.0)

**Rationale:** Multiple distinct fork bars require schema v7 (`fork_branch_id` on messages), which means a DB migration and re-import. This is a meaningful disruption and should only be tackled once MVP fork visualization proves its value.

**Delivers:** Distinct sub-bars per fork branch; `fork_branch_id` schema migration; extended fork detail on click

**Uses (from STACK.md):** Schema v7 migration pattern (existing migration chain in `src/db/index.js`)

**Implements (from ARCHITECTURE.md):** `fork_branch_id INTEGER` on messages; `fork-detector.js` assigns integer branch indices; new GROUP BY query replaces min/max approach

**Research flag:** May need research on UX patterns for multi-fork display and click-through to fork messages.

---

### Phase Ordering Rationale

- Phase 1 before all others: architecture decisions made wrong are expensive to undo; working time policy especially affects correctness of existing displayed data
- Phase 2 before Phase 3: frontend cannot be built without a real API response shape to develop against
- Phase 3 sequenced bottom-up (new component before integration): isolates risk, allows component preview page testing
- Phase 4 deferred: polish has no dependencies but zero urgency
- Phase 5 deferred: schema migration risk justifies a clear post-MVP boundary

### Research Flags

Phases needing additional research during planning:
- **Phase 5 only:** UX patterns for clicking through to individual fork branch messages when branches are identified by ID

Phases with standard patterns (research complete, no additional research needed):
- **Phase 1:** Decision-making only; no implementation research required
- **Phase 2:** Mirrors `computeIdleGaps` pattern exactly; implementation fully specified in ARCHITECTURE.md
- **Phase 3:** Mirrors existing Gantt component structure; implementation fully specified
- **Phase 4:** Pure visual iteration; no research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings from direct source code inspection; no external libraries involved |
| Features | HIGH | Based on codebase analysis + established git visualization UX patterns; scope is well-bounded |
| Architecture | HIGH | Full pseudocode provided; all integration points verified against actual source; overlay approach is concrete |
| Pitfalls | HIGH | All pitfalls derived from actual source code reading with line numbers; no general-pattern speculation |

**Overall confidence:** HIGH

### Gaps to Address

- **Working time policy:** Must be decided in Phase 1 and documented as a code comment. Neither include nor exclude is obviously correct — make the call, write it down, move on.
- **Fork bar segment threshold:** Should the fork segment grouping threshold match the idle threshold (user-configurable) or use a fixed value (e.g., 30 minutes)? Using the idle threshold is pragmatic but may produce many small bars for scattered fork activity. Decide during Phase 2 implementation.
- **Toggle UX location:** Show/hide fork sub-rows toggle belongs somewhere in the UI (toolbar, settings panel, sidebar). Not specified in research. Decide during Phase 3 based on existing UI patterns.
- **Per-fork bars (Phase 5 scope):** The exact UX for clicking a fork sub-bar to see its messages is unresolved. Clicking to a filtered messages modal (showing only fork-branch messages for that branch ID) is the likely pattern, but the sessions/:id/messages route currently has no fork-branch filtering.

## Sources

### Primary (HIGH confidence — direct source inspection)

- `/home/claude/cctimereporter/src/client/components/GanttChart.vue` — lane height computation, zoom mechanics, drag-pan guard
- `/home/claude/cctimereporter/src/client/components/GanttSwimlane.vue` — sub-row stacking, bar height constants
- `/home/claude/cctimereporter/src/client/components/GanttBar.vue` — bar geometry, `timeToPercent`, positioning model
- `/home/claude/cctimereporter/src/server/routes/timeline.js` — session shape, message query, `computeIdleGaps` pattern
- `/home/claude/cctimereporter/src/importer/fork-detector.js` — fork detection algorithm, UUID tree traversal
- `/home/claude/cctimereporter/src/db/schema.js` — schema v6 DDL, migration constants

### Secondary (MEDIUM confidence — UX pattern reference)

- GitKraken Commit Graph — branch lane visualization patterns
- Mermaid GitGraph Diagrams — declarative branch/commit timeline layout
- Graphite stacked branch visualization — DAG branch lane UX
- git log --graph — column-per-branch convention

---
*Research completed: 2026-03-20*
*Ready for roadmap: yes*
