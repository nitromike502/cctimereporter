# Architecture Patterns: Token Usage Integration

**Domain:** Adding token usage tracking to an existing Node.js/Vue 3/SQLite CLI app
**Researched:** 2026-04-06
**Based on:** Direct codebase inspection (HIGH confidence — read actual source files)

---

## Existing Architecture Summary

The app follows a clean layered pattern:

```
JSONL files → importer/ → SQLite DB → services/ → routes/ + CLI + MCP → Vue frontend
```

Each layer has a single responsibility and a clear handoff point. Services are the primary integration seam: routes, CLI commands, and MCP tools all call the same service functions, so adding capabilities to a service propagates everywhere.

### Key Structural Facts (verified by source inspection)

**Parser** (`src/importer/parser.js`): Already attaches `rawMessage: msg` to each parsed message. The usage object lives at `msg.rawMessage.message.usage` for assistant messages. It is present in memory during import but is never extracted or stored.

**DB writer** (`src/importer/db-writer.js`): `insertMessages()` currently inserts 12 columns. Adding token columns means updating the INSERT statement and the `ON CONFLICT DO UPDATE SET` clause — a mechanical change following the established pattern.

**Schema migration** (`src/db/index.js`): Auto-migrates v1→v9 via a chained if-else ladder. Each new version adds one `else if (existingVersion === N)` branch and one `MIGRATION_VN_TO_VN+1` constant in `schema.js`.

**Service pattern** (`src/services/timeline.js`, `src/services/sessions.js`): Factory functions (`createXService(db)`) return closures with prepared statements created once at factory time and reused across calls. A new service file follows this identical pattern.

**Route pattern** (`src/server/routes/timeline.js`): Thin HTTP wrappers — validate input, call service, return result. No business logic in routes.

**MCP tools** (`src/mcp/tools/query.js`): Call the same services as routes. A new MCP tool for token data follows `registerQueryTools()` pattern exactly, calling `createTokensService(db)` the same way existing tools call `createTimelineService(db)`.

**Vue router** (`src/client/router/index.js`): Three routes currently. Adding `/tokens` requires one import and one route object.

---

## Recommended Architecture for Token Integration

### 1. Schema Migration: v9 → v10

**Decision: Add four INTEGER columns to the `messages` table. No separate table.**

Token data is 1:1 with assistant messages. A separate table would require a JOIN for every token query and adds schema complexity with no benefit at this scale. Storing on `messages` keeps the "import raw data" philosophy — raw values land in the same row as the message they describe.

Session-level token aggregates (totals per session, totals per day) must NOT be computed at import time and stored on the sessions table. The existing `tool_use_count` column on sessions is explicitly acknowledged in the codebase memory as dead data — "computed at import, never queried by server or displayed in frontend." Token aggregates stored on sessions would repeat this mistake. Keep aggregates in the service layer as SQL `SUM()` queries.

The four columns to add:

```sql
-- MIGRATION_V9_TO_V10
ALTER TABLE messages ADD COLUMN input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN output_tokens INTEGER;
ALTER TABLE messages ADD COLUMN cache_creation_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN cache_read_input_tokens INTEGER;
```

All four default to NULL. Only assistant messages with a `usage` block will have non-NULL values. User messages, system messages, and tool_result messages remain NULL — no special handling needed. The migration is additive and safe on existing databases.

**The `cache_creation` subobject** (contains `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`) should not be stored as structured columns in the first pass. It is rarely needed for day-to-day reporting. If needed later, a JSON TEXT column for the raw subobject can be added in a future migration without blocking the initial feature.

**Migration wiring:**

- Add `MIGRATION_V9_TO_V10` export to `src/db/schema.js`
- Bump `SCHEMA_VERSION` from 9 to 10
- Add `migrateV9toV10()` function in `src/db/index.js`
- Add `else if (existingVersion === 9)` branch calling `migrateV9toV10(db)` before setting `PRAGMA user_version = 10`
- Extend all older migration paths (v1 through v8) to also call `migrateV9toV10(db)` — follows the established chained ladder

---

### 2. Parser Changes: Extract Usage at Import Time

**Location:** `src/importer/index.js` — `importFile()` function, specifically the `messagesForDb` mapping (line 361 in current source).

The `rawMessage` reference is already present on each parsed message. No changes are needed in `src/importer/parser.js`. The extraction is additive to the existing mapping:

```js
// Inside the messagesForDb.map() — extract usage from assistant messages
const usage = msg.rawMessage?.message?.usage ?? null;
// Add to the mapped object:
input_tokens:                  usage?.input_tokens                 ?? null,
output_tokens:                 usage?.output_tokens                ?? null,
cache_creation_input_tokens:   usage?.cache_creation_input_tokens  ?? null,
cache_read_input_tokens:       usage?.cache_read_input_tokens      ?? null,
```

**Agent files** (the `agentMessages` mapping around line 579): Agent sidechain messages can also have usage data. Apply identical extraction. Currently agent messages set `content: null` explicitly — apply the same null-for-non-assistant pattern for token columns.

**`insertMessages()` in `src/importer/db-writer.js`**: Add the four columns to the INSERT column list, VALUES list, and ON CONFLICT DO UPDATE SET clause. This is a mechanical copy of how `content` was added in the v7→v8 migration — same structure, four more rows.

---

### 3. New Service: Token Query Service

**Location:** `src/services/tokens.js` (new file)

**Decision: New dedicated service, not an extension of `timeline.js` or `sessions.js`.**

Token queries aggregate differently than timeline queries. Timeline groups by project/ticket and computes working time from message timestamps. Token queries aggregate sums by date, project, or session — different groupings, different SQL, different projection shapes. Adding them to `timeline.js` would bloat a file that is already large (389 lines) for a distinct concern.

Service factory pattern is unchanged from existing services:

```js
export function createTokensService(db) {
  // Prepared statements at factory time (where possible)
  // Return { getDaySummary, getSessionTokens, getDateRangeTotals }
}
```

**Core SQL queries the service needs:**

Daily totals across all sessions on a date:
```sql
SELECT
  SUM(m.input_tokens)                AS total_input,
  SUM(m.output_tokens)               AS total_output,
  SUM(m.cache_creation_input_tokens) AS total_cache_write,
  SUM(m.cache_read_input_tokens)     AS total_cache_read
FROM messages m
WHERE m.timestamp >= ? AND m.timestamp < ?
  AND m.type = 'assistant'
  AND m.input_tokens IS NOT NULL;
```

Per-session breakdown for a date (for the detail table):
```sql
SELECT
  m.session_id,
  SUM(m.input_tokens)                AS input_tokens,
  SUM(m.output_tokens)               AS output_tokens,
  SUM(m.cache_creation_input_tokens) AS cache_write_tokens,
  SUM(m.cache_read_input_tokens)     AS cache_read_tokens,
  p.project_path
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
JOIN projects p ON s.project_id = p.id
WHERE m.timestamp >= ? AND m.timestamp < ?
  AND m.type = 'assistant'
GROUP BY m.session_id
ORDER BY (input_tokens + output_tokens) DESC;
```

Multi-date range for trend charts:
```sql
SELECT
  DATE(m.timestamp) AS date,
  SUM(m.input_tokens)                AS total_input,
  SUM(m.output_tokens)               AS total_output,
  SUM(m.cache_creation_input_tokens) AS total_cache_write,
  SUM(m.cache_read_input_tokens)     AS total_cache_read
FROM messages m
WHERE m.timestamp >= ? AND m.timestamp < ?
  AND m.type = 'assistant'
  AND m.input_tokens IS NOT NULL
GROUP BY DATE(m.timestamp)
ORDER BY date ASC;
```

Single-session token total (for session detail enrichment):
```sql
SELECT
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(cache_creation_input_tokens) AS cache_write_tokens,
  SUM(cache_read_input_tokens) AS cache_read_tokens
FROM messages
WHERE session_id = ?
  AND type = 'assistant';
```

---

### 4. New API Route: GET /api/tokens

**Location:** `src/server/routes/tokens.js` (new file)

Pattern is identical to `src/server/routes/timeline.js` — thin wrapper, delegates to the tokens service.

**Endpoints:**

```
GET /api/tokens?date=YYYY-MM-DD
```
Returns single-day token summary with per-session breakdown.

```
GET /api/tokens?from=YYYY-MM-DD&to=YYYY-MM-DD
```
Returns multi-day totals array for the trend chart.

**Response shape for date query:**

```json
{
  "date": "2026-04-06",
  "totals": {
    "inputTokens": 125000,
    "outputTokens": 18000,
    "cacheWriteTokens": 95000,
    "cacheReadTokens": 210000
  },
  "bySessions": [
    {
      "sessionId": "...",
      "projectPath": "...",
      "inputTokens": 5000,
      "outputTokens": 800,
      "cacheWriteTokens": 3000,
      "cacheReadTokens": 12000
    }
  ]
}
```

**Registration:** `src/server/index.js` registers routes by importing and calling each route plugin. Add the `tokensRoute` import and registration alongside `timelineRoute` — one import, one `fastify.register()` call.

---

### 5. New Vue Page: /tokens Route

**Router change** (`src/client/router/index.js`): One new import, one new route object:
```js
{ path: '/tokens', component: TokensPage }
```

**New page:** `src/client/pages/TokensPage.vue`

**New components** in `src/client/components/`:

| Component | Responsibility | Notes |
|-----------|---------------|-------|
| `TokenSummaryCard.vue` | Display a single token category total (label + large number) | Stateless display; 4 instances for input/output/cache-write/cache-read |
| `TokenBreakdownTable.vue` | Per-session token table for the selected date | Shows project, session, and per-category counts |
| `TokenTrendChart.vue` | Multi-day bar chart showing token usage over N days | SVG-based; no external chart library |

**No new external dependencies.** The existing design token system in `tokens.css` provides all CSS custom properties needed. Charts can be implemented as SVG templates — at the scale of one chart showing 7-30 data points, a charting library adds bundle weight without proportional value. A 30-line SVG `<rect>` bar chart is sufficient and consistent with the app's zero-extra-dependency posture.

**Page structure:**

```
TokensPage.vue
  TimelineToolbar.vue (reuse — date navigation already implemented)
  <div class="token-summary-cards">
    TokenSummaryCard.vue  (input)
    TokenSummaryCard.vue  (output)
    TokenSummaryCard.vue  (cache write)
    TokenSummaryCard.vue  (cache read)
  </div>
  TokenTrendChart.vue  (N-day trend, fetches from /api/tokens?from=&to=)
  TokenBreakdownTable.vue  (per-session detail, fetches from /api/tokens?date=)
```

The toolbar reuse is important: date navigation, date-picker, and keyboard shortcuts are already implemented in `TimelineToolbar.vue`. The tokens page needs the same date selection behavior. Use the existing `@navigate` event and `selectedDate` state pattern from `TimelinePage.vue`.

---

### 6. Extending Existing Outputs

**Session Detail Panel** (`src/client/components/SessionDetailPanel.vue`):

The panel shows session metadata when a Gantt bar is clicked. Token totals per session can be added as a secondary stat section below the existing working time display. Options:

Option A: Tokens service query embedded in the timeline route response — include per-session token totals in the existing `/api/timeline` payload. Avoids a second API call from the panel.

Option B: Panel fetches `/api/tokens?session=ID` on demand when a session is selected — clean separation, no payload bloat, slight latency for the detail view.

Recommendation: Option B. The timeline response is already moderately large (sessions array for each project on the selected date). Adding token fields there bloats every timeline load, even for users browsing the Gantt without caring about tokens. Fetch on-demand when the detail panel opens.

**Day Summary CLI/MCP** (`src/cli/commands/summary.js`, `src/mcp/tools/query.js`):

The existing `get_day_summary` MCP tool and `summary` CLI command return ticket-grouped working time. Token totals can be added as an optional top-level field:

```json
{
  "date": "2026-04-06",
  "workingTimeMs": 14400000,
  "tokenTotals": {
    "inputTokens": 125000,
    "outputTokens": 18000,
    "cacheWriteTokens": 95000,
    "cacheReadTokens": 210000
  },
  "byTicket": [...]
}
```

This is additive — existing consumers see a new field and can ignore it. The tokens service is called alongside the timeline service in the CLI/MCP handler and the result is merged into the response object.

**New MCP tool** in `src/mcp/tools/query.js`: Add `get_token_summary` to `registerQueryTools()`. Follows the identical pattern to existing tools — call `createTokensService(db)`, return JSON string. This is the primary surface for AI assistants querying token cost data.

---

## Component Interaction Map

```
MODIFIED FILES
─────────────
src/db/schema.js
  + SCHEMA_VERSION: 10
  + MIGRATION_V9_TO_V10 (4 ALTER TABLE statements)

src/db/index.js
  + migrateV9toV10() function
  + else-if branch for version 9
  + migrateV9toV10() call added to all older migration paths

src/importer/db-writer.js
  + 4 token columns in INSERT column list
  + 4 token columns in VALUES list
  + 4 token columns in ON CONFLICT DO UPDATE SET

src/importer/index.js
  + usage extraction in messagesForDb mapping (4 lines)
  + usage extraction in agentMessages mapping (4 lines)

src/server/index.js
  + import tokensRoute
  + fastify.register(tokensRoute, { db })

src/mcp/tools/query.js
  + get_token_summary tool registration

src/client/router/index.js
  + import TokensPage
  + { path: '/tokens', component: TokensPage }

NEW FILES
─────────
src/services/tokens.js
  createTokensService(db)
  → getDaySummary(date) → { totals, bySessions }
  → getSessionTokens(sessionId) → { inputTokens, ... }
  → getDateRangeTotals(from, to) → [{ date, totals }, ...]

src/server/routes/tokens.js
  GET /api/tokens?date=YYYY-MM-DD
  GET /api/tokens?from=YYYY-MM-DD&to=YYYY-MM-DD

src/client/pages/TokensPage.vue
src/client/components/TokenSummaryCard.vue
src/client/components/TokenBreakdownTable.vue
src/client/components/TokenTrendChart.vue
```

---

## Build Order (Dependency Graph)

Build in this sequence to avoid blocked dependencies and allow early validation at each layer.

**Phase 1 — Data foundation**

1. Schema migration v9→v10 (`schema.js` + `db/index.js`)
2. DB writer update in `db-writer.js` (add 4 token columns)
3. Usage extraction in `importer/index.js`
4. Trigger re-import, verify via SQL: `SELECT SUM(input_tokens) FROM messages WHERE type='assistant'`

This phase has no UI and no service. If something is wrong, it is visible immediately via SQL query without needing to run any service or frontend code. Self-contained and verifiable in isolation.

**Phase 2 — Service and API**

5. `src/services/tokens.js` — token query service
6. `src/server/routes/tokens.js` — HTTP endpoint
7. Register in `src/server/index.js`
8. Verify via curl: `curl "localhost:3847/api/tokens?date=2026-04-06"`

Phase 2 depends on Phase 1 data being present. It does not depend on any frontend work.

**Phase 3 — CLI and MCP extension**

9. Add `get_token_summary` MCP tool in `src/mcp/tools/query.js`
10. Extend `summary` CLI output in `src/cli/commands/summary.js`

Phase 3 is additive to existing CLI/MCP outputs. It will not break existing consumers.

**Phase 4 — Vue frontend**

11. `TokenSummaryCard.vue` — stateless display component, no API calls
12. `TokenBreakdownTable.vue` — stateless display component, no API calls
13. `TokenTrendChart.vue` — SVG chart component, accepts data as props
14. `TokensPage.vue` — wires components, makes API calls, handles loading/error state
15. Router update in `src/client/router/index.js`

Phase 4 depends on Phase 2 for API data. Components 11-13 can be built and previewed on `/components` before the page exists.

Each phase is independently releasable. Phase 1+2 is a complete backend feature. Phase 3 extends the AI interface. Phase 4 adds the visual interface. A milestone could ship Phase 1+2 first and follow with Phase 3+4.

---

## Anti-Patterns to Avoid

**Do not add token aggregate columns to the sessions table.** The existing `tool_use_count` is already acknowledged dead data. Token aggregates stored at import time would repeat this mistake and require re-import to update when counting logic changes. Keep aggregates as `SUM()` queries in the service layer.

**Do not bloat the timeline API response with token data.** The timeline response serves Gantt chart rendering. Adding token fields there inflates every timeline load for all users, including those who never open the tokens page. Token data has its own endpoint.

**Do not add a charting library.** The app distributes via `npx` and bundle size matters. A simple SVG bar chart (20-40 lines of template code) is sufficient for showing N-day token trends. If a library becomes necessary later, it can be added in a follow-on milestone.

**Do not store the `cache_creation` ephemeral breakdown as structured columns yet.** The `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` split is not useful for day-to-day reporting. Store the four top-level integers. If the breakdown is ever needed, add a JSON TEXT column in a future migration.

**Do not fetch token data eagerly in the session detail panel.** Fetch on demand when a session bar is clicked, not as part of the timeline load. The detail panel is only open for one session at a time; eager fetching for all sessions would be wasteful.

---

## Scalability Notes

Token data grows linearly with messages. At current app scale (local SQLite, single user), all `SUM()` queries across the messages table are fast without additional indexes. One partial index may help the date-range trend query if session counts grow large:

```sql
CREATE INDEX IF NOT EXISTS idx_messages_tokens
  ON messages(timestamp, type)
  WHERE input_tokens IS NOT NULL;
```

This is optional and can be added to the migration DDL as a safeguard or deferred until performance is observed to be an issue.

---

## Confidence Assessment

| Area | Confidence | Source |
|------|------------|--------|
| Schema migration pattern | HIGH | Read `src/db/schema.js` and `src/db/index.js` directly |
| `rawMessage` structure | HIGH | Read `src/importer/parser.js` directly — `rawMessage: msg` confirmed present |
| DB writer INSERT pattern | HIGH | Read `src/importer/db-writer.js` directly |
| Service factory pattern | HIGH | Read `src/services/timeline.js` and `sessions.js` directly |
| Route thin-wrapper pattern | HIGH | Read `src/server/routes/timeline.js` directly |
| MCP tool registration | HIGH | Read `src/mcp/tools/query.js` directly |
| Vue router structure | HIGH | Read `src/client/router/index.js` directly |
| Usage object field names | HIGH | Provided in project context, consistent with Claude API docs |
| Chart implementation (SVG) | MEDIUM | No charting library investigated — SVG recommendation is judgment call; will need prototyping |
