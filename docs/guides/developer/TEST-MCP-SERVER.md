# Test: MCP Server

*Extracted from TESTING-V080-PROGRAMMATIC-ACCESS.md and corrected against actual code.*

## Overview

These tests verify the MCP (Model Context Protocol) server activated by the `--mcp` flag.
The server communicates via JSON-RPC over stdio. To test it, you send JSON-RPC messages to
stdin and read responses from stdout.

## Prerequisites

- Node.js 22 or later installed (`node --version`)
- Repository cloned and dependencies installed (`npm install`)
- At least one previous import completed so the database has session data
- A known date with session data
- `jq` installed for JSON validation
- Two terminal windows for conflict tests (2.9, 2.12, 2.13)

> **Note:** MCP mode owns stdio. All diagnostic output is suppressed. The server
> communicates exclusively via JSON-RPC over stdin/stdout.

> **Note:** The Node.js SQLite experimental feature warning has been suppressed in the CLI.

> **Important:** Several MCP tests use the `{ sleep N; }` pattern to keep stdin open.
> The MCP process exits when stdin closes (end of the printf pipe), which can terminate
> operations in progress. The sleep keeps the pipe open long enough for the operation to
> complete.

---

## Test Cases

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

**Expected output:** An array of up to 5 date strings in `YYYY-MM-DD` format, sorted
descending (most recent first).

### 2.4 Test get_day_summary

**Test:** The `get_day_summary` tool returns a working time summary for a date.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_day_summary","arguments":{"date":"2026-03-27"}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | {date, workingTime}'
```

**Expected output:** A JSON object with `date` and `workingTime` fields. The `workingTime`
should be a human-readable string like `"2h 15m"`.

### 2.5 Test get_sessions

**Test:** The `get_sessions` tool returns project-grouped session data. It returns an array
of project objects (not a flat session list).

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_sessions","arguments":{"date":"2026-03-27"}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | .[0] | keys'
```

**Expected output:** An array of keys from the first project object:

```json
["displayName","projectId","projectPath","sessions"]
```

Each project object contains `projectId`, `projectPath`, `displayName`, and a `sessions`
array with the session details.

### 2.6 Test get_session_messages

**Prerequisites:** You need a valid session ID. Get one from the `sessions` CLI command:

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

**Expected output:** A JSON object with `totalCount` (total messages in the session) and
`messageCount` (number returned, up to 20 with head+tail truncation).

### 2.7 Test get_session_messages with invalid ID

**Test:** Requesting messages for a nonexistent session returns an error with `isError: true`.

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_session_messages","arguments":{"session_id":"00000000-0000-0000-0000-000000000000"}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '{isError: .result.isError, error: (.result.content[0].text | fromjson)}'
```

**Expected output:**

```json
{
  "isError": true,
  "error": {
    "error": "not_found",
    "message": "Session not found"
  }
}
```

The `isError: true` flag on the result envelope tells the MCP client that the tool call
failed.

### 2.8 Test trigger_import

**Test:** The `trigger_import` tool runs an import and returns stats. Uses `max_age_days: 1`
for a faster test and `{ sleep 30; }` to keep stdin open during the import.

```bash
{ printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trigger_import","arguments":{"max_age_days":1}}}\n'; sleep 30; } | \
  timeout 35 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | {ok, filesProcessed}'
```

**Expected output:** `{"ok": true, "filesProcessed": N}` where N is a number. The full
response also includes `projectsFound`, `filesSkipped`, `totalMessages`, and `errors`.

### 2.9 Test trigger_import conflict

**Prerequisites:** Two terminal windows.

**Terminal 1 -- start a long import via CLI:**

```bash
node bin/cli.js import --all
```

**Terminal 2 -- attempt MCP import while Terminal 1 is running:**

```bash
{ printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trigger_import","arguments":{}}}\n'; sleep 10; } | \
  timeout 15 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '{isError: .result.isError, error: (.result.content[0].text | fromjson)}'
```

**Expected output:**

```json
{
  "isError": true,
  "error": {
    "error": "already_running",
    "message": "Import already running (PID XXXXX via cli, started Xs ago). Wait for it to finish or kill the process."
  }
}
```

### 2.10 Test server_status when no server running

**Prerequisites:** Ensure no cctimereporter web server is running
(`pkill -f "node bin/cli.js" 2>/dev/null` if needed).

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"server_status","arguments":{}}}\n' | \
  timeout 5 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"running": false}`

### 2.11 Test start_server

**Prerequisites:** No web server running.

The `{ sleep 5; }` pattern keeps stdin open so the MCP process (and its inline Fastify
server) stay alive long enough to return the response. Without it, the MCP process exits
on stdin close, which stops the Fastify instance before the response is sent.

```bash
{ printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"start_server","arguments":{}}}\n'; sleep 5; } | \
  timeout 10 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson'
```

**Expected output:** `{"status": "started", "url": "http://127.0.0.1:3847"}` (port may vary
if 3847 is in use).

> **Note:** The MCP process exits when stdin closes (end of the sleep), which triggers
> `cleanupMcpServer` and stops the inline Fastify instance. To verify the server is actually
> reachable, check `server_status` in the same MCP session instead of curling from outside.

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

**Expected output:** `{"status": "stopped", "was_pid": XXXXX}` where the PID matches
`$SERVER_PID`.

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
