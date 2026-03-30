# Test: CLI Subcommands

*Extracted from TESTING-V080-PROGRAMMATIC-ACCESS.md and corrected against actual code.*

## Overview

These tests verify the CLI subcommands (`summary`, `sessions`, `import`) that provide
JSON output to stdout. All commands use `node bin/cli.js` for local testing.

## Prerequisites

- Node.js 22 or later installed (`node --version`)
- Repository cloned and dependencies installed (`npm install`)
- At least one previous import completed so the database has session data
- A known date with session data (run `node bin/cli.js summary` to find one)
- `jq` installed for JSON validation (optional but recommended)
- Two terminal windows for the conflict test (1.13)

If you have no data yet, run an initial import first:

```bash
cd /home/claude/cctimereporter
node bin/cli.js import --all
```

Note a date from the output that has sessions. The examples below use `2026-03-27` --
replace with your own date.

> **Note:** The Node.js SQLite experimental feature warning has been suppressed in the CLI.
> You should not see any warnings on stderr from normal commands.

---

## Test Cases

### 1.1 Verify --help output

**Test:** The top-level help shows all subcommands including `summary`, `sessions`, `import`, and `serve`.

```bash
node bin/cli.js --help
```

**Expected output:** A usage line with `[command]` and a list of commands that includes
`summary`, `sessions`, `import`, and `serve`. The `serve` command is the default.

**Verify:** All four subcommands appear in the output.

### 1.2 Verify subcommand help

**Test:** Each subcommand has its own `--help` with options.

```bash
node bin/cli.js summary --help
node bin/cli.js sessions --help
node bin/cli.js import --help
```

**Expected output:** Each command shows its description and options. `summary` and `sessions`
show `--date`, `--pretty`, and `--idle` options. `import` shows `--days`, `--all`, and `--pretty` options.

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
- `workingTimeMs` (number)
- `workingTime` (human-readable string like `"2h 15m"`)
- `byTicket` array (each entry has `ticket`, `workingTimeMs`, `workingTime`, `sessions`)
- `unticketedSessions` array

**Verify with jq:**

```bash
node bin/cli.js summary --date 2026-03-27 | jq '.workingTime'
```

This should print a quoted string like `"2h 15m"`. If jq errors, the output is not valid JSON.

### 1.5 Test summary with --pretty flag

**Test:** The `--pretty` flag produces indented JSON output.

```bash
node bin/cli.js summary --date 2026-03-27 --pretty
```

**Expected output:** The same JSON as test 1.4 but formatted with 2-space indentation
across multiple lines.

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

**Expected output:** The JSON `date` field should be today's date. If there is no data
for today, the output is still valid JSON but with empty arrays and zero working time.

### 1.7 Test sessions with a known date

**Test:** The `sessions` command outputs a JSON array of sessions.

```bash
node bin/cli.js sessions --date 2026-03-27
```

**Expected output:** A JSON array where each element has:
- `sessionId` (UUID string)
- `project` (display name string)
- `startTime` and `endTime` (ISO datetime strings)
- `workingTimeMs` (number)
- `workingTime` (human-readable string)
- `ticket` (string or null)
- `branch` (string or null)
- `summary` (string or null)
- `userLabel` (string or null)
- `userTicket` (string or null)

**Verify with jq:**

```bash
node bin/cli.js sessions --date 2026-03-27 | jq '.[0] | {sessionId, project, workingTime}'
```

This should print an object with a UUID, a project display name, and a time string.

### 1.8 Test sessions sorted by start time

**Test:** Sessions are sorted chronologically.

```bash
node bin/cli.js sessions --date 2026-03-27 | jq '[.[].startTime]'
```

**Expected output:** An array of timestamps in ascending order.

### 1.9 Test import with default days

**Test:** The `import` command runs with the default 2-day window, shows progress on stderr,
and prints JSON result on stdout.

```bash
node bin/cli.js import 2>/tmp/import-stderr.txt
cat /tmp/import-stderr.txt
```

**Expected output:**
- stderr (`/tmp/import-stderr.txt`): Contains `Discovering files...` and `Importing: N/M...`
  progress lines (where N and M are numbers)
- stdout: A JSON object with keys `projectsFound`, `filesProcessed`, `filesSkipped`,
  `totalMessages`, and `errors`

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

**Expected output:** A pretty-printed JSON result. The `filesProcessed` count should be
equal to or greater than the count from test 1.9.

### 1.11 Test import --days

**Test:** The `--days` flag controls the import window.

```bash
node bin/cli.js import --days 7 2>/dev/null | jq '.filesProcessed'
```

**Expected output:** A number. With `--days 7`, the count should be equal to or greater
than the default `--days 2` count.

### 1.12 Test invalid date format

**Test:** Passing a malformed date returns an error JSON with exit code 1.

```bash
node bin/cli.js summary --date "not-a-date" --pretty; echo "Exit code: $?"
```

**Expected output:**

```json
{
  "error": "Invalid date format. Use YYYY-MM-DD."
}
```

Exit code: `1`

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

**Expected output:** A number representing the count of projects. The server should start,
respond to API requests, and shut down cleanly.

### 1.15 Test custom idle threshold

**Test:** The `--idle` option changes the working time calculation.

```bash
SHORT=$(node bin/cli.js summary --date 2026-03-27 --idle 5 | jq '.workingTimeMs')
LONG=$(node bin/cli.js summary --date 2026-03-27 --idle 30 | jq '.workingTimeMs')
echo "5min threshold: $SHORT ms, 30min threshold: $LONG ms"
```

**Expected output:** The working time with a 30-minute idle threshold should be greater
than or equal to the working time with a 5-minute threshold (a longer threshold consolidates
more gaps into working time).
