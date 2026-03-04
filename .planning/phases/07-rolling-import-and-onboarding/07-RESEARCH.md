# Phase 7: Rolling Import and Onboarding - Research

**Researched:** 2026-03-03
**Domain:** SQLite schema migration, file I/O peek, import filtering, Vue 3 state detection, Fastify SSE
**Confidence:** HIGH (all findings based on direct codebase inspection + verified Node.js built-ins)

---

## Summary

Phase 7 has a detailed pre-existing plan (`.planning/rolling-import-plan.md`) that was validated against the actual codebase. The plan is accurate and well-targeted. The implementation touches 8 files across 3 concern areas: (1) schema migration to add timestamp columns to `import_log`, (2) rolling-window import logic with a cheap synchronous peek, and (3) a first-time welcome state in the Vue frontend.

The codebase is structurally ready for these changes. The migration pattern is established (v1→v2→v3 already wired in `src/db/index.js`), the import pipeline's skip logic is centralized and easy to extend, and the empty-state detection in `TimelinePage.vue` is a single `v-else-if` check that splits cleanly.

IMP-04 ("progressive feedback") does NOT require SSE or a new streaming API. The toolbar already has `AppProgressBar` with an `indeterminate` mode and the `importRunning` prop/spinner. The requirement is satisfied by: (a) improving the welcome screen to clearly say "first import may take a moment", and (b) ensuring the existing indeterminate progress bar is visible in the welcome state, not just the toolbar. No new infrastructure needed.

**Primary recommendation:** Follow the pre-existing plan exactly — it is accurate, ordered correctly, and scoped appropriately. The 8 implementation steps map directly to the 3 plan files in the roadmap.

---

## Standard Stack

No new libraries are needed for this phase. All required capabilities are available in the existing stack:

### Core
| Capability | Source | Notes |
|------------|--------|-------|
| Schema migration | `src/db/index.js` + `src/db/schema.js` | Established v1→v2→v3 pattern; extend to v4 |
| File size read | `node:fs` `statSync` (already used in `discovery.js`) | Already in use |
| File peek (first bytes) | `node:fs` `openSync` / `readSync` / `closeSync` | Built-in, synchronous, no new deps |
| SQLite upsert | `node:sqlite` `DatabaseSync` | Already in use; `INSERT OR REPLACE` pattern established |
| Rolling-window filter | Pure JS in `importAll()` | Date cutoff is a string comparison on ISO8601 |
| Welcome state | Vue 3 `v-else-if` in `TimelinePage.vue` | Conditional on `totalSessions === 0` from API |
| Progress feedback | `AppProgressBar` (indeterminate) + `AppButton` (loading) | Already rendered in toolbar during import |

### Supporting
| Capability | Source | Notes |
|------------|--------|-------|
| Import status API | `GET /api/import-status` | NOT needed — existing blocking import + spinner is sufficient for IMP-04 |
| SSE streaming | `@fastify/sse` (exists in ecosystem) | NOT needed for this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Synchronous `openSync/readSync` peek | Async readline (existing `parseTranscript`) | Sync peek is faster for skip-decision; no event loop blocking concern for a few KB |
| `totalSessions` from timeline API | New `/api/status` endpoint | Simpler to add `totalSessions` to existing timeline response — one HTTP call instead of two |
| SSE for live import progress | Polling + existing blocking import | SSE adds `@fastify/sse` dependency; polling requires a status endpoint; blocking + good messaging satisfies IMP-04 |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended File Structure (no new files)

All changes are edits to existing files:

```
src/db/schema.js          — SCHEMA_VERSION 3→4, MIGRATION_V3_TO_V4, DDL update
src/db/index.js           — migrateV3toV4(), cascade wiring
src/importer/db-writer.js — updateImportLog() extended params, getImportedFileInfo()
src/importer/parser.js    — peekFirstTimestamp() function added
src/importer/index.js     — rolling window logic in importAll()
src/server/routes/import.js — pass maxAgeDays from request body
src/server/routes/timeline.js — add totalSessions to response
src/client/pages/TimelinePage.vue — welcome state + empty-date state split
```

### Pattern 1: Schema Migration Cascade

The established pattern is to add a new `MIGRATION_VX_TO_VY` constant to `schema.js`, export it, then add a `migrateVXtoVY(db)` function in `index.js` and wire it into the existing cascade.

```js
// src/db/schema.js
export const SCHEMA_VERSION = 4;

export const MIGRATION_V3_TO_V4 = `
ALTER TABLE import_log ADD COLUMN first_message_at TEXT;
ALTER TABLE import_log ADD COLUMN last_message_at TEXT;
`;

// Also update SCHEMA_DDL import_log CREATE TABLE to include these columns
// (for fresh installs — the CREATE TABLE is the canonical definition)
```

```js
// src/db/index.js — extend existing cascade
function migrateV3toV4(db) {
  runMigration(db, MIGRATION_V3_TO_V4);
}

// In openDatabase(), add v3→v4 to all cascade paths:
if (existingVersion === 1) {
  migrateV1toV2(db); migrateV2toV3(db); migrateV3toV4(db);
} else if (existingVersion === 2) {
  migrateV2toV3(db); migrateV3toV4(db);
} else if (existingVersion === 3) {
  migrateV3toV4(db);
}
db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
```

**Key detail:** `runMigration()` already wraps each statement in try/catch for idempotency — re-running `ALTER TABLE ADD COLUMN` that already exists is safe.

### Pattern 2: File Peek (peekFirstTimestamp)

Read only the first ~2KB synchronously to extract the first JSON line's timestamp:

```js
// src/importer/parser.js — add this function
import { openSync, readSync, closeSync } from 'node:fs';

/**
 * Read the first JSON line of a JSONL file and return its timestamp, or null.
 * Uses synchronous I/O to avoid event-loop overhead for a simple skip decision.
 *
 * @param {string} filePath
 * @returns {string|null} ISO8601 timestamp string, or null
 */
export function peekFirstTimestamp(filePath) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = readSync(fd, buf, 0, 8192, 0);
    const text = buf.slice(0, bytesRead).toString('utf8');
    const newlineIdx = text.indexOf('\n');
    const firstLine = newlineIdx === -1 ? text : text.slice(0, newlineIdx);
    const trimmed = firstLine.trim();
    if (!trimmed) return null;
    const msg = JSON.parse(trimmed);
    return msg.timestamp ?? null;
  } catch (_) {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch (_) { /* ignore */ }
  }
}
```

**Key detail:** `fd` must be declared before the try block so the `finally` clause can close it.

### Pattern 3: getImportedFileInfo (replace getImportedFileSizes)

Replace the existing `Map<path, size>` with `Map<path, { fileSize, lastMessageAt }>`:

```js
// src/importer/db-writer.js
export function getImportedFileInfo(db) {
  const rows = db.prepare(
    `SELECT file_path, file_size, last_message_at
     FROM import_log
     WHERE status IN ('ok', 'skipped_old')`
  ).all();

  const map = new Map();
  for (const row of rows) {
    map.set(row.file_path, {
      fileSize: row.file_size,
      lastMessageAt: row.last_message_at ?? null,
    });
  }
  return map;
}
```

**Key detail:** Include `status = 'skipped_old'` in the query — files peeked and skipped on a previous run should still be tracked to avoid re-peeking on subsequent imports (satisfies IMP-02).

### Pattern 4: updateImportLog Extended Signature

Add `firstMessageAt` and `lastMessageAt` params to `updateImportLog()`:

```js
// src/importer/db-writer.js
export function updateImportLog(db, filePath, sessionId, fileSize, status, errorMsg,
                                firstMessageAt = null, lastMessageAt = null) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO import_log (
      file_path, session_id, file_size, status, error_msg,
      first_message_at, last_message_at
    ) VALUES (
      $file_path, $session_id, $file_size, $status, $error_msg,
      $first_message_at, $last_message_at
    )
  `);
  stmt.run({ ..., $first_message_at: firstMessageAt, $last_message_at: lastMessageAt });
}
```

**Key detail:** Default params (`= null`) keep all existing call sites compatible without changes. Only the `importFile()` success path and the `skipped_old` recording path need to pass the timestamps.

### Pattern 5: Rolling Window Filter Logic

In `importAll()`, after fetching `importedFileInfo`:

```js
// src/importer/index.js
const { maxAgeDays = 30 } = options;
const cutoffDate = maxAgeDays != null
  ? new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
  : null;

for (const file of files) {
  const cached = importedFileInfo.get(file.path);

  // Skip 1: size unchanged (existing behavior, fast path)
  if (!force && cached?.fileSize === file.size) {
    toSkip.push(file);
    continue;
  }

  // Skip 2: rolling window — cached lastMessageAt is before cutoff
  if (!force && cutoffDate && cached?.lastMessageAt && cached.lastMessageAt < cutoffDate) {
    toSkip.push(file);
    continue;
  }

  // Skip 3: new file — peek first timestamp
  if (!force && cutoffDate && !cached) {
    const firstTs = peekFirstTimestamp(file.path);
    if (firstTs && firstTs < cutoffDate) {
      // Record as skipped_old so re-runs don't re-peek
      updateImportLog(db, file.path, file.sessionId, file.size, 'skipped_old', null, firstTs, firstTs);
      filesSkipped++;
      continue;
    }
  }

  toImport.push(file);
}
```

**Key detail:** ISO8601 strings sort lexicographically — `'2025-12-01T...' < '2026-01-01T...'` is a valid date comparison without `new Date()`.

### Pattern 6: totalSessions in Timeline Response

```js
// src/server/routes/timeline.js
const totalSessionsStmt = db.prepare('SELECT COUNT(*) AS cnt FROM sessions');

// In the handler:
const { cnt: totalSessions } = totalSessionsStmt.get();

return {
  date,
  totalSessions,
  projects: [...projectMap.values()],
};
```

### Pattern 7: Welcome vs Empty-Date State in Vue

The current single empty state check (`timelineData.projects.length === 0`) splits into two:

```vue
<!-- First-time welcome: no sessions ever imported -->
<div v-else-if="timelineData && timelineData.totalSessions === 0" class="timeline-welcome">
  <h2>Welcome to CC Time Reporter</h2>
  <p>This tool scans <code>~/.claude/projects/</code> for your Claude Code session transcripts
     and shows them as a day-by-day Gantt chart.</p>
  <p>Your first import covers the last 30 days. It may take a moment&nbsp;&mdash;
     progress is shown in the toolbar above.</p>
  <AppButton variant="primary" size="lg" :loading="importRunning" @click="triggerImport">
    Import Sessions
  </AppButton>
</div>

<!-- Empty date: sessions exist but none on this date -->
<div v-else-if="timelineData && timelineData.projects.length === 0" class="timeline-empty">
  <p>No sessions found for <strong>{{ selectedDate }}</strong>.</p>
  <p class="timeline-empty-hint">Try navigating to a different date.</p>
</div>
```

**Key detail:** `totalSessions === 0` must be checked BEFORE `projects.length === 0` since both would be true when empty. The `v-else-if` chain in Vue processes top-down.

### Anti-Patterns to Avoid

- **Re-reading size for skipped_old files:** Skip 1 (size check) must remain the first check. If a `skipped_old` file has grown in size (user had more sessions), it needs to be re-imported.
- **Peeking on every import run:** Once a file is recorded as `skipped_old`, the `fileSize` is stored; if size unchanged → skip via Skip 1. Only peek if no cache entry exists AND size has changed.
- **SSE for IMP-04:** Over-engineering. The existing indeterminate progress bar + spinner in the toolbar communicates "working" adequately. The welcome screen's text copy ("may take a moment") handles expectations.
- **Using `getImportedFileSizes` after adding `getImportedFileInfo`:** Remove the old export or rename — two similar functions will cause confusion.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO date comparison | Date parsing | String comparison on ISO8601 | Lexicographic order is reliable for ISO8601 timestamps |
| SSE for import progress | Custom streaming server | Existing blocking import + indeterminate spinner | IMP-04 is a UX requirement, not a technical one; the spinner already exists |
| Migration idempotency | Custom migration tracker | Existing `runMigration()` with try/catch | Already handles `duplicate column name` errors safely |

**Key insight:** The codebase already has almost everything needed. This phase is largely wiring, not building.

---

## Common Pitfalls

### Pitfall 1: Migration Cascade Gaps

**What goes wrong:** Adding `migrateV3toV4` only to the `existingVersion === 3` branch — users on v1 or v2 skip v4.
**Why it happens:** Developers add to the most obvious branch without thinking through all paths.
**How to avoid:** Update ALL three cascade paths (v1→...→v4, v2→...→v4, v3→v4). Follow the existing pattern in `openDatabase()`.
**Warning signs:** `PRAGMA user_version` is 4 for new installs but 3 for upgraded installs.

### Pitfall 2: skipped_old Files Not Tracked by Size

**What goes wrong:** `skipped_old` entries are written with the file's current size, but `getImportedFileInfo` only checks `status = 'ok'`.
**Why it happens:** The function name suggests it tracks imported files, not skipped ones.
**How to avoid:** Include `status IN ('ok', 'skipped_old')` in `getImportedFileInfo`. A `skipped_old` file that grows in size will fail Skip 1 (size mismatch) and correctly fall through to full import.
**Warning signs:** Re-running import re-peeks every file (IMP-02 not satisfied).

### Pitfall 3: Agent File Timestamps Not Updated

**What goes wrong:** The agent file import path in `importAll()` also calls `updateImportLog()` but doesn't pass timestamps.
**Why it happens:** Agent files don't go through `importFile()`, so the timestamp extraction happens there — the agent path was written separately.
**How to avoid:** For agent files, timestamps are less critical (they merge into parent sessions), but for completeness pass `null` for `firstMessageAt`/`lastMessageAt` — the new default params handle this.
**Warning signs:** `first_message_at IS NULL` for all `skipped_old` agent file entries (acceptable).

### Pitfall 4: totalSessions Wrong Scope

**What goes wrong:** `totalSessionsStmt` prepared outside the route handler but called inside, or vice versa — same as the existing `sessionStmt` and `messageStmt` which are prepared at registration time.
**Why it happens:** Confusion about when `db.prepare()` runs vs when `.get()` runs.
**How to avoid:** Follow the existing pattern — prepare outside the handler (once at registration time), call `.get()` inside the handler (once per request). Prepared statements in node:sqlite are reusable.
**Warning signs:** Stale count, or "cannot prepare a statement on a closed db" errors.

### Pitfall 5: Vue Welcome State Ordering

**What goes wrong:** `projects.length === 0` check appears before `totalSessions === 0` check.
**Why it happens:** Adding the welcome state as a new `v-else-if` after the existing empty state.
**How to avoid:** The welcome state must come FIRST in the chain since `totalSessions === 0` implies `projects.length === 0`.
**Warning signs:** Welcome state never shows (returning users with no sessions on the date see the generic empty state instead).

---

## Code Examples

Verified patterns from direct codebase inspection:

### Existing Migration Pattern (HIGH confidence — from src/db/index.js)

```js
if (existingVersion === 1) {
  migrateV1toV2(db);
  migrateV2toV3(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
} else if (existingVersion === 2) {
  migrateV2toV3(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
```
Extend by adding `migrateV3toV4(db)` calls and a new `else if (existingVersion === 3)` branch.

### Existing Import Skip Logic (HIGH confidence — from src/importer/index.js lines 297-303)

```js
for (const file of files) {
  if (!force && importedSizes.get(file.path) === file.size) {
    toSkip.push(file);
  } else {
    toImport.push(file);
  }
}
```
Replace `importedSizes.get(file.path) === file.size` with the multi-step filter chain described in Pattern 5.

### Existing updateImportLog Call Sites (HIGH confidence — lines 251, 320-323, 355, 365)

```js
// Success path (line 251):
updateImportLog(db, file.path, file.sessionId, file.size, 'ok', null);

// Error path (lines 320-323):
updateImportLog(db, file.path, file.sessionId, file.size, 'error', err.message);
```
Adding default params `firstMessageAt = null, lastMessageAt = null` to `updateImportLog` keeps these call sites unchanged. Only the success path in `importFile()` needs to pass the timestamps.

### Existing Empty State (HIGH confidence — from TimelinePage.vue line 25-29)

```vue
<div v-else-if="timelineData && timelineData.projects.length === 0" class="timeline-empty">
  <p>No sessions found for <strong>{{ selectedDate }}</strong>.</p>
  <AppButton variant="primary" :loading="importRunning" @click="triggerImport">
    Import Sessions
  </AppButton>
</div>
```
Insert the welcome `v-else-if` block BEFORE this existing block.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Import all files every time | Rolling 30-day window with size-skip | Phase 7 | First import for users with 90+ days of history is ~3x faster (only last 30 days) |
| One empty state for all zero-session scenarios | Two states: welcome (no sessions ever) vs empty-date (no sessions on this date) | Phase 7 | First-time users see onboarding copy, returning users see actionable hint |

---

## Open Questions

1. **maxAgeDays UI control**
   - What we know: The pre-existing plan passes `maxAgeDays` from request body (import.js)
   - What's unclear: Is there a UI control to change it, or is 30 hard-coded in the frontend's `triggerImport()` call?
   - Recommendation: Default to hard-coded 30 in the frontend for this phase. The plan's step 5 only says "read `maxAgeDays` from request body (default 30)" — no UI mentioned. Don't add a UI control unless IMP-01 specifically requires it. The roadmap success criteria only require "30 days" to be the default, not configurable.

2. **What happens to files that grow past the 30-day cutoff?**
   - What we know: An active session file that grows in size will fail Skip 1 and be re-imported. Its new `lastMessageAt` may extend past the cutoff.
   - What's unclear: Should files with `lastMessageAt` past the cutoff but starting before it be included?
   - Recommendation: Include them. The cutoff is on `lastMessageAt` OR `peekFirstTimestamp` (Skip 2 and Skip 3). A file that was old but has grown gets re-imported — that's correct.

3. **IMP-04: Is the existing toolbar progress bar enough?**
   - What we know: The toolbar already renders `AppProgressBar` (indeterminate) when `importRunning === true`. The welcome screen's CTA triggers `triggerImport()` which sets `importRunning = true`.
   - What's unclear: The success criteria says "not a frozen spinner" — does this imply live counts, or just that the spinner is visible?
   - Recommendation: The existing indeterminate progress bar plus welcome text copy ("your first import may take a moment") satisfies "not a frozen spinner." No streaming or polling needed. The AppProgressBar animates continuously while `importRunning` is true.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection: `src/db/schema.js` — schema DDL, SCHEMA_VERSION=3, migration constants
- Direct inspection: `src/db/index.js` — `openDatabase()`, `runMigration()`, cascade pattern
- Direct inspection: `src/importer/index.js` — `importAll()`, skip logic, all call sites
- Direct inspection: `src/importer/db-writer.js` — `updateImportLog()`, `getImportedFileSizes()`
- Direct inspection: `src/importer/parser.js` — `parseTranscript()` streaming pattern
- Direct inspection: `src/importer/discovery.js` — `findTranscriptFiles()`, `findAgentFiles()`
- Direct inspection: `src/server/routes/import.js` — `importRoute()`, concurrency guard
- Direct inspection: `src/server/routes/timeline.js` — timeline handler, prepared stmt pattern
- Direct inspection: `src/client/pages/TimelinePage.vue` — empty state, `triggerImport()`, `importRunning`
- Direct inspection: `src/client/components/TimelineToolbar.vue` — `AppProgressBar` usage
- Direct inspection: `.planning/rolling-import-plan.md` — pre-existing 8-step plan (validated against codebase)
- Node.js v22.17.1 confirmed: `openSync`, `readSync`, `closeSync` available in `node:fs`

### Secondary (MEDIUM confidence)
- `@fastify/sse` exists in Fastify ecosystem (from Fastify ecosystem docs) — confirmed NOT needed for this phase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all capabilities are existing built-ins or already-imported modules
- Architecture: HIGH — all patterns verified directly in codebase code; pre-existing plan is accurate
- Pitfalls: HIGH — derived from reading actual code and reasoning about edge cases, not hypothetical

**Research date:** 2026-03-03
**Valid until:** 2026-06-01 (stable Node.js built-ins and codebase; re-verify if schema changes)

---

## Plan Validation: Pre-existing Plan vs Codebase

The `.planning/rolling-import-plan.md` 8-step plan was checked against the current codebase. All file paths and function names are accurate. Specific findings:

| Plan Step | Status | Notes |
|-----------|--------|-------|
| 1. Schema v3→v4 (add timestamp cols to import_log) | VALID | Current schema is v3; `import_log` has no timestamp cols |
| 2. `updateImportLog()` + `getImportedFileInfo()` | VALID | Current `getImportedFileSizes()` returns `Map<path,size>`; needs replacement |
| 3. `peekFirstTimestamp()` in parser.js | VALID | No such function exists yet; `openSync/readSync` are available |
| 4. Rolling window in `importAll()` | VALID | Current skip logic is 3 lines; needs extension |
| 5. Import route accepts `maxAgeDays` | VALID | Current route passes empty `{}` to `importAll()` |
| 6. `totalSessions` in timeline response | VALID | Current response only returns `{ date, projects }` |
| 7. Welcome state + empty-date state split | VALID | Current Vue has single `projects.length === 0` check |
| 8. Build dist | VALID | Standard step after frontend changes |

**One correction to the plan:** Step 2 says `getImportedFileInfo` should query `WHERE status IN ('ok', 'skipped_old')`. This is correct, but the plan's description of "size unchanged + cached `lastMessageAt` before cutoff → skip (rolling window on known files)" in Step 4 implicitly requires that `skipped_old` files are also returned by `getImportedFileInfo`. This cross-step dependency should be explicit in the PLAN.md.
