# Plan: Import Session Summaries from sessions-index.json

## Context

When reviewing a day's sessions in the timeline, it's hard to know what each session was about without clicking every bar. Claude Code's `/resume` command shows AI-generated one-sentence summaries for each session, but these summaries are stored in `sessions-index.json` files — NOT in the JSONL transcripts.

**Investigation findings:**
- `~/.claude/projects/{project}/sessions-index.json` contains `summary`, `firstPrompt`, `customTitle` per session
- Only 2/8 projects currently have this file (it's created when `/resume` is used)
- 16/89 imported sessions already have summaries (from the 2 indexed projects)
- The existing `sessions` table already has a `summary` column, and the timeline API already returns it
- The parser extracts `summary` from JSONL but transcripts never contain it — `sessions-index.json` is the sole source
- For sessions without an index, the first user message from the JSONL is a good fallback label

**User decision:** Show summaries in the detail panel only (not bar labels). Import from `sessions-index.json` where available, use `firstPrompt` as fallback.

## Changes

### 1. Add `first_prompt` column to sessions table

**File:** `src/db/schema.js`
- Bump `SCHEMA_VERSION` to 4
- Add `MIGRATION_V3_TO_V4`: `ALTER TABLE sessions ADD COLUMN first_prompt TEXT`
- Update `SCHEMA_DDL` sessions CREATE TABLE to include `first_prompt TEXT`

**File:** `src/db/index.js`
- Import `MIGRATION_V3_TO_V4`, add `migrateV3toV4(db)`, wire cascade

### 2. Read sessions-index.json during import

**File:** `src/importer/session-index.js` (new)
- `readSessionIndex(transcriptDir)` — reads `sessions-index.json` from the parent of transcriptDir (the project dir)
- Returns `Map<sessionId, { summary, firstPrompt, customTitle }>` or empty Map if file doesn't exist
- Path logic: transcriptDir is like `~/.claude/projects/-home-foo/`, index is at same level

### 3. Extract firstPrompt from JSONL as fallback

**File:** `src/importer/parser.js`
- Extract `firstPrompt` in `parseTranscript()`: capture the text content of the first `type: "user"` message (truncated to 200 chars)
- Add to return object

### 4. Merge session index data in importAll()

**File:** `src/importer/index.js`
- Import `readSessionIndex`
- After `discoverProjects()`, call `readSessionIndex(project.transcriptDir)` for each project
- In `importFile()`: pass session index entry so it can merge `summary` (index takes priority over JSONL) and `firstPrompt` (index firstPrompt as primary, parsed firstPrompt as fallback)
- Update `upsertSession` call to include `first_prompt`

**File:** `src/importer/db-writer.js`
- Add `first_prompt` to `upsertSession()` INSERT/VALUES

### 5. Show summary in SessionDetailPanel

**File:** `src/client/components/SessionDetailPanel.vue`
- Add new detail item: "Summary" showing `session.summary || session.firstPrompt || '—'`
- Place it prominently (first or second row in the grid)

### 6. Include firstPrompt in timeline API

**File:** `src/server/routes/timeline.js`
- Add `s.first_prompt` to the SELECT query
- Add `firstPrompt: row.first_prompt` to the session response object

### 7. Build dist

- Run `npm run build`

## Files Modified (8)

1. `src/db/schema.js` — schema v4, migration, DDL
2. `src/db/index.js` — migration wiring
3. `src/importer/session-index.js` — new: read sessions-index.json
4. `src/importer/parser.js` — extract firstPrompt from first user message
5. `src/importer/index.js` — merge session index data during import
6. `src/importer/db-writer.js` — add first_prompt to upsertSession
7. `src/server/routes/timeline.js` — include first_prompt in API response
8. `src/client/components/SessionDetailPanel.vue` — show summary/firstPrompt

## Verification

1. Run `node bin/cli.js`, trigger import
2. Check DB: `SELECT session_id, summary, first_prompt FROM sessions WHERE summary IS NOT NULL LIMIT 5` — should show summaries from indexed projects
3. Check DB: `SELECT session_id, first_prompt FROM sessions WHERE first_prompt IS NOT NULL AND summary IS NULL LIMIT 5` — should show firstPrompt fallbacks
4. Click a session bar in the UI — detail panel should show "Summary" field with either the AI summary or the first prompt text
5. Verify sessions from non-indexed projects show firstPrompt as the summary label
