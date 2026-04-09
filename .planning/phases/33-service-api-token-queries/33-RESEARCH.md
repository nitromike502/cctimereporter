# Phase 33: Service, API, and Token Queries - Research

**Researched:** 2026-04-07
**Domain:** SQLite aggregation queries, Fastify route registration, Vue 3 component updates, number formatting
**Confidence:** HIGH

## Summary

Phase 33 builds on the data foundation from Phase 32 (schema v10, token columns on `messages`). The token service, API route, and UI updates follow patterns already established in this codebase — no new libraries needed. The key technical work is writing correct SQL aggregation queries that respect the sidechain/fork-branch exclusion rules, computing cache hit rate, and threading token data into two existing Vue components.

The biggest design decision is the **contradiction between CONTEXT.md and the roadmap success criteria**: CONTEXT.md says "show only grand total (single number)" for the session detail panel, while the roadmap success criteria (DISP-01, DISP-02) and the phase note say "shows input/output/cache token breakdown" and "cache hit rate percentage". The roadmap success criteria are authoritative per the phase context. The plan must implement the full breakdown (input/output/cache + cache hit rate) in the session detail panel, plus grand total in day summary.

The session detail panel currently has 9 fields in a 3×3 grid. Displaying the token breakdown there without a redesign is architecturally tricky — the grid is fixed. The plan should add tokens inline to the existing "Working Time" or "Messages" row, or expand the grid to 4×3 by adding a row, rather than requiring a full component redesign.

**Primary recommendation:** Implement `createTokensService(db)` following the `createTimelineService(db)` factory pattern, register `GET /api/tokens?date=YYYY-MM-DD` with identical route registration as `timelineRoute`, and update `SessionDetailPanel` and `DaySummary` in Vue with a second parallel API call from `TimelinePage`.

## Standard Stack

No new packages required. This phase uses only existing project infrastructure.

### Core
| Component | Location | Purpose |
|-----------|----------|---------|
| `node:sqlite` DatabaseSync | built-in | Prepared statement aggregation queries |
| `src/services/` pattern | project | Factory function service pattern |
| `src/server/routes/` pattern | project | Fastify plugin pattern with `opts.db` |
| Vue 3 `ref`, `computed`, `fetch` | project | Reactive data in TimelinePage.vue |

**Installation:** `npm install` — no new packages.

## Architecture Patterns

### Recommended Project Structure

New files for this phase:

```
src/
├── services/
│   └── tokens.js            # NEW: createTokensService(db)
└── server/
    └── routes/
        └── tokens.js        # NEW: tokensRoute(fastify, opts)
```

Modified files:

```
src/server/index.js          # Register tokensRoute
src/client/pages/TimelinePage.vue     # Fetch /api/tokens, pass data down
src/client/components/SessionDetailPanel.vue  # Show token breakdown
src/client/components/DaySummary.vue          # Show day total tokens
```

### Pattern 1: Service Factory (createTokensService)

Follow the exact factory pattern from `createTimelineService` and `createSessionsService`:

```javascript
// Source: src/services/timeline.js (established pattern)
export function createTokensService(db) {
  // Prepare statements at factory time (not per-call)
  const dayTotalStmt = db.prepare(`...`);
  const perSessionStmt = db.prepare(`...`);

  function getDayTokens(date) { /* ... */ }
  function getSessionTokens(sessionId) { /* ... */ }

  return { getDayTokens, getSessionTokens };
}
```

**Key invariant:** Prepare statements in the factory closure, not inside the query functions. This is the established performance pattern — statements are reused across calls without re-parsing.

### Pattern 2: Fastify Route Plugin

Follow the thin-wrapper pattern from `src/server/routes/timeline.js`:

```javascript
// Source: src/server/routes/timeline.js (established pattern)
export async function tokensRoute(fastify, opts) {
  const { db } = opts;
  const svc = createTokensService(db);

  fastify.get('/api/tokens', async (request, reply) => {
    const date = request.query.date ?? getTodayString();
    if (!DATE_RE.test(date)) {
      reply.code(400);
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }
    return svc.getDayTokens(date);
  });
}
```

Register in `src/server/index.js` by adding one line alongside existing route registrations:

```javascript
import { tokensRoute } from './routes/tokens.js';
// ...
app.register(tokensRoute, { db });
```

### Pattern 3: SQL Aggregation with Sidechain/Fork Exclusion

The core SQL logic for token aggregation. Based on Phase 32 decisions and Phase 33 context:

**Per-session day query (returns one row per session for a given date):**

```sql
-- Sessions overlapping the day, per-session token totals
-- Exclude: is_sidechain=1 (parent session totals shouldn't double-count subagent API calls)
-- Exclude: is_fork_branch=1 (for "actual spend" totals — fork branches re-use tokens)
-- Null-safe: sessions with no token data get NULL aggregates (purged transcripts)
SELECT
  m.session_id,
  SUM(m.input_tokens)                   AS input_tokens,
  SUM(m.output_tokens)                  AS output_tokens,
  SUM(m.cache_creation_input_tokens)    AS cache_creation_input_tokens,
  SUM(m.cache_read_input_tokens)        AS cache_read_input_tokens,
  SUM(COALESCE(m.input_tokens, 0) +
      COALESCE(m.output_tokens, 0) +
      COALESCE(m.cache_creation_input_tokens, 0) +
      COALESCE(m.cache_read_input_tokens, 0))
                                        AS total_tokens
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
WHERE m.type = 'assistant'
  AND m.is_sidechain = 0
  AND m.is_fork_branch = 0
  AND m.timestamp >= ?  -- dayStartUTC
  AND m.timestamp <  ?  -- dayEndUTC
GROUP BY m.session_id
```

**Day total query (single row summary):**

```sql
SELECT
  SUM(m.input_tokens)                   AS input_tokens,
  SUM(m.output_tokens)                  AS output_tokens,
  SUM(m.cache_creation_input_tokens)    AS cache_creation_input_tokens,
  SUM(m.cache_read_input_tokens)        AS cache_read_input_tokens,
  SUM(COALESCE(m.input_tokens, 0) +
      COALESCE(m.output_tokens, 0) +
      COALESCE(m.cache_creation_input_tokens, 0) +
      COALESCE(m.cache_read_input_tokens, 0))
                                        AS total_tokens
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
WHERE m.type = 'assistant'
  AND m.is_sidechain = 0
  AND m.is_fork_branch = 0
  AND m.timestamp >= ?  -- dayStartUTC
  AND m.timestamp <  ?  -- dayEndUTC
```

**Single-session detail query:**

```sql
-- Same exclusion rules applied to a single session_id
SELECT
  SUM(m.input_tokens)                   AS input_tokens,
  SUM(m.output_tokens)                  AS output_tokens,
  SUM(m.cache_creation_input_tokens)    AS cache_creation_input_tokens,
  SUM(m.cache_read_input_tokens)        AS cache_read_input_tokens,
  SUM(COALESCE(m.input_tokens, 0) +
      COALESCE(m.output_tokens, 0) +
      COALESCE(m.cache_creation_input_tokens, 0) +
      COALESCE(m.cache_read_input_tokens, 0))
                                        AS total_tokens
FROM messages m
WHERE m.session_id = ?
  AND m.type = 'assistant'
  AND m.is_sidechain = 0
  AND m.is_fork_branch = 0
```

**Note on CONTEXT.md decision "include sidechain and fork-branch tokens in displayed totals":** This is contradicted by `STATE.md` which says "Sidechain exclusion (is_sidechain=0) as default for all token aggregates" and "Fork branch exclusion (is_fork_branch=0) for 'actual spend' totals". The roadmap success criteria say "Sidechain messages (is_sidechain=1) are excluded from parent session totals". Follow the roadmap: **exclude sidechain AND fork-branch messages**.

### Pattern 4: Cache Hit Rate Computation

Compute in the service layer, not in SQL:

```javascript
function computeCacheHitRate(cacheRead, input) {
  // cache_read / (cache_read + input) × 100
  const denominator = (cacheRead ?? 0) + (input ?? 0);
  if (denominator === 0) return null; // no data → null, not NaN
  return Math.round(((cacheRead ?? 0) / denominator) * 100 * 10) / 10; // one decimal
}
```

Returns `null` when there's no token data (denominator zero), which the UI maps to "—".

### Pattern 5: API Response Shape

For `GET /api/tokens?date=YYYY-MM-DD`:

```javascript
// Response shape
{
  date: "2026-04-07",
  dayTotal: {
    inputTokens: 45000,            // null if no sessions with token data
    outputTokens: 12000,
    cacheCreationInputTokens: 8000,
    cacheReadInputTokens: 25000,
    totalTokens: 90000,
    cacheHitRate: 35.7             // percent, one decimal, null if no data
  },
  sessions: [
    {
      sessionId: "abc123...",
      inputTokens: 1500,
      outputTokens: 400,
      cacheCreationInputTokens: 800,
      cacheReadInputTokens: 2500,
      totalTokens: 5200,
      cacheHitRate: 62.5           // null if no token data for this session
    },
    // ...
  ]
}
```

**Key field naming:** Use camelCase in JSON responses to match existing API conventions (see `/api/timeline` response: `workingTimeMs`, `sessionId`, `projectId`).

### Pattern 6: Token Number Formatting

Since this is Claude's discretion, the recommendation is:

- **1.2M format** for values ≥ 1,000,000 (e.g., "1.2M tokens")
- **12.3K format** for values ≥ 1,000 and < 1,000,000 (e.g., "12.3K tokens")
- **Plain number** for values < 1,000 (e.g., "847 tokens")
- **"—"** (em dash) for null/zero (sessions with purged transcripts)

Implement as a `formatTokenCount(n)` pure function in the Vue component or shared utils:

```javascript
function formatTokenCount(n) {
  if (n == null || n === 0) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}
```

### Pattern 7: Vue Data Flow for Token Data

**Approach:** Fetch tokens separately from timeline, keyed by `sessionId`. This avoids modifying the existing `/api/timeline` response shape and keeps concerns separated.

In `TimelinePage.vue`:

```javascript
const tokenData = ref(null) // { dayTotal, sessions: Map<sessionId, tokenFields> }

async function fetchTokens() {
  const res = await fetch(`/api/tokens?date=${selectedDate.value}`)
  if (!res.ok) return // fail silently — tokens are supplementary
  const data = await res.json()
  // Build a Map for O(1) lookup by sessionId
  const sessionMap = new Map(data.sessions.map(s => [s.sessionId, s]))
  tokenData.value = { dayTotal: data.dayTotal, sessions: sessionMap }
}

// Call fetchTokens alongside fetchTimeline
onMounted(() => { fetchTimeline(); fetchTokens() })
watch(() => route.query.date, () => { fetchTimeline(); fetchTokens() })
```

Pass `tokenData` to components:
- `SessionDetailPanel` gets the per-session token object via a computed `selectedSessionTokens`
- `DaySummary` gets `dayTotal` directly

### Pattern 8: SessionDetailPanel Token Display

The current 9-field 3×3 grid must absorb token fields. Options:

**Option A (recommended):** Add a 4th row (expand grid to 3×4 = 12 cells). Put the token row below the timing row:
- Row 4, Col 1: "Tokens: [total] (input/cache/output)"  
- Row 4, Col 2: "Cache Hit: 62.5%"  
- Row 4, Col 3: (empty or future use)

Change `grid-template-rows: repeat(3, auto)` to `repeat(4, auto)` in scoped CSS.

**Option B:** Compress the token breakdown into the "Messages" row as a sub-label. Less readable.

**Option A is recommended** — clean, extensible, minimal CSS change.

The grid column auto-flow is set to `column`, meaning items fill column-by-column. A new row of 3 items at the end of the grid must be placed correctly. Verify with the existing 9-field layout before adding more.

### Anti-Patterns to Avoid

- **Modifying /api/timeline to add token data:** Keep concerns separated. Token data in a separate endpoint prevents bloating the primary timeline response and avoids coupling the service layers.
- **Computing cache hit rate in SQL:** Requires division with NULL guard. Simpler and more testable in JS.
- **Using SUM without NULL handling for total_tokens:** `SUM(a + b)` returns NULL if any term is NULL. Use `COALESCE(col, 0)` inside the SUM for the total_tokens derived field.
- **Fetching tokens inside SessionDetailPanel:** Token data should flow from TimelinePage as props, not be fetched by the child component. Follows the existing prop-down pattern.
- **Blocking timeline render on token fetch:** Token fetch should be independent — if it fails or is slow, the main timeline still works. Use a separate `ref` and fail silently.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Number formatting | Custom regex/sprintf | Simple JS arithmetic with `.toFixed()` | Sufficient; no i18n needed here |
| Route registration | Custom HTTP handler | Fastify plugin via `app.register()` | Established pattern in all 5 existing routes |
| DB connection management | New connection | Pass `db` via `opts` in route factory | Fastify plugin opts pattern already used everywhere |

**Key insight:** Everything in this phase is wiring existing infrastructure — service factory, route plugin, Vue props. No genuinely new technical patterns needed.

## Common Pitfalls

### Pitfall 1: SUM of NULLs Returns NULL, Not Zero

**What goes wrong:** `SUM(input_tokens + output_tokens)` returns NULL for a session where all messages have NULL token columns (e.g., purged transcripts with no re-import).

**Why it happens:** SQLite SUM propagates NULL through arithmetic. `1 + NULL = NULL`, so `SUM(...)` returns NULL if any row has NULL values.

**How to avoid:** Use `COALESCE(col, 0)` inside the SUM for the `total_tokens` computed field. For the individual breakdown columns (`input_tokens`, etc.), return NULL as-is — it means "no data", which the UI renders as "—". Only the `total_tokens` sum needs COALESCE.

**Warning signs:** `total_tokens` is NULL for sessions that have some (but not all) messages with token data.

### Pitfall 2: Day Boundary in UTC vs. Local

**What goes wrong:** Token queries filter by timestamp but the day boundaries need to match how the timeline service computes them — using UTC representation of the local day start/end.

**Why it happens:** Timestamps in the DB are ISO 8601 UTC strings. The timeline service converts the local date to UTC before filtering. Token queries must use the same conversion.

**How to avoid:** Use exactly the same boundary computation as `timeline.js`:
```javascript
const dayStartUTC = new Date(date + 'T00:00:00').toISOString();
const dayEndUTC   = new Date(date + 'T23:59:59.999').toISOString();
```

**Warning signs:** Token totals don't match expected values for dates near midnight local time.

### Pitfall 3: Missing is_sidechain / is_fork_branch Filters

**What goes wrong:** Token totals for sessions with subagents are inflated — subagent messages are counted in the parent session's total.

**Why it happens:** The `messages` table stores subagent messages with `is_sidechain=1`. Without filtering, aggregation counts all messages in the session.

**How to avoid:** Always include `AND m.is_sidechain = 0 AND m.is_fork_branch = 0` in token queries. This is the "actual spend" definition per STATE.md.

**Warning signs:** A session that ran a subagent shows dramatically higher token count than expected. Can verify with: `SELECT COUNT(*) FROM messages WHERE session_id = ? AND is_sidechain = 1`.

### Pitfall 4: Sessions Without Token Data Show Zero Instead of "—"

**What goes wrong:** Sessions with purged transcripts (no re-import, all token columns NULL) display "0 tokens" instead of "—".

**Why it happens:** The Vue component checks `tokenData?.totalTokens` and that returns `null`, but a `|| 0` fallback converts it to zero.

**How to avoid:** Use explicit null check in `formatTokenCount`: `if (n == null) return '—'`. Don't use falsy coercion since 0 tokens is a valid (if unusual) value.

**Warning signs:** Sessions with no messages show "0 tokens" instead of "—".

### Pitfall 5: Cache Hit Rate Formula Denominator

**What goes wrong:** Cache hit rate is 100% when `cache_read_input_tokens` is non-zero but `input_tokens` is NULL.

**Why it happens:** The formula `cache_read / (cache_read + input)` treats NULL input as 0 in JavaScript. If input_tokens is NULL (no uncached tokens at all), the denominator equals cache_read, giving 100%.

**How to avoid:** Use null-coalescing for both operands:
```javascript
const num = cacheRead ?? 0;
const denom = (cacheRead ?? 0) + (input ?? 0);
```

A session that only has cache hits (all input served from cache, no new input tokens) should legitimately show 100% — this is correct. The guard should be `if (denom === 0) return null` (no data at all).

### Pitfall 6: Grid Layout Breaking When Adding Tokens Row

**What goes wrong:** The 4th row of tokens in `SessionDetailPanel` renders in the wrong column order due to `grid-auto-flow: column`.

**Why it happens:** The grid uses `grid-auto-flow: column`, filling column by column. With 3 columns and 4 rows, 12 cells are laid out as column 1 (rows 1-4), column 2 (rows 1-4), column 3 (rows 1-4). A 10th item goes to column 1 row 4, 11th to column 2 row 4, 12th to column 3 row 4 — this is correct. Just ensure `grid-template-rows` is updated to `repeat(4, auto)` (currently `repeat(3, auto)`).

**Warning signs:** The new token row wraps incorrectly or shows up before the timing row.

## Code Examples

### Token Service Factory Skeleton

```javascript
// Source: established pattern from src/services/sessions.js and timeline.js
import { DEFAULT_IDLE_THRESHOLD_MIN } from './timeline.js';

export function createTokensService(db) {
  // Prepare UTC boundary helper (same as timeline.js)
  function dayBoundaries(date) {
    return {
      dayStartUTC: new Date(date + 'T00:00:00').toISOString(),
      dayEndUTC:   new Date(date + 'T23:59:59.999').toISOString(),
    };
  }

  const dayTotalStmt = db.prepare(`
    SELECT
      SUM(m.input_tokens)                                          AS input_tokens,
      SUM(m.output_tokens)                                         AS output_tokens,
      SUM(m.cache_creation_input_tokens)                           AS cache_creation_input_tokens,
      SUM(m.cache_read_input_tokens)                               AS cache_read_input_tokens,
      SUM(COALESCE(m.input_tokens, 0)
        + COALESCE(m.output_tokens, 0)
        + COALESCE(m.cache_creation_input_tokens, 0)
        + COALESCE(m.cache_read_input_tokens, 0))                  AS total_tokens
    FROM messages m
    WHERE m.type = 'assistant'
      AND m.is_sidechain = 0
      AND m.is_fork_branch = 0
      AND m.timestamp >= ?
      AND m.timestamp <  ?
  `);

  const perSessionStmt = db.prepare(`
    SELECT
      m.session_id,
      SUM(m.input_tokens)                                          AS input_tokens,
      SUM(m.output_tokens)                                         AS output_tokens,
      SUM(m.cache_creation_input_tokens)                           AS cache_creation_input_tokens,
      SUM(m.cache_read_input_tokens)                               AS cache_read_input_tokens,
      SUM(COALESCE(m.input_tokens, 0)
        + COALESCE(m.output_tokens, 0)
        + COALESCE(m.cache_creation_input_tokens, 0)
        + COALESCE(m.cache_read_input_tokens, 0))                  AS total_tokens
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    WHERE m.type = 'assistant'
      AND m.is_sidechain = 0
      AND m.is_fork_branch = 0
      AND m.timestamp >= ?
      AND m.timestamp <  ?
    GROUP BY m.session_id
  `);

  const singleSessionStmt = db.prepare(`
    SELECT
      SUM(m.input_tokens)                                          AS input_tokens,
      SUM(m.output_tokens)                                         AS output_tokens,
      SUM(m.cache_creation_input_tokens)                           AS cache_creation_input_tokens,
      SUM(m.cache_read_input_tokens)                               AS cache_read_input_tokens,
      SUM(COALESCE(m.input_tokens, 0)
        + COALESCE(m.output_tokens, 0)
        + COALESCE(m.cache_creation_input_tokens, 0)
        + COALESCE(m.cache_read_input_tokens, 0))                  AS total_tokens
    FROM messages m
    WHERE m.session_id = ?
      AND m.type = 'assistant'
      AND m.is_sidechain = 0
      AND m.is_fork_branch = 0
  `);

  function computeCacheHitRate(cacheRead, input) {
    const denom = (cacheRead ?? 0) + (input ?? 0);
    if (denom === 0) return null;
    return Math.round(((cacheRead ?? 0) / denom) * 1000) / 10; // one decimal
  }

  function enrichRow(row) {
    return {
      inputTokens:               row.input_tokens,
      outputTokens:              row.output_tokens,
      cacheCreationInputTokens:  row.cache_creation_input_tokens,
      cacheReadInputTokens:      row.cache_read_input_tokens,
      totalTokens:               row.total_tokens,
      cacheHitRate:              computeCacheHitRate(row.cache_read_input_tokens, row.input_tokens),
    };
  }

  function getDayTokens(date) {
    const { dayStartUTC, dayEndUTC } = dayBoundaries(date);

    const dayRow = dayTotalStmt.get(dayStartUTC, dayEndUTC);
    const sessionRows = perSessionStmt.all(dayStartUTC, dayEndUTC);

    return {
      date,
      dayTotal: enrichRow(dayRow),
      sessions: sessionRows.map(r => ({
        sessionId: r.session_id,
        ...enrichRow(r),
      })),
    };
  }

  function getSessionTokens(sessionId) {
    const row = singleSessionStmt.get(sessionId);
    if (!row) return null;
    return { sessionId, ...enrichRow(row) };
  }

  return { getDayTokens, getSessionTokens };
}
```

### Token Formatting (Vue)

```javascript
// Source: Claude's Discretion per CONTEXT.md
function formatTokenCount(n) {
  if (n == null || n === 0) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}

function formatCacheHitRate(rate) {
  if (rate == null) return '—'
  return rate.toFixed(1) + '%'
}
```

### DaySummary: Tokens in Summary Line

Current template renders: `Total working time: <strong>5h 23m</strong>`

Updated template: `Total working time: <strong>5h 23m</strong> | <strong>1.2M</strong> tokens`

This matches the CONTEXT.md decision: "Alongside working time — next to the existing working time display (e.g. '5h 23m | 1.2M tokens')".

Add `dayTokens` prop to DaySummary:

```javascript
// In DaySummary.vue props:
defineProps({
  projects: { type: Array, required: true },
  dayTokens: { type: Object, default: null }, // { totalTokens, cacheHitRate, ... }
})
```

### Route Registration in server/index.js

```javascript
// Add import:
import { tokensRoute } from './routes/tokens.js';

// Add registration alongside existing routes:
app.register(tokensRoute, { db });
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| No token data in DB | Token columns on `messages` (Phase 32) | Can now aggregate at query time |
| Token totals undefined | SQL SUM with sidechain exclusion | Accurate per-session and day totals |
| "—" in session detail for token field | Input/output/cache breakdown + cache hit rate | DISP-01, DISP-02 satisfied |
| No day total | "5h 23m | 1.2M tokens" in DaySummary | DISP-03 satisfied |

## Open Questions

1. **CONTEXT.md vs. Roadmap contradiction on token breakdown**
   - What we know: CONTEXT.md says "show only grand total" in session detail panel; roadmap success criteria and DISP-01/DISP-02 say "input/output/cache token breakdown" and "cache hit rate"
   - What's unclear: Which is authoritative? The phase context note says "roadmap success criteria are authoritative"
   - Recommendation: Implement full breakdown (input/output/cache + cache hit rate) in session detail panel. This satisfies DISP-01 and DISP-02.

2. **CONTEXT.md vs. STATE.md contradiction on sidechain inclusion**
   - What we know: CONTEXT.md says "include sidechain and fork-branch tokens"; STATE.md says "sidechain exclusion (is_sidechain=0) as default"; roadmap success criteria say "sidechain messages are excluded"
   - Recommendation: Follow roadmap: exclude sidechain AND fork-branch messages from all aggregates. This is confirmed by roadmap success criterion #3.

3. **Session detail panel: token data for fork selections**
   - What we know: The session detail panel can show either a session or a fork. The roadmap doesn't specify whether forks show token data.
   - What's unclear: Should a selected fork show fork-specific token data, or the parent session total?
   - Recommendation: Show parent session total when a fork is selected (same behavior as working time, which uses `props.fork?.workingTimeMs` or falls back to session). Fork-specific token queries would require additional complexity not implied by the requirements.

4. **Whether GET /api/tokens needs date parameter only or also session-id**
   - What we know: The roadmap success criterion says `curl "localhost:3847/api/tokens?date=YYYY-MM-DD"` returns per-session data. Session detail uses the per-session data from the same call (keyed by sessionId client-side).
   - Recommendation: Single endpoint with `?date=YYYY-MM-DD`. The service returns both day total and per-session breakdown. No separate `/api/tokens/:sessionId` endpoint needed — client looks up by sessionId in the sessions array.

## Sources

### Primary (HIGH confidence)
- `src/services/timeline.js` — Factory pattern, UTC boundary computation, prepared statement placement
- `src/services/sessions.js` — Factory pattern for simpler service
- `src/server/routes/timeline.js` — Fastify plugin pattern, date validation, opts.db
- `src/server/index.js` — Route registration pattern
- `src/db/schema.js` — SCHEMA_VERSION=10, token column names, is_sidechain, is_fork_branch flags
- `src/importer/db-writer.js` — Confirmed token columns: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, ephemeral_5m_input_tokens, ephemeral_1h_input_tokens, model
- `src/client/components/SessionDetailPanel.vue` — 3×3 grid layout, props interface, style scoping
- `src/client/components/DaySummary.vue` — summary-total template, props interface
- `src/client/pages/TimelinePage.vue` — Data fetching pattern, component wiring, prop-down pattern
- `.planning/phases/32-data-foundation/32-01-SUMMARY.md` — Phase 32 completion confirmed, 3,398 assistant messages populated

### Secondary (MEDIUM confidence)
- `.planning/phases/33-service-api-token-queries/33-CONTEXT.md` — User decisions (locked choices noted above)
- Phase 33 roadmap context (provided in phase context) — Authoritative on success criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing project infrastructure verified by direct code inspection
- Architecture: HIGH — all patterns verified against working implementations in the codebase
- SQL queries: HIGH — column names verified against schema.js and db-writer.js; sidechain/fork exclusion logic from CONTEXT.md + STATE.md + roadmap
- Pitfalls: HIGH — derived from direct code inspection of grid layout, Vue data flow, and SQLite NULL behavior
- Token formatting: HIGH — simple JS, Claude's Discretion, no external validation needed

**Research date:** 2026-04-07
**Valid until:** 60 days — this phase uses only stable internal patterns and built-in SQLite
