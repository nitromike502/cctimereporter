# Phase 36: Tokens Chart Message Drill-Down - Research

**Researched:** 2026-04-10
**Domain:** Chart.js 4 click events + Vue 3 state + Fastify timestamp-range API + UX drill-down patterns
**Confidence:** HIGH

## Summary

This phase adds click-to-drill-down on the Per Message (timeline) line chart in TokensPage.vue. When a user clicks a point on the line chart, the app shows the assistant messages from the clicked time bucket. The phase requires three coordinated pieces: (1) extracting bucket identity from a Chart.js click event, (2) filtering the already-available tokenMessages array by timestamp range, and (3) displaying those messages in the existing SessionMessagesModal with minimal adaptation.

The key architectural discovery: the tokenMessages array (from `/api/tokens`) already has timestamps for every assistant message in the session. When a bucket is clicked, activeElements[0].index gives the bucket's position in the bucketStarts array. The bucket's timestamp range is [bucketStart, bucketStart + bucketMinutes) minutes-of-day. Messages can be filtered client-side using the existing `localMinuteOfDay()` helper — no new backend endpoint is required if displaying messages from the tokenMessages data. However, showing actual message content requires a backend query (the tokenMessages payload does not carry content text, only token counts and timestamps). The existing `/api/sessions/:id/messages` endpoint does not support timestamp-range filtering. A new endpoint or query parameter is needed.

The UX pattern research confirms: showing filtered messages in the existing modal is the right choice. A "bucket detail" view (showing only messages from the clicked 5-min interval) in the same SessionMessagesModal is preferable to a new inline panel — it reuses battle-tested modal infrastructure and avoids layout complexity. The modal title should be updated to indicate the time range context.

**Primary recommendation:** Extend the existing messages API with `?fromTimestamp=&toTimestamp=` query params. In the frontend, on bucket click: resolve session + bucket timestamps, open SessionMessagesModal passing the time range. Minimize code changes by reusing all existing modal rendering logic.

## Standard Stack

No new libraries needed. All work uses existing stack.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chart.js | 4.5.1 | Chart rendering + click events | Already integrated |
| vue-chartjs | 5.3.3 | Vue wrapper for Chart.js | Already integrated |
| vue 3 | current | Reactive state, computed | Project standard |
| fastify | current | HTTP server + route handler | Project standard |
| node:sqlite | built-in | SQL timestamp range query | Already in use |

### No New Dependencies
This phase adds zero new npm dependencies. All capability is in the existing stack.

**Installation:**
```bash
# No new packages
```

## Architecture Patterns

### Key Data Flow

```
User clicks line chart point
  → Chart.js onClick(event, activeElements, chart)
  → activeElements[0].datasetIndex  → which session (via datasets[].sessionIndex)
  → activeElements[0].index         → which bucket in the bucketStarts array
  → bucketStarts[index]             → minutes-of-day for bucket start
  → bucketStart + bucketMinutes     → minutes-of-day for bucket end
  → Convert minute-of-day back to UTC timestamps for the selected date
  → Open SessionMessagesModal with (sessionId, fromTimestamp, toTimestamp)
  → New API: GET /api/sessions/:id/messages?from=ISO&to=ISO
  → Return content-bearing messages in that time window
```

### Recommended Project Structure

```
src/
├── server/routes/messages.js          # Add from/to query params to existing route
├── services/sessions.js               # Add getMessagesByTimeRange() or extend getMessages()
└── client/
    ├── pages/TokensPage.vue           # Extend timelineChartOptions onClick + modal state
    └── components/
        └── SessionMessagesModal.vue   # Accept optional fromTimestamp/toTimestamp props
```

### Pattern 1: Chart.js Bucket Click Resolution

**What:** Translate Chart.js activeElements into a session + bucket timestamp range.

**When to use:** In the `onClick` handler of `timelineChartOptions` in TokensPage.vue.

**Example:**
```javascript
// Source: https://www.chartjs.org/docs/latest/configuration/interactions.html
// activeElements[0].index = position in labels array = bucket index

onClick: (_event, activeElements) => {
  if (!activeElements.length) return

  const bucketIndex = activeElements[0].index           // x-axis bucket position
  const ds = timelineChartData.value.datasets[activeElements[0].datasetIndex]
  if (ds?.sessionIndex == null) return

  const session = visibleSessions.value[ds.sessionIndex]
  if (!session) return

  // Resolve bucket's minute-of-day from bucketStarts array
  // bucketStarts is returned by bucketMessages() but currently discarded
  // Must expose it from timelineChartData computed (or recompute here)
  const bucketStartMinute = currentBucketStarts.value[bucketIndex]
  const bucketEndMinute = bucketStartMinute + bucketMinutes.value

  // Convert minute-of-day to ISO timestamp for the selected date
  const from = minuteOfDayToTimestamp(selectedDate.value, bucketStartMinute)
  const to   = minuteOfDayToTimestamp(selectedDate.value, bucketEndMinute)

  // Open modal with time-range filter
  selectedSession.value = session
  bucketModalSessionId.value = session.sessionId
  bucketModalFrom.value = from
  bucketModalTo.value = to
  messagesModalOpen.value = true
}
```

### Pattern 2: Expose bucketStarts from timelineChartData

**What:** The `bucketMessages()` function returns `{ labels, bucketStarts, bucketMap }` but `timelineChartData` computed currently discards `bucketStarts`. Must expose it as a reactive ref or separate computed.

**When to use:** Required — the onClick handler needs bucketStarts to map bucket index to time.

**Example:**
```javascript
// In TokensPage.vue — either expose bucketStarts as a ref updated in a watch,
// or store it in a computed that the onClick handler closes over.

// Option A: Store alongside chartData (preferred — single source of truth)
const timelineBucketState = computed(() => {
  const sessions = visibleSessions.value
  return bucketMessages(sessions, bucketMinutes.value)
})

const timelineChartData = computed(() => {
  const { labels, bucketMap } = timelineBucketState.value
  // ... rest of dataset building
})

// onClick closes over timelineBucketState.value.bucketStarts
```

### Pattern 3: Minute-of-Day to ISO Timestamp Conversion

**What:** Convert a "minute of day" value (0–1439) back to an ISO timestamp for a given YYYY-MM-DD date string.

**When to use:** In the onClick handler when building API query params.

**Example:**
```javascript
// localMinuteOfDay() is already defined in TokensPage.vue (the inverse operation)
// The inverse:
function minuteOfDayToLocalISO(dateStr, minuteOfDay) {
  // dateStr is 'YYYY-MM-DD'; minuteOfDay is 0-1439 local time
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0)
  return d.toISOString()
}
```

Note: This creates a local-time date and converts to UTC via toISOString(), which correctly inverts the `localMinuteOfDay()` function that uses `d.getHours()` and `d.getMinutes()`.

### Pattern 4: Backend Timestamp-Range Message Query

**What:** Extend `/api/sessions/:id/messages` to accept `?from=ISO&to=ISO` query params that filter messages to a time window.

**When to use:** New API surface for bucket drill-down.

**Example:**
```javascript
// In src/services/sessions.js — add prepared statement
const timeRangeStmt = db.prepare(`
  SELECT uuid, type, content, timestamp, is_fork_branch, fork_branch_id
  FROM messages
  WHERE session_id = ?
    AND content IS NOT NULL
    AND timestamp >= ?
    AND timestamp <  ?
    AND (fork_branch_id IS NULL OR fork_branch_id = '')
  ORDER BY timestamp ASC
`);

// In getMessages(), extend options:
function getMessages(sessionId, { forkBranchId, from, to } = {}) {
  // ... existing branch logic
  if (from && to) {
    rows = timeRangeStmt.all(sessionId, from, to)
    // Return without head/tail truncation — bucket is already small
    const msgs = rows.map(mapRow)
    return { messages: msgs, totalCount: msgs.length, skipped: 0, isBucketView: true }
  }
  // ... existing logic
}
```

### Pattern 5: SessionMessagesModal Time-Range Support

**What:** Add optional `fromTimestamp`/`toTimestamp` props to SessionMessagesModal. When provided, pass them as query params to the messages API. Update the modal title to show the time range context.

**When to use:** When drill-down is triggered from a bucket click.

**Example:**
```javascript
// In SessionMessagesModal.vue — add props:
const props = defineProps({
  open: { type: Boolean, default: false },
  sessionId: { type: String, default: '' },
  forkBranchId: { type: String, default: '' },
  fromTimestamp: { type: String, default: '' },  // new
  toTimestamp: { type: String, default: '' },    // new
})

// In fetch logic:
let url = `/api/sessions/${encodeURIComponent(id)}/messages`
const params = new URLSearchParams()
if (props.forkBranchId) params.set('forkBranchId', props.forkBranchId)
if (props.fromTimestamp) params.set('from', props.fromTimestamp)
if (props.toTimestamp) params.set('to', props.toTimestamp)
if (params.toString()) url += '?' + params.toString()

// Modal title shows "Bucket Messages — 9:05 AM – 9:10 AM"
```

### Anti-Patterns to Avoid

- **Filtering tokenMessages client-side for content display:** The tokenMessages array contains timestamps and token counts only — no `content` field. Client-side filtering would give counts but no message text. A backend query is required to show actual message content.
- **Building a new inline panel below the chart:** Adds layout complexity, requires CSS, duplicates message rendering logic. The existing SessionMessagesModal is already tested and handles all edge cases. Reuse it.
- **Adding uuid to the tokenMessages payload:** The tokenMessages array is a lightweight aggregate. Adding content or uuid here would bloat the `/api/tokens` response for no benefit when the modal approach works.
- **Using 'nearest' interaction mode for bucket click:** The chart already uses the default interaction mode. activeElements from the built-in onClick callback already contains the correct index. No need for `getElementsAtEventForMode()`.
- **Re-running bucketMessages() inside onClick:** The bucket computation is expensive (iterates all messages). Expose bucketStarts from a computed so it's reactive and cached. Don't recompute on each click.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message rendering + expand/collapse | Custom message list | SessionMessagesModal.vue | Already handles fork context, overflow detection, and all edge cases |
| Timestamp-range SQL | Date math in JavaScript | SQLite `timestamp >= ? AND timestamp < ?` with ISO string comparison | SQLite ISO string comparison is lexicographic and correct for UTC ISO-8601 |
| Bucket-to-time mapping | New time utility | Extend `minuteOfDayToTimestamp()` using same logic as existing `localMinuteOfDay()` inverse | Consistency with existing bucketing logic |

**Key insight:** The existing SessionMessagesModal handles nearly everything. Adding two optional props (fromTimestamp, toTimestamp) and a title override is all the frontend change the modal needs.

## Common Pitfalls

### Pitfall 1: bucketStarts Not Exposed to onClick

**What goes wrong:** The onClick handler in timelineChartOptions cannot see the bucketStarts array because it's computed inside `timelineChartData` but not stored on the component.

**Why it happens:** `bucketMessages()` returns `{ labels, bucketStarts, bucketMap }` but only `labels` and `bucketMap` are currently used. `bucketStarts` is discarded.

**How to avoid:** Refactor to store the full `bucketMessages()` result in a computed (e.g., `timelineBucketState`) that both `timelineChartData` and the onClick handler reference.

**Warning signs:** `bucketStarts is not defined` error in onClick, or bucket index lookup always returning undefined.

### Pitfall 2: Local Time vs UTC Confusion in Timestamp Conversion

**What goes wrong:** The bucket is computed in local time (localMinuteOfDay uses `d.getHours()`), but the database stores UTC ISO-8601. Converting bucket boundaries incorrectly can cause messages to be missed or wrong messages shown.

**Why it happens:** `new Date('2026-04-10T00:00:00')` (no Z suffix) is parsed as local time in browsers, making the inverse conversion match. But `new Date('2026-04-10T00:00:00Z')` is UTC. The `selectedDate` value ('YYYY-MM-DD') must be parsed as local time for the inverse to work.

**How to avoid:** Use `new Date(year, month-1, day, hours, minutes)` (local time constructor, no UTC) when converting minute-of-day back to a timestamp. Then call `.toISOString()` to get UTC for the query. This correctly inverts `localMinuteOfDay()`.

**Warning signs:** Clicking a 9:05 AM bucket returns messages timestamped at 1:05 AM or 2:05 PM.

### Pitfall 3: Zero-Token Buckets Have null Data Points

**What goes wrong:** Datasets have `null` data for buckets outside a session's active range. Clicking on a null point may still fire onClick with activeElements — or may return an empty activeElements array.

**Why it happens:** Chart.js behavior when clicking on null/gap points varies. With `spanGaps: false`, clicking in the gap between two null points typically returns empty activeElements. But clicking on a point rendered as `0` returns elements.

**How to avoid:** Check `activeElements.length > 0` before proceeding. Also check `data[bucketIndex] !== null` if possible, since a 0-token bucket might not have messages to show. Show an empty state if the API returns no messages.

**Warning signs:** Modal opens but shows "No messages found" when clicking idle buckets.

### Pitfall 4: Modal State Not Reset Between Bucket Clicks

**What goes wrong:** Clicking bucket A shows messages, then clicking bucket B shows bucket A's messages because the watch condition `[props.open, props.sessionId]` doesn't change when sessionId stays the same.

**Why it happens:** SessionMessagesModal's watch fires on `[props.open, props.sessionId, props.forkBranchId]`. Adding `fromTimestamp` and `toTimestamp` to the watch array ensures re-fetch when the bucket changes within the same session.

**How to avoid:** Add `props.fromTimestamp` and `props.toTimestamp` to the watch array in SessionMessagesModal. Or: close and re-open the modal (set open=false briefly) when switching buckets.

**Warning signs:** Same messages shown after clicking a different bucket on the same session line.

### Pitfall 5: API Returns All Messages (No Head/Tail Truncation) When Range is Small

**What goes wrong:** A 5-minute bucket might have 0–3 messages. Applying the same HEAD_COUNT/TAIL_COUNT truncation (10+10) to a 2-message result creates confusing UI (0 skipped, but divider logic still renders).

**Why it happens:** The existing `getMessages` truncation is designed for full sessions (potentially 100s of messages). For bucket views with 2–10 messages, truncation is unnecessary.

**How to avoid:** When `from`/`to` params are present, skip head/tail truncation and return all matching messages directly. Add `isBucketView: true` to the response so the modal can adjust its title/description.

## Code Examples

Verified patterns from official sources:

### Chart.js 4 onClick with activeElements (verified via official docs + masteringjs.io)
```javascript
// Source: https://www.chartjs.org/docs/latest/configuration/interactions.html
// Source: https://masteringjs.io/tutorials/chartjs/onclick-bar-chart

onClick: (event, activeElements, chart) => {
  if (!activeElements.length) return

  const { datasetIndex, index } = activeElements[0]
  // index = x-axis bucket position (matches chartData.labels[index])
  // datasetIndex = which dataset line (use to find session)

  const label = chart.data.labels[index]           // time label string e.g. "9:05 AM"
  const value = chart.data.datasets[datasetIndex].data[index]  // token count or null
}
```

### SQLite Timestamp Range Query (verified via existing codebase pattern)
```sql
-- Source: existing pattern in src/services/tokens.js (perMessageStmt)
SELECT uuid, type, content, timestamp
FROM messages
WHERE session_id = ?
  AND content IS NOT NULL
  AND timestamp >= ?    -- ISO-8601 string, lexicographic comparison works for UTC
  AND timestamp <  ?
  AND (fork_branch_id IS NULL OR fork_branch_id = '')
ORDER BY timestamp ASC
```

### vue-chartjs Options Passthrough (verified via existing codebase)
```javascript
// Source: existing TokenChart.vue + TokensPage.vue pattern
// onClick is passed through chartOptions prop — no special vue-chartjs API needed.
// The options object is forwarded directly to Chart.js as-is.

<TokenChart
  :chart-data="chartData"
  :chart-options="chartOptions"   // ← onClick lives here
  :chart-type="'line'"
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart.js v2 `_model` API for click data | `activeElements[0].index` and `.datasetIndex` | Chart.js v3 (2021) | Current code uses correct v3/v4 API already |
| Separate canvas event listener for clicks | Built-in `onClick` in options object | Chart.js v3+ | Current code uses built-in onClick — correct |

**Deprecated/outdated:**
- `chart.getElementsAtEvent(event)`: Removed in Chart.js 4. Use `getElementsAtEventForMode()` or built-in `onClick` callback — but built-in onClick is sufficient for this use case.
- `item[0]['_model'].label`: Chart.js v2 pattern. Current code already uses v4 activeElements correctly.

## Open Questions

1. **Should bucket drill-down replace or augment the existing session-selection click?**
   - What we know: Currently, clicking any point selects the session (updates SessionDetailPanel). The phase wants clicking to also open a bucket message view.
   - What's unclear: Should a click (a) select session AND open bucket modal, (b) open bucket modal only, or (c) first click selects session, second click on same point opens modal?
   - Recommendation: First click selects session (existing behavior), second click on the same dataset point opens the bucket modal. This matches the toggle-selection pattern already in the code (`selectedSession.value?.sessionId === session.sessionId ? null : session`). Alternatively, always open bucket modal on click and auto-select session simultaneously.

2. **Bar chart (Session Totals mode) drill-down scope**
   - What we know: The bar chart already has an onClick that selects sessions. The phase description says "clicking a point on the Tokens line chart."
   - What's unclear: Whether Session Totals bar chart should also get drill-down (clicking a bar opens all messages for that session).
   - Recommendation: Out of scope for this phase. Bar chart click → session selection already works. Add full-session modal trigger via the existing "view" link in SessionDetailPanel.

3. **Empty bucket behavior**
   - What we know: Some bucket indices have `null` data (before/after session range) or `0` (idle gaps within session).
   - What's unclear: Whether Chart.js fires onClick for null points in spanGaps: false mode.
   - Recommendation: Guard with `if (value === null || value === 0) return` in onClick. Test empirically.

## Sources

### Primary (HIGH confidence)
- Official Chart.js docs — https://www.chartjs.org/docs/latest/configuration/interactions.html — onClick signature, activeElements structure, interaction modes
- Official Chart.js API docs — https://www.chartjs.org/docs/latest/developers/api.html — getElementsAtEventForMode, data access pattern
- Existing codebase — TokensPage.vue lines 388-530 — bucketMessages(), timelineChartData, existing onClick pattern (activeElements[0].datasetIndex confirmed working)
- Existing codebase — src/services/sessions.js — getMessages() structure, prepared statement patterns
- Existing codebase — src/db/schema.js — messages table timestamp column type and format

### Secondary (MEDIUM confidence)
- masteringjs.io/tutorials/chartjs/onclick-bar-chart — verified activeElements[0].index = x-axis label index with working example
- vue-chartjs.org/api/ — confirmed onClick passes through options prop to Chart.js

### Tertiary (LOW confidence)
- WebSearch: drill-down UX pattern (detail panel vs modal) — multiple sources confirm modal preferred for focused task-based interactions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, existing codebase verified
- Architecture: HIGH — Chart.js click API confirmed via official docs and existing working code
- Pitfalls: HIGH — bucketStarts exposure and local/UTC conversion are code-verified concerns; modal watch and truncation are pattern-verified

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable libraries; Chart.js 4.x API unlikely to change)
