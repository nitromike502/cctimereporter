# Phase 8: Session Context - Research

**Researched:** 2026-03-04
**Domain:** Session summary import, JSONL firstPrompt extraction, Vue detail panel
**Confidence:** HIGH

## Summary

Phase 8 adds human-readable session context to the Gantt detail panel. The work involves reading Claude Code's `sessions-index.json` files (which contain AI-generated summaries and firstPrompt fields), extracting firstPrompt from JSONL as a fallback, storing both in the database, and surfacing them in `SessionDetailPanel.vue`.

The existing codebase is well-prepared: the `sessions` table already has a `summary` column, the timeline API already returns `summary` in session objects, and `SessionDetailPanel.vue` already receives the full session object — it just needs a new UI row to display it. The main work is: (1) adding a `first_prompt` column via schema v4→v5 migration, (2) building a `session-index.js` reader module, (3) extracting firstPrompt in the parser, (4) merging both into the import pipeline, and (5) updating the API and panel.

**Primary recommendation:** Build `session-index.js` as a standalone module, integrate it per-project in `importAll()` before the per-file loop, and pass session index data into `importFile()` so both `summary` and `first_prompt` are written during the upsert. The summary column is already wired end-to-end — only `first_prompt` needs the full schema+API+UI treatment.

## sessions-index.json Format (VERIFIED ON DISK)

**Location:** Directly inside `transcriptDir` (same level as `.jsonl` files).
- Path: `~/.claude/projects/{encoded-name}/sessions-index.json`
- `transcriptDir` already points to this directory in the import pipeline.

**Structure (verified from two real files):**

```json
{
  "version": 1,
  "entries": [
    {
      "sessionId": "68955549-b874-4966-9873-48e2853ee488",
      "fullPath": "/home/.../.../68955549-b874-4966-9873-48e2853ee488.jsonl",
      "fileMtime": 1769995093834,
      "firstPrompt": "Help me run a few tests...",
      "summary": "Claude Code Test: Creating Agents and Slash Commands",
      "messageCount": 4,
      "created": "2026-01-10T04:20:18.670Z",
      "modified": "2026-01-10T04:22:15.389Z",
      "gitBranch": "",
      "projectPath": "/home/training/test-1",
      "isSidechain": false
    }
  ],
  "originalPath": "/home/training/test-1"
}
```

**Key observations:**
- Top-level has `version` (always 1 in observed data) and `entries` array.
- Each entry: `sessionId`, `firstPrompt`, `summary`, `customTitle` (optional — only present for some entries).
- `firstPrompt` sentinel: value `"No prompt"` appears when a session had no user message (e.g., slash command sessions). This should be treated as absent, not stored.
- Only 2 of the ~8 discovered projects currently have this file (created when `/resume` is used or session summaries are generated).
- Session index is keyed by `sessionId` after reading the `entries` array — build a `Map<sessionId, entry>` for O(1) lookup during per-file import.

## Current State: What Already Exists

### Already done — no changes needed:

| Item | Status | Evidence |
|------|--------|---------|
| `sessions.summary` column | EXISTS | `schema.js` SCHEMA_DDL line 29 |
| `upsertSession()` writes `summary` | EXISTS | `db-writer.js` lines 47, 99 |
| `importFile()` passes `data.summary` | EXISTS | `index.js` line 211 |
| Timeline API selects `s.summary` | EXISTS | `timeline.js` line 91 |
| Timeline API returns `summary` in session object | EXISTS | `timeline.js` line 173 |
| `session.summary` passed to `SessionDetailPanel` | EXISTS | `TimelinePage.vue` — full session object passed |
| `discovery.js` excludes sessions-index.json | EXISTS | Only `.jsonl` files accepted (comment at line 169) |

### Must be built:

| Item | Files Affected |
|------|---------------|
| `first_prompt` column in sessions table | `schema.js`, `src/db/index.js` |
| Schema migration v4→v5 | `schema.js`, `src/db/index.js` |
| `session-index.js` reader module (new file) | `src/importer/session-index.js` |
| firstPrompt extraction from JSONL | `src/importer/parser.js` |
| Merge session index data in importAll | `src/importer/index.js` |
| Add `first_prompt` to upsertSession | `src/importer/db-writer.js` |
| Add `first_prompt` to timeline API | `src/server/routes/timeline.js` |
| Show summary in SessionDetailPanel | `src/client/components/SessionDetailPanel.vue` |
| Build dist | npm run build |

## Architecture Patterns

### Recommended Project Structure

No new directories needed. New file:
```
src/importer/
├── session-index.js   # NEW: reads sessions-index.json for a project
├── discovery.js
├── parser.js
├── index.js
└── db-writer.js
```

### Pattern 1: Session Index Reader

**What:** Reads and parses `sessions-index.json` from a transcriptDir. Returns a Map for O(1) session lookup. Returns empty Map if file absent or malformed (most projects won't have it).

**Implementation:**

```javascript
// src/importer/session-index.js
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read sessions-index.json from a project's transcriptDir.
 * Returns Map<sessionId, { summary, firstPrompt, customTitle }>.
 * Returns empty Map if file absent, unreadable, or malformed.
 *
 * @param {string} transcriptDir - Full path to project transcript directory
 * @returns {Map<string, { summary: string|null, firstPrompt: string|null, customTitle: string|null }>}
 */
export function readSessionIndex(transcriptDir) {
  const indexPath = join(transcriptDir, 'sessions-index.json');
  if (!existsSync(indexPath)) return new Map();

  let data;
  try {
    const raw = readFileSync(indexPath, 'utf8');
    data = JSON.parse(raw);
  } catch (_err) {
    return new Map();
  }

  const entries = data?.entries;
  if (!Array.isArray(entries)) return new Map();

  const map = new Map();
  for (const entry of entries) {
    if (!entry.sessionId) continue;
    map.set(entry.sessionId, {
      summary:     entry.summary     ?? null,
      firstPrompt: entry.firstPrompt ?? null,
      customTitle: entry.customTitle ?? null,
    });
  }
  return map;
}
```

### Pattern 2: firstPrompt Extraction in Parser

**What:** Capture the text of the first `type: "user"` message with a non-meta, non-null content. Truncate to 200 chars to bound storage.

**Implementation detail:** User message content is at `msg.message.content` — either a string (direct text) or an array of content blocks. Use `extractContentText()` which already exists in `parser.js`.

```javascript
// In parseTranscript(), add to state:
let firstPrompt = null;

// In the message loop, after type checks:
if (!firstPrompt && msg.type === 'user' && !msg.isMeta) {
  const text = extractContentText(msg);
  if (text && text.trim()) {
    firstPrompt = text.trim().slice(0, 200);
  }
}

// In return object:
return { messages, summary, firstPrompt, customTitle, slug, ... };
```

### Pattern 3: Integration in importAll()

**What:** Read session index once per project (not per file), pass relevant entry to `importFile()`.

```javascript
// In importAll(), per-project loop:
const sessionIndex = readSessionIndex(project.transcriptDir);

// Pass to importFile():
const result = await importFile(db, file, projectId, { verbose }, sessionIndex);

// In importFile() signature:
async function importFile(db, file, projectId, options, sessionIndex = new Map()) {
  // ...
  const indexEntry = sessionIndex.get(file.sessionId);

  // Priority: index summary > JSONL summary (JSONL never has summary in practice)
  const summaryValue = indexEntry?.summary ?? data.summary ?? null;

  // Priority: index firstPrompt (if not "No prompt") > parsed firstPrompt
  const indexFirstPrompt = (indexEntry?.firstPrompt && indexEntry.firstPrompt !== 'No prompt')
    ? indexEntry.firstPrompt
    : null;
  const firstPromptValue = indexFirstPrompt ?? data.firstPrompt ?? null;

  upsertSession(db, {
    // ...existing fields...
    summary:      summaryValue,
    first_prompt: firstPromptValue,
  });
}
```

### Pattern 4: Schema Migration v4→v5

**What:** Add `first_prompt TEXT` column to sessions. Follow the established migration pattern.

```javascript
// schema.js:
export const SCHEMA_VERSION = 5;

export const MIGRATION_V4_TO_V5 = `
ALTER TABLE sessions ADD COLUMN first_prompt TEXT;
`;

// In SCHEMA_DDL sessions CREATE TABLE, add:
//   first_prompt TEXT,
```

```javascript
// db/index.js — add migrateV4toV5() and wire into cascade:
// existingVersion === 1 → migrateV1toV2 → V3 → V4 → V5
// existingVersion === 2 → V3 → V4 → V5
// existingVersion === 3 → V4 → V5
// existingVersion === 4 → V5
```

### Pattern 5: Timeline API Update

**What:** Add `s.first_prompt` to SELECT and `firstPrompt` to the session object.

```javascript
// In sessionStmt SELECT list:
s.first_prompt,

// In sessionObj construction:
firstPrompt: row.first_prompt,
```

### Pattern 6: SessionDetailPanel UI

**What:** Add a "Summary" detail item, prominently placed (first in grid). Show `session.summary || session.firstPrompt` with fallback `'—'`.

```html
<!-- In .detail-grid, first item: -->
<div class="detail-item detail-item--wide">
  <span class="detail-label">Summary</span>
  <span class="detail-value detail-value--wrap">{{ session?.summary || session?.firstPrompt || '—' }}</span>
</div>
```

The current `detail-value` has `white-space: nowrap; text-overflow: ellipsis`. For summary text, wrapping is better UX. Add a modifier class or make summary a full-width row.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing with error recovery | Custom try/catch chains | Standard `try { JSON.parse() }` | The existing codebase pattern already handles this correctly |
| Text truncation | Complex NLP | `.slice(0, 200)` | Simple character limit is sufficient for a label |
| Session ID lookup | Array.find() on every file | `Map<sessionId, entry>` | O(1) vs O(n) for potentially hundreds of sessions |

**Key insight:** The sentinel value `"No prompt"` in sessions-index.json firstPrompt must be filtered — storing it as a fallback label would show misleading text.

## Common Pitfalls

### Pitfall 1: sessions-index.json Path Confusion

**What goes wrong:** The old plan notes said the index is "at the parent of transcriptDir" — this is WRONG. The file is inside `transcriptDir`, at the same level as `.jsonl` files.

**Verified:** `join(transcriptDir, 'sessions-index.json')` is the correct path.

**Warning signs:** File not found, empty Maps for all projects.

### Pitfall 2: "No prompt" Sentinel Value

**What goes wrong:** Storing `"No prompt"` as `first_prompt` would display it in the UI, confusing users.

**How to avoid:** Filter `firstPrompt !== 'No prompt'` before storing.

**Warning signs:** SessionDetailPanel shows "No prompt" for sessions that had slash commands or tool-only starts.

### Pitfall 3: summary Column Already Exists — Don't Duplicate in Migration

**What goes wrong:** Adding `summary` to MIGRATION_V4_TO_V5 when it already exists in v1+ schema would cause "duplicate column name" errors — which the migration runner swallows silently via try/catch, but it's confusing.

**How to avoid:** Only add `first_prompt` to the v4→v5 migration. `summary` is already in SCHEMA_DDL and all existing migration paths.

**Verified:** `schema.js` SCHEMA_DDL already contains `summary TEXT` at line 29.

### Pitfall 4: INSERT OR REPLACE Resets imported_at

**What goes wrong:** `upsertSession` uses `INSERT OR REPLACE` which deletes then inserts, resetting `imported_at` to `datetime('now')` on every re-import.

**Impact:** This is pre-existing behavior, not new. Adding `first_prompt` doesn't change this.

**How to avoid:** Don't add `first_prompt` to migration and then also update it separately — just include it in the existing `upsertSession` call.

### Pitfall 5: SessionDetailPanel Grid Layout for Long Text

**What goes wrong:** The current `.detail-value` CSS has `white-space: nowrap` which will ellipsis-truncate summary text. A 200-char summary will be nearly invisible.

**How to avoid:** The Summary row needs `white-space: normal` or a `detail-item--wide` modifier that spans full width. Plan for a CSS class addition to handle this.

### Pitfall 6: Schema v4→v5 Migration Path — ALL Existing Paths Need Updating

**What goes wrong:** `openDatabase()` handles versions 1, 2, 3, and 4 specifically. Adding v5 requires updating ALL existing migration cascades:
- v1 → v2 → v3 → v4 → **v5**
- v2 → v3 → v4 → **v5**
- v3 → v4 → **v5**
- v4 → **v5** (new path)

**Warning signs:** Existing v3 databases get opened at v5 SCHEMA_DDL (which includes `first_prompt`), but the `PRAGMA user_version` gets set correctly. However, if the migration cascade is incomplete, existing DBs stay at v4 schema without `first_prompt` column even though SCHEMA_DDL includes it (because `SCHEMA_DDL` uses `CREATE TABLE IF NOT EXISTS` — it won't alter existing tables).

## Code Examples

### Reading sessions-index.json (verified against actual file format)

```javascript
// Source: verified against /home/meckert/.claude/projects/-home-training-test-1/sessions-index.json
// and /home/meckert/.claude/projects/-home-claude-manager/sessions-index.json

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function readSessionIndex(transcriptDir) {
  const indexPath = join(transcriptDir, 'sessions-index.json');
  if (!existsSync(indexPath)) return new Map();

  let data;
  try {
    const raw = readFileSync(indexPath, 'utf8');
    data = JSON.parse(raw);
  } catch (_err) {
    return new Map();
  }

  const entries = data?.entries;
  if (!Array.isArray(entries)) return new Map();

  const map = new Map();
  for (const entry of entries) {
    if (!entry.sessionId) continue;
    map.set(entry.sessionId, {
      summary:     entry.summary     ?? null,
      // Filter sentinel value — "No prompt" means absent
      firstPrompt: (entry.firstPrompt && entry.firstPrompt !== 'No prompt')
        ? entry.firstPrompt
        : null,
      customTitle: entry.customTitle ?? null,
    });
  }
  return map;
}
```

### Extracting firstPrompt from JSONL (leverages existing extractContentText)

```javascript
// In parseTranscript(), parser.js — add after existing state declarations:
let firstPrompt = null;

// In the per-line loop, after existing metadata checks:
if (!firstPrompt && msg.type === 'user' && !msg.isMeta) {
  const text = extractContentText(msg);  // already exists in parser.js
  const trimmed = text?.trim();
  if (trimmed) {
    firstPrompt = trimmed.slice(0, 200);
  }
}

// Add firstPrompt to return object
return { messages, summary, firstPrompt, customTitle, slug, ... };
```

### upsertSession with first_prompt (diff from existing)

```javascript
// db-writer.js — add first_prompt to column list and values:
INSERT OR REPLACE INTO sessions (
  // ...all existing columns...
  first_prompt    -- ADD
) VALUES (
  // ...all existing values...
  $first_prompt   -- ADD
)

// In stmt.run():
$first_prompt: sessionData.first_prompt ?? null,
```

### SessionDetailPanel summary row (Vue template)

```html
<!-- Add as first item in .detail-grid: -->
<div class="detail-item detail-item--full">
  <span class="detail-label">Summary</span>
  <span class="detail-value detail-value--wrap">
    {{ session?.summary || session?.firstPrompt || '—' }}
  </span>
</div>
```

```css
/* Add to SessionDetailPanel <style scoped>: */
.detail-item--full {
  grid-column: 1 / -1;  /* span all columns */
}

.detail-value--wrap {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Parser tried to extract summary from JSONL | sessions-index.json is the sole source for AI summaries | JSONL never contains summary; sessions-index.json always does for indexed projects |
| No firstPrompt in DB | Extract from JSONL + sessions-index.json, store as first_prompt | Enables fallback label for all sessions |

## Open Questions

1. **firstPrompt truncation length**
   - What we know: 200 chars is the existing plan's recommendation
   - What's unclear: No formal constraint; sessions-index.json firstPrompt entries observed at 80–200 chars
   - Recommendation: 200 chars is reasonable for a label; increase to 500 if full sentence visibility is needed

2. **customTitle field from sessions-index.json**
   - What we know: The `custom_title` column already exists in sessions. The current importer reads `data.customTitle` from JSONL (which never has it). sessions-index.json entries sometimes have `customTitle`.
   - What's unclear: Should Phase 8 also update `custom_title` from the session index?
   - Recommendation: Yes — if `indexEntry.customTitle` exists, use it as the `custom_title` value. This is a small additive change with no new schema work required.

3. **Re-import of already-imported sessions**
   - What we know: The rolling-window import (Phase 7) may skip files based on size/timestamp. Sessions imported before Phase 8 won't get `first_prompt` populated until they're re-imported or a force import runs.
   - Recommendation: This is acceptable for v0.2.0. Sessions-index.json data will be populated on the next import trigger. Document in verification steps.

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `/home/meckert/.claude/projects/-home-training-test-1/sessions-index.json` — format verified
- Direct file inspection: `/home/meckert/.claude/projects/-home-claude-manager/sessions-index.json` — format verified (second example)
- Source code audit: `src/db/schema.js` — confirmed schema v4, confirmed `summary` column exists
- Source code audit: `src/db/index.js` — confirmed migration pattern
- Source code audit: `src/importer/parser.js` — confirmed `extractContentText()` exists, confirmed no firstPrompt extraction today
- Source code audit: `src/importer/db-writer.js` — confirmed upsertSession signature
- Source code audit: `src/importer/index.js` — confirmed importFile flow
- Source code audit: `src/server/routes/timeline.js` — confirmed `summary` already in SELECT and response
- Source code audit: `src/client/components/SessionDetailPanel.vue` — confirmed receives full session object

### Secondary (MEDIUM confidence)
- `.planning/session-summaries-plan.md` — prior investigation findings (mostly confirmed, path correction noted)

## Metadata

**Confidence breakdown:**
- sessions-index.json format: HIGH — verified on two actual files on disk
- Schema migration pattern: HIGH — verified from existing v1→v2→v3→v4 code
- What already exists vs needs building: HIGH — direct code audit
- firstPrompt "No prompt" sentinel: HIGH — observed in actual data
- Path location (transcriptDir, not parent): HIGH — verified with ls and find commands
- UI CSS approach for full-width summary: MEDIUM — pattern is standard CSS grid, not tested

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain — no external dependencies)
