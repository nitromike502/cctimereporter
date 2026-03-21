# Architecture Patterns: Fork Visualization

**Domain:** Adding fork segment visualization to existing Gantt chart
**Researched:** 2026-03-20
**Confidence:** HIGH — based on direct source reading, no external dependencies to verify

---

## Current Architecture (Verified)

### Component Hierarchy

```
TimelinePage.vue
  GanttChart.vue           — two-column layout, zoom, scroll/pan
    GanttSwimlane.vue      — greedy sub-row layout per project
      GanttBar.vue         — single session bar, absolute positioned
```

### Data Flow (Current)

```
GET /api/timeline
  → sessions[].idleGaps[]        (computed from message timestamps in route)
  → sessions[].forkCount         (from sessions table, already present)
  → sessions[].realForkCount     (from sessions table, already present)

TimelinePage → GanttChart → GanttSwimlane → GanttBar
                                             ↳ renders idle gap segments inline
```

### Key Sizing Constants (Must Stay In Sync)

`GanttChart.vue` and `GanttSwimlane.vue` share a `BAR_ROW_HEIGHT = 36` constant (28px bar + 8px gap). **Both files must be updated together** when row height changes. The label column height (`laneHeights` computed) mirrors `GanttSwimlane`'s `laneHeight` via a duplicated greedy algorithm — this coupling is a maintenance risk.

### What the DB Already Has

- `messages.is_fork_branch` (BOOLEAN) — set at import time by `fork-detector.js`
- `sessions.fork_count`, `sessions.real_fork_count` — aggregate counts
- `messages.timestamp` — needed to derive time segments
- `messages.type` — already filtered in the message query in `timeline.js`

The fork branch messages are **not currently fetched** by the timeline route. The message query only retrieves `timestamp` from `type IN ('user', 'assistant')` for working time computation.

---

## The Core Problem: Interleaved Messages to Segments

Fork branch messages are interleaved chronologically with main branch messages. Given a session with 5006 main messages and 3029 fork-branch messages, both streams share the same timeline.

To render a fork bar, we need discrete time segments: contiguous runs of `is_fork_branch = 1` messages. Consecutive fork-branch messages that are close in time (under some threshold) form one segment; a long gap splits them into separate segments.

**Segment derivation algorithm** (same structure as `computeIdleGaps`):
1. Fetch timestamps for `is_fork_branch = 1` messages in the session, ordered by timestamp
2. Walk the list: when two consecutive timestamps are more than `thresholdMs` apart, end the current segment and start a new one
3. Each segment has `{ start: timestamp, end: timestamp }`

This mirrors the idle-gap computation already in `timeline.js`. The idle threshold already propagated from the UI can serve double duty here.

---

## Recommended Architecture

### 1. Where Fork Segments Are Computed

**Recommendation: API route (`timeline.js`), not client-side.**

Rationale:
- Fork segments require a DB query (`is_fork_branch = 1` messages for each session with forks)
- The route already performs per-session message queries in a tight loop
- Clients should receive ready-to-render data, not raw timestamps requiring re-derivation
- Consistency: idle gaps are already server-computed; fork segments follow the same pattern

**Do not compute at import time.** Segments depend on the idle threshold (a UI-configurable parameter), so they cannot be fixed at import. The threshold changes dynamically.

**Do not add a new API endpoint.** Fork segments are per-session data logically belonging to the session object. Adding them to the existing timeline response is the right coupling point.

### 2. API Changes Required

Add a `forkSegments` array to each session object in the timeline response, alongside `idleGaps`.

New prepared statement needed in `timeline.js`:

```js
const forkMessageStmt = db.prepare(`
  SELECT timestamp
  FROM messages
  WHERE session_id = ?
    AND is_fork_branch = 1
    AND timestamp IS NOT NULL
  ORDER BY timestamp
`);
```

New helper function (structurally identical to `computeIdleGaps`):

```js
function computeForkSegments(timestamps, thresholdMs) {
  if (timestamps.length === 0) return [];
  const segments = [];
  let segStart = timestamps[0];
  let segEnd = timestamps[0];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = new Date(timestamps[i]).getTime() - new Date(segEnd).getTime();
    if (gap > thresholdMs) {
      segments.push({ start: segStart, end: segEnd });
      segStart = timestamps[i];
    }
    segEnd = timestamps[i];
  }
  segments.push({ start: segStart, end: segEnd });
  return segments;
}
```

Call site in the session loop (only when `realForkCount > 0` to avoid the DB query overhead for the common case):

```js
let forkSegments = [];
if (row.real_fork_count > 0) {
  const forkMsgRows = forkMessageStmt.all(row.session_id);
  const forkTimestamps = forkMsgRows
    .map(m => m.timestamp)
    .filter(t => t >= dayStartUTC && t < dayEndUTC);
  forkSegments = computeForkSegments(forkTimestamps, thresholdMs);
}
```

The session object gets `forkSegments` appended:

```js
const sessionObj = {
  // ... existing fields ...
  forkSegments,   // [{ start, end }] — empty array when no forks
};
```

### 3. Component Changes

#### GanttSwimlane.vue — Modified

Currently renders one `GanttBar` per session, stacked in sub-rows via the greedy algorithm.

For fork visualization, each main bar needs an associated fork bar rendered at half-height directly below it (not in a separate greedy sub-row — it belongs to the same logical session row).

**Change required:** When a session has `forkSegments.length > 0`, render an additional `GanttForkBar` positioned at `top: rowIdx * BAR_ROW_HEIGHT + 14px` (14px = half of the 28px bar height). This is an overlay within the same row, not a new row.

The swimlane lane height does **not** change when forks are present — fork bars share vertical space with the bottom half of the main bar. No changes to `laneHeight` or the label-column height sync.

**Alternative considered:** Render fork bars as a second sub-row at 50% height, doubling lane height when forks are present. This would require updating `laneHeights` in `GanttChart.vue` and adds visual noise when a session has both forks and overlapping sessions. Rejected in favor of the overlay approach.

#### GanttChart.vue — No Changes Required (likely)

The `laneHeights` computed and its mirrored greedy algorithm do not need to change if fork bars are rendered as overlays within existing rows. If the overlay approach is chosen, `GanttChart.vue` is untouched.

If the sub-row approach is chosen instead, `computeSubRowCount` and `laneHeights` must be updated to account for fork rows. This is the main reason to prefer the overlay approach.

#### GanttBar.vue — No Changes Required

Fork bars are a separate component. The existing bar handles its own idle-gap rendering and label; fork bars are a distinct visual element with different semantics.

### 4. New Component: GanttForkBar.vue

A simpler, display-only variant of `GanttBar`. Key differences from `GanttBar`:

- No click/select interaction (forks are informational, not selectable as separate sessions)
- No label text (too small and no meaningful label to show)
- Rendered at 50% height (14px instead of 28px)
- Positioned in the lower half of its parent session's row
- Color derived from parent session's color at lower opacity (visually subordinate)
- No idle-gap segment rendering (each segment is already a discrete bar)
- Multiple instances per session (one per segment in `forkSegments`)

Props: `{ segment: { start, end }, date, color }`

Positioning uses the same `timeToPercent` logic as `GanttBar`. The component is absolutely positioned within the swimlane, not within the parent bar.

**Rendering location:** `GanttSwimlane.vue`, rendered after the main `GanttBar` for each session, in the same row slot.

### 5. Rendering the Fork Bars in GanttSwimlane

After the existing `GanttBar` for a session, iterate `session.forkSegments` and render one `GanttForkBar` per segment:

```html
<template v-for="(row, rowIdx) in subRows" :key="rowIdx">
  <GanttBar
    v-for="session in row"
    :key="session.sessionId"
    :session="session"
    ...
    :style="{ top: rowIdx * BAR_ROW_HEIGHT + 'px' }"
  />
  <!-- Fork segment bars: lower half of the same row -->
  <template v-for="session in row" :key="'forks-' + session.sessionId">
    <GanttForkBar
      v-for="(seg, segIdx) in session.forkSegments"
      :key="segIdx"
      :segment="seg"
      :date="date"
      :color="color"
      :style="{ top: rowIdx * BAR_ROW_HEIGHT + 14 + 'px' }"
    />
  </template>
</template>
```

---

## Data Flow After Changes

```
GET /api/timeline?date=...&threshold=...
  messages table (is_fork_branch=1, per session)
    → computeForkSegments()
    → sessions[].forkSegments[{ start, end }]

TimelinePage → GanttChart → GanttSwimlane → GanttBar (main, unchanged)
                                           → GanttForkBar × N (one per segment)
```

---

## Zoom Interaction

Fork bars use the same CSS percentage positioning as main bars. At all zoom levels, they scale identically. At 14px height they will be narrow but visible — same minimum width constraint (`min-width: 4px`) should apply. No special zoom handling needed.

The 14px height is fixed in pixels (not percentage), so it does not shrink at 1x zoom. This is correct behavior — the visual indicator should remain visible regardless of zoom.

---

## Suggested Build Order

1. **API route change** — Add `forkSegments` to the session object in `timeline.js`. Gate on `real_fork_count > 0` for performance. This is independently testable via the API.

2. **GanttForkBar.vue** — Create the new component. Can be developed and visually tested in the `/components` preview page before integration.

3. **GanttSwimlane.vue** — Import and render `GanttForkBar` instances. This is the integration point; nothing else needs to change.

4. **Visual polish** — Color, opacity, tooltip, and minimum-width decisions for fork bars.

This order respects the existing dependency graph: the API change is pure addition (no breaking changes to existing consumers), the new component has no dependencies on modified code, and the swimlane change is last because it depends on both.

---

## Integration Points Summary

| Component | Change Type | What Changes |
|-----------|-------------|--------------|
| `timeline.js` | Modified | New `forkMessageStmt`, `computeForkSegments()`, `forkSegments` in session object |
| `GanttSwimlane.vue` | Modified | Import and render `GanttForkBar` per segment per session |
| `GanttForkBar.vue` | New | Display-only fork segment bar at 50% height |
| `GanttChart.vue` | No change | Overlay approach avoids lane height recalculation |
| `GanttBar.vue` | No change | Main bar unaffected |
| `TimelinePage.vue` | No change | Passes sessions through unchanged |

---

## Risks and Constraints

**Performance:** Sessions with many forks (e.g., 1042 forks = 3029 fork-branch messages) add one DB query per session with `real_fork_count > 0`. This is bounded by the number of sessions on a given day. The `idx_messages_session` index makes each query O(log n). The `real_fork_count > 0` guard skips the query for the common case (most sessions have no forks).

**Segment threshold:** Using the same idle threshold for fork segment grouping as for main working time is pragmatic. If the threshold is 10 minutes, two fork-branch messages 11 minutes apart become separate segments. This may produce too many small bars for sessions with scattered fork activity. A fixed minimum segment gap (e.g., 30 minutes, independent of the idle threshold) is worth considering for visual clarity.

**DB constraint:** `is_fork_branch` is already populated by the existing import pipeline. No re-import or schema change required. This is a read-only addition to the query layer.

---

## Sources

All findings are HIGH confidence — derived from direct reading of the source files listed in the milestone context.

- `/home/claude/cctimereporter/src/client/components/GanttChart.vue`
- `/home/claude/cctimereporter/src/client/components/GanttSwimlane.vue`
- `/home/claude/cctimereporter/src/client/components/GanttBar.vue`
- `/home/claude/cctimereporter/src/server/routes/timeline.js`
- `/home/claude/cctimereporter/src/importer/fork-detector.js`
- `/home/claude/cctimereporter/src/db/schema.js`
