# Domain Pitfalls: Token Usage Tracking and Visualization

**Domain:** Adding token usage tracking and charting to an existing Node.js/Vue 3/SQLite session management tool  
**Researched:** 2026-04-06  
**Scope:** Specific to the cctimereporter codebase (v0.8.2), adding token data to an existing import pipeline, database, and UI

---

## Critical Pitfalls

Mistakes that cause data corruption, silent undercounting, or require painful rewrites.

---

### Pitfall 1: Existing Messages Have NULL Token Data Until Re-Imported — Silent Gap

**What goes wrong:** Adding `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` columns to the `messages` table via `ALTER TABLE` will successfully add the columns, but all existing rows will have `NULL` for every token field. The migration completes cleanly, the app starts normally, and token totals for historical sessions return 0 (or NULL). There is no error — just wrong data.

**Why it happens:** SQLite `ALTER TABLE ADD COLUMN` is extremely fast (it only modifies the schema, not the data) but cannot back-fill values into existing rows. The existing rows were imported before token extraction was added to the parser. The rolling-window import skip (size-based skip in `getImportedFileInfo`) will skip unchanged files on the next normal import run, leaving those rows permanently NULL.

**Consequences:**  
- Historical token charts show a "cliff" at the migration date — everything before the upgrade looks like zero tokens  
- Session-level token totals are incorrect for all pre-migration sessions  
- Users see misleading data without knowing why  
- The longer between the migration and user discovery, the more historical data is affected

**Warning signs:** Sessions imported before the version bump show `total_tokens = 0` or NULL. The migration date creates a visible discontinuity in any time-series chart.

**Prevention:**  
1. After the schema migration, force re-import of sessions within a meaningful window (e.g., the last 30 days, matching `maxAgeDays` default). The existing `force` option in `importAll()` supports this.  
2. Alternatively, delete import_log entries for the window you want to re-import — the next normal import will re-process those files.  
3. Document the re-import requirement in the migration comment in `schema.js` and in the CHANGELOG.  
4. Consider adding a `tokens_extracted` flag or using schema version to prompt a forced partial re-import on first startup after migration.

**Phase to address:** Schema migration phase (v9→v10). Must be handled before UI is built — otherwise dashboards launch with misleading zero-token history.

---

### Pitfall 2: Double-Counting Subagent Tokens

**What goes wrong:** The import pipeline merges tool-invoked subagent messages (from `<uuid>/subagents/agent-*.jsonl`) into their parent session with `is_sidechain = 1`. These merged messages have their own `usage` fields from the Anthropic API. If token totals are computed as `SUM(input_tokens) WHERE session_id = ?` without filtering, subagent tokens are counted alongside parent session tokens, inflating the total.

Additionally, the `agent_progress` events in the parent session (progress messages with `type: "progress"`) and the final tool result on the parent's `user` message include a `totalTokens` field in `toolUseResult`. If you extract this field AND also sum from the sidechain messages, you count the subagent twice.

**Why it happens:** Subagent messages appear in two places: (1) as merged `is_sidechain=1` messages in the parent session's message table, and (2) referenced as summary counts in the parent's tool result block. The pipeline was designed to merge messages for timeline display, not for token accounting.

**Consequences:**  
- Sessions with subagents report 2x–5x their actual token spend  
- Heavy subagent users (agent teams) see wildly inflated numbers  
- This is specifically called out in upstream Claude Code issues: `tool_uses` and `total_tokens` in nested subagents are known to be underreported/double-reported depending on where you look

**Warning signs:** Sessions with `has_subagents = 1` or `is_subagent = 0` but many sidechain messages show token totals disproportionate to their working time.

**Prevention:**  
- **Recommended approach:** Extract token data only from `assistant` messages in the main session where `is_sidechain = 0`. This counts only the parent model's actual API calls.  
- Do NOT add together `SUM(tokens) from messages` + `totalTokens from toolUseResult` — those overlap.  
- Subagent tokens in their own files (`is_subagent = 1` sessions) are correctly attributable to those sessions separately. Sum them separately if you want a "total including subagents" view, but label it clearly.  
- Add a `count_mode` concept: "direct" (parent only) vs "inclusive" (parent + subagents). Default to direct to avoid surprise inflation.

**Phase to address:** Token extraction schema and aggregation query phase. Must be defined before DB schema is finalized, because the filtering strategy determines which rows need token columns.

---

### Pitfall 3: Progress Messages and Non-API Messages Have No Usage Field

**What goes wrong:** Only `assistant` messages that represent actual API responses carry a `usage` object. The following message types do NOT have usage and must be explicitly excluded from any token extraction logic:

- `progress` messages (type: "progress") — real-time streaming updates, no API cost
- `system` messages — metadata events, hooks, errors  
- `file-history-snapshot` messages  
- `summary`, `custom-title`, `queue-operation` messages  
- `user` messages (tool results, human input)  
- `assistant` messages that are compact summaries (`isCompactSummary: true`)

If the parser does `msg.rawMessage?.message?.usage` and the field is absent, `null` or `undefined` is returned. If the writer does `?? 0`, these rows are stored as `0` rather than NULL, which pollutes aggregations.

**Why it happens:** The schema and the raw JSONL structure have different granularities. The JSONL has usage only where an API call occurred. Any code that doesn't check `msg.type === 'assistant'` before reading usage will silently get null/undefined.

**Consequences:**  
- Token column stored as `0` instead of NULL for non-assistant messages inflates `COUNT(*)` denominators if doing per-message averages  
- Harder to query "messages with token data" (must check `IS NOT NULL` vs `> 0`)  
- Progress forks already filtered from working time calculations may still appear in token queries if not explicitly filtered

**Warning signs:** `COUNT(*) WHERE input_tokens IS NOT NULL` returns more rows than `COUNT(*) WHERE type = 'assistant'`. Average tokens/message appears very low.

**Prevention:**  
- Only write token columns for `type = 'assistant'` messages. Leave NULL for everything else.  
- In the parser, add extraction guarded by `if (msg.type !== 'assistant') return null` — same pattern used by `extractMessageContent()` for content.  
- In queries, always filter: `WHERE type = 'assistant' AND input_tokens IS NOT NULL`.  
- Do not use `COALESCE(input_tokens, 0)` in aggregation queries — use `SUM(input_tokens)` which ignores NULLs correctly in SQL.

**Phase to address:** Parser token extraction phase. Establish the NULL-for-non-assistant convention before writing any DB rows.

---

### Pitfall 4: Fork Branch Messages Inflate Token Counts for Abandoned Branches

**What goes wrong:** When a real fork exists, the secondary (abandoned) branch messages are stored in the messages table with `is_fork_branch = 1` and a `fork_branch_id`. These messages have their own `usage` data from the API calls made during that abandoned conversation branch. If token totals aggregate all messages without filtering fork branches, you count tokens from conversations the user discarded.

**Why it happens:** The fork detection pipeline correctly marks secondary branches but doesn't exclude them from any aggregate — it was built for timeline display where forks are shown as visual segments. There's no prior case where per-message data needed to be summed across only the "winning" branch.

**Consequences:**  
- Sessions with real forks (editing history, `/clear` before forking) report token counts for work the user effectively discarded  
- Heavy fork users see inflated per-session totals  
- The effect is proportional to how long the abandoned branch was before the user reverted

**Warning signs:** Sessions with `real_fork_count > 0` show token totals that seem high relative to their working time.

**Prevention:**  
- For "actual spend" totals: filter `WHERE is_fork_branch = 0` when summing tokens. This counts only the main/winning branch.  
- For "total API spend including abandoned work" totals: sum all branches. Label this view clearly as "including discarded work."  
- Decide which view is the default at aggregation query design time — changing it later is a confusing UX shift for users who've built mental models around the numbers.  
- Store `is_fork_branch` in the token rows' context, or derive from the existing `messages.is_fork_branch` column (already populated).

**Phase to address:** Aggregation query design phase, before any UI numbers are shown.

---

## Moderate Pitfalls

Mistakes that cause delays, wrong UX decisions, or technical debt.

---

### Pitfall 5: Re-Import Invalidation Strategy Doesn't Force Re-Process Existing Files

**What goes wrong:** The current import pipeline skips files where `file_size` hasn't changed (the `cached?.fileSize === file.size` check in `importAll()`). After adding token columns, files that haven't changed in size won't be re-imported even though their DB rows lack token data. A normal `npm start` + import button click won't fix existing sessions.

**Why it happens:** The size-based skip is a performance optimization that assumes "same size = same content = no need to re-parse." This assumption holds for the data that existed before, but breaks when the extraction logic changes (new fields being pulled from previously-parsed content).

**Consequences:**  
- Users who click "Import" after upgrading see the progress bar complete, but historical token data remains NULL  
- No error is shown — the import genuinely succeeded, it just skipped all the old files  
- Users must discover and run `cctimereporter import --all` to force full re-import

**Warning signs:** After upgrading, only sessions from the last 2 days (the default import window) show token data.

**Prevention:**  
- On first startup after v10 migration, detect that token columns are new (check `user_version` transition) and either:  
  a. Delete import_log entries within the default `maxAgeDays` window so they're re-processed  
  b. Expose a one-time migration prompt in the UI: "Token data requires re-import. Re-import now?" with a button  
- Document in CHANGELOG that users should run `cctimereporter import --all` once after upgrading to v10 to populate historical token data.  
- Do NOT silently force a full `--all` import on upgrade — that could take several minutes for heavy users and block startup.

**Phase to address:** Schema migration and import pipeline phase.

---

### Pitfall 6: Chart Bundle Size Can Blow Up npx Cold Start Time

**What goes wrong:** Adding a full-featured charting library like Apache ECharts (~300KB gzipped) or Chart.js (~50KB gzipped minified) to the Vue bundle inflates the `dist/` assets served by Fastify. On `npx cctimereporter` cold starts, the browser must download this additional JS before the timeline page is interactive.

**Why it happens:** npx users don't have the app cached locally. The Vite build bundles the charting library into the client JS. If the charting library isn't tree-shakeable or is large, it becomes a permanent cold-start penalty.

**Consequences:**  
- ECharts at ~300KB adds ~1-2 seconds to first meaningful paint on average connections  
- Slows down the main timeline view if the chart library is loaded eagerly  
- Adds to npm package download size (published via `dist/` in `files` array)

**Warning signs:** `npm run build` output shows a chunk > 200KB. `npx cctimereporter` first load feels noticeably slower after adding charts.

**Prevention:**  
- **Prefer uPlot** (~50KB minified, ~15KB gzipped) for time series — purpose-built for time-ordered data, minimal bundle, no stacked series support but fine for line/area charts  
- Use Vite dynamic `import()` to lazy-load the chart component — it only loads when the user navigates to the token usage view, not the main timeline  
- If ECharts is chosen for its features, use the tree-shakeable `echarts/core` entry point (import only the chart types and components needed)  
- Alternatively, use Canvas 2D directly for simple bar charts — zero dependency cost for static monthly aggregates  
- Measure the built bundle size (`npm run build && du -sh dist/`) before and after adding the library

**Phase to address:** Charting library selection phase. Decide before writing any chart components.

---

### Pitfall 7: Charting Too Many Data Points Causes Rendering Lag

**What goes wrong:** A heavy user of Claude Code might have 500+ sessions over a month, each with dozens of assistant messages. Plotting per-message token data as individual points on a time-series chart creates thousands of DOM elements (SVG) or canvas draw calls, causing the chart to render slowly or freeze the browser tab on first load.

**Why it happens:** Developers test with their own data, which may be sparse. Production users with months of data and heavy agent use have far more data points than the developer expected.

**Consequences:**  
- Chart takes 2-5 seconds to render on first load  
- Scrolling or zooming in the chart causes jank  
- Browser memory spikes from large dataset held in chart state

**Warning signs:** Chart renders instantly in dev with 30 sessions, freezes with 300+ sessions.

**Prevention:**  
- Default to **session-level** or **daily aggregates** for the primary view, not per-message points. Aggregation happens in SQL before the chart receives data.  
- Only fetch per-message granularity on explicit drill-down (e.g., clicking a session bar).  
- uPlot handles 100k+ points efficiently via canvas; Chart.js SVG degrades much earlier.  
- Implement time-range filtering in the API: token charts should default to a 30-day window, not all-time.  
- Cap the number of sessions returned for the chart endpoint (e.g., max 90 days of daily aggregates = 90 data points, which is always fast).

**Phase to address:** API design and charting implementation phase.

---

### Pitfall 8: Aggregating Across Sessions Ignores the "Import Raw, Derive at Query Time" Philosophy

**What goes wrong:** Storing pre-aggregated token totals on the `sessions` table (e.g., `total_input_tokens`, `total_output_tokens` as session-level denormalized columns) creates a consistency problem: if re-import changes the per-message values (detection logic change, fork reclassification), the session-level totals are stale. The pipeline must remember to re-compute them during every upsert.

The project's stated philosophy is "import raw, derive at query time." Violating this for token data creates a two-source-of-truth problem.

**Why it happens:** Denormalizing totals to sessions seems like an obvious query optimization. It's tempting because `SUM(m.input_tokens) JOIN messages` is a more expensive query than `SELECT total_input_tokens FROM sessions`.

**Consequences:**  
- Session totals get out of sync after fork reclassification or import logic changes  
- The upsert in `db-writer.js` must be updated to include token total computation — easily forgotten  
- Future features (like filtering out fork branches) require retroactively invalidating all session-level totals

**Warning signs:** `SUM(messages.input_tokens) != sessions.total_input_tokens` for some sessions after a re-import.

**Prevention:**  
- Store token data **per message only** (in the `messages` table). Let the timeline service compute totals at query time with appropriate filters (`is_fork_branch = 0`, `is_sidechain = 0`, `type = 'assistant'`).  
- Use a SQLite partial index on `messages(session_id, input_tokens) WHERE type = 'assistant' AND is_fork_branch = 0 AND is_sidechain = 0` to keep the aggregation fast.  
- If performance becomes an issue for long date ranges, add an explicit daily pre-aggregation step — but make it a separate derived table that is clearly marked as a cache, not the source of truth.

**Phase to address:** Schema design phase. Decide storage strategy before writing the migration.

---

### Pitfall 9: `cache_creation` Nested Object Needs Explicit Extraction Path

**What goes wrong:** The usage object has a nested `cache_creation` field with sub-fields for different cache tier durations (`ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`). Accessing `msg.rawMessage?.message?.usage?.cache_creation` works for the nested structure, but the top-level `cache_creation_input_tokens` is a flat summary of all cache creation. Using both fields in aggregation double-counts cache creation tokens.

Additionally, the `service_tier` field on usage (`"standard"` vs potentially other values) affects pricing calculations. Ignoring service tier and applying a single pricing formula will produce incorrect cost estimates.

**Why it happens:** The usage object has redundant representations: `cache_creation_input_tokens` equals the sum of `cache_creation.ephemeral_5m_input_tokens + cache_creation.ephemeral_1h_input_tokens`. Developers who read only part of the schema may not notice the overlap.

**Consequences:**  
- Cost estimates are inflated 2x for cache creation if both `cache_creation_input_tokens` and the nested breakdown are summed  
- Different cache tiers have different prices — 5-minute cache is cheaper to write than 1-hour; mixing them produces inaccurate cost breakdowns

**Warning signs:** Computed cost per session is consistently ~1.5x–2x higher than Anthropic invoice totals.

**Prevention:**  
- Use `cache_creation_input_tokens` (the flat field) for total cache creation cost. Do not also sum the nested `cache_creation.*` fields.  
- If tier-level breakdown is needed for cost estimation, use only the nested fields and skip the flat summary.  
- Store all four flat fields: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`. Leave the nested breakdown as a future enhancement, not stored in v10.  
- Document the overlap explicitly in the extraction code comment.

**Phase to address:** Parser token extraction phase.

---

### Pitfall 10: Theme-Incompatible Chart Colors Break Dark Mode

**What goes wrong:** Charts hardcode colors (e.g., `color: '#3b82f6'`) rather than using the app's CSS custom property tokens from `tokens.css`. In dark mode (`[data-theme='dark']`), these hardcoded colors may be invisible (dark blue on dark background) or fail to meet contrast ratios.

**Why it happens:** Charting libraries have their own theming systems that don't know about CSS custom properties. Their examples show hardcoded hex values. Developers wire these up, test in light mode, and ship.

**Consequences:**  
- Charts are unreadable in dark mode  
- Inconsistent look — chart colors don't match button/highlight colors established by design tokens  
- Fixing retroactively requires rethreading color values through all chart option objects

**Warning signs:** The existing app has dark mode support via `[data-theme='dark']` in `tokens.css`. If chart components are added without reading this attribute, dark mode is broken for charts only.

**Prevention:**  
- Read `document.documentElement.getAttribute('data-theme')` at chart render time and switch color palettes accordingly  
- Use a computed Vue property or composable that returns the correct color set based on current theme  
- Prefer canvas-based libraries (uPlot, Chart.js) that accept programmatic color objects over SVG-based libraries that mix CSS and JS theming  
- Add dark mode chart rendering to the `ComponentsPage.vue` preview — it's the right place to catch this regression

**Phase to address:** Chart component implementation phase, before any chart is wired to real data.

---

## Minor Pitfalls

Mistakes that cause annoyance but are quickly fixed.

---

### Pitfall 11: `ALTER TABLE ADD COLUMN` Succeeds Silently on Already-Migrated DBs

**What goes wrong:** The existing migration runner in `db/index.js` wraps each DDL statement in a try/catch and ignores `duplicate column name` errors. This is correct and intentional for idempotency. But when adding token columns, a developer testing the migration might run it twice and see no error — leading them to think the columns weren't added when they were.

**Why it happens:** The silent error suppression is a known pattern in this codebase (`runMigration()` catches `duplicate column name`). It exists specifically to allow safe re-migration. But it can confuse developers who expect a "column already exists" confirmation.

**Consequences:** No data impact. Minor developer confusion only.

**Prevention:** After migration testing, verify column existence with `PRAGMA table_info(messages)` rather than inferring success from the absence of errors.

**Phase to address:** Schema migration development and testing phase.

---

### Pitfall 12: Token Columns Require `messagesForDb` Array Update in `importFile()`

**What goes wrong:** The `messagesForDb` mapping in `src/importer/index.js` (the array built before calling `insertMessages()`) explicitly maps fields from the parsed message to DB columns. Adding token columns to the schema does NOT automatically cause them to be written — the explicit field mapping must also be updated. Similarly, `insertMessages()` in `db-writer.js` has its own explicit column list. Missing either update means token data is parsed but not persisted.

**Why it happens:** This is a "three-place update" pattern: schema → db-writer INSERT statement → importFile() mapping. Each must be updated in sync. The test for "is it working" (app starts, imports complete without error) doesn't catch missing fields because the `ON CONFLICT DO UPDATE` upsert silently ignores fields that aren't in the SET clause.

**Consequences:** Token extraction code is written and tested, but data is never stored. Queries return NULL for all token fields. App appears to work but has no token data.

**Warning signs:** Parser extraction function returns non-null values in unit tests, but `SELECT input_tokens FROM messages` returns all NULL.

**Prevention:** When adding a new column, update all three in a single commit: (1) schema DDL in `schema.js`, (2) INSERT statement in `db-writer.js`'s `insertMessages()`, (3) `messagesForDb` mapping in `importer/index.js`. Add a unit test that inserts a mock message and asserts the token fields are populated.

**Phase to address:** Import pipeline extension phase.

---

### Pitfall 13: Charting Library Added to `dependencies` Bloats `node_modules` for CLI-Only Flows

**What goes wrong:** Adding a charting library to `dependencies` means it's downloaded even when the user runs `cctimereporter summary --date 2026-04-06 --pretty` (CLI-only, no browser). The chart library is never used in CLI/MCP mode but is still installed.

**Why it happens:** npm doesn't distinguish between "browser dependencies" and "server dependencies." Everything in `dependencies` is installed on `npm install`.

**Consequences:**  
- Cold `npx cctimereporter` startup downloads the chart library even for users who only use CLI/MCP tools  
- Larger package footprint for all users regardless of feature use

**Prevention:**  
- Use Vite's bundling to include the chart library in the frontend bundle (`dist/`) rather than as a runtime npm dependency. The library is bundled at build time and served as a static asset — no runtime `require()` needed.  
- The `dist/` directory is included in the npm package via the `files` array and `prepublishOnly` build script. The chart library becomes part of the pre-built asset, not a runtime dependency.  
- Only add the chart library to `devDependencies` (Vite uses it at build time). Users who `npx cctimereporter` get the pre-built `dist/` — no chart library install at runtime.

**Phase to address:** Dependency setup phase, before any charting component is written.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Schema migration (v9→v10) | Existing messages have NULL token data | Document re-import requirement; consider forced window re-import on first start |
| Schema migration (v9→v10) | Migration runner silently succeeds on already-migrated DB | Verify with `PRAGMA table_info(messages)` not absence of error |
| Token extraction in parser | Non-assistant messages written as `0` instead of NULL | Guard extraction with `type === 'assistant'` check |
| Token extraction in parser | Nested `cache_creation` double-counted against flat field | Use flat `cache_creation_input_tokens` only; skip nested fields in v10 |
| Import pipeline extension | Three-place update (schema, db-writer, importFile mapping) not kept in sync | Update all three in single commit; add integration test |
| Token aggregation queries | Subagent sidechain tokens double-counted | Filter `is_sidechain = 0` for parent-only totals |
| Token aggregation queries | Fork branch tokens counted for abandoned work | Filter `is_fork_branch = 0` for "actual spend" view |
| Token storage strategy | Denormalizing totals to sessions table | Store per-message only; derive at query time |
| Charting library selection | ECharts/Chart.js bundles added to dependencies | Use `devDependencies` + Vite bundling; prefer uPlot for size |
| Charting library selection | Too many data points cause render lag | Default to daily/session aggregates, not per-message series |
| Chart component implementation | Hardcoded chart colors break dark mode | Read `data-theme` attribute; use token-derived color palette |
| Import invalidation | Size-based skip leaves historical sessions with NULL tokens | Expose one-time forced re-import path; document in CHANGELOG |

---

## Sources

- Direct codebase inspection: `src/importer/index.js`, `src/importer/db-writer.js`, `src/importer/parser.js`, `src/importer/fork-detector.js`, `src/db/schema.js`, `src/db/index.js`, `src/services/timeline.js` — HIGH confidence (primary source)
- `references/claude-transcript-schema.md` (in-repo schema reference) — HIGH confidence (verified against JSONL structure used in parser)
- SQLite `ALTER TABLE ADD COLUMN` documentation: [https://www.sqlite.org/lang_altertable.html](https://www.sqlite.org/lang_altertable.html) — HIGH confidence (official SQLite docs)
- Claude Code GitHub issue on subagent token double-reporting: [https://github.com/anthropics/claude-code/issues/22625](https://github.com/anthropics/claude-code/issues/22625) — MEDIUM confidence (GitHub issue, not official docs)
- Claude Code GitHub issue on nested subagent token underreporting: [https://github.com/anthropics/claude-code/issues/43198](https://github.com/anthropics/claude-code/issues/43198) — MEDIUM confidence (GitHub issue)
- uPlot README (bundle size, limitations): [https://github.com/leeoniya/uPlot](https://github.com/leeoniya/uPlot) — HIGH confidence (official repo)
- Charting library size survey: [https://npmtrends.com/amcharts-vs-apexcharts-vs-chart.js-vs-echarts-vs-recharts-vs-uplot](https://npmtrends.com/amcharts-vs-apexcharts-vs-chart.js-vs-echarts-vs-recharts-vs-uplot) — MEDIUM confidence (download trends, not direct size measurement)
