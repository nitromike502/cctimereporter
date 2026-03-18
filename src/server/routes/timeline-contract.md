# GET /api/timeline — Segment-Aware Contract (v0.6.0)

This document defines the response shape that Phase 20 (backend derivation), Phase 21 (frontend rendering), and Phase 22 (time-of-day filtering) code against.

## Current Shape (pre-v0.6.0)

```json
{
  "date": "2026-03-17",
  "totalWorkingTimeMs": 14400000,
  "projects": [
    {
      "projectId": 1,
      "projectPath": "/home/user/myproject",
      "displayName": "myproject",
      "totalWorkingTimeMs": 14400000,
      "totalSessions": 2,
      "sessions": [ /* session objects */ ]
    }
  ]
}
```

## v0.6.0 Shape

`sessions[]` is replaced by `segments[]`. Session objects become segment objects with added fields.

```json
{
  "date": "2026-03-17",
  "totalWorkingTimeMs": 14400000,
  "projects": [
    {
      "projectId": 1,
      "projectPath": "/home/user/myproject",
      "displayName": "myproject",
      "totalWorkingTimeMs": 14400000,
      "totalSessions": 2,
      "totalSegments": 3,
      "segments": [ /* segment objects — see below */ ]
    }
  ]
}
```

## Segment Object Fields

All fields from the current session object are preserved. New fields added for v0.6.0:

| Field | Type | Description |
|-------|------|-------------|
| `segmentId` | string | `"${sessionId}:${segmentIndex}"` — unique render key |
| `sessionId` | string | Original session UUID — use for PATCH and messages endpoints |
| `segmentIndex` | number | 0-based index within the parent session |
| `isSplit` | boolean | `true` if parent session has >1 segment; `false` for unsplit sessions |

Preserved session fields (unchanged):

| Field | Type | Source |
|-------|------|--------|
| `startTime` | string | First timestamp in this segment |
| `endTime` | string | Last timestamp in this segment |
| `continuesFromPrevDay` | boolean | Segment starts before day boundary |
| `continuesIntoNextDay` | boolean | Segment ends after day boundary |
| `workingTimeMs` | number | Working time scoped to this segment |
| `idleGaps` | array | Idle gaps within this segment's time range |
| `ticket` | string\|null | Primary ticket derived from this segment's messages only |
| `branch` | string\|null | Working branch derived from this segment's messages only |
| `summary` | string\|null | From parent session (shared across all segments) |
| `firstPrompt` | string\|null | From parent session (shared across all segments) |
| `customTitle` | string\|null | From parent session (shared across all segments) |
| `userLabel` | string\|null | From parent session (shared across all segments) |
| `userTicket` | string\|null | From parent session (shared across all segments) |
| `messageCount` | number | Count of messages in this segment only |
| `userMessageCount` | number | Count of user messages in this segment only |
| `forkCount` | number | From parent session |
| `realForkCount` | number | From parent session |

## Behavioral Rules

1. **No /clear → one segment**: Sessions with no `/clear` message produce exactly one segment (`segmentIndex: 0`, `isSplit: false`). The segment object is identical to the current session object plus the four new fields.

2. **/clear exclusion**: The `/clear` message itself is excluded from both adjacent segments. No double-counting.

3. **Clipping before splitting**: Overnight clipping (trimming sessions to the requested day boundary) happens BEFORE segment splitting. A session that spans midnight is clipped to the day, then split by `/clear` boundaries within the clipped range.

4. **Per-segment ticket and branch**: `ticket` and `branch` are derived from only that segment's messages. Two segments from the same session may have different tickets if the work changed after `/clear`.

5. **Shared session metadata**: `summary`, `firstPrompt`, `customTitle`, `userLabel`, `userTicket` come from the parent session record and are shared across all segments of the same session.

6. **Per-segment counts**: `messageCount` and `userMessageCount` reflect only that segment's messages.

7. **Per-segment timing**: `workingTimeMs` and `idleGaps` are computed from that segment's timestamps only.

8. **totalSessions backward compatibility**: `totalSessions` on the project object counts unique sessions (not segments). Add `totalSegments` as a new field alongside it.

## Segment ID Resolution for Existing Endpoints

Segment IDs (`"abc123:0"`) may be passed to endpoints that expect session IDs. Both endpoints must handle this transparently:

- **`PATCH /api/sessions/:id`** — if `:id` contains `:`, strip everything from `:` onward to get `sessionId`
- **`GET /api/sessions/:id/messages`** — if `:id` contains `:`, strip everything from `:` onward; return messages for the full session (or optionally filter to segment's time range)

Pattern: `const sessionId = id.includes(':') ? id.split(':')[0] : id;`

## Example JSON

A project with two sessions — one unsplit, one split into two segments:

```json
{
  "date": "2026-03-17",
  "totalWorkingTimeMs": 10800000,
  "projects": [
    {
      "projectId": 1,
      "projectPath": "/home/user/myproject",
      "displayName": "myproject",
      "totalWorkingTimeMs": 10800000,
      "totalSessions": 2,
      "totalSegments": 3,
      "segments": [
        {
          "segmentId": "session-aaa:0",
          "sessionId": "session-aaa",
          "segmentIndex": 0,
          "isSplit": false,
          "startTime": "2026-03-17T09:00:00.000Z",
          "endTime": "2026-03-17T11:00:00.000Z",
          "continuesFromPrevDay": false,
          "continuesIntoNextDay": false,
          "workingTimeMs": 3600000,
          "idleGaps": [],
          "ticket": "PROJ-42",
          "branch": "feature/proj-42",
          "summary": "Implemented auth flow",
          "firstPrompt": "Help me implement JWT authentication",
          "customTitle": null,
          "userLabel": null,
          "userTicket": null,
          "messageCount": 45,
          "userMessageCount": 12,
          "forkCount": 0,
          "realForkCount": 0
        },
        {
          "segmentId": "session-bbb:0",
          "sessionId": "session-bbb",
          "segmentIndex": 0,
          "isSplit": true,
          "startTime": "2026-03-17T13:00:00.000Z",
          "endTime": "2026-03-17T14:30:00.000Z",
          "continuesFromPrevDay": false,
          "continuesIntoNextDay": false,
          "workingTimeMs": 3600000,
          "idleGaps": [],
          "ticket": "PROJ-55",
          "branch": "feature/proj-55",
          "summary": "Fixed bugs and added new feature",
          "firstPrompt": "Fix the login validation bug",
          "customTitle": null,
          "userLabel": null,
          "userTicket": null,
          "messageCount": 30,
          "userMessageCount": 8,
          "forkCount": 1,
          "realForkCount": 1
        },
        {
          "segmentId": "session-bbb:1",
          "sessionId": "session-bbb",
          "segmentIndex": 1,
          "isSplit": true,
          "startTime": "2026-03-17T14:31:00.000Z",
          "endTime": "2026-03-17T16:00:00.000Z",
          "continuesFromPrevDay": false,
          "continuesIntoNextDay": false,
          "workingTimeMs": 3600000,
          "idleGaps": [],
          "ticket": "PROJ-60",
          "branch": "feature/proj-60",
          "summary": "Fixed bugs and added new feature",
          "firstPrompt": "Fix the login validation bug",
          "customTitle": null,
          "userLabel": null,
          "userTicket": null,
          "messageCount": 25,
          "userMessageCount": 7,
          "forkCount": 1,
          "realForkCount": 1
        }
      ]
    }
  ]
}
```

## Implementation Notes for Phase 20

The segment derivation logic lives in `GET /api/timeline` route (`src/server/routes/timeline.js`). The implementation approach:

1. Query messages for each session in the date range, ordered by timestamp
2. Find `/clear` message positions: `WHERE command = 'clear'`
3. Split the message array at each `/clear` position (excluding the /clear message itself)
4. For each segment slice, compute: startTime, endTime, workingTimeMs, idleGaps, ticket, branch, messageCount, userMessageCount
5. Attach shared fields from the session record: summary, firstPrompt, customTitle, userLabel, userTicket, forkCount, realForkCount
6. Build segmentId as `"${session.session_id}:${index}"`
7. Set isSplit based on whether segment count > 1

The `command = 'clear'` column in the `messages` table (added in schema v7) provides the split signal.
