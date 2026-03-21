# Technology Stack: Fork Branch Visualization

**Project:** CC Time Reporter — fork visualization milestone
**Researched:** 2026-03-20
**Question:** What stack additions/changes are needed for fork branch visualization as sub-rows in the Gantt chart?

## Verdict

**No new libraries are needed.** Fork visualization is achievable entirely within the existing
Vue 3 + pure CSS stack. The data pipeline requires one new server-side query and a
server-side algorithm to derive time ranges from interleaved messages. The frontend
requires layout and rendering changes to existing components only.

---

## Existing Stack (Verified Against Codebase)

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Vue 3 (Composition API, `<script setup>`) | current |
| Gantt positioning | Pure CSS, percentage-based `position: absolute` | — |
| Bar rendering | `GanttBar.vue` — `left`/`width` as `% of 24h day` | — |
| Swimlane stacking | `GanttSwimlane.vue` — greedy sub-row algorithm | — |
| Chart layout | `GanttChart.vue` — pinned labels + scrollable canvas | — |
| Backend | Fastify routes, `node:sqlite` | — |
| Fork data (DB) | `messages.is_fork_branch BOOLEAN`, `sessions.fork_count`, `sessions.real_fork_count` | schema v6 |

All positioning math already exists: `timeToPercent(timestamp, dateStr)` in `GanttBar.vue`
converts any ISO timestamp to a percentage offset within the 24h canvas.
The bar height constant (`28px`) and row stride (`BAR_ROW_HEIGHT = 36`) are already
parameterized in both `GanttSwimlane.vue` and `GanttChart.vue`.

---

## What Needs to Change

### 1. Server: New Query — Fork Branch Time Ranges

**Problem:** `messages.is_fork_branch` is a boolean tag on individual messages.
The frontend needs *discrete time ranges* (start/end pairs) to render bars, not
a list of tagged message timestamps.

**Solution:** New SQL query in `timeline.js` (or a new route) that, for each session
with `real_fork_count > 0`, fetches fork-branch messages and groups them into
contiguous time ranges. The grouping mirrors `computeIdleGaps()`: a gap exceeding
the idle threshold between consecutive fork-branch messages ends one range and starts
another (or simply: one range per fork branch identified by UUID chain).

The UUID chain approach is more accurate: the existing `fork-detector.js` logic
identifies which messages belong to each fork branch by following parent→child UUID
relationships. The server can replicate this at query time, or the DB can store a
`fork_branch_id` integer per message (a schema v7 migration).

**Recommendation:** Add `fork_branch_id INTEGER` to the `messages` table (schema v7).
Set it during import in `fork-detector.js` — each secondary branch gets an integer
index (1, 2, 3...). This makes the server query trivial:

```sql
SELECT fork_branch_id,
       MIN(timestamp) AS branch_start,
       MAX(timestamp) AS branch_end
FROM messages
WHERE session_id = ?
  AND is_fork_branch = 1
GROUP BY fork_branch_id
```

Without this schema addition, deriving ranges requires loading all fork-branch
message timestamps and walking the UUID tree in JS, which replicates `fork-detector.js`
logic in the route handler — duplication that will drift.

**Confidence:** HIGH — based on direct inspection of `fork-detector.js`, `schema.js`,
and `timeline.js`.

### 2. API: Extend `/api/timeline` Response

**Problem:** Session objects currently carry `forkCount` and `realForkCount` as
integers but no fork branch geometry.

**Solution:** Add a `forkBranches` array to each session object in the timeline
response:

```js
forkBranches: [
  { branchId: 1, startTime: '2026-03-20T10:15:00Z', endTime: '2026-03-20T10:28:00Z' },
  { branchId: 2, startTime: '2026-03-20T11:02:00Z', endTime: '2026-03-20T11:09:00Z' },
]
```

The array is empty (`[]`) for sessions with no real forks, so the frontend has a safe
default and no conditional null-checking is required.

**Confidence:** HIGH — timeline.js shape is well-understood from code inspection.

### 3. Frontend: `GanttBar.vue` — Fork Sub-Row Rendering

**Problem:** `GanttBar.vue` renders a single 28px-high bar. Fork branches need to
appear as 50%-height bars in a sub-row below the parent bar.

**Current geometry:**
- Bar height: `28px` (hardcoded in `.gantt-bar { height: 28px }`)
- The bar renders with `position: absolute` inside the swimlane's relative container

**Solution:** `GanttBar.vue` receives `forkBranches` as a prop and renders additional
absolutely-positioned elements below the main bar. No new component is strictly required;
fork sub-bars are visually simpler than full bars (no label, no idle-gap segments, just
a colored band at 50% height).

The main bar `top` position is already controlled by `GanttSwimlane` via `:style="{ top: rowIdx * BAR_ROW_HEIGHT + 'px' }"`. Fork sub-bars hang below at
`top: 28px` within the bar's own coordinate space (using `overflow: visible`, which the
parent already sets).

Alternatively, fork sub-bars can be sibling elements in `GanttSwimlane` positioned
relative to the parent bar's row. Either approach works; rendering inside `GanttBar`
is simpler because `timeToPercent` and `barLeft`/`barWidth` computed values are
already in scope.

**Confidence:** HIGH — layout model is fully understood from code inspection.

### 4. Frontend: `GanttSwimlane.vue` — Lane Height Adjustment

**Problem:** `laneHeight` is computed as `subRows.value.length * BAR_ROW_HEIGHT + 8`.
If a session has fork branches, the lane needs extra height to accommodate the
sub-row below it.

**Current `BAR_ROW_HEIGHT`:** 36px (28px bar + 8px gap)

**Solution:** When any session in a row has `forkBranches.length > 0`, that row's
height needs to increase by approximately 14px (50% of 28px = 14px height for fork
bars). The simplest approach: define a `FORK_SUBROW_HEIGHT` constant (e.g. `14px`)
and add it to the row height when any session in that row has forks.

`GanttChart.vue` mirrors `GanttSwimlane`'s `computeSubRowCount` logic to set matching
label heights. The same adjustment must be made in `GanttChart.vue`'s
`computeSubRowCount` / `laneHeights` computed.

**Confidence:** HIGH — the mirrored height calculation pattern is explicit in both files
(`computeSubRowCount` in `GanttChart.vue` duplicates `GanttSwimlane`'s `subRows`
computation specifically to keep label heights in sync).

---

## Alternatives Considered and Rejected

### SVG-Based Rendering

Some Gantt libraries use SVG for precise layout and connector lines. SVG would simplify
drawing fork connection lines from parent bar to sub-bar.

**Rejected because:** The existing percentage-CSS approach is already working and
well-understood. Switching to SVG for fork visualization alone would require rewriting
`GanttBar`, `GanttSwimlane`, and `GanttChart`, plus the zoom/pan logic. The only
feature SVG would add is diagonal connector lines — a cosmetic benefit that doesn't
justify the rewrite cost.

Fork bars can show their relationship via visual alignment (same time position,
directly below parent, slightly indented or differentiated color) without explicit
connector lines.

### Third-Party Gantt Library (e.g. dhtmlx-gantt, frappe-gantt)

All third-party Gantt libraries impose their own data models and rendering logic,
which would conflict with the existing custom implementation.

**Rejected because:** The existing system has features (idle-gap segments, zoom with
cursor anchoring, SSE import progress, session click-to-detail) that no off-the-shelf
library provides. Adopting a library would mean porting all of this into its plugin/API
system — net negative.

### Storing Fork Ranges in a Separate Table

A `fork_branch_ranges` table pre-computing start/end times at import time.

**Considered but deferred:** The `fork_branch_id` column on `messages` (recommended above)
achieves the same goal with less schema complexity. A GROUP BY query at serve-time
is fast enough given the data volume (messages per session is in the hundreds).

---

## Integration Points Summary

| Component | Change Type | Scope |
|-----------|-------------|-------|
| `schema.js` | Add `fork_branch_id INTEGER` to messages; schema v7 migration | Small: 1 DDL line + migration constant |
| `fork-detector.js` | Assign branch index integers in addition to existing UUID set | Small: integer counter alongside `forkBranchUuids` |
| `db-writer.js` | Write `fork_branch_id` during message insert | Small: 1 column in INSERT |
| `timeline.js` | New query for fork branch ranges; add `forkBranches` to session shape | Medium: new prepared statement + loop |
| `GanttBar.vue` | Accept `forkBranches` prop; render fork sub-bars below main bar | Medium: new prop + rendering logic |
| `GanttSwimlane.vue` | Account for fork sub-row height in `laneHeight` | Small: height formula adjustment |
| `GanttChart.vue` | Mirror the same fork height adjustment in `laneHeights` | Small: same change as above |

---

## Sources

- Direct code inspection of `/home/claude/cctimereporter/src/` (HIGH confidence — current code)
- `src/importer/fork-detector.js` — fork detection algorithm
- `src/db/schema.js` — schema v6 DDL, migration constants
- `src/server/routes/timeline.js` — session shape, message query pattern
- `src/client/components/GanttBar.vue` — bar geometry, positioning model
- `src/client/components/GanttSwimlane.vue` — sub-row stacking, height computation
- `src/client/components/GanttChart.vue` — label height mirroring, zoom mechanics
