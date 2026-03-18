# Phase 19: Schema, Import, and API Contract - Research

**Researched:** 2026-03-17
**Domain:** SQLite schema migration, JSONL parser extension, API contract definition
**Confidence:** HIGH

## Summary

This phase has three tightly-scoped tasks that build directly on existing codebase patterns. All three are low-ambiguity: the schema migration approach is already established (v1→v6 chain), the slash command format is documented and a parser already exists, and the API contract design has a clear prior art in `timeline.js`.

The migration adds a single `command TEXT` column to the messages table (v6→v7). The parser must detect slash commands in user messages and propagate the command name (without arguments) to the message objects that `insertMessages()` stores. The API contract defines a segment-aware response shape for `GET /api/timeline` that phases 20, 21, and 22 can code against before the segment derivation logic exists.

One key constraint: `insertMessages()` uses `INSERT OR IGNORE`, so existing message rows will NOT gain a `command` value until a session is re-imported. This is intentional and documented in the decisions.

**Primary recommendation:** Follow all existing patterns exactly. No new libraries, no new utilities. The command detection logic is a small extension of what `parseCommandXml()` and `extractContentText()` already do.

## Standard Stack

No new dependencies for this phase. Everything uses what is already in the project.

### Core (already present)
| Component | Version | Purpose |
|-----------|---------|---------|
| `node:sqlite` (DatabaseSync) | Node 22 built-in | Schema migration and message inserts |
| `src/utils/parse-command-xml.js` | project | Already parses slash command XML — use it for command detection |
| `src/importer/parser.js` | project | Extend to emit `command` field on message objects |
| `src/importer/db-writer.js` | project | Extend `insertMessages()` to accept and store `command` |
| `src/db/schema.js` | project | Add `MIGRATION_V6_TO_V7` constant |
| `src/db/index.js` | project | Add v6→v7 migration path |

## Architecture Patterns

### Pattern 1: Schema Migration (v6→v7)

**What:** Add `command TEXT` column to messages table, bump `SCHEMA_VERSION` to 7.

**How the existing chain works:**
1. `schema.js` exports `SCHEMA_VERSION = 6` and named `MIGRATION_Vn_TO_Vm` string constants
2. `index.js` imports each migration constant, defines `migrateVntoVm(db)` functions, and the `openDatabase()` switch handles every version from 1 upward
3. Each migration string contains semicolon-separated ALTER TABLE statements run via `runMigration(db, sql)`, which wraps each statement individually in try/catch (SQLite has no `ADD COLUMN IF NOT EXISTS`)
4. After migrations, `PRAGMA user_version = ${SCHEMA_VERSION}` is set

**What must change in `schema.js`:**
```javascript
// Source: src/db/schema.js (existing pattern)
export const SCHEMA_VERSION = 7;  // bump from 6

// New at bottom of file:
export const MIGRATION_V6_TO_V7 = `
ALTER TABLE messages ADD COLUMN command TEXT;
`;
```

**SCHEMA_DDL does NOT need updating** — it is only used for fresh databases (CREATE IF NOT EXISTS), and the messages table DDL there will stay at v6 shape. Fresh installs start at v0 and go directly to `PRAGMA user_version = 7` after DDL + migration chain. However, to keep fresh DBs in sync, the `command TEXT` column should be added to the `CREATE TABLE messages` block in `SCHEMA_DDL` as well, otherwise fresh installs will have the column only after the migration runs. Looking at the existing pattern: `openDatabase()` always applies `SCHEMA_DDL` (which uses `CREATE IF NOT EXISTS`) AND then sets `user_version = SCHEMA_VERSION`. For version 0 (fresh), DDL is applied then version is set to 7. So **`SCHEMA_DDL` must include `command TEXT`** in the messages table for fresh installs to be correct.

**What must change in `index.js`:**
```javascript
// Source: src/db/index.js (existing pattern)
import { ..., MIGRATION_V5_TO_V6, MIGRATION_V6_TO_V7 } from './schema.js';

function migrateV6toV7(db) {
  runMigration(db, MIGRATION_V6_TO_V7);
}

// In openDatabase(), add to each branch:
// existingVersion === 1: add migrateV6toV7(db)
// existingVersion === 2: add migrateV6toV7(db)
// existingVersion === 3: add migrateV6toV7(db)
// existingVersion === 4: add migrateV6toV7(db)
// existingVersion === 5: add migrateV6toV7(db)
// NEW branch:
} else if (existingVersion === 6) {
  migrateV6toV7(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
```

### Pattern 2: Slash Command Detection in Parser

**What:** For each `user` message in the JSONL stream, check if its text content is a slash command. If so, emit the command name (without leading `/`) as the `command` field on the message object.

**Slash command format in JSONL (from `references/claude-transcript-schema.md` and `parse-command-xml.js`):**

Slash commands appear in two forms in user message content:
1. **XML format** (majority): `<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>`
2. **Plain text format** (rare/legacy): just `/clear` as the message text

The existing `parseCommandXml()` function in `src/utils/parse-command-xml.js` already handles form 1 and returns a string like `"/clear"` or `"/gsd:execute-phase 7"`. The parser already calls `parseCommandXml()` for the `firstPrompt` path.

**What the command detection function needs to do:**
- Input: a `user` message's text content (string from `extractContentText(msg.rawMessage)`)
- Output: command name string (e.g. `'clear'`, `'rename'`, `'gsd:execute-phase'`) or `null`
- Strip the leading `/` for storage — just the name
- Works for XML format via `parseCommandXml()`
- Works for plain text `/command` via simple regex fallback

**Detection logic to add in `parser.js`:**
```javascript
// Source: src/utils/parse-command-xml.js (parseCommandXml already exists)
// and src/importer/parser.js (extractContentText already exists)

function detectCommand(rawMsg) {
  if (rawMsg?.type !== 'user' || rawMsg?.isMeta) return null;
  const text = extractContentText(rawMsg)?.trim();
  if (!text) return null;

  // XML format: <command-name>/clear</command-name>...
  const parsed = parseCommandXml(text);
  if (parsed) {
    // parseCommandXml returns "/command args" — extract just the command name
    const nameWithSlash = parsed.split(' ')[0]; // "/clear" or "/gsd:execute-phase"
    return nameWithSlash.startsWith('/') ? nameWithSlash.slice(1) : nameWithSlash;
  }

  // Plain text format: message is just "/command" or "/command args"
  const plainMatch = text.match(/^\/([a-zA-Z][a-zA-Z0-9:_-]*)/);
  if (plainMatch) return plainMatch[1];

  return null;
}
```

**Where it hooks into `parseTranscript()` in `parser.js`:** When building the message objects array (lines 114-129), add `command: detectCommand(msg)` to the normalized message object.

**The normalized message object gains one field:**
```javascript
messages.push({
  uuid: msg.uuid || `line-${lineNum}`,
  type: msg.type,
  // ... existing fields ...
  command: detectCommand(msg),  // NEW: null for non-command messages
});
```

### Pattern 3: db-writer.js — insertMessages() Extension

**What:** Add `command` to the INSERT statement and the per-message parameter mapping.

**The INSERT OR IGNORE constraint:** Because `insertMessages()` uses `INSERT OR IGNORE` on the `UNIQUE(session_id, uuid)` constraint, existing rows already in the database will NOT be updated when `command` is added. Re-importing a session (which happens when the file size changes or `--force` is used) will delete-and-reinsert via the session upsert, but messages for unchanged sessions will remain NULL. This is the expected behavior per the decisions.

**Change to `insertMessages()`:**
```javascript
// Source: src/importer/db-writer.js (current insertMessages pattern)
const stmt = db.prepare(`
  INSERT OR IGNORE INTO messages (
    session_id, uuid, type, subtype, timestamp,
    parent_uuid, git_branch, is_meta, is_sidechain, is_fork_branch,
    command  -- NEW
  ) VALUES (
    $session_id, $uuid, $type, $subtype, $timestamp,
    $parent_uuid, $git_branch, $is_meta, $is_sidechain, $is_fork_branch,
    $command  -- NEW
  )
`);

// In per-message loop:
stmt.run({
  // ... existing params ...
  $command: msg.command ?? null,  // NEW
});
```

**Change to `importFile()` in `src/importer/index.js`:** The `messagesForDb` mapping (lines 330-340) must pass `command` through:
```javascript
const messagesForDb = messages.map(msg => ({
  uuid:           msg.uuid,
  type:           msg.type,
  subtype:        msg.subtype,
  timestamp:      msg.timestamp,
  parent_uuid:    msg.parentUuid,
  git_branch:     msg.gitBranch,
  is_meta:        msg.isMeta ? 1 : 0,
  is_sidechain:   msg.isSidechain ? 1 : 0,
  is_fork_branch: forkData.forkBranchUuids.has(msg.uuid) ? 1 : 0,
  command:        msg.command ?? null,  // NEW
}));
```

Note: agent file messages (the `agentToImport` path in `importAll`) also call `insertMessages()` and will need `command` passed similarly if agent sessions can contain slash commands. For completeness, the agent message mapping should also include `command`.

### Pattern 4: API Contract for Segment-Aware Timeline Response

**What:** Define the shape that `GET /api/timeline` will return once Phase 20 adds segment derivation. Document this as the contract Phases 21 and 22 code against.

**Design constraints from decisions:**
- Segment IDs: `${sessionId}:${N}` suffix format (e.g. `"abc123:0"`, `"abc123:1"`)
- Overnight clipping happens before segment splitting
- `/clear` message itself excluded from both adjacent segments
- Sessions without any `/clear` produce exactly one segment (N=0), keeping the same `sessionId` prefix
- Response shape must minimize frontend changes — sessions become segments, segments have the same fields sessions have today plus a few new ones

**Current `GET /api/timeline` response shape (from `timeline.js`):**
```json
{
  "date": "YYYY-MM-DD",
  "totalSessions": 42,
  "projects": [
    {
      "projectId": 1,
      "projectPath": "/home/user/project",
      "displayName": "project",
      "sessions": [
        {
          "sessionId": "uuid-string",
          "startTime": "ISO8601",
          "endTime": "ISO8601",
          "continuesFromPrevDay": false,
          "continuesIntoNextDay": false,
          "workingTimeMs": 12345,
          "idleGaps": [{"start": "ISO8601", "end": "ISO8601"}],
          "ticket": "PROJ-123",
          "branch": "feature/foo",
          "summary": "string",
          "firstPrompt": "string",
          "customTitle": "string",
          "userLabel": "string",
          "userTicket": "string",
          "messageCount": 45,
          "userMessageCount": 12,
          "forkCount": 0,
          "realForkCount": 0
        }
      ]
    }
  ]
}
```

**Proposed segment-aware shape (v0.6.0 contract):**

The key insight is to rename `sessions` to `segments` in the response and change each session object to a segment object. The segment ID replaces `sessionId`. The session ID is retained separately for use by the sessions API (detail panel, message modal). Sessions without `/clear` produce a single segment where `segmentIndex: 0` and `isSplit: false`.

```json
{
  "date": "YYYY-MM-DD",
  "totalSessions": 42,
  "projects": [
    {
      "projectId": 1,
      "projectPath": "/home/user/project",
      "displayName": "project",
      "segments": [
        {
          "segmentId": "uuid-string:0",
          "sessionId": "uuid-string",
          "segmentIndex": 0,
          "isSplit": false,
          "startTime": "ISO8601",
          "endTime": "ISO8601",
          "continuesFromPrevDay": false,
          "continuesIntoNextDay": false,
          "workingTimeMs": 12345,
          "idleGaps": [{"start": "ISO8601", "end": "ISO8601"}],
          "ticket": "PROJ-123",
          "branch": "feature/foo",
          "summary": "string",
          "firstPrompt": "string",
          "customTitle": "string",
          "userLabel": "string",
          "userTicket": "string",
          "messageCount": 45,
          "userMessageCount": 12,
          "forkCount": 0,
          "realForkCount": 0
        }
      ]
    }
  ]
}
```

**Field differences from current shape:**
| Old field | New field | Notes |
|-----------|-----------|-------|
| `sessionId` | `sessionId` (kept) + `segmentId` (new) | Both present: `sessionId` for API calls, `segmentId` for Gantt rendering |
| _(new)_ | `segmentIndex` | 0-based segment number within session |
| _(new)_ | `isSplit` | `true` if session has >1 segment; `false` for unsplit sessions |
| `sessions[]` | `segments[]` | Array rename on project object |

**Why this shape minimizes frontend changes:**
- All existing session fields are preserved in-place — components that read `ticket`, `branch`, `summary`, etc. need no changes
- `sessionId` remains for the detail panel and messages API which use session IDs
- The only breaking change is `sessions` → `segments` on the project object
- Components can check `isSplit` to decide whether to render a split indicator
- The `segmentId` is the stable rendering key (replaces `sessionId` as the `:key` in v-for)

**Where to document the contract:** A dedicated file at `src/server/routes/timeline-contract.md` or inline as a JSDoc comment block at the top of `timeline.js` before the route function. Given that this contract is consumed by 3 parallel phases, a standalone doc file is clearer. However, the decision is left to Claude's discretion — both approaches work.

### Anti-Patterns to Avoid

- **Don't update `SCHEMA_DDL` without also adding migration:** Fresh installs will get the column from DDL; upgraded installs need the ALTER TABLE migration. Both must be in sync.
- **Don't use `INSERT OR REPLACE` for messages:** The existing INSERT OR IGNORE is intentional (preserves idempotency). Switching to OR REPLACE would break the established import model.
- **Don't backfill `command` in the migration:** The decision is explicit: no backfill, NULL until re-import. Don't add an `UPDATE messages SET command = ...` in the migration.
- **Don't rename `sessionId` to `segmentId` in the response:** Both must coexist. The sessions API endpoints (`/api/sessions/:id/messages`, `PATCH /api/sessions/:id`) use session IDs. If the frontend only had `segmentId`, it couldn't call those APIs without parsing out the session ID.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XML slash command parsing | New XML parser | `parseCommandXml()` (already exists) | It already handles `<command-name>`, `<command-message>`, `<command-args>` correctly |
| Content text extraction | New content walker | `extractContentText()` (already in parser.js) | Handles string and array content forms, already imported in parser.js |
| Migration transaction handling | Custom transaction | `runMigration()` (already in index.js) | Already wraps in BEGIN/COMMIT with per-statement try/catch for duplicate column |

## Common Pitfalls

### Pitfall 1: SCHEMA_DDL Not Updated for Fresh Installs
**What goes wrong:** Only the migration SQL is updated, not the `SCHEMA_DDL` string. New installations (version 0) apply DDL and then set `user_version = 7`. If DDL doesn't have `command TEXT`, fresh installs will be missing the column until the v6→v7 migration runs — but the migration only runs for `existingVersion === 6`, not version 0 installs.
**How to avoid:** Add `command TEXT` to the `CREATE TABLE messages` block inside `SCHEMA_DDL`, and add `MIGRATION_V6_TO_V7` for the `existingVersion === 6` upgrade path.
**Warning signs:** Fresh install test shows messages table without `command` column.

### Pitfall 2: Command Not Propagated Through importFile() Mapping
**What goes wrong:** Parser emits `command` on message objects, db-writer accepts `$command`, but the mapping in `importFile()` (lines 330-340 of `index.js`) doesn't include `command:` in the `messagesForDb` array. The column gets `NULL` for everything.
**How to avoid:** Check all three places: parser output, db-writer parameter list, and the `importFile()` mapping.
**Warning signs:** After re-import, `/clear` messages still have NULL in `command` column.

### Pitfall 3: Agent Message Path Missing command
**What goes wrong:** Regular transcript files get `command` populated, but agent subagent files (the `agentToImport` path in `importAll()`) build their message objects separately (lines 538-549) and won't include `command` if only the main path is updated.
**How to avoid:** Update both message-building code paths in `importAll()`.
**Warning signs:** Agent session messages always have NULL even after re-import.

### Pitfall 4: parseCommandXml Returns Full Command Including Arguments
**What goes wrong:** `parseCommandXml()` returns `"/gsd:execute-phase 7"` (with args). If stored directly, the `command` column would contain `"gsd:execute-phase 7"` instead of `"gsd:execute-phase"`.
**How to avoid:** Split on space and take `[0]`, then strip the leading `/`. Example: `"/gsd:execute-phase 7".split(' ')[0].slice(1)` → `"gsd:execute-phase"`.
**Warning signs:** SELECT DISTINCT command FROM messages shows values with spaces or arguments.

### Pitfall 5: API Contract Shape Change Breaks Existing Frontend
**What goes wrong:** If `sessions[]` is renamed to `segments[]` before Phase 21 (Gantt UI update) is deployed, the existing frontend will stop rendering sessions.
**How to avoid:** Phase 20 (backend segment derivation) and Phase 21 (frontend Gantt update) must be deployed together, or the contract must include a compatibility shim during transition.
**Warning signs:** Timeline shows empty project rows after deploying Phase 20.

## Code Examples

### Migration constant (schema.js)
```javascript
// Source: src/db/schema.js — follows exact pattern of MIGRATION_V5_TO_V6
export const MIGRATION_V6_TO_V7 = `
ALTER TABLE messages ADD COLUMN command TEXT;
`;
```

### runMigration call (index.js)
```javascript
// Source: src/db/index.js — follows exact pattern of migrateV5toV6
function migrateV6toV7(db) {
  runMigration(db, MIGRATION_V6_TO_V7);
}

// In openDatabase(), new branch:
} else if (existingVersion === 6) {
  migrateV6toV7(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
```

### Command detection (add to parser.js)
```javascript
// Source: src/importer/parser.js — uses existing parseCommandXml and extractContentText
import { parseCommandXml } from '../utils/parse-command-xml.js';

/**
 * Detect a slash command in a user message.
 * Returns the command name without leading slash, or null.
 *
 * @param {object} rawMsg - The full JSONL line object
 * @returns {string|null}
 */
function detectCommand(rawMsg) {
  if (rawMsg?.type !== 'user' || rawMsg?.isMeta) return null;
  const text = extractContentText(rawMsg)?.trim();
  if (!text) return null;

  // XML format: <command-name>/clear</command-name>
  const parsed = parseCommandXml(text);
  if (parsed) {
    const nameWithSlash = parsed.split(' ')[0];
    return nameWithSlash.startsWith('/') ? nameWithSlash.slice(1) : nameWithSlash;
  }

  // Plain text format: "/command" or "/command args"
  const plainMatch = text.match(/^\/([a-zA-Z][a-zA-Z0-9:_-]*)/);
  if (plainMatch) return plainMatch[1];

  return null;
}
```

### insertMessages addition (db-writer.js)
```javascript
// Source: src/importer/db-writer.js — add command to INSERT and .run() call
INSERT OR IGNORE INTO messages (
  session_id, uuid, type, subtype, timestamp,
  parent_uuid, git_branch, is_meta, is_sidechain, is_fork_branch,
  command
) VALUES (
  $session_id, $uuid, $type, $subtype, $timestamp,
  $parent_uuid, $git_branch, $is_meta, $is_sidechain, $is_fork_branch,
  $command
)

// In loop:
stmt.run({
  // existing fields...
  $command: msg.command ?? null,
});
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Sessions array in timeline response | Segments array (v0.6.0) | Rename + add segmentId/segmentIndex/isSplit |
| No command tracking | `command TEXT` column on messages | General-purpose, not just /clear |

## Open Questions

1. **SCHEMA_DDL vs migration for fresh installs**
   - What we know: `openDatabase()` always runs `db.exec(SCHEMA_DDL)` regardless of version, then sets `user_version`. For version 0, no migration functions run.
   - What's unclear: Does `db.exec(SCHEMA_DDL)` run before or after the `PRAGMA user_version` check? Looking at the code: the check happens BEFORE `db.exec(SCHEMA_DDL)` (line 89 vs line 141). So for fresh installs: DDL runs at line 141, version set at line 143.
   - Recommendation: Update `SCHEMA_DDL` to include `command TEXT` in messages DDL. This is the clear path.

2. **Contract doc file vs inline comments**
   - Both work. A file at `.planning/phases/19-schema-import-contract/API-CONTRACT.md` or `src/server/routes/TIMELINE-API-CONTRACT.md` would be most visible to the planner writing phases 20-22.
   - Recommendation: Create a contract doc at `src/server/routes/timeline-contract.md` (co-located with the implementation). This is where Phase 20 implementors will look.

3. **`isSplit` field naming**
   - `isSplit: true` indicates the parent session was split by `/clear`. An alternative is `splitCount: N` (how many splits). `isSplit` boolean is simpler and sufficient for Phase 21's display logic.
   - Recommendation: Use `isSplit` boolean. Phase 21 can show a visual indicator; it doesn't need the exact count.

## Sources

### Primary (HIGH confidence)
- `src/db/schema.js` — Full DDL, all migration constants, SCHEMA_VERSION
- `src/db/index.js` — Migration chain, openDatabase() control flow
- `src/importer/parser.js` — Message object shape, extractContentText, parseCommandXml usage
- `src/importer/db-writer.js` — insertMessages() INSERT OR IGNORE pattern
- `src/importer/index.js` — importFile() messagesForDb mapping, agent path
- `src/server/routes/timeline.js` — Current API response shape (verified in code)
- `src/utils/parse-command-xml.js` — parseCommandXml return format (verified in code)
- `references/claude-transcript-schema.md` — JSONL slash command format (local reference doc)

### Secondary (MEDIUM confidence)
- `.planning/phases/19-schema-import-contract/19-CONTEXT.md` — Decisions made by user

## Metadata

**Confidence breakdown:**
- Schema migration: HIGH — exact pattern verified in 6 prior migrations
- Parser extension: HIGH — existing function handles XML format, plain text is trivial regex
- db-writer extension: HIGH — adding one column to established INSERT follows exact prior pattern
- API contract shape: HIGH — based on reading current response shape + decisions
- Slash command JSONL format: HIGH — documented in transcript schema reference + parse-command-xml.js already handles it

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable internal codebase, no external dependencies added)
