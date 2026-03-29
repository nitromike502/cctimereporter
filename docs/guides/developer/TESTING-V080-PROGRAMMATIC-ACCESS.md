# How to test the v0.8.0 programmatic data access features

*Last updated: 2026-03-27*

## Overview

This guide explains how to verify that all v0.8.0 features of CC Time Reporter work correctly. The v0.8.0 release adds CLI subcommands for JSON output, an MCP server for AI agent integration, and multi-instance coordination. These tests cover the CLI, MCP server, coordination layer, and backward compatibility with the existing web UI.

## Prerequisites

Before you begin, ensure you have:

- Node.js 22 or later installed (`node --version`)
- The repository cloned and dependencies installed (`npm install`)
- At least one previous import completed so the database has session data
- A known date with session data (run `node bin/cli.js summary` to find one)
- `jq` installed for JSON validation (optional but recommended)
- Two terminal windows available for multi-instance tests

If you have no data yet, run an initial import first:

```bash
cd /home/claude/cctimereporter
node bin/cli.js import --all
```

Note a date from the output that has sessions. The examples below use `2026-03-27` -- replace with your own date.

---

## Section 1: CLI subcommands

### 1.1 Verify --help output

**Test:** The top-level help shows all subcommands including `summary`, `sessions`, `import`, and `serve`.

```bash
node bin/cli.js --help
```

**Expected output:** You should see a usage line with `[command]` and a list of commands that includes `summary`, `sessions`, `import`, and `serve`. The `serve` command is the default.

**Verify success:** All four subcommands appear in the output.

### 1.2 Verify subcommand help

**Test:** Each subcommand has its own `--help` with options.

```bash
node bin/cli.js summary --help
node bin/cli.js sessions --help
node bin/cli.js import --help
```

**Expected output:** Each command shows its description and options. `summary` and `sessions` show `--date`, `--pretty`, and `--idle` options. `import` shows `--days`, `--all`, and `--pretty` options.

### 1.3 Verify --version

**Test:** The `--version` flag prints the version from `package.json`.

```bash
node bin/cli.js --version
```

**Expected output:** The version string (e.g., `0.8.0`). Confirm it matches:

```bash
node -e "console.log(require('./package.json').version)"
```

### 1.4 Test summary with a known date

**Test:** The `summary` command outputs valid JSON with working time fields.

```bash
node bin/cli.js summary --date 2026-03-27
```

**Expected output:** A single JSON object on stdout containing:
- `date` field matching the requested date
- `totalWorkingTimeMs` (number)
- `totalWorkingTime` (human-readable string like `"2h 15m"`)
- `byTicket` array (each entry has `ticket`, `workingTimeMs`, `workingTime`, `sessions`)
- `unticketedSessions` array

**Verify with jq:**

```bash
node bin/cli.js summary --date 2026-03-27 | jq '.totalWorkingTime'
```

This should print a quoted string like `"2h 15m"`. If jq errors, the output is not valid JSON.

### 1.5 Test summary with --pretty flag

**Test:** The `--pretty` flag produces indented JSON output.

```bash
node bin/cli.js summary --date 2026-03-27 --pretty
```

**Expected output:** The same JSON as test 1.4 but formatted with 2-space indentation across multiple lines.

**Verify:** The output should span many lines. Compare line count:

```bash
COMPACT=$(node bin/cli.js summary --date 2026-03-27 | wc -l)
PRETTY=$(node bin/cli.js summary --date 2026-03-27 --pretty | wc -l)
echo "Compact: $COMPACT lines, Pretty: $PRETTY lines"
```

The compact output should be 1 line; the pretty output should be many lines.

### 1.6 Test summary defaults to today

**Test:** Omitting `--date` uses today's date.

```bash
node bin/cli.js summary --pretty | head -5
```

**Expected output:** The JSON `date` field should be today's date (`2026-03-27` or whatever today is). If there is no data for today, the output is still valid JSON but with empty arrays and zero working time.

### 1.7 Test sessions with a known date

**Test:** The `sessions` command outputs a JSON array of sessions.

```bash
node bin/cli.js sessions --date 2026-03-27
```

**Expected output:** A JSON array where each element has:
- `sessionId` (UUID string)
- `startTime` and `endTime` (ISO datetime strings)
- `workingTimeMs` (number)
- `workingTime` (human-readable string)
- `projectPath` or `projectName`

**Verify with jq:**

```bash
node bin/cli.js sessions --date 2026-03-27 | jq '.[0].sessionId'
```

This should print a quoted UUID string.

### 1.8 Test sessions sorted by start time

**Test:** Sessions are sorted chronologically.

```bash
node bin/cli.js sessions --date 2026-03-27 | jq '[.[].startTime]'
```

**Expected output:** An array of timestamps in ascending order.

### 1.9 Test import with default days

**Test:** The `import` command runs with the default 2-day window, shows progress on stderr, and prints JSON result on stdout.

```bash
node bin/cli.js import 2>/tmp/import-stderr.txt
cat /tmp/import-stderr.txt
```

**Expected output:**
- stderr (`/tmp/import-stderr.txt`): Contains `Discovering files...` and `Importing: N/M...` progress lines
- stdout: A JSON object with `projectsFound`, `filesProcessed`, `filesSkipped`, `totalMessages`, and `errors` fields

**Verify JSON on stdout:**

```bash
node bin/cli.js import 2>/dev/null | jq '.filesProcessed'
```

This should print a number.

### 1.10 Test import --all

**Test:** The `--all` flag imports all history without a day limit.

```bash
node bin/cli.js import --all --pretty 2>/dev/null
```

**Expected output:** A pretty-printed JSON result. The `filesProcessed` count should be equal to or greater than the count from test 1.9.

### 1.11 Test import --days

**Test:** The `--days` flag controls the import window.

```bash
node bin/cli.js import --days 7 2>/dev/null | jq '.filesProcessed'
```

**Expected output:** A number. With `--days 7`, the count should be equal to or greater than the default `--days 2` count.

### 1.12 Test invalid date format

**Test:** Passing a malformed date does not crash and produces a meaningful result.

```bash
node bin/cli.js summary --date "not-a-date" --pretty
```

**Expected output:** The command should still produce valid JSON. The output may have zero working time and empty arrays since no sessions match the invalid date. The exit code should be 0 (the command handles bad dates gracefully by returning empty results rather than erroring).

### 1.13 Test import conflict (exit code 2)

**Prerequisites:** This test requires two terminal windows.

**Terminal 1 -- start a long import:**

```bash
node bin/cli.js import --all
```

**Terminal 2 -- attempt concurrent import while Terminal 1 is still running:**

```bash
node bin/cli.js import; echo "Exit code: $?"
```

**Expected output (Terminal 2):**
- stderr: A message like `Import already running (PID XXXXX via cli, started Xs ago). Wait for it to finish or kill the process.`
- Exit code: `2`

### 1.14 Test no-args starts web server (backward compatibility)

**Test:** Running the CLI with no arguments starts the web server.

```bash
node bin/cli.js &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:3847/api/projects | jq '.projects | length'
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
```

**Expected output:** A number representing the count of projects. The server should start, respond to API requests, and shut down cleanly.

### 1.15 Test custom idle threshold

**Test:** The `--idle` option changes the working time calculation.

```bash
SHORT=$(node bin/cli.js summary --date 2026-03-27 --idle 5 | jq '.totalWorkingTimeMs')
LONG=$(node bin/cli.js summary --date 2026-03-27 --idle 30 | jq '.totalWorkingTimeMs')
echo "5min threshold: $SHORT ms, 30min threshold: $LONG ms"
```

**Expected output:** The working time with a 30-minute idle threshold should be greater than or equal to the working time with a 5-minute threshold (a longer threshold consolidates more gaps into working time).

---

## Section 2: MCP server

The MCP server uses the Model Context Protocol over stdio. To test it, you send JSON-RPC messages to stdin and read responses from stdout. The examples below use a helper pattern with `echo` and a subshell.

> **Note:** MCP mode owns stdio. All diagnostic output is suppressed. The server communicates exclusively via JSON-RPC over stdin/stdout.

### 2.1 Verify --mcp flag starts the server

**Test:** The `--mcp` flag starts an MCP server that responds to the `initialize` handshake.

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | head -1 | jq '.result.serverInfo'
```

**Expected output:** A JSON object with `name: "cctimereporter"` and a `version` string.

### 2.2 List available tools

**Test:** After initialization, the `tools/list` method returns all 8 tools.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '[.result.tools[].name] | sort'
```

**Expected output:** A sorted JSON array of 8 tool names:

```json
["get_dates","get_day_summary","get_session_messages","get_sessions","server_status","start_server","stop_server","trigger_import"]
```

### 2.3 Test get_dates

**Test:** The `get_dates` tool returns an array of dates with session data.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_dates","arguments":{}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | .dates[:5]'
```

**Expected output:** An array of up to 5 date strings in `YYYY-MM-DD` format, sorted descending (most recent first).

### 2.4 Test get_day_summary

**Test:** The `get_day_summary` tool returns a working time summary for a date.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_day_summary","arguments":{"date":"2026-03-27"}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | {date, totalWorkingTime}'
```

**Expected output:** A JSON object with `date` and `totalWorkingTime` fields. The `totalWorkingTime` should be a human-readable string like `"2h 15m"`.

### 2.5 Test get_sessions

**Test:** The `get_sessions` tool returns project-grouped session data.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_sessions","arguments":{"date":"2026-03-27"}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | .[0] | keys'
```

**Expected output:** An array of keys from the first project object, which should include fields like `projectPath`, `projectName`, `displayName`, and `sessions`.

### 2.6 Test get_session_messages

**Prerequisites:** You need a valid session ID. Get one from the `sessions` command:

```bash
SESSION_ID=$(node bin/cli.js sessions --date 2026-03-27 | jq -r '.[0].sessionId')
echo "Using session: $SESSION_ID"
```

**Test:**

```bash
SESSION_ID=$(node bin/cli.js sessions --date 2026-03-27 | jq -r '.[0].sessionId')
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_session_messages","arguments":{"session_id":"'"$SESSION_ID"'"}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | {totalCount, messageCount: (.messages | length)}'
```

**Expected output:** A JSON object with `totalCount` (total messages in the session) and `messageCount` (number returned, up to 20 with head+tail truncation).

### 2.7 Test get_session_messages with invalid ID

**Test:** Requesting messages for a nonexistent session returns an error.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_session_messages","arguments":{"session_id":"00000000-0000-0000-0000-000000000000"}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"error": "not_found", "message": "Session not found"}` and the `isError` flag is `true` on the result envelope.

### 2.8 Test trigger_import

**Test:** The `trigger_import` tool runs an import and returns stats.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trigger_import","arguments":{}}}\n' | \
  timeout 30 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | {ok, filesProcessed}'
```

**Expected output:** `{"ok": true, "filesProcessed": N}` where N is a number.

### 2.9 Test trigger_import conflict

**Prerequisites:** Two terminal windows.

**Terminal 1 -- start a long import via CLI:**

```bash
node bin/cli.js import --all
```

**Terminal 2 -- attempt MCP import while Terminal 1 is running:**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trigger_import","arguments":{}}}\n' | \
  timeout 10 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"error": "already_running", "message": "Import already running ..."}` with `isError: true`.

### 2.10 Test server_status when no server running

**Prerequisites:** Ensure no cctimereporter web server is running (`pkill -f "node bin/cli.js" 2>/dev/null` if needed).

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"server_status","arguments":{}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"running": false}`

### 2.11 Test start_server

**Prerequisites:** No web server running.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"start_server","arguments":{}}}\n' | \
  timeout 10 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"status": "started", "url": "http://127.0.0.1:3847"}` (port may vary if 3847 is in use).

**Verify the server is actually running:**

```bash
curl -s http://127.0.0.1:3847/api/projects | jq '.projects | length'
```

> **Note:** The MCP process exits when stdin closes (end of the printf pipe), which triggers `cleanupMcpServer` and stops the Fastify instance it started. To keep it running for verification, you would need to hold stdin open. For a quick integration test, verify by checking the `server_status` tool in the same MCP session instead.

### 2.12 Test start_server when already running

**Prerequisites:** Start a web server first.

**Terminal 1:**

```bash
node bin/cli.js &
sleep 2
```

**Terminal 2:**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"start_server","arguments":{}}}\n' | \
  timeout 10 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"status": "already_running", "url": "http://127.0.0.1:3847", "pid": XXXXX}`

**Cleanup:**

```bash
kill %1 2>/dev/null; wait 2>/dev/null
```

### 2.13 Test stop_server

**Prerequisites:** Start a web server in the background.

```bash
node bin/cli.js &
SERVER_PID=$!
sleep 2
```

**Test:**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"stop_server","arguments":{}}}\n' | \
  timeout 10 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"status": "stopped", "was_pid": XXXXX}` where the PID matches `$SERVER_PID`.

**Verify the server is stopped:**

```bash
curl -s http://127.0.0.1:3847/api/projects 2>&1 || echo "Connection refused (server stopped)"
```

**Cleanup:**

```bash
wait $SERVER_PID 2>/dev/null
```

### 2.14 Test stop_server when not running

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"stop_server","arguments":{}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"status": "not_running"}`

---

## Section 3: Multi-instance coordination

### 3.1 Test second web server detects first and exits

**Prerequisites:** Two terminal windows.

**Terminal 1 -- start the first server:**

```bash
node bin/cli.js
```

Wait for the `cctimereporter running at http://127.0.0.1:3847` message.

**Terminal 2 -- attempt a second server:**

```bash
node bin/cli.js; echo "Exit code: $?"
```

**Expected output (Terminal 2):**
- stdout: `Server already running at http://127.0.0.1:3847 (PID XXXXX)`
- Exit code: `0` (not an error -- it's informational)

**Cleanup:** Press Ctrl+C in Terminal 1.

### 3.2 Test stale lock reclaim

**Test:** Simulate a stale lock by inserting a dead PID into the `process_locks` table, then verify a new server reclaims it.

```bash
# Insert a stale lock with a PID that doesn't exist
node -e "
  const { openDatabase } = await import('./src/db/index.js');
  const { db } = openDatabase();
  db.prepare('DELETE FROM process_locks WHERE lock_name = ?').run('server');
  db.prepare('INSERT INTO process_locks (lock_name, pid, source, port) VALUES (?, ?, ?, ?)').run('server', 99999, 'test', 3847);
  console.log('Stale lock inserted for PID 99999');
  db.close();
"
```

**Now start the server:**

```bash
node bin/cli.js &
SERVER_PID=$!
sleep 2
echo "Server started with PID: $SERVER_PID"
curl -s http://127.0.0.1:3847/api/projects | jq '.projects | length'
```

**Expected output:** The server should start successfully (not be blocked by the stale PID 99999 lock). It reclaims the lock because PID 99999 is not alive.

**Cleanup:**

```bash
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
```

### 3.3 Test import lock prevents concurrent imports

**Prerequisites:** Two terminal windows.

**Terminal 1:**

```bash
node bin/cli.js import --all
```

**Terminal 2 (while Terminal 1 is still importing):**

```bash
node bin/cli.js import; echo "Exit code: $?"
```

**Expected output (Terminal 2):**
- stderr: `Import already running (PID XXXXX via cli, started Xs ago). Wait for it to finish or kill the process.`
- Exit code: `2`

This confirms the DB-based lock prevents concurrent imports across separate processes.

### 3.4 Test cross-process import conflict (CLI vs MCP)

**Terminal 1 -- start CLI import:**

```bash
node bin/cli.js import --all
```

**Terminal 2 -- attempt MCP import:**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trigger_import","arguments":{}}}\n' | \
  timeout 10 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson .error'
```

**Expected output:** `"already_running"`

---

## Section 4: Service layer regression (web UI)

These tests verify the web UI still works correctly after the service layer refactoring.

### 4.1 Test web UI timeline endpoint

**Prerequisites:** Start the web server.

```bash
node bin/cli.js &
SERVER_PID=$!
sleep 2
```

**Test:**

```bash
curl -s "http://127.0.0.1:3847/api/timeline?date=2026-03-27" | jq '{
  date: .date,
  projectCount: (.projects | length),
  hasWorkingTime: (.totalWorkingTimeMs > 0)
}'
```

**Expected output:** A JSON object with `date` matching the requested date, a positive `projectCount`, and `hasWorkingTime: true` (if there is data for that date).

**Verify response shape:**

```bash
curl -s "http://127.0.0.1:3847/api/timeline?date=2026-03-27" | jq 'keys'
```

**Expected output:** An array containing keys like `date`, `projects`, `totalWorkingTimeMs`, `byTicket`, `unticketedSessions`.

### 4.2 Test web UI import with SSE progress

**Test:**

```bash
curl -s -N "http://127.0.0.1:3847/api/import/progress?maxAgeDays=2" &
CURL_PID=$!
sleep 10
kill $CURL_PID 2>/dev/null
```

**Expected output:** A stream of SSE events (`data: {...}`) showing import progress with `phase`, `processed`, and `total` fields. The stream ends with a `done` event containing the import result.

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

**Expected output:** A JSON object with `totalCount` and `messageCount`. The `messageCount` should be at most 20 (head+tail truncation).

### 4.4 Test session editing (PATCH)

**Prerequisites:** Get a session ID from test 4.3.

**Test -- set a user label:**

```bash
curl -s -X PATCH "http://127.0.0.1:3847/api/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"user_label": "test-label-v080"}' | jq '.user_label'
```

**Expected output:** `"test-label-v080"`

**Verify persistence:**

```bash
curl -s "http://127.0.0.1:3847/api/timeline?date=2026-03-27" | jq --arg sid "$SESSION_ID" \
  '[.projects[].sessions[] | select(.sessionId == $sid) | .userLabel][0]'
```

**Expected output:** `"test-label-v080"`

**Clean up the test label:**

```bash
curl -s -X PATCH "http://127.0.0.1:3847/api/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"user_label": null}' | jq '.user_label'
```

**Expected output:** `null`

**Cleanup -- stop the server:**

```bash
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
```

### 4.5 Test web UI serves static files

**Prerequisites:** Start the server if not already running.

```bash
node bin/cli.js &
SERVER_PID=$!
sleep 2
```

**Test:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3847/
```

**Expected output:** `200` (or `302` redirecting to `/timeline`).

**Cleanup:**

```bash
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
```

---

## Troubleshooting

### Import shows 0 files processed

**Symptom:** The import command runs but reports `filesProcessed: 0`.

**Cause:** No Claude Code session files exist within the import window, or the `~/.claude/projects/` directory does not exist.

**Solution:** Use `--all` to import all history, or verify that `~/.claude/projects/` contains JSONL transcript files.

### MCP commands return empty or error

**Symptom:** MCP tool calls return empty results or parse errors.

**Cause:** The JSON-RPC messages may be malformed, or the `initialize` handshake was skipped.

**Solution:** Ensure you always send the `initialize` request first, followed by `notifications/initialized`, before calling any tools. Check that the JSON is valid (no trailing commas, proper quoting).

### Port 3847 already in use

**Symptom:** Server fails to start or uses a different port.

**Cause:** Another process (possibly a previous test) is using port 3847.

**Solution:** The server automatically tries ports 3847-3856. Check which process holds the port:

```bash
lsof -i :3847
```

Kill the stale process or use the `stop_server` MCP tool to clean up.

### Exit code 2 when not expected

**Symptom:** Import exits with code 2 unexpectedly.

**Cause:** A previous import process crashed and left a stale lock in the database.

**Solution:** The lock system auto-reclaims stale locks (dead PIDs), but if the PID was reused by another process, manual cleanup is needed:

```bash
node -e "
  const { openDatabase } = await import('./src/db/index.js');
  const { db } = openDatabase();
  db.prepare('DELETE FROM process_locks WHERE lock_name = ?').run('import');
  console.log('Import lock cleared');
  db.close();
"
```

## Related guides

- [CHANGELOG](/CHANGELOG.md) for v0.8.0 release notes
- [Architecture overview](../architecture/) for system design details
- [CLAUDE.md](/CLAUDE.md) for project architecture and API reference
