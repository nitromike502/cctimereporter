# API Endpoints Reference

*Last updated: 2026-03-27*
*Schema version: 9*

## Overview

CC Time Reporter exposes a JSON REST API on `http://127.0.0.1:{port}`. All endpoints return `application/json` unless otherwise noted. There is no authentication.

---

## GET /api/timeline

Returns sessions grouped by project for a given date, with computed working time, idle gaps, and fork segments.

### Parameters

| Parameter | Location | Type | Required | Default | Constraints | Description |
|-----------|----------|------|----------|---------|-------------|-------------|
| `date` | query | string | No | Today (`YYYY-MM-DD`) | Must match `YYYY-MM-DD` | Date to query |
| `threshold` | query | integer | No | `10` | Clamped to 1--60 | Idle threshold in minutes |

### Response

**Status:** `200 OK`
**Content-Type:** `application/json`

```json
{
  "date": "2026-03-27",
  "totalSessions": 142,
  "schemaMigrated": false,
  "projects": [
    {
      "projectId": 3,
      "projectPath": "/home/claude/cctimereporter",
      "displayName": "cctimereporter",
      "sessions": [
        {
          "sessionId": "abc123-def456-...",
          "startTime": "2026-03-27T08:15:00.000Z",
          "endTime": "2026-03-27T09:45:00.000Z",
          "continuesFromPrevDay": false,
          "continuesIntoNextDay": false,
          "workingTimeMs": 4500000,
          "elapsedTimeMs": 5400000,
          "idleGaps": [
            {
              "startTime": "2026-03-27T08:30:00.000Z",
              "endTime": "2026-03-27T08:45:00.000Z",
              "durationMs": 900000
            }
          ],
          "forkSegments": [
            {
              "forkBranchId": "fork-branch-uuid",
              "startTime": "2026-03-27T08:20:00.000Z",
              "endTime": "2026-03-27T08:35:00.000Z",
              "messageCount": 12,
              "workingTimeMs": 600000,
              "elapsedTimeMs": 900000
            }
          ],
          "ticket": "PROJ-123",
          "branch": "feature/my-branch",
          "summary": "Session summary text",
          "firstPrompt": "The first user message",
          "customTitle": "User-set session title via /rename",
          "userLabel": "My custom label",
          "userTicket": "PROJ-456",
          "messageCount": 24,
          "userMessageCount": 12,
          "forkCount": 3,
          "realForkCount": 1
        }
      ]
    }
  ]
}
```

### Response fields

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Echoed query date |
| `totalSessions` | integer | Total session count across all dates (from DB) |
| `schemaMigrated` | boolean | `true` if the database was migrated on this server startup |
| `projects` | array | Project groups containing sessions |
| `projects[].projectId` | integer | Database ID of the project |
| `projects[].projectPath` | string | Filesystem path of the project |
| `projects[].displayName` | string | Last path segment of `projectPath` |
| `projects[].sessions` | array | Sessions active on the queried date |

### Session object fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `sessionId` | string | No | UUID of the Claude Code session |
| `startTime` | string | No | ISO 8601 timestamp, clamped to day boundaries for overnight sessions |
| `endTime` | string | No | ISO 8601 timestamp, clamped to day boundaries |
| `continuesFromPrevDay` | boolean | No | `true` if session started before this date |
| `continuesIntoNextDay` | boolean | No | `true` if session extends past this date |
| `workingTimeMs` | integer | No | Active working time in milliseconds (idle gaps excluded) |
| `elapsedTimeMs` | integer | No | Wall-clock time from start to end in milliseconds |
| `idleGaps` | array | No | Periods of inactivity exceeding the threshold |
| `forkSegments` | array | No | Fork branch time ranges (empty if no real forks) |
| `ticket` | string | Yes | Auto-detected primary ticket (e.g., `PROJ-123`) |
| `branch` | string | Yes | Git working branch |
| `summary` | string | Yes | Claude-generated session summary |
| `firstPrompt` | string | Yes | First user message text |
| `customTitle` | string | Yes | Title set via `/rename` command |
| `userLabel` | string | Yes | User-edited label (preserved across re-imports) |
| `userTicket` | string | Yes | User-edited ticket override |
| `messageCount` | integer | No | Messages within the queried day |
| `userMessageCount` | integer | No | Total user messages in the session |
| `forkCount` | integer | No | Total fork branches detected |
| `realForkCount` | integer | No | Real (non-progress) fork branches |

### Idle gap object

| Field | Type | Description |
|-------|------|-------------|
| `startTime` | string | ISO 8601 start of idle period |
| `endTime` | string | ISO 8601 end of idle period |
| `durationMs` | integer | Duration in milliseconds |

### Fork segment object

| Field | Type | Description |
|-------|------|-------------|
| `forkBranchId` | string | UUID of the fork branch |
| `startTime` | string | ISO 8601 start, clamped to day boundaries |
| `endTime` | string | ISO 8601 end, clamped to day boundaries |
| `messageCount` | integer | Messages in the fork branch on this day |
| `workingTimeMs` | integer | Active time in the fork branch |
| `elapsedTimeMs` | integer | Wall-clock time of the fork branch |

### Errors

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Invalid date format. Use YYYY-MM-DD." }` | `date` param does not match `YYYY-MM-DD` |

---

## GET /api/projects

Returns all known projects.

### Parameters

None.

### Response

**Status:** `200 OK`
**Content-Type:** `application/json`

```json
[
  {
    "projectId": 3,
    "projectPath": "/home/claude/cctimereporter",
    "displayName": "cctimereporter",
    "lastImportAt": "2026-03-27 14:30:00"
  }
]
```

### Response fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `projectId` | integer | No | Database ID |
| `projectPath` | string | No | Full filesystem path |
| `displayName` | string | No | Last path segment |
| `lastImportAt` | string | Yes | SQLite datetime of last import, or `null` if never imported |

### Errors

None specific. Returns an empty array if no projects exist.

---

## POST /api/import

Triggers a transcript import. Returns the result as JSON when complete. Non-streaming alternative to `GET /api/import/progress`.

### Parameters

| Parameter | Location | Type | Required | Default | Constraints | Description |
|-----------|----------|------|----------|---------|-------------|-------------|
| `maxAgeDays` | body | integer | No | `30` | Must be a finite integer | Only import files modified within this many days |

### Request body

**Content-Type:** `application/json`

```json
{
  "maxAgeDays": 7
}
```

### Response

**Status:** `200 OK`
**Content-Type:** `application/json`

```json
{
  "ok": true,
  "projectsFound": 5,
  "filesProcessed": 42,
  "filesSkipped": 118,
  "totalMessages": 3200,
  "errors": []
}
```

### Response fields

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` on success |
| `projectsFound` | integer | Number of discovered projects |
| `filesProcessed` | integer | Transcript files successfully imported |
| `filesSkipped` | integer | Files skipped (unchanged size, outside time window, or too old) |
| `totalMessages` | integer | Total messages stored across all processed files |
| `errors` | array of strings | Non-fatal error messages (e.g., `"filename.jsonl: parse error"`) |

### Errors

| Status | Body | Condition |
|--------|------|-----------|
| 409 | `{ "error": "Import already running (PID ... via ..., started ...)" }` | Another import is in progress (same or different process) |

---

## GET /api/import/progress

Triggers a transcript import with real-time progress streaming via Server-Sent Events (SSE).

### Parameters

| Parameter | Location | Type | Required | Default | Constraints | Description |
|-----------|----------|------|----------|---------|-------------|-------------|
| `maxAgeDays` | query | integer | No | `30` | Must be a finite integer | Only import files modified within this many days |

### Response

**Status:** `200 OK`
**Content-Type:** `text/event-stream`
**Cache-Control:** `no-cache`

The response is a stream of SSE events. Each event has a named `event:` field and a JSON `data:` payload.

### SSE event: `progress`

Sent during the import process. Two sub-phases:

**Discovery phase:**

```
event: progress
data: {"phase":"discovered","totalFiles":160,"totalProjects":5,"skipped":118}
```

**Import phase (repeated per file):**

```
event: progress
data: {"phase":"importing","processed":12,"total":42,"skipped":118,"currentFile":"abc123-def456"}
```

| Field | Type | Description |
|-------|------|-------------|
| `phase` | string | `"discovered"`, `"importing"`, or `"complete"` |
| `totalFiles` | integer | Total files to process (discovery phase) |
| `totalProjects` | integer | Total projects found (discovery phase) |
| `processed` | integer | Files processed so far (import phase) |
| `total` | integer | Total files to process (import phase) |
| `skipped` | integer | Files skipped |
| `currentFile` | string or null | Session ID of the file currently being imported |

### SSE event: `complete`

Sent once when the import finishes successfully.

```
event: complete
data: {"projectsFound":5,"filesProcessed":42,"filesSkipped":118,"totalMessages":3200,"errors":[]}
```

Fields are identical to the `POST /api/import` response (without the `ok` field).

### SSE event: `error`

Sent if the import fails.

```
event: error
data: {"message":"Import already running (PID 1234 via web, started 30s ago)","conflict":true}
```

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Error description |
| `conflict` | boolean | Present and `true` only for `ImportConflictError` (409-equivalent) |

---

## GET /api/sessions/:id/messages

Returns messages for a session with head/tail truncation for large sessions.

### Parameters

| Parameter | Location | Type | Required | Default | Description |
|-----------|----------|------|----------|---------|-------------|
| `id` | path | string | Yes | -- | Session UUID |
| `forkBranchId` | query | string | No | *(primary branch)* | Fork branch UUID, or `"all"` for all branches |

### Fork branch filtering

| `forkBranchId` value | Behavior |
|----------------------|----------|
| *(omitted)* | Returns messages from the primary branch only (`fork_branch_id IS NULL`) |
| A UUID string | Returns messages from that specific fork branch |
| `"all"` | Returns messages across all branches |

### Response

**Status:** `200 OK`
**Content-Type:** `application/json`

```json
{
  "messages": [
    {
      "uuid": "msg-uuid-1",
      "role": "user",
      "content": "Please implement the feature",
      "timestamp": "2026-03-27T08:15:00.000Z",
      "is_fork_branch": false,
      "fork_branch_id": null
    },
    {
      "uuid": "msg-uuid-2",
      "role": "assistant",
      "content": "I will implement the feature now...",
      "timestamp": "2026-03-27T08:15:05.000Z",
      "is_fork_branch": false,
      "fork_branch_id": null
    }
  ],
  "totalCount": 48,
  "skipped": 28
}
```

### Response fields

| Field | Type | Description |
|-------|------|-------------|
| `messages` | array | Message objects (see below) |
| `totalCount` | integer | Total messages matching the branch filter |
| `skipped` | integer | Number of middle messages omitted (0 if total <= 20) |

### Truncation behavior

Messages are returned as first-10 + last-10 with a `skipped` count for the middle. If the total is 20 or fewer, all messages are returned and `skipped` is `0`.

### Message object

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `uuid` | string | No | Message UUID |
| `role` | string | No | `"user"` or `"assistant"` |
| `content` | string | Yes | Message text content; `"(no text content)"` placeholder for fork branch tool-use-only messages |
| `timestamp` | string | Yes | ISO 8601 timestamp |
| `is_fork_branch` | boolean | No | `true` if message is on a fork branch |
| `fork_branch_id` | string | Yes | Fork branch UUID, or `null` for primary branch messages |

### Errors

| Status | Body | Condition |
|--------|------|-----------|
| 404 | `{ "error": "Session not found" }` | No session with the given ID exists |

---

## PATCH /api/sessions/:id

Updates user-editable fields on a session. These fields are preserved across re-imports.

### Parameters

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `id` | path | string | Yes | Session UUID |

### Request body

**Content-Type:** `application/json`

```json
{
  "userLabel": "My custom label",
  "userTicket": "PROJ-456"
}
```

Both fields are optional. Empty strings are normalized to `null`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userLabel` | string | No | Custom label for the session |
| `userTicket` | string | No | Manual ticket override |

### Response

**Status:** `200 OK`
**Content-Type:** `application/json`

```json
{
  "ok": true
}
```

### Errors

| Status | Body | Condition |
|--------|------|-----------|
| 404 | `{ "error": "Session not found" }` | No session with the given ID exists |

---

## Related documents

- [Configuration reference](../CONFIGURATION.md)
