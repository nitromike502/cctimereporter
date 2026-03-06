# Claude Code Transcript JSONL Schema

This document provides a comprehensive schema definition for Claude Code transcript JSONL files.

## Overview

Claude Code stores conversation transcripts as JSONL (JSON Lines) files, where each line represents a single message or event in the conversation. Files are stored in:
- `~/.claude/projects/{project-path-encoded}/{session-id}.jsonl`

The `session-id` is a UUID that uniquely identifies a conversation session.

---

## Message Types

| Type | Description | Frequency |
|------|-------------|-----------|
| `user` | User input, tool results, slash commands | High |
| `assistant` | Claude's responses including text, thinking, and tool calls | High |
| `progress` | Real-time progress updates for long-running operations | Very High |
| `system` | System events: turn duration, errors, compaction, hooks | Medium |
| `file-history-snapshot` | File backup snapshots for undo/restore | Medium |
| `summary` | Session summary/title | Low |
| `queue-operation` | Message queue operations (enqueue/dequeue/remove) | Low |
| `custom-title` | User-defined session title | Rare |

---

## Common Properties (Base Message)

These properties appear on most message types:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Message type identifier |
| `uuid` | string (UUID) | Yes | Unique identifier for this message |
| `timestamp` | string (ISO 8601) | Yes | When the message was created |
| `parentUuid` | string (UUID) \| null | Yes | UUID of parent message in conversation tree |
| `sessionId` | string (UUID) | Yes* | Session identifier (matches filename) |
| `isSidechain` | boolean | Yes* | Whether this is part of a background/agent conversation |
| `userType` | string | Yes* | Always "external" |
| `cwd` | string | Yes* | Current working directory |
| `version` | string | Yes* | Claude Code version (e.g., "2.1.19") |
| `gitBranch` | string | No | Current git branch (empty if not in repo) |
| `slug` | string | No | Human-readable session identifier |

\* Not present on all message types (e.g., `summary`, `file-history-snapshot`, `custom-title`)

---

## Type: `user`

User messages contain human input, tool results, and slash commands.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | object | Yes | Message content object |
| `isMeta` | boolean | No | Meta message (not for Claude to respond to) |
| `isCompactSummary` | boolean | No | Compaction summary message |
| `isVisibleInTranscriptOnly` | boolean | No | Only stored in transcript, not sent to API |
| `toolUseResult` | object \| array \| string | No | Result from tool execution |
| `mcpMeta` | object | No | MCP tool structured response metadata |
| `sourceToolAssistantUUID` | string (UUID) | No | Assistant message that triggered this tool result |
| `thinkingMetadata` | object | No | Extended thinking configuration |
| `permissionMode` | string | No | Permission mode (e.g., "acceptEdits") |
| `agentId` | string | No | Agent identifier for sub-agent conversations |

### `message` Object (User)

```json
{
  "role": "user",
  "content": "string or array"
}
```

Content can be:
- **String**: Plain text user input
- **Array**: Contains content blocks

### Content Block Types (User)

#### Text Block
```json
{
  "type": "text",
  "text": "User message text"
}
```

#### Tool Result Block
```json
{
  "tool_use_id": "toolu_01ABC...",
  "type": "tool_result",
  "content": "Tool output string or JSON",
  "is_error": false
}
```

### `toolUseResult` Variations

The `toolUseResult` property can take different forms depending on the tool:

#### Bash Tool Result
```json
{
  "stdout": "command output",
  "stderr": "",
  "interrupted": false,
  "isImage": false
}
```

#### Read Tool Result
```json
{
  "content": "file contents",
  "filenames": ["/path/to/file"],
  "mode": "content",
  "numFiles": 1,
  "numLines": 100,
  "appliedLimit": 2000
}
```

#### Edit Tool Result
```json
{
  "filePath": "/path/to/file",
  "oldString": "original text",
  "newString": "replacement text",
  "originalFile": "full file contents",
  "replaceAll": false,
  "userModified": false,
  "structuredPatch": [
    {
      "oldStart": 10,
      "oldLines": 5,
      "newStart": 10,
      "newLines": 8,
      "lines": ["+added", "-removed", " unchanged"]
    }
  ]
}
```

#### Glob Tool Result
```json
{
  "filenames": ["file1.js", "file2.js"],
  "mode": "files",
  "numFiles": 2
}
```

#### Grep Tool Result
```json
{
  "filenames": ["file1.js"],
  "mode": "files_with_matches",
  "numFiles": 1,
  "durationMs": 150,
  "truncated": false
}
```

#### ToolSearch Result
```json
{
  "matches": [...],
  "query": "search terms",
  "total_deferred_tools": 50
}
```

#### Agent (Task) Result
```json
{
  "status": "completed",
  "prompt": "Agent task prompt",
  "agentId": "abc1234",
  "content": [...],
  "totalDurationMs": 45000,
  "totalTokens": 12000,
  "totalToolUseCount": 15,
  "usage": {...}
}
```

### `thinkingMetadata` Object
```json
{
  "maxThinkingTokens": 31999
}
```

### `mcpMeta` Object
```json
{
  "structuredContent": {
    "result": "JSON string of MCP tool response"
  }
}
```

---

## Type: `assistant`

Assistant messages contain Claude's responses.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | object | Yes | API message object |
| `requestId` | string | Yes | API request identifier |
| `agentId` | string | No | Agent identifier for sub-agent responses |

### `message` Object (Assistant)

```json
{
  "model": "claude-opus-4-5-20251101",
  "id": "msg_01ABC...",
  "type": "message",
  "role": "assistant",
  "content": [...],
  "stop_reason": null | "end_turn" | "stop_sequence",
  "stop_sequence": null | string,
  "usage": {...}
}
```

### Content Block Types (Assistant)

#### Text Block
```json
{
  "type": "text",
  "text": "Claude's response text"
}
```

#### Thinking Block
```json
{
  "type": "thinking",
  "thinking": "Claude's reasoning process",
  "signature": "base64 encoded signature"
}
```

#### Tool Use Block
```json
{
  "type": "tool_use",
  "id": "toolu_01ABC...",
  "name": "Bash",
  "input": {
    "command": "ls -la",
    "description": "List files"
  },
  "caller": {
    "type": "direct"
  }
}
```

**Note**: MCP tool calls may not have the `caller` property:
```json
{
  "type": "tool_use",
  "id": "toolu_01ABC...",
  "name": "mcp__google-sheets__get_sheet_data",
  "input": {
    "spreadsheet_id": "...",
    "sheet": "Sheet1"
  }
}
```

### `usage` Object
```json
{
  "input_tokens": 1500,
  "output_tokens": 500,
  "cache_creation_input_tokens": 10000,
  "cache_read_input_tokens": 5000,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 10000,
    "ephemeral_1h_input_tokens": 0
  },
  "service_tier": "standard"
}
```

---

## Type: `progress`

Progress messages provide real-time updates during long-running operations.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `data` | object | Yes | Progress data (type-specific) |
| `toolUseID` | string | Yes | Identifier for the tool call |
| `parentToolUseID` | string | Yes | Parent tool call identifier |

### Progress Data Types

#### `hook_progress`
```json
{
  "type": "hook_progress",
  "hookEvent": "SessionStart",
  "hookName": "SessionStart:clear",
  "command": "~/.claude/hooks/session_start.py"
}
```

#### `bash_progress`
```json
{
  "type": "bash_progress",
  "output": "current output",
  "fullOutput": "complete output so far",
  "elapsedTimeSeconds": 5,
  "totalLines": 100
}
```

#### `mcp_progress`
```json
{
  "type": "mcp_progress",
  "status": "started" | "completed",
  "serverName": "tickets",
  "toolName": "jira_get_issue"
}
```

#### `agent_progress`
```json
{
  "type": "agent_progress",
  "message": {...},
  "normalizedMessages": [],
  "prompt": "Agent task prompt",
  "agentId": "abc1234"
}
```

#### `query_update` (Web Search)
```json
{
  "type": "query_update",
  "query": "search query string"
}
```

#### `search_results_received` (Web Search)
```json
{
  "type": "search_results_received",
  "resultCount": 10,
  "query": "search query"
}
```

#### `waiting_for_task`
```json
{
  "type": "waiting_for_task",
  "taskDescription": "Analyze conversation",
  "taskType": "local_agent"
}
```

---

## Type: `system`

System messages record events, errors, and metadata.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subtype` | string | Yes | System message category |
| `level` | string | No | Log level: "info", "error", "suggestion" |
| `isMeta` | boolean | No | Whether this is a meta message |

### Subtypes

#### `turn_duration`
```json
{
  "type": "system",
  "subtype": "turn_duration",
  "durationMs": 162576
}
```

#### `compact_boundary`
```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "content": "Conversation compacted",
  "level": "info",
  "logicalParentUuid": "uuid-of-last-message-before-compaction",
  "compactMetadata": {
    "trigger": "auto",
    "preTokens": 155500
  }
}
```

#### `api_error`
```json
{
  "type": "system",
  "subtype": "api_error",
  "level": "error",
  "cause": {
    "code": "ConnectionRefused",
    "path": "https://api.anthropic.com/v1/messages",
    "errno": 0
  },
  "error": {...},
  "retryInMs": 622.4,
  "retryAttempt": 1,
  "maxRetries": 10
}
```

#### `local_command`
```json
{
  "type": "system",
  "subtype": "local_command",
  "content": "<command-name>/memory</command-name>\n<command-message>memory</command-message>\n<command-args></command-args>",
  "level": "info"
}
```

#### `stop_hook_summary`
```json
{
  "type": "system",
  "subtype": "stop_hook_summary",
  "hookCount": 1,
  "hookInfos": [
    {"command": "python3 hooks/stop.py"}
  ],
  "hookErrors": [],
  "preventedContinuation": false,
  "stopReason": "",
  "hasOutput": true,
  "level": "suggestion",
  "toolUseID": "uuid"
}
```

---

## Type: `file-history-snapshot`

Records file state for undo/restore functionality.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `messageId` | string (UUID) | Yes | Associated message ID |
| `snapshot` | object | Yes | Snapshot data |
| `isSnapshotUpdate` | boolean | Yes | Whether this updates an existing snapshot |

### `snapshot` Object
```json
{
  "messageId": "uuid",
  "timestamp": "2026-01-27T15:15:49.634Z",
  "trackedFileBackups": {
    "/path/to/file.php": {
      "backupFileName": "d377a8e07209d05f@v1",
      "version": 1,
      "backupTime": "2026-01-27T15:55:24.286Z"
    }
  }
}
```

---

## Type: `summary`

Session summary for display in session list.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `summary` | string | Yes | Brief description of the session |
| `leafUuid` | string (UUID) | Yes | UUID of the last message when summary was generated |

```json
{
  "type": "summary",
  "summary": "Fix restricted file URLs in PageBuilder",
  "leafUuid": "39867a2f-7570-44d4-b783-617c10beb75f"
}
```

---

## Type: `queue-operation`

Message queue operations for managing user input queue.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `operation` | string | Yes | "enqueue", "dequeue", or "remove" |
| `content` | string | No | Message content (for enqueue) |
| `sessionId` | string (UUID) | Yes | Session identifier |
| `timestamp` | string (ISO 8601) | Yes | Operation timestamp |

### Operations

#### Enqueue
```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-01-27T18:33:15.615Z",
  "sessionId": "uuid",
  "content": "User's queued message"
}
```

#### Dequeue
```json
{
  "type": "queue-operation",
  "operation": "dequeue",
  "timestamp": "2026-01-16T19:22:23.987Z",
  "sessionId": "uuid"
}
```

#### Remove
```json
{
  "type": "queue-operation",
  "operation": "remove",
  "timestamp": "2026-01-27T18:33:27.866Z",
  "sessionId": "uuid"
}
```

---

## Type: `custom-title`

User-assigned session title.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `customTitle` | string | Yes | User-defined title |
| `sessionId` | string (UUID) | Yes | Session identifier |

```json
{
  "type": "custom-title",
  "customTitle": "eshow-20260128",
  "sessionId": "uuid"
}
```

---

## Message Relationships

### Parent-Child Relationship

Messages form a tree structure via `parentUuid`:

```
user (parentUuid: null)           # Root message
  └── assistant (parentUuid: user.uuid)
        └── user (parentUuid: assistant.uuid)   # Tool result
              └── assistant (parentUuid: user.uuid)
                    └── user (parentUuid: assistant.uuid)  # Next human input
```

### Tool Call Flow

1. **Assistant** message contains `tool_use` content block with `id`
2. **Progress** messages track execution with matching `toolUseID`
3. **User** message contains `tool_result` with matching `tool_use_id`
4. `sourceToolAssistantUUID` links tool result back to assistant

### Session Identification

- `sessionId` matches the filename (without `.jsonl` extension)
- All messages in a file share the same `sessionId`
- `slug` provides a human-readable alternative (e.g., "lively-conjuring-gizmo")

### Sidechain Conversations

When `isSidechain: true`:
- Messages are from sub-agent conversations
- `agentId` identifies the specific agent
- Forms a separate conversation branch

### Compaction

When context grows too large:
1. `system` message with `subtype: "compact_boundary"` marks the boundary
2. `user` message with `isCompactSummary: true` contains conversation summary
3. `logicalParentUuid` links to the last pre-compaction message

---

## Tool Names

### Built-in Tools
- `Bash` - Execute shell commands
- `Read` - Read file contents
- `Write` - Write file contents
- `Edit` - Edit file with search/replace
- `Glob` - Find files by pattern
- `Grep` - Search file contents
- `Task` - Launch sub-agent
- `ToolSearch` - Search/load deferred tools
- `WebFetch` - Fetch and analyze web content
- `WebSearch` - Search the web
- `NotebookEdit` - Edit Jupyter notebooks

### MCP Tools
Format: `mcp__{server}__{tool}`
- `mcp__tickets__jira_get_issue`
- `mcp__google-sheets__get_sheet_data`
- `mcp__mssql__query`

---

## Edge Cases and Variations

### Empty Content
User messages may have empty content strings for meta messages.

### Tool Results as Strings
Some `toolUseResult` values are plain error strings:
```json
"toolUseResult": "Error: Invalid input"
```

### Tool Results as Arrays
When multiple tool calls complete:
```json
"toolUseResult": [
  {"tool_use_id": "...", "result": "..."},
  {"tool_use_id": "...", "result": "..."}
]
```

### Missing Optional Fields
Many fields are optional and may be absent:
- `gitBranch` - empty string when not in git repo
- `slug` - not always present
- `agentId` - only for sub-agent conversations
- `thinkingMetadata` - only when extended thinking enabled

---

## Transcript File Layout

All session transcripts live in `~/.claude/projects/<encoded-project-path>/`:

| Pattern | Location | Description |
|---------|----------|-------------|
| Regular sessions | `<uuid>.jsonl` | Top-level JSONL file |
| Team leader sessions | `<uuid>.jsonl` | Top-level JSONL file (same as regular) |
| Team member sessions | `<uuid>.jsonl` | Top-level JSONL file (same as regular, NOT in subdirectories) |
| Tool-invoked subagents | `<uuid>/subagents/agent-*.jsonl` | Subdirectory named after the parent session UUID |
| Tool results | `<uuid>/tool-results/` | Tool output files for a session |

Team leader sessions have a corresponding `<uuid>/subagents/` subdirectory containing their team member agent files. Team member sessions themselves are always top-level JSONL files -- they are not stored inside subdirectories.

---

## Distinguishing Session Types by JSONL Content

All sessions (regular, team leader, team member) have `userType: "external"` on their messages. The session type is determined by examining message-level fields, not file location.

### Regular session

- No `teamName` or `agentName` on messages
- May have a `type: "agent-name"` metadata entry if renamed via `/rename`
- May have a `type: "custom-title"` metadata entry

### Team leader

- `teamName` appears on messages ONLY after the `/team` command is used (not from the start of the session)
- `agentName` only appears on a standalone `type: "agent-name"` metadata entry (from `/rename`), NOT on regular messages
- Has a `<uuid>/subagents/` subdirectory containing team member agent files
- `has_subagents` may be true if inline agents were also used

### Team member

- `teamName` AND `agentName` present on EVERY message from line 0
- Both fields appear on regular message types (`user`, `assistant`, `progress`, `system`)
- The `agentName` value is the name assigned when the team member was created
- No `<uuid>/` subdirectory exists for the team member session

### Renamed session (via /rename)

- Gets a standalone `type: "agent-name"` entry with an `agentName` field
- Gets a standalone `type: "custom-title"` entry with a `customTitle` field
- Regular messages do NOT have `agentName` on them
- This is the key distinction from team members: renamed sessions have `agentName` only in metadata entries, while team members have it on every message

### Field presence summary

| Field on messages | Regular | Team leader | Team member | Renamed |
|-------------------|---------|-------------|-------------|---------|
| `teamName` | No | After `/team` | Every message | No |
| `agentName` (on messages) | No | No | Every message | No |
| `agentName` (metadata only) | No | Optional | N/A | Yes |
| `customTitle` (metadata) | Optional | Optional | No | Yes |

---

## Subagent Detection Logic

The importer classifies sessions into types using two detection mechanisms.

### Team member detection

The parser sets `isTeamMember = true` when a non-metadata message has both `teamName` and `agentName` fields present. This correctly identifies team members because:

- Team leaders only have `agentName` on `type: "agent-name"` metadata entries, not on regular messages
- Renamed sessions only have `agentName` on metadata entries, not on regular messages
- Only team members have `agentName` on every regular message

### Worktree-based subagent detection

Worktree-based subagents are detected by path pattern rather than JSONL content. A session is classified as a worktree subagent when the project path contains either:

- `-tmp-` in the path
- `.claude/worktrees/` in the path

### Tool-invoked subagent detection

Tool-invoked subagents (launched via the `Task` tool) are identified by their file path matching the pattern `<uuid>/subagents/agent-*.jsonl`. These are stored as subdirectories of their parent session.
