# Architecture Research: v0.4.0 Session Intelligence

**Researched:** 2026-03-07
**Confidence:** HIGH

## Overview

Two features integrate into the existing architecture:
1. **Session naming** — first write-back capability (UI → API → SQLite)
2. **Ticket detection improvements** — additional scoring sources in import pipeline

## Session Naming: Data Flow

```
User edits name in SessionDetailPanel
  → PATCH /api/sessions/:id { userLabel: "new name" }
  → UPDATE sessions SET user_label = ? WHERE session_id = ?
  → Response: updated session object
  → Frontend updates local state
```

### New Route: `src/server/routes/sessions.js`
- `PATCH /api/sessions/:id` — update user_label and/or user_ticket
- Validates session exists (404 if not)
- Validates input (reject empty/whitespace-only)
- Returns updated session fields

### Modified: `src/db/schema.js`
- Schema v6: `ALTER TABLE sessions ADD COLUMN user_label TEXT`
- Migration: `MIGRATION_V5_TO_V6`

### Modified: `src/importer/db-writer.js`
- `upsertSession()` must use COALESCE to preserve user_label on re-import
- Change from `INSERT OR REPLACE` to `INSERT ... ON CONFLICT(session_id) DO UPDATE`
- The UPDATE SET clause excludes user_label (never overwritten by import)

### Modified: `src/server/routes/timeline.js`
- SELECT must include user_label
- Label chain: `COALESCE(user_label, custom_title, primary_ticket, working_branch)` or handle in JS

### Modified: `src/client/components/SessionDetailPanel.vue`
- Replace static session name display with Reka UI Editable component
- EditableRoot with submitMode='blur', activationMode='focus'
- On @submit: call PATCH endpoint, update parent state

### Modified: `src/client/components/GanttBar.vue`
- Label computation: add user_label to top of fallback chain

## Ticket Detection: Data Flow

```
Import pipeline processes JSONL file
  → parseTranscript() extracts messages (existing)
  → NEW: scanCommitMessages(messages) — extract tickets from tool_result git output
  → NEW: scanSummary(summary) — extract tickets from AI summary text
  → collectTickets() aggregates all sources with scores (existing)
  → scoreTickets() determines primary (existing)
```

### Modified: `src/importer/index.js`
- Add commit message scanning: look for tool_result blocks containing git commit output
- Add summary scanning: run ticket pattern against session summary text
- New scoring weights:
  - Git commit messages: ~50pts (reliable passive signal)
  - Summary mentions: ~25pts (AI-generated, moderately reliable)
  - Assistant content: ~3pts (very noisy, low weight)

### Modified: `src/importer/ticket-scorer.js`
- Add new source types to scoring
- Possibly refine denylist or scoring thresholds

### NOT Modified (explicitly)
- `src/importer/parser.js` — already extracts all message data needed
- `src/importer/discovery.js` — no changes
- `src/importer/fork-detector.js` — no changes
- `src/db/index.js` — only migration registration
- `src/client/pages/TimelinePage.vue` — no structural changes needed

## Component Boundaries

### New Files (1)
| File | Purpose |
|------|---------|
| `src/server/routes/sessions.js` | PATCH endpoint for user edits |

### Modified Files (5-6)
| File | Change |
|------|--------|
| `src/db/schema.js` | v6 migration, user_label column |
| `src/importer/db-writer.js` | COALESCE-based upsert preserving user fields |
| `src/server/routes/timeline.js` | Include user_label in query |
| `src/client/components/SessionDetailPanel.vue` | Reka UI Editable for name |
| `src/client/components/GanttBar.vue` | user_label in label chain |
| `src/importer/index.js` | New ticket sources (commit msgs, summary) |

## Build Order

### Phase A: Session Naming (backend first)
1. DB migration (user_label column)
2. Modify upsertSession() to preserve user fields
3. New PATCH route
4. Frontend inline edit + label chain update

### Phase B: Ticket Detection Improvements
1. Add commit message scanning to import pipeline
2. Add summary scanning
3. Tune scoring weights against real transcripts
4. Test with sample data at /tmp/cctimereporter-research/

**Phase A and B are independent** — can be built in either order or in parallel.

## Anti-Patterns to Avoid

- **Don't reuse custom_title for user edits** — it's import-managed, will be overwritten
- **Don't scan tool_result blocks indiscriminately** — too noisy, most contain file contents
- **Don't add git as a runtime dependency** — scanning should be opportunistic at import time
- **Don't break INSERT OR REPLACE for non-user fields** — only protect user_label/user_ticket

---
*Research completed: 2026-03-07*
