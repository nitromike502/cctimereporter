# Domain Pitfalls: Fork Visualization

**Domain:** Adding fork branch visualization to an existing Gantt timeline
**Researched:** 2026-03-20
**Scope:** Specific to the cctimereporter codebase

---

## Critical Pitfalls

Mistakes that cause rewrites or silent data corruption.

---

### Pitfall 1: Duplicated Sub-Row Algorithm Breaks Label Height Sync

**What goes wrong:** GanttChart and GanttSwimlane each independently implement the same greedy sub-row stacking algorithm. If fork bars introduce a new row type (50%-height rows beneath each parent bar), the algorithm must be updated in both places. Updating only GanttSwimlane causes the label column heights to diverge from the swimlane heights — the pinned project labels misalign from their corresponding bars immediately and visually.

**Why it happens:** The duplication is intentional and documented at line 244 in GanttChart.vue: "must match GanttSwimlane.vue BAR_ROW_HEIGHT". The comment is a warning that maintainers must keep in sync. Fork sub-rows add height to GanttSwimlane (via `laneHeight`) but `laneHeights` in GanttChart computes the same thing independently via `computeSubRowCount()`. Any new height contribution from fork rows must be reflected in BOTH computed values.

**Consequences:** Label column and swimlane rows visually misalign. At 1–2 forks, the misalignment is small and may not be caught in testing. With sessions that have many forks, labels for projects further down the list can be off by dozens of pixels.

**Prevention:** Before writing any fork rendering code, extract the sub-row height calculation into a shared utility function (e.g., `src/client/utils/gantt-layout.js`) that both GanttChart and GanttSwimlane import. Do not patch them separately. The `BAR_ROW_HEIGHT = 36` constant is also duplicated across both files and must stay in sync.

**Detection:** Render a date with at least one session that has `realForkCount > 0`. Check that the left-column project label top-aligns with its first bar.

**Phase to address:** Phase 1 (layout foundation). Extracting shared layout logic should be the first commit of the implementation, before any fork bars are rendered.

---

### Pitfall 2: Working Time Inflated by Fork Branch Messages

**What goes wrong:** `computeWorkingTime()` in `timeline.js` uses ALL messages for a session (type `user` or `assistant`, not null timestamp). Fork branch messages are stored in the `messages` table with `is_fork_branch = 1`. The current query at line 138–145 does NOT filter by `is_fork_branch`:

```sql
SELECT timestamp FROM messages
WHERE session_id = ?
  AND type IN ('user', 'assistant')
  AND timestamp IS NOT NULL
ORDER BY timestamp
```

Fork branch messages are interleaved by timestamp with main branch messages. If a user explored a fork that added significant time, those timestamps will be included in the working time calculation, potentially inflating the number shown in the session detail panel.

**Why it happens:** The timeline route was built before fork visualization was a concern. The query is correct for the current feature set. Nobody has yet examined whether fork branch timestamps should be excluded.

**Consequences:** Working time for sessions with real forks may be overstated. The effect is largest for sessions where the fork branch covered a different time span than the main branch (e.g., a fork explored at the end of a session that was otherwise idle).

**Prevention:** Decide the semantics before building UI. Two defensible positions:
- **Include fork time:** A fork represents real work the user did; it should count. Keeps the current query unchanged.
- **Exclude fork time:** Only the "winning" branch (main branch) represents accepted work. Requires adding `AND is_fork_branch = 0` to the messages query.

Neither is obviously wrong. The pitfall is implementing fork visualization without making this decision explicitly, then discovering the working time numbers are confusing after shipping.

**Detection:** Find a session with `realForkCount > 0` and compare working time with and without `AND is_fork_branch = 0` in the query.

**Phase to address:** Phase 1 (before any fork UI lands). Decide the policy and document it as a code comment in `timeline.js`.

---

### Pitfall 3: Fork Data Not Available at Query Time — Only Counts Are Stored

**What goes wrong:** The API currently returns `forkCount` and `realForkCount` as integers on each session object (lines 222–223 in timeline.js). It does NOT return time spans, message lists, or any structural data about individual forks. The fork branch UUIDs (`forkBranchUuids`) from `detectForks()` are discarded after import — only the per-message `is_fork_branch` flag survives in the DB.

To render fork bars with correct start/end times, a new query is needed: fetch timestamps of `is_fork_branch = 1` messages per session, then derive time spans. This requires either:
- A new API endpoint, or
- Extending the existing `/api/timeline` response with per-fork time span data

**Why it happens:** The importer was designed to count forks for statistics, not to serve them to a timeline. The data is present in the DB but requires a query that doesn't exist yet.

**Consequences:** Attempting to render fork bars with only `realForkCount: 2` (a count) is impossible. The work to expose fork time spans is non-trivial — the messages table doesn't store "fork N started at X and ended at Y" directly. Fork time spans must be derived from `is_fork_branch` message timestamps, which are interleaved across all forks.

**Prevention:** Before any frontend work, write and test the backend query that returns per-session fork time spans. Verify it handles: sessions with 0 forks (empty array), sessions with 1000+ fork messages, and overnight sessions (which need the same day-boundary clamping as regular sessions).

**Phase to address:** Phase 1. The backend data contract must be settled first.

---

### Pitfall 4: Multiple Forks Cannot Be Distinguished from `is_fork_branch` Alone

**What goes wrong:** `is_fork_branch = 1` marks a message as "on a non-primary branch" but does NOT indicate WHICH fork it belongs to. A session with `realForkCount = 3` has messages from three separate fork branches all marked `is_fork_branch = 1` with no fork-identity column. There is no stored fork ID.

To render distinct fork bars, fork identity must be reconstructed from `parent_uuid` chains at query time — or the importer must be extended to store fork IDs.

**Why it happens:** The import schema was designed to answer "how much of this session is fork overhead?" not "show me each fork as a separate bar." The `parent_uuid` column is stored in messages, so reconstruction is possible, but it requires re-running tree traversal logic in the server.

**Consequences:** If you attempt to draw one fork bar per `realForkCount`, you have no way to group `is_fork_branch` messages into individual forks without reconstructing the parent-UUID tree at query time. This is expensive for sessions with 1000+ messages.

**Prevention:** Two options:
1. Add a `fork_id` column to the `messages` table during import, populated by `detectForks()`. This is a schema change (v7 migration) but makes query-time grouping trivial.
2. Accept "one fork bar spanning all fork messages" as the MVP rendering. Don't attempt per-fork distinction in the first iteration. Show a single collapsed "fork activity" span per session using `MIN(timestamp)` and `MAX(timestamp)` of `is_fork_branch = 1` messages.

Option 2 is lower risk and still meaningful.

**Phase to address:** Phase 1 (architecture decision). If per-fork bars are required, schema migration must be scoped early.

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt.

---

### Pitfall 5: Fork Bar Height at 1x Zoom Is Unclickable

**What goes wrong:** GanttBar is 28px tall (CSS `.gantt-bar { height: 28px }`). Fork bars at 50% height would be 14px. At 1x zoom on a typical monitor, 14px is below comfortable click target size (Apple HIG recommends 44px; Material recommends 48px). Users with sessions that have many forks will find the fork bars nearly impossible to click without zooming in.

**Why it happens:** The 28px bar height was set for full-session bars and was not designed with sub-bars in mind. 50% of 28px is 14px, which is too small.

**Consequences:** If fork bars are clickable (to show fork detail), users on 1x zoom will be frustrated. If fork bars are display-only (no click), the height is annoying but survivable.

**Prevention:** Decide the interaction model before choosing the height. If fork bars are click-targets: minimum 18–20px with a larger invisible click region via CSS padding. If display-only: 8–10px is sufficient as a visual indicator. Consider fork bars as decorative indicators rather than interactive elements in the first phase.

**Detection:** Render at 1x zoom, attempt to click a fork bar.

**Phase to address:** Phase 1 (interaction design decision). Lock down click behavior before implementing height.

---

### Pitfall 6: Drag-Pan Click Guard Does Not Protect Fork Bar Clicks

**What goes wrong:** GanttChart suppresses bar click events when `didScroll = true` (set after mousedown moves more than 5px). This logic is in `onBarSelect()` at line 229–235 in GanttChart.vue. GanttBar emits `select` directly on click without any awareness of drag state. When fork bars are added, if they emit their own `select` events (or a new `fork-select` event), they must bubble through GanttSwimlane and GanttChart before the drag-pan guard can intercept them.

If fork bars are added as a new component that emits events directly attached in GanttSwimlane (bypassing GanttChart's `onBarSelect`), the drag-pan guard will not fire and users will accidentally select forks when panning at zoom > 1x.

**Prevention:** Route fork bar click events through the same `onBarSelect` handler in GanttChart. Do not attach direct click handlers to fork bars in GanttSwimlane that emit to the parent without going through GanttChart.

**Phase to address:** Phase 1. Identify the event routing before writing fork bar click handling.

---

### Pitfall 7: Performance Degradation with 1000+ Fork Messages

**What goes wrong:** A session with 1042 forks means 1000+ `is_fork_branch = 1` messages. The timeline route currently runs one `messageStmt.all(session_id)` per session to get timestamps. Adding fork timestamp fetching means a second query per session. For a day with 20+ sessions, each potentially having hundreds of fork messages, the server makes 40+ queries where it currently makes 20.

**Why it happens:** The query-per-session pattern is fine for the current feature set. It has not been load tested with fork data returned.

**Consequences:** Noticeable API latency on days with many fork-heavy sessions.

**Prevention:** Batch the fork timestamp query across all sessions for a given day instead of one per session:

```sql
SELECT session_id, timestamp FROM messages
WHERE session_id IN (?, ?, ...) AND is_fork_branch = 1
ORDER BY session_id, timestamp
```

Then group in JavaScript. Do not loop per session.

**Detection:** Run the timeline API for a date with fork-heavy sessions and measure response time.

**Phase to address:** Phase 2 (backend query optimization). Profile before optimizing — the issue may not materialize at typical session counts.

---

### Pitfall 8: GanttBar Minimum Width of 0.03% Hides Short Forks

**What goes wrong:** GanttBar enforces a minimum width of `Math.max(widthPct, 0.03)` (line 80 in GanttBar.vue). This ensures bars remain visible. Fork branches that lasted only a few minutes on a 24-hour axis will be rendered as this minimum width, which can cause them to appear to overlap the main bar at different positions than their actual time.

**Why it happens:** The minimum width is a UX affordance for very short sessions. It creates positional misrepresentation for anything under ~26 minutes (0.03% of 24 hours = ~26 seconds, so this is not usually a problem — but on 4x zoom, 0.03% still maps to the same physical pixels, so this is fine). Actually at 4x zoom, the effective minimum is still 0.03% of the canvas. No issue.

**Correction:** This pitfall is lower risk than initial analysis suggested. The minimum bar width of 0.03% is ~26 seconds of the day, which is negligible for fork spans. Not a meaningful concern unless forks are under 1 minute.

**Prevention:** No action needed unless fork bars use a different minimum width constant.

---

## Minor Pitfalls

Mistakes that cause visual bugs but are easily fixed.

---

### Pitfall 9: `continuesFromPrevDay` / `continuesIntoNextDay` Applied to Fork Bars Incorrectly

**What goes wrong:** GanttBar renders arrow indicators when `session.continuesFromPrevDay` or `session.continuesIntoNextDay` is true. These flags are computed in `timeline.js` for the whole session. Fork branch time spans are sub-spans of the session, so they cannot continue across day boundaries unless the session itself does. However, if fork bar objects are constructed with a naive copy of these flags from the parent session, they may show day-continuation arrows erroneously.

**Prevention:** Do not copy session-level flags to fork bar objects. Fork bars are always contained within the session's clamped time span (already clipped to day boundaries in `timeline.js`). Fork bars never get day-continuation indicators.

**Phase to address:** Phase 1. Explicitly document that fork bar objects do not inherit session-level flags.

---

### Pitfall 10: Z-Index Conflict Between Fork Bars and Selection Ring

**What goes wrong:** Selected GanttBars use `z-index: 2` (`.gantt-bar.selected { z-index: 2 }`). Fork bars rendered as siblings within the same absolutely-positioned parent will fight for z-index with unselected bars (`z-index` unset, defaults to auto/0). Fork bars beneath the main bar (lower y position) are fine, but if a fork bar overlaps a neighboring session's bar (possible with overlapping sessions), visual order may be surprising.

**Prevention:** Assign fork bars `z-index: 1` explicitly so they sit above the background but below selected bars. Do not leave z-index unset on fork bars.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Backend: fork time span query | Fork identity not derivable from `is_fork_branch` alone | Decide between schema migration (fork_id column) vs single-span MVP |
| Backend: working time calculation | Fork messages inflate working time | Decide include/exclude policy before query is written |
| Frontend: layout | Duplicated sub-row algorithm causes label misalignment | Extract to shared utility before rendering fork bars |
| Frontend: event handling | Drag-pan guard bypassed by fork bar click events | Route all fork clicks through GanttChart's `onBarSelect` |
| Frontend: height/click targets | 14px fork bars uncallable at 1x zoom | Choose display-only vs interactive and set height accordingly |
| Performance | Per-session fork query doubles DB round-trips | Batch fork queries across all sessions for the day |

---

## Sources

- Direct source reading: `src/client/components/GanttSwimlane.vue`, `GanttChart.vue`, `GanttBar.vue`
- Direct source reading: `src/server/routes/timeline.js`
- Direct source reading: `src/importer/fork-detector.js`, `src/importer/db-writer.js`
- Direct source reading: `src/db/schema.js`
- Confidence: HIGH — all pitfalls derived from actual source code, not training data or general patterns
