# Phase 32: Data Foundation - Research

**Researched:** 2026-04-07
**Domain:** SQLite schema migration, import pipeline, JSONL token extraction
**Confidence:** HIGH

## Summary

Phase 32 adds seven new columns to the `messages` table (six token integers + one model string) and bumps schema to v10. The codebase follows a well-established migration pattern: `openDatabase()` returns `{ db, migrated }`, and each version step is implemented as an exported `MIGRATION_VX_TO_VY` string of semicolon-separated ALTER TABLE statements executed via `runMigration()`. The same function handles duplicate-column errors gracefully so migration is idempotent.

Token data lives at `rawMessage.message.usage` on assistant messages, as documented in the transcript schema reference. The usage object has a nested structure: top-level fields (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) and a `cache_creation` sub-object (`ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`). Model name is at `rawMessage.message.model`.

The three-place update (schema DDL, `insertMessages` in db-writer, `messagesForDb` mapping in importer/index.js) exactly matches how the `content` column was added in v7→v8. Auto re-import after migration is already handled: the `migrated` flag propagates through `cli.js` → `createServer()` → `serverState` → `/api/timeline` response → frontend banner. The banner already calls `triggerImport({ full: true })` which passes `maxAgeDays: undefined` to `runImport`, equivalent to `--all`.

**Primary recommendation:** Follow the exact v7→v8 precedent. Add `MIGRATION_V9_TO_V10`, bump `SCHEMA_VERSION` to 10, extend the migration chain in `openDatabase()`, update `SCHEMA_DDL`, update `insertMessages`, update `messagesForDb` mapping in `importFile`. No new trigger mechanism needed — the existing `schemaMigrated` banner already handles auto re-import prompt.

## Standard Stack

This phase uses only built-in project infrastructure — no new dependencies.

### Core
| Component | Location | Purpose |
|-----------|----------|---------|
| `node:sqlite` DatabaseSync | built-in | Schema migration and inserts |
| `src/db/schema.js` | project | DDL + migration string exports |
| `src/db/index.js` | project | `openDatabase()`, `runMigration()`, migration chain |
| `src/importer/db-writer.js` | project | `insertMessages()` prepared statement |
| `src/importer/index.js` | project | `messagesForDb` mapping in `importFile()` |

**Installation:** No new packages required.

## Architecture Patterns

### Established Migration Pattern (v1→v2 through v8→v9)

Every migration follows this exact structure:

1. Export a migration constant from `schema.js`:
```javascript
// Source: src/db/schema.js
export const MIGRATION_V9_TO_V10 = `
ALTER TABLE messages ADD COLUMN input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN output_tokens INTEGER;
ALTER TABLE messages ADD COLUMN cache_creation_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN cache_read_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN ephemeral_5m_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN ephemeral_1h_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN model TEXT;
`;
```

2. Add a migration function in `index.js`:
```javascript
function migrateV9toV10(db) {
  runMigration(db, MIGRATION_V9_TO_V10);
}
```

3. Thread it through every existing version branch in `openDatabase()`:
```javascript
// Every existing branch (v1 through v8) gets migrateV9toV10() appended
} else if (existingVersion === 9) {
  migrateV9toV10(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  migrated = true;
}
```

4. Update `SCHEMA_DDL` to include the new columns in the `CREATE TABLE IF NOT EXISTS messages` statement so fresh databases get them without migration.

5. Bump `SCHEMA_VERSION` to 10.

### Token Data Extraction Pattern

The usage object is on `rawMessage.message.usage` for assistant messages. The ephemeral cache tiers are nested one level deeper:

```javascript
// Source: references/claude-transcript-schema.md
// rawMessage.message.usage shape:
{
  "input_tokens": 1500,
  "output_tokens": 500,
  "cache_creation_input_tokens": 10000,
  "cache_read_input_tokens": 5000,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 10000,
    "ephemeral_1h_input_tokens": 0
  },
  "service_tier": "standard"
}
```

Extraction in `messagesForDb` mapping:
```javascript
// Only assistant messages carry usage data
const usage = msg.type === 'assistant' ? msg.rawMessage?.message?.usage : null;
const cacheCreation = usage?.cache_creation ?? null;

// In the messagesForDb mapping:
{
  // ... existing fields ...
  input_tokens:                   usage?.input_tokens                   ?? null,
  output_tokens:                  usage?.output_tokens                  ?? null,
  cache_creation_input_tokens:    usage?.cache_creation_input_tokens    ?? null,
  cache_read_input_tokens:        usage?.cache_read_input_tokens        ?? null,
  ephemeral_5m_input_tokens:      cacheCreation?.ephemeral_5m_input_tokens ?? null,
  ephemeral_1h_input_tokens:      cacheCreation?.ephemeral_1h_input_tokens ?? null,
  model:                          msg.type === 'assistant' ? (msg.rawMessage?.message?.model ?? null) : null,
}
```

### insertMessages Extension Pattern

The ON CONFLICT DO UPDATE clause in `insertMessages` must include the new columns so re-imports update token data for previously stored messages:

```javascript
// Extend the INSERT column list, VALUES list, and ON CONFLICT DO UPDATE SET:
ON CONFLICT(session_id, uuid) DO UPDATE SET
  fork_branch_id  = excluded.fork_branch_id,
  is_fork_branch  = excluded.is_fork_branch,
  content         = excluded.content,
  input_tokens                = excluded.input_tokens,
  output_tokens               = excluded.output_tokens,
  cache_creation_input_tokens = excluded.cache_creation_input_tokens,
  cache_read_input_tokens     = excluded.cache_read_input_tokens,
  ephemeral_5m_input_tokens   = excluded.ephemeral_5m_input_tokens,
  ephemeral_1h_input_tokens   = excluded.ephemeral_1h_input_tokens,
  model                       = excluded.model
```

### Auto Re-import Trigger: Existing Mechanism Sufficient

The `migrated` flag from `openDatabase()` flows through to the frontend today. No new mechanism needed:

```
openDatabase() → { db, migrated }
  → cli.js: createServer(db, { migrated })
  → server/index.js: serverState = { migrated }
  → routes/timeline.js: response includes schemaMigrated: serverState.migrated
  → TimelinePage.vue: schemaMigrated ref → shows "Re-import Now" banner
  → triggerImport({ full: true }) → GET /api/import/progress (maxAgeDays: undefined = --all)
```

When `migrated = true` (v9→v10 upgrade), the banner appears on first page load. The user clicks "Re-import Now" and all JSONL files are processed with `maxAgeDays: undefined` (no cutoff, equivalent to `--all`). Sessions with purged transcripts retain existing rows but token columns stay NULL.

The `schemaMigrated` flag is cleared in `serverState` after a successful import (`serverState.migrated = false` in both POST and SSE routes).

### Agent Messages (Sidechain Policy)

Sidechain agent messages in `importFile` are mapped separately (the `agentToImport` branch). Currently they hardcode `content: null`. They ALSO need token extraction — all messages that are `type === 'assistant'` should get their usage extracted, regardless of `is_sidechain`. The `rawMessage` is available via `parseTranscript()` in both the main and agent import paths.

For the agent path (Pattern A subagents), messages are mapped inline in `importAll()`:
```javascript
const agentMessages = agentData.messages
  .filter(m => m.timestamp)
  .map(msg => ({
    // ... existing fields ...
    is_sidechain:   1,
    is_fork_branch: 0,
    fork_branch_id: null,
    content:        null, // unchanged per existing policy
    // ADD:
    input_tokens:                   msg.type === 'assistant' ? (msg.rawMessage?.message?.usage?.input_tokens ?? null) : null,
    // ... etc
  }));
```

### Anti-Patterns to Avoid

- **Writing zero instead of NULL for non-assistant rows:** The policy is explicit — NULL means "no usage data". Writing 0 conflates "zero tokens" with "not applicable". Use `?? null` everywhere, conditioned on `msg.type === 'assistant'`.
- **Forgetting the agent message path:** There are two places that call `insertMessages` — `importFile` (main sessions) and the `agentToImport` loop. Both need token columns.
- **Omitting columns from ON CONFLICT DO UPDATE:** Without updating token columns on conflict, re-imports won't backfill existing message rows. The ON CONFLICT clause must include all seven new columns.
- **Forgetting to add columns to SCHEMA_DDL:** The migration adds columns to existing tables, but `SCHEMA_DDL` is used for fresh databases. Both must be updated in sync.
- **Not threading migrateV9toV10 through all existing version branches:** Every branch from `existingVersion === 1` through `existingVersion === 9` must call `migrateV9toV10()`. Missing a branch leaves users on older versions without the new columns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent ALTER TABLE | Custom existence check | Existing `runMigration()` with try/catch | Already handles "duplicate column name" errors |
| Version tracking | Custom version table | `PRAGMA user_version` | Existing pattern, no schema change needed |
| Re-import trigger | New CLI flag or API endpoint | Existing `schemaMigrated` banner flow | Already implemented end-to-end |
| Batch message insert | Loop with individual inserts | Existing `insertMessages()` with BEGIN/COMMIT | Already handles batching |

## Common Pitfalls

### Pitfall 1: Missing the Agent File Import Path

**What goes wrong:** Token columns are NULL for all sidechain/agent messages even after re-import.

**Why it happens:** There are two code paths that call `insertMessages`: the main `importFile()` function (for regular and team member sessions) and the `agentToImport` loop directly in `importAll()`. Only updating `messagesForDb` in `importFile` misses the agent path.

**How to avoid:** Search for all callsites of `insertMessages` and ensure both map token fields. The agent path constructs its own inline object — it needs the same extraction logic.

**Warning signs:** After re-import, `SELECT type, input_tokens FROM messages WHERE is_sidechain=1 LIMIT 5` returns all NULLs.

### Pitfall 2: Ephemeral Token Fields Are Nested

**What goes wrong:** `ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` are always NULL despite usage data being present.

**Why it happens:** These are under `usage.cache_creation.ephemeral_5m_input_tokens`, not directly on `usage`. Accessing `usage?.ephemeral_5m_input_tokens` returns undefined.

**How to avoid:** Navigate `usage?.cache_creation?.ephemeral_5m_input_tokens`. Check the transcript schema reference — the nesting is explicit.

**Warning signs:** Top-level token counts are non-NULL but ephemeral fields are always NULL.

### Pitfall 3: model Field is on message, Not usage

**What goes wrong:** `model` column stays NULL for all assistant messages.

**Why it happens:** The model name (`"claude-opus-4-5-20251101"`) is on `rawMessage.message.model`, not inside `rawMessage.message.usage`. Naively iterating through usage fields misses it.

**How to avoid:** Extract separately: `msg.rawMessage?.message?.model ?? null`.

**Warning signs:** `SELECT model FROM messages WHERE type='assistant' LIMIT 5` returns all NULLs.

### Pitfall 4: maxAgeDays Default in importAll vs runImport

**What goes wrong:** Re-import triggered by migration banner only processes last 30 days (the `importAll` default), not all available transcripts.

**Why it happens:** `importAll` defaults `maxAgeDays` to 30 when the parameter is not provided. But `runImport` passes through `maxAgeDays` directly. The frontend `triggerImport({ full: true })` call needs to pass `maxAgeDays: undefined` explicitly (not omit it) to bypass the 30-day default.

**How to avoid:** Verify the existing `triggerImport({ full: true })` code path in TimelinePage.vue sends `maxAgeDays=undefined` (or no `maxAgeDays` query param). Looking at the current import route, `maxAgeDays` on the server side comes from `request.query.maxAgeDays` — if absent, `parseInt(undefined, 10)` is `NaN`, which is not finite, so `maxAgeDays` is set to `undefined` in the route. This correctly passes `undefined` to `runImport`, which passes `undefined` to `importAll`, which then uses `cutoffDate = null` (no cutoff). The existing path is correct.

**Warning signs:** Re-import completes quickly and skips large numbers of files.

### Pitfall 5: ON CONFLICT DO UPDATE Must Include New Columns

**What goes wrong:** Existing message rows in the DB are not updated with token data on re-import.

**Why it happens:** The current `insertMessages` ON CONFLICT clause only updates `fork_branch_id`, `is_fork_branch`, and `content`. New columns not in the UPDATE SET are not touched on conflict — existing NULL values stay NULL even when the JSONL has usage data.

**How to avoid:** Add all seven new columns to the DO UPDATE SET clause.

**Warning signs:** After re-import, messages that existed before migration still have NULL token columns.

## Code Examples

### Complete MIGRATION_V9_TO_V10 Constant

```javascript
// Source: src/db/schema.js pattern from MIGRATION_V7_TO_V8
export const MIGRATION_V9_TO_V10 = `
ALTER TABLE messages ADD COLUMN input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN output_tokens INTEGER;
ALTER TABLE messages ADD COLUMN cache_creation_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN cache_read_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN ephemeral_5m_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN ephemeral_1h_input_tokens INTEGER;
ALTER TABLE messages ADD COLUMN model TEXT;
`;
```

### Token Extraction Helper (recommended for clarity)

```javascript
// Inline or extract as a small helper in importer/index.js
function extractTokenFields(msg) {
  if (msg.type !== 'assistant') {
    return {
      input_tokens: null,
      output_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      ephemeral_5m_input_tokens: null,
      ephemeral_1h_input_tokens: null,
      model: null,
    };
  }
  const usage = msg.rawMessage?.message?.usage ?? null;
  const cacheCreation = usage?.cache_creation ?? null;
  return {
    input_tokens:                   usage?.input_tokens                        ?? null,
    output_tokens:                  usage?.output_tokens                       ?? null,
    cache_creation_input_tokens:    usage?.cache_creation_input_tokens         ?? null,
    cache_read_input_tokens:        usage?.cache_read_input_tokens             ?? null,
    ephemeral_5m_input_tokens:      cacheCreation?.ephemeral_5m_input_tokens   ?? null,
    ephemeral_1h_input_tokens:      cacheCreation?.ephemeral_1h_input_tokens   ?? null,
    model:                          msg.rawMessage?.message?.model             ?? null,
  };
}
```

### Verifying Migration Success

```sql
-- Check schema version
PRAGMA user_version;  -- expect 10

-- Check non-NULL token data for recent assistant messages
SELECT input_tokens, output_tokens, model
FROM messages
WHERE type = 'assistant'
LIMIT 5;

-- Confirm NULL for non-assistant messages
SELECT COUNT(*) as null_check
FROM messages
WHERE type != 'assistant' AND input_tokens IS NOT NULL;  -- expect 0

-- Confirm model column populated
SELECT DISTINCT model FROM messages WHERE type = 'assistant' LIMIT 10;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fresh schema only | ALTER TABLE migrations | v1→v2 | Users retain data across upgrades |
| Manual BEGIN/COMMIT | `runMigration()` utility | v2+ | Idempotent, duplicate-column safe |
| No token storage | Per-message token columns | Phase 32 (now) | Enables downstream cost/usage reporting |

## Open Questions

1. **Progress messages that contain usage data**
   - What we know: `progress` type messages exist for long-running operations; they are not `assistant` type
   - What's unclear: Do any `progress` messages carry `message.usage`? The transcript schema doesn't indicate they do.
   - Recommendation: Extract only from `type === 'assistant'` as specified. If progress messages have usage, that is a separate concern for a later phase.

2. **Null usage on some assistant messages**
   - What we know: Not all assistant messages necessarily have a `usage` object (e.g., streaming vs. non-streaming, API errors)
   - What's unclear: How common are assistant messages with missing `usage`?
   - Recommendation: The `?? null` fallback handles this correctly. NULL means "data not available", which is semantically correct for both non-assistant messages and assistant messages with no usage object.

## Sources

### Primary (HIGH confidence)
- `src/db/schema.js` — All migration constants and SCHEMA_DDL, full inspection
- `src/db/index.js` — `openDatabase()` and `runMigration()` full inspection
- `src/importer/db-writer.js` — `insertMessages()` full inspection
- `src/importer/index.js` — `importFile()` and `importAll()` full inspection, `messagesForDb` mapping
- `src/importer/parser.js` — `parseTranscript()` full inspection
- `references/claude-transcript-schema.md` — Authoritative JSONL structure including `usage` object shape
- `src/server/routes/import.js` — SSE and POST import routes
- `bin/cli.js` — `migrated` flag propagation

### Secondary (MEDIUM confidence)
- `src/client/pages/TimelinePage.vue` — `schemaMigrated` banner and `triggerImport` behavior (lines 38-46, 167, 296-299, 489)
- `src/server/routes/timeline.js` — `schemaMigrated` in API response

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all files inspected directly from codebase
- Architecture: HIGH — migration pattern is consistent across 8 prior migrations
- Pitfalls: HIGH — derived from direct code inspection of both import paths and ON CONFLICT clauses
- Token field structure: HIGH — verified against authoritative transcript schema reference

**Research date:** 2026-04-07
**Valid until:** Stable — schema migration patterns and JSONL format are not fast-moving
