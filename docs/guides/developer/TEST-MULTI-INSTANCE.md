# Test: Multi-Instance Coordination

*Extracted from TESTING-V080-PROGRAMMATIC-ACCESS.md.*

## Overview

These tests verify the multi-instance coordination layer: server lock detection,
stale lock reclaim, and import lock enforcement across separate processes.

## Prerequisites

- Node.js 22 or later installed (`node --version`)
- Repository cloned and dependencies installed (`npm install`)
- At least one previous import completed so the database has session data
- `jq` installed for JSON validation
- Two terminal windows for most tests

> **Note:** The Node.js SQLite experimental feature warning has been suppressed in the CLI.

---

## Test Cases

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
- Exit code: `0` (not an error -- it is informational)

**Cleanup:** Press Ctrl+C in Terminal 1.

### 3.2 Test stale lock reclaim

**Test:** Simulate a stale lock by inserting a dead PID into the `process_locks` table,
then verify a new server reclaims it.

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

**Expected output:** The server should start successfully (not be blocked by the stale
PID 99999 lock). It reclaims the lock because PID 99999 is not alive.

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
{ printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trigger_import","arguments":{}}}\n'; sleep 10; } | \
  timeout 15 node bin/cli.js --mcp 2>/dev/null | tail -1 | jq '.result.content[0].text | fromjson | .error'
```

**Expected output:** `"already_running"`
