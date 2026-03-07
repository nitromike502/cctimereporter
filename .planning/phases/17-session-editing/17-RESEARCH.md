# Phase 17: Session Editing - Research

**Researched:** 2026-03-07
**Domain:** SQLite schema migration, Fastify PATCH API, Vue 3 modal forms, Reka UI Dialog
**Confidence:** HIGH

## Summary

This phase adds user-editable session names and ticket overrides via a modal dialog launched from the detail panel. The implementation spans three layers: database schema (new columns + migration + upsert fix), API endpoint (PATCH route), and frontend (edit modal + display logic changes).

The codebase already has all necessary patterns established: Reka UI Dialog is used in `SessionMessagesModal.vue`, schema migrations follow a well-tested ALTER TABLE chain in `src/db/index.js`, and the timeline API already returns `customTitle` and `summary` fields needed for editability detection.

**Primary recommendation:** Add `user_label` and `user_ticket` columns to the sessions table (separate from import-managed fields), convert `upsertSession` from INSERT OR REPLACE to INSERT ON CONFLICT DO UPDATE with COALESCE to protect user data, and build the edit modal using the existing Reka UI Dialog pattern.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| reka-ui | 2.8.2 | Dialog, form primitives | Already used for SessionMessagesModal; provides accessible DialogRoot/Portal/Overlay/Content/Title/Description |
| vue | 3.5.29 | Reactive forms, computed props | Project framework |
| fastify | 5.7.4 | PATCH route handler | Project server framework |
| node:sqlite | built-in | DatabaseSync for schema + queries | Project database layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| navigator.clipboard | Web API | Copy CLI command to clipboard | Copy button for `claude --session-id` command |

### No New Dependencies Needed
The project has everything required. No additional libraries need to be installed.

## Architecture Patterns

### Schema Change Pattern (established in codebase)

The project uses a versioned migration chain. Currently at SCHEMA_VERSION 5 with migrations v1->v2, v2->v3, v3->v4, v4->v5. The new migration will be v5->v6.

**Migration chain in `src/db/index.js`:**
Each version step has a `migrateVXtoVY(db)` function that calls `runMigration(db, MIGRATION_VX_TO_VY)`. The `openDatabase()` function chains them: if version is 5, run v5->v6. If version is 4, run v4->v5 then v5->v6, etc.

**New columns on sessions table:**
```sql
ALTER TABLE sessions ADD COLUMN user_label TEXT;
ALTER TABLE sessions ADD COLUMN user_ticket TEXT;
```

- `user_label` — user-set name via UI (separate from `custom_title` which comes from Claude Code)
- `user_ticket` — user-set ticket override via UI (separate from `primary_ticket` which comes from import scoring)

### Upsert Fix Pattern (INSERT ON CONFLICT DO UPDATE)

The current `upsertSession` uses `INSERT OR REPLACE` which deletes the old row and inserts a new one, wiping any columns not included in the INSERT. This is the critical bug: re-import will destroy `user_label` and `user_ticket`.

**Fix: Use INSERT ON CONFLICT DO UPDATE with COALESCE for user columns:**
```sql
INSERT INTO sessions (session_id, project_id, file_path, ... all import columns ...)
VALUES ($session_id, $project_id, $file_path, ...)
ON CONFLICT(session_id) DO UPDATE SET
  project_id = excluded.project_id,
  file_path = excluded.file_path,
  file_size = excluded.file_size,
  -- ... all import-managed columns use excluded.X ...
  working_branch = excluded.working_branch,
  primary_ticket = excluded.primary_ticket,
  summary = excluded.summary,
  custom_title = excluded.custom_title,
  -- User columns are NEVER overwritten by import:
  user_label = COALESCE(sessions.user_label, NULL),
  user_ticket = COALESCE(sessions.user_ticket, NULL)
```

Actually, the simplest approach: just omit `user_label` and `user_ticket` from the ON CONFLICT UPDATE SET clause entirely. They default to NULL on first insert and are never touched by import.

```sql
ON CONFLICT(session_id) DO UPDATE SET
  project_id = excluded.project_id,
  file_path = excluded.file_path,
  -- ... all import-managed columns ...
  -- user_label and user_ticket deliberately omitted = preserved
```

### API Route Pattern (PATCH endpoint)

Following the existing route registration pattern in `src/server/index.js`:

**New file: `src/server/routes/sessions.js`**
```javascript
export async function sessionsRoute(fastify, opts) {
  const { db } = opts;

  fastify.patch('/api/sessions/:id', async (request, reply) => {
    const sessionId = request.params.id;
    const { userLabel, userTicket } = request.body ?? {};

    // Validate session exists
    const session = db.prepare('SELECT session_id FROM sessions WHERE session_id = ?').get(sessionId);
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    // Update user-editable fields (null = clear/revert)
    db.prepare(`
      UPDATE sessions
      SET user_label = $user_label, user_ticket = $user_ticket
      WHERE session_id = $session_id
    `).run({
      $user_label: userLabel ?? null,
      $user_ticket: userTicket ?? null,
      $session_id: sessionId,
    });

    return { ok: true };
  });
}
```

Register in `src/server/index.js` alongside existing routes.

### Modal Component Pattern (from SessionMessagesModal.vue)

The existing modal uses Reka UI Dialog primitives:
```javascript
import {
  DialogRoot, DialogPortal, DialogOverlay,
  DialogContent, DialogTitle, DialogDescription,
} from 'reka-ui'
```

The edit modal follows the same structure but adds form fields. Key pattern: `v-model:open` with `@update:open` emission for two-way binding.

### Timeline API Response Enhancement

The `/api/timeline` response already includes `customTitle` and `summary` per session. It needs to also return:
- `userLabel` — from new `user_label` column
- `userTicket` — from new `user_ticket` column

The label chain in GanttBar.vue then becomes:
```
userLabel > customTitle > ticket > branch > summary > sessionId
```

And the ticket display becomes:
```
userTicket > primary_ticket (from scoring)
```

### Display Logic for Name Editability

The CONTEXT.md says: "Session name is ONLY editable when Claude Code did not provide a summary (no sessions-index.json entry)."

Detection: `session.summary` being non-null indicates Claude Code named the session via sessions-index.json. The `custom_title` field from Claude Code's sessions-index.json `customTitle` property is a different signal.

Actually, looking more carefully at the code: `summary` comes from `sessions-index.json` summary field (the auto-generated session description). The CONTEXT says "Named in Claude Code" when Claude Code provided a summary. So the check is: if `session.summary` is truthy, the name field is read-only.

Users who already set `user_label` via UI can edit/clear it even if summary exists -- wait, the CONTEXT says "Session name is ONLY editable when Claude Code did not provide a summary." But also "Users who already set a custom name via UI can edit or clear it." These seem contradictory. Resolution: if `user_label` is set by the user, they can always edit it. If `summary` exists AND `user_label` is not set, the field is read-only.

### Clipboard API for CLI Command

```javascript
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for non-HTTPS contexts (localhost is usually allowed)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
```

The command to display: `claude --session-id <full-session-id>`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal dialog | Custom overlay/focus trap | Reka UI DialogRoot/Portal/Overlay/Content | Already used in project, handles focus management, escape key, overlay click |
| Accessible form labels | Manual aria attributes | HTML `<label>` with `for` attribute | Standard HTML, no library needed |
| Clipboard copy | Custom selection logic | navigator.clipboard.writeText() | Standard Web API, works on localhost |
| Schema migration | Manual ALTER TABLE | Existing `runMigration()` + migration chain | Established pattern with error handling |

## Common Pitfalls

### Pitfall 1: INSERT OR REPLACE Destroys User Data
**What goes wrong:** The current `upsertSession` uses `INSERT OR REPLACE` which DELETEs the existing row then INSERTs a new one. Any column not in the INSERT list (like `user_label`, `user_ticket`) gets wiped to NULL/default.
**Why it happens:** SQLite's `INSERT OR REPLACE` is a DELETE + INSERT, not an UPDATE.
**How to avoid:** Convert to `INSERT ... ON CONFLICT(session_id) DO UPDATE SET` and omit user columns from the UPDATE SET clause.
**Warning signs:** User edits disappear after running import.

### Pitfall 2: PATCH Body Parsing in Fastify 5
**What goes wrong:** Fastify 5 does not parse JSON request bodies by default for all content types.
**How to avoid:** Fastify 5 auto-parses `application/json` content-type bodies. The frontend `fetch()` must set `Content-Type: application/json` and use `JSON.stringify()` for the body. No additional configuration needed.
**Warning signs:** `request.body` is undefined in the route handler.

### Pitfall 3: Optimistic UI Update vs. Refetch
**What goes wrong:** After saving edits, the UI shows stale data until a full timeline refetch.
**How to avoid:** After a successful PATCH, update `selectedSession` in the local reactive state immediately (optimistic update). This avoids a full timeline refetch which would reset scroll position and selection.
**Warning signs:** User saves, sees old values until clicking away and back.

### Pitfall 4: Empty String vs. Null for "Cleared" Fields
**What goes wrong:** Sending `""` (empty string) to the API stores an empty string instead of NULL, breaking COALESCE/fallback logic.
**How to avoid:** The PATCH handler should normalize: if `userLabel` is `""` or undefined, store NULL. Frontend should send `null` explicitly when clearing.
**Warning signs:** After clearing a custom name, the fallback label doesn't appear (empty string is truthy-ish in template rendering).

### Pitfall 5: Prepared Statement Caching with node:sqlite
**What goes wrong:** Creating prepared statements inside route handlers (per-request) is inefficient.
**How to avoid:** Prepare the UPDATE statement once outside the route handler, similar to how `sessionStmt` and `messageStmt` are done in timeline.js.
**Warning signs:** Not a correctness issue, but a performance best practice already followed in the codebase.

## Code Examples

### Migration SQL (v5 -> v6)
```javascript
// In src/db/schema.js
export const MIGRATION_V5_TO_V6 = `
ALTER TABLE sessions ADD COLUMN user_label TEXT;
ALTER TABLE sessions ADD COLUMN user_ticket TEXT;
`;
```

### Updated upsertSession with ON CONFLICT
```javascript
// In src/importer/db-writer.js
export function upsertSession(db, sessionData) {
  const stmt = db.prepare(`
    INSERT INTO sessions (
      session_id, project_id, file_path, file_size, file_modified_at,
      working_branch, primary_ticket, summary, custom_title, slug,
      first_message_at, last_message_at, last_updated_at,
      message_count, user_message_count, assistant_message_count,
      tool_use_count, fork_count, real_fork_count,
      is_compacted, has_subagents, is_subagent, team_name, agent_name,
      first_prompt
    ) VALUES (
      $session_id, $project_id, $file_path, $file_size, $file_modified_at,
      $working_branch, $primary_ticket, $summary, $custom_title, $slug,
      $first_message_at, $last_message_at, $last_updated_at,
      $message_count, $user_message_count, $assistant_message_count,
      $tool_use_count, $fork_count, $real_fork_count,
      $is_compacted, $has_subagents, $is_subagent, $team_name, $agent_name,
      $first_prompt
    )
    ON CONFLICT(session_id) DO UPDATE SET
      project_id = excluded.project_id,
      file_path = excluded.file_path,
      file_size = excluded.file_size,
      file_modified_at = excluded.file_modified_at,
      working_branch = excluded.working_branch,
      primary_ticket = excluded.primary_ticket,
      summary = excluded.summary,
      custom_title = excluded.custom_title,
      slug = excluded.slug,
      first_message_at = excluded.first_message_at,
      last_message_at = excluded.last_message_at,
      last_updated_at = excluded.last_updated_at,
      message_count = excluded.message_count,
      user_message_count = excluded.user_message_count,
      assistant_message_count = excluded.assistant_message_count,
      tool_use_count = excluded.tool_use_count,
      fork_count = excluded.fork_count,
      real_fork_count = excluded.real_fork_count,
      is_compacted = excluded.is_compacted,
      has_subagents = excluded.has_subagents,
      is_subagent = excluded.is_subagent,
      team_name = excluded.team_name,
      agent_name = excluded.agent_name,
      first_prompt = excluded.first_prompt
  `);
  // user_label and user_ticket deliberately omitted from ON CONFLICT
  // so they are preserved across re-imports

  stmt.run({ /* ... same bindings as current ... */ });
}
```

### Edit Modal Template Structure
```html
<DialogRoot :open="open" @update:open="$emit('update:open', $event)">
  <DialogPortal>
    <DialogOverlay class="modal-overlay" />
    <DialogContent class="modal-content">
      <DialogTitle class="modal-title">Edit Session</DialogTitle>
      <DialogDescription class="sr-only">
        Edit session name and ticket
      </DialogDescription>
      <button class="modal-close" @click="close" aria-label="Close">&times;</button>

      <form class="edit-form" @submit.prevent="save">
        <!-- Session Name -->
        <div class="form-field">
          <label for="edit-name">Session Name</label>
          <div class="input-wrapper">
            <input
              id="edit-name"
              v-model="nameValue"
              :disabled="nameReadOnly"
              :placeholder="namePlaceholder"
              type="text"
            />
            <button v-if="nameValue" type="button" class="clear-btn" @click="nameValue = ''">
              <!-- x icon -->
            </button>
          </div>
          <span v-if="nameReadOnly" class="field-note">Named in Claude Code</span>
        </div>

        <!-- Ticket ID -->
        <div class="form-field">
          <label for="edit-ticket">Ticket ID</label>
          <div class="input-wrapper">
            <input
              id="edit-ticket"
              v-model="ticketValue"
              :placeholder="ticketPlaceholder"
              type="text"
            />
            <button v-if="ticketValue" type="button" class="clear-btn" @click="ticketValue = ''">
              <!-- x icon -->
            </button>
          </div>
        </div>

        <!-- Persistence notice -->
        <p class="persistence-notice">
          Changes are local to CC Time Reporter and do not persist to Claude Code
        </p>

        <!-- CLI command -->
        <div class="cli-command">
          <code>claude --session-id {{ sessionId }}</code>
          <button type="button" @click="copyCommand">Copy</button>
        </div>

        <button type="submit" class="save-btn">Save</button>
      </form>
    </DialogContent>
  </DialogPortal>
</DialogRoot>
```

### PATCH Fetch Call
```javascript
async function save() {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userLabel: nameValue.value || null,
      userTicket: ticketValue.value || null,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  emit('saved', { userLabel: nameValue.value || null, userTicket: ticketValue.value || null });
  emit('update:open', false);
}
```

### Updated Label Chain in GanttBar.vue
```javascript
const label = computed(() => {
  if (props.session.userLabel) return props.session.userLabel
  if (props.session.customTitle) return props.session.customTitle
  if (props.session.ticket) return props.session.ticket
  if (props.session.branch) return props.session.branch
  if (props.session.summary) {
    const parsed = parseCommandXml(props.session.summary) || props.session.summary
    const words = parsed.split(/\s+/).slice(0, 5).join(' ')
    return words.length < parsed.length ? words + '...' : words
  }
  return props.session.sessionId.slice(0, 8)
})
```

### Updated Ticket Display
```javascript
// Wherever ticket is displayed, use userTicket fallback:
const displayTicket = computed(() => props.session.userTicket || props.session.ticket)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| INSERT OR REPLACE | INSERT ON CONFLICT DO UPDATE | This phase | Prevents user data loss on re-import |
| Single custom_title column | Separate user_label + custom_title | This phase | Clean separation of import-managed vs user-managed data |
| Read-only session display | Editable via PATCH API | This phase | Users can customize session metadata |

## Key Implementation Sequence

1. **Schema migration (v5->v6):** Add `user_label` and `user_ticket` columns
2. **Fix upsertSession:** Convert INSERT OR REPLACE to INSERT ON CONFLICT DO UPDATE
3. **PATCH API route:** New `src/server/routes/sessions.js`
4. **Timeline API update:** Include `userLabel` and `userTicket` in response
5. **Edit modal component:** `SessionEditModal.vue` using Reka UI Dialog
6. **Detail panel integration:** Pencil icon button, hover behavior, emit to open modal
7. **Display logic updates:** GanttBar label chain, DaySummary ticket display, detail panel
8. **Customized indicator:** Subtle icon on bar/detail when user has customized

## Open Questions

1. **Name editability when user previously set a label but summary now exists:**
   - What we know: CONTEXT says name is "ONLY editable when Claude Code did not provide a summary" BUT ALSO "Users who already set a custom name via UI can edit or clear it"
   - Recommendation: If `user_label` is set (user previously edited), allow editing regardless of summary. If `user_label` is null AND `summary` exists, show as read-only. This respects both rules.

2. **Pencil icon source:**
   - What we know: The project uses no icon library. SessionMessagesModal uses HTML entity `&times;` for close. Continuation icons use unicode triangles.
   - Recommendation: Use an inline SVG pencil icon (small, no dependency). A simple 16x16 SVG edit/pencil icon.

3. **Customized indicator icon:**
   - Recommendation: A small dot or asterisk indicator, similar to "modified" indicators in editors. Could be a CSS-only pseudo-element.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/db/schema.js`, `src/db/index.js` (migration chain pattern)
- Codebase analysis: `src/importer/db-writer.js` (current INSERT OR REPLACE problem)
- Codebase analysis: `src/client/components/SessionMessagesModal.vue` (Reka UI Dialog pattern)
- Codebase analysis: `src/server/routes/timeline.js` (API response structure)
- Codebase analysis: `src/client/components/GanttBar.vue` (label chain)
- Codebase analysis: `src/importer/session-index.js` (summary/customTitle source)

### Secondary (MEDIUM confidence)
- SQLite ON CONFLICT documentation for INSERT behavior (well-established SQL feature)
- Fastify 5 JSON body parsing (auto-parsing for application/json content type)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - everything already in project, no new dependencies
- Architecture: HIGH - all patterns established in codebase, following existing conventions
- Schema migration: HIGH - migration chain pattern is well-established with 4 prior migrations
- Upsert fix: HIGH - INSERT ON CONFLICT is standard SQLite, well-documented
- Pitfalls: HIGH - identified from direct code analysis
- Modal UX: HIGH - Reka UI Dialog already used identically in SessionMessagesModal

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable domain, no external dependency changes expected)
