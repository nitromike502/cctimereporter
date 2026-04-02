---
phase: quick
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/timeline.js
autonomous: true

must_haves:
  truths:
    - "Fork segments with zero working time are not displayed on the Gantt chart"
    - "Fork segments from overnight sessions are clipped to in-day message boundaries, not midnight"
  artifacts:
    - path: "src/services/timeline.js"
      provides: "computeForkSegments with working time filter and message-based day clamping"
  key_links:
    - from: "src/services/timeline.js computeForkSegments"
      to: "GanttSwimlane.vue fork rendering"
      via: "forkSegments array in API response"
      pattern: "forkSegments"
---

<objective>
Fix two fork display bugs in the timeline Gantt chart:

1. Empty fork sessions visible — fork sub-bars appear with ~4 messages but 0 minutes working time because the filter only checks `message_count >= 2` with no working time threshold.
2. Fork session bleeding into next day — overnight fork segments clamp to day boundary (23:59:59) instead of the last in-day message timestamp, causing the fork bar to stretch to midnight. Main sessions already use message-based clamping (lines 212-214 of timeline.js) but forks use raw day boundary clamping.

Purpose: Clean up the fork visualization so only meaningful fork activity is shown, and overnight forks are visually consistent with how main sessions handle day boundaries.
Output: Updated `computeForkSegments` function in `src/services/timeline.js`.
</objective>

<execution_context>
@/home/meckert/.claude/get-shit-done/workflows/execute-plan.md
@/home/meckert/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/services/timeline.js
@src/utils/timeline-utils.js
@src/client/components/GanttSwimlane.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix computeForkSegments filtering and clamping</name>
  <files>src/services/timeline.js</files>
  <action>
Modify the `computeForkSegments` function (lines 36-59) with two changes:

**Bug 1 — Filter empty forks by working time:**
After computing `workingTimeMs` on line 47, filter out fork segments where `workingTimeMs === 0`. The current `.filter()` on line 38 only checks `message_count >= 2` which lets through forks that have messages but zero actual working time (all gaps exceed idle threshold). Move the working time check to a post-map filter, or restructure so that the map+filter produces only segments with `workingTimeMs > 0`.

Approach: Change from `.filter().map()` to `.map().filter()` (or `.flatMap()`):
1. Keep the existing day-overlap check (`end_time >= dayStartUTC && start_time < dayEndUTC`)
2. Keep the `message_count >= 2` check
3. Compute the segment as currently done
4. ADD: filter out results where `workingTimeMs === 0`

**Bug 2 — Use message-based clamping instead of day boundary:**
Currently lines 40-41 clamp start/end to `dayStartUTC`/`dayEndUTC` (midnight boundaries). Main sessions (lines 212-214) instead use the first/last in-day message timestamp for overnight sessions. Apply the same approach to forks:

Replace:
```js
const clampedStart = row.start_time < dayStartUTC ? dayStartUTC : row.start_time;
const clampedEnd = row.end_time > dayEndUTC ? dayEndUTC : row.end_time;
```

With logic that uses `dayTs` (the day-filtered timestamps computed on line 46) to determine the visual extent:
```js
const clampedStart = row.start_time < dayStartUTC ? (dayTs[0] ?? dayStartUTC) : row.start_time;
const clampedEnd = row.end_time > dayEndUTC ? (dayTs.at(-1) ?? dayEndUTC) : row.end_time;
```

This mirrors the main session logic at lines 212-214. The fork bar will end at its last in-day message instead of stretching to midnight.

NOTE: The `dayTs` computation (line 46) must happen BEFORE the clamped start/end computation (currently it does, so ordering is fine). The `elapsedTimeMs` computation on line 48 uses `clampedEnd - clampedStart`, so it will automatically reflect the tighter bounds.

Also filter out segments where `dayTs.length === 0` (no messages on this day after filtering) — this handles edge cases where fork_branch has messages outside the day window.
  </action>
  <verify>
1. `npm run build` completes without errors
2. Start the app with `npm start` and navigate to a date with fork sessions — verify:
   - No fork sub-bars with "0m" or zero working time visible
   - Overnight fork segments end at their last message, not at midnight
3. Review the API response at `/api/timeline?date=YYYY-MM-DD` for a date with forks — confirm `forkSegments` arrays contain no entries with `workingTimeMs: 0`, and `endTime` values for overnight forks are before midnight
  </verify>
  <done>
Fork segments with zero working time are excluded from the API response. Overnight fork segments use message-based clamping (first/last in-day fork message) instead of day boundary clamping. The fork bar visual extent matches how main session bars handle overnight clipping.
  </done>
</task>

</tasks>

<verification>
- `npm run build` succeeds
- API response for `/api/timeline` shows no fork segments with `workingTimeMs: 0`
- Overnight fork segments have `endTime` matching last in-day message, not `T23:59:59.999Z`
</verification>

<success_criteria>
1. Zero-working-time fork segments are filtered out of the timeline API response
2. Overnight fork segments are visually clipped to their last in-day message timestamp, consistent with main session clamping behavior
3. No regressions — existing fork segments with real working time still display correctly
</success_criteria>

<output>
After completion, create `.planning/quick/003-fix-fork-display-bugs/003-SUMMARY.md`
</output>
