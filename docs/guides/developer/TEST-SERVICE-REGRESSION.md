# Test: Service Layer Regression (Web UI)

*Extracted from TESTING-V080-PROGRAMMATIC-ACCESS.md and corrected against actual code.*

## Overview

These tests verify the web UI API endpoints still work correctly after the service layer
refactoring. They cover the timeline endpoint, import with SSE, session messages, and
session editing.

## Prerequisites

- Node.js 22 or later installed (`node --version`)
- Repository cloned and dependencies installed (`npm install`)
- At least one previous import completed so the database has session data
- A known date with session data
- `jq` installed for JSON validation
- Frontend built (`npm run build`)

> **Note:** The Node.js SQLite experimental feature warning has been suppressed in the CLI.

Start the web server before running these tests:

```bash
cd /home/claude/cctimereporter
node bin/cli.js &
SERVER_PID=$!
sleep 2
```

---

## Test Cases

### 4.1 Test web UI timeline endpoint

**Test:** The timeline API returns project-grouped session data.

```bash
curl -s "http://127.0.0.1:3847/api/timeline?date=2026-03-27" | jq '{
  date: .date,
  totalSessions: .totalSessions,
  projectCount: (.projects | length),
  schemaMigrated: .schemaMigrated
}'
```

**Expected output:** A JSON object with `date` matching the requested date, `totalSessions`
as a number, a positive `projectCount` (if there is data for that date), and
`schemaMigrated` as a boolean.

**Verify response shape:**

```bash
curl -s "http://127.0.0.1:3847/api/timeline?date=2026-03-27" | jq 'keys'
```

**Expected output:** An array containing keys: `date`, `projects`, `schemaMigrated`,
`totalSessions`.

### 4.2 Test web UI import with SSE progress

**Test:**

```bash
curl -s -N "http://127.0.0.1:3847/api/import/progress?maxAgeDays=2" &
CURL_PID=$!
sleep 10
kill $CURL_PID 2>/dev/null
```

**Expected output:** A stream of SSE events (`data: {...}`) showing import progress with
`phase`, `processed`, and `total` fields. The stream ends with a `done` event containing
the import result.

Alternatively, trigger a non-streaming import:

```bash
curl -s -X POST "http://127.0.0.1:3847/api/import?maxAgeDays=2" | jq '.filesProcessed'
```

**Expected output:** A number.

### 4.3 Test session messages endpoint

**Prerequisites:** Get a session ID.

```bash
SESSION_ID=$(curl -s "http://127.0.0.1:3847/api/timeline?date=2026-03-27" | jq -r '.projects[0].sessions[0].sessionId')
echo "Session: $SESSION_ID"
```

**Test:**

```bash
curl -s "http://127.0.0.1:3847/api/sessions/$SESSION_ID/messages" | jq '{totalCount, messageCount: (.messages | length)}'
```

**Expected output:** A JSON object with `totalCount` and `messageCount`. The `messageCount`
should be at most 20 (head+tail truncation).

### 4.4 Test session editing (PATCH)

**Prerequisites:** Get a session ID from test 4.3.

**Test -- set a user label:**

The PATCH body uses camelCase field names (`userLabel`, not `user_label`). The response
is `{"ok": true}` on success -- it does not echo back the field values.

```bash
curl -s -X PATCH "http://127.0.0.1:3847/api/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"userLabel": "test-label-v080"}' | jq '.'
```

**Expected output:** `{"ok": true}`

**Verify persistence via the timeline endpoint:**

```bash
curl -s "http://127.0.0.1:3847/api/timeline?date=2026-03-27" | jq --arg sid "$SESSION_ID" \
  '[.projects[].sessions[] | select(.sessionId == $sid) | .userLabel][0]'
```

**Expected output:** `"test-label-v080"`

**Clean up the test label:**

```bash
curl -s -X PATCH "http://127.0.0.1:3847/api/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"userLabel": null}' | jq '.'
```

**Expected output:** `{"ok": true}`

### 4.5 Test web UI serves static files

**Test:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3847/
```

**Expected output:** `200` (or `302` redirecting to `/timeline`).

### Cleanup

Stop the server when all tests are complete:

```bash
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
```

---

## Troubleshooting

### Import shows 0 files processed

**Symptom:** The import command runs but reports `filesProcessed: 0`.
**Cause:** No Claude Code session files exist within the import window, or the
`~/.claude/projects/` directory does not exist.
**Solution:** Use `--all` to import all history, or verify that `~/.claude/projects/`
contains JSONL transcript files.

### MCP commands return empty or error

**Symptom:** MCP tool calls return empty results or parse errors.
**Cause:** The JSON-RPC messages may be malformed, or the `initialize` handshake was
skipped.
**Solution:** Ensure you always send the `initialize` request first, followed by
`notifications/initialized`, before calling any tools. Check that the JSON is valid
(no trailing commas, proper quoting).

### Port 3847 already in use

**Symptom:** Server fails to start or uses a different port.
**Cause:** Another process (possibly a previous test) is using port 3847.
**Solution:** The server automatically tries ports 3847-3856. Check which process holds
the port:

```bash
lsof -i :3847
```

Kill the stale process or use the `stop_server` MCP tool to clean up.

### Exit code 2 when not expected

**Symptom:** Import exits with code 2 unexpectedly.
**Cause:** A previous import process crashed and left a stale lock in the database.
**Solution:** The lock system auto-reclaims stale locks (dead PIDs), but if the PID was
reused by another process, manual cleanup is needed:

```bash
node -e "
  const { openDatabase } = await import('./src/db/index.js');
  const { db } = openDatabase();
  db.prepare('DELETE FROM process_locks WHERE lock_name = ?').run('import');
  console.log('Import lock cleared');
  db.close();
"
```
