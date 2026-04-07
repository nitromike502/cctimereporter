---
phase: quick-004
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/sessions.js
  - src/client/components/SessionMessagesModal.vue
autonomous: true

must_haves:
  truths:
    - "Fork modal shows first 2 session-start messages from primary branch"
    - "Fork modal shows skip count between session start and pre-fork context"
    - "Fork modal shows last 2-3 pre-fork context messages from primary branch"
    - "Fork modal shows fork point divider separating context from fork messages"
    - "Fork modal shows all fork branch messages with normal styling"
    - "Context messages (session start + pre-fork) are visually dim/muted"
    - "Primary branch (non-fork) message modal is unchanged"
  artifacts:
    - path: "src/services/sessions.js"
      provides: "Fork context zone query logic"
    - path: "src/client/components/SessionMessagesModal.vue"
      provides: "Zone-aware rendering with dim/muted context styling"
  key_links:
    - from: "src/services/sessions.js"
      to: "messages table"
      via: "SQL queries for primary branch context + fork branch messages"
      pattern: "fork_branch_id IS NULL.*parent_uuid"
    - from: "src/client/components/SessionMessagesModal.vue"
      to: "zone field on messages"
      via: "conditional CSS classes based on msg.zone"
      pattern: "zone.*context"
---

<objective>
When viewing a fork branch's messages in the modal, show context from the primary branch before the fork messages: first 2 session-start messages, a skip count, last 2-3 pre-fork messages, a fork point divider, then all fork branch messages. Context messages are styled dim/muted.

Purpose: Fork messages lack context — the user can't see what conversation led to the fork. Adding primary branch context zones makes fork branches understandable without switching back and forth.

Output: Updated sessions service returning zone-annotated messages for fork queries, and updated modal component rendering zones with appropriate styling.
</objective>

<execution_context>
@/home/meckert/.claude/get-shit-done/workflows/execute-plan.md
@/home/meckert/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/services/sessions.js
@src/client/components/SessionMessagesModal.vue
@src/server/routes/messages.js
@src/db/schema.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add fork context zone query logic to sessions service</name>
  <files>src/services/sessions.js</files>
  <action>
When `forkBranchId` is provided (and not "all"), change `getMessages` to return zone-annotated messages instead of just the fork branch messages. The response shape stays the same (`{ messages, totalCount, skipped }`) but each message object gains a `zone` field.

Algorithm for the fork branch case:

1. Get the fork branch messages (existing `forkBranchStmt` query). These are zone `"fork"`.

2. Find the fork point: take the first fork branch message by timestamp. Query for that message's `parent_uuid`:
   ```sql
   SELECT parent_uuid FROM messages WHERE session_id = ? AND fork_branch_id = ? ORDER BY timestamp ASC LIMIT 1
   ```
   The `parent_uuid` value is the UUID of the last shared message on the primary branch.

3. Get ALL primary branch messages with content (existing `primaryBranchStmt` query, which filters `content IS NOT NULL` and `fork_branch_id IS NULL`).

4. Find the index of the fork point message (by matching uuid to the parent_uuid from step 2) in the primary branch list. If not found (edge case), fall back to returning only fork messages with zone "fork" (current behavior).

5. Build the context zones:
   - **Session start**: first 2 primary branch messages with content. Zone: `"context-start"`.
   - **Pre-fork context**: last 3 primary branch messages at or before the fork point index (i.e., from index `forkPointIdx - 2` to `forkPointIdx`, clamped to 0). Zone: `"context-prefork"`. If the fork point is within the first 5 messages, session start and pre-fork may overlap — deduplicate (prefer context-start zone for overlapping messages).
   - **Skipped count**: number of primary branch messages between session start and pre-fork context that were omitted.
   - **Fork messages**: all fork branch messages. Zone: `"fork"`.

6. Return:
   ```js
   {
     messages: [...sessionStartMsgs, ...preForkMsgs, ...forkMsgs],
     totalCount: forkMsgs.length,  // fork message count (what the user cares about)
     skipped: skippedCount,        // primary branch messages skipped between start and pre-fork
     hasForkContext: true           // flag so the UI knows to render zone-aware layout
   }
   ```

Add a new prepared statement for fetching the fork point parent_uuid:
```sql
SELECT parent_uuid FROM messages
WHERE session_id = ? AND fork_branch_id = ?
ORDER BY timestamp ASC LIMIT 1
```

Keep existing behavior unchanged for non-fork queries (primary branch, "all" branches). The `zone` field should NOT be added to non-fork responses — this avoids any impact on existing UI behavior.

Map context messages to the same response shape as fork messages (uuid, role, content, timestamp, is_fork_branch, fork_branch_id) plus the `zone` field.
  </action>
  <verify>
Run `node -e "import('./src/services/sessions.js')"` to confirm no syntax errors. Manually inspect that:
- Non-fork getMessages calls return the same shape as before (no zone field)
- The new prepared statement is valid SQL
  </verify>
  <done>
getMessages returns zone-annotated messages for fork queries: session start (zone "context-start"), pre-fork (zone "context-prefork"), fork (zone "fork"), plus skipped count and hasForkContext flag. Non-fork queries unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Render context zones with dim styling in SessionMessagesModal</name>
  <files>src/client/components/SessionMessagesModal.vue</files>
  <action>
Update the modal to handle the new zone-annotated response when `hasForkContext` is true in the API response.

**Data changes:**
- Add a `hasForkContext` ref (boolean, default false), set from `data.hasForkContext` in the fetch watcher.

**Template changes — replace the current message rendering with zone-aware layout when `hasForkContext` is true:**

When `hasForkContext` is false, keep the existing rendering exactly as-is (firstMessages, divider, lastMessages).

When `hasForkContext` is true, render ALL messages from `messages` array in order, with zone-based visual treatment:

1. Iterate over messages. For each message:
   - If `msg.zone === 'context-start'` or `msg.zone === 'context-prefork'`: render with `message-item--context` CSS class (dim styling).
   - If `msg.zone === 'fork'`: render with normal styling (existing classes).

2. Between context-start messages and context-prefork messages (when `skipped > 0`), render a divider: `"N earlier messages skipped"`.

3. Between the last context-prefork message and the first fork message, render a fork point divider: a horizontal rule with text `"fork point"` centered.

**Implementation approach:**
- Compute a `zoneGroups` computed property that splits `messages` into sequential groups by zone. This makes the template cleaner.
- OR simpler: just iterate all messages and use `v-if` between items to insert dividers when the zone changes from the previous message.

Recommended simpler approach — iterate `messages` with zone transition detection:
```html
<template v-for="(msg, i) in messages" :key="msg.uuid || i">
  <!-- Insert skip divider when transitioning from context-start to context-prefork -->
  <div v-if="hasForkContext && msg.zone === 'context-prefork' && i > 0 && messages[i-1]?.zone === 'context-start' && skipped > 0"
       class="message-divider">
    <span class="divider-text">{{ skipped }} earlier messages</span>
  </div>
  <!-- BUT also handle case where skipped divider appears before first context-prefork even if previous isn't context-start (when start and prefork don't overlap) -->

  <!-- Insert fork point divider when transitioning from context-prefork to fork -->
  <div v-if="hasForkContext && msg.zone === 'fork' && i > 0 && messages[i-1]?.zone !== 'fork'"
       class="message-divider message-divider--fork">
    <span class="divider-text divider-text--fork">fork point</span>
  </div>

  <div class="message-item" :class="[`message-item--${msg.role}`, { 'message-item--context': hasForkContext && msg.zone?.startsWith('context') }]">
    <!-- existing message rendering (role, timestamp, content, expand) -->
  </div>
</template>
```

When `hasForkContext` is false, use the existing firstMessages/lastMessages split rendering (no changes).

**CSS additions:**

```css
.message-item--context {
  opacity: 0.55;
  border-color: var(--color-border);
}

.message-item--context .message-content {
  color: var(--color-muted);
}

.message-item--context .message-role {
  color: var(--color-muted);
}

.message-divider--fork {
  margin: var(--spacing-sm) 0;
}

.divider-text--fork {
  font-weight: 600;
  color: var(--color-warning, var(--color-muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: var(--font-size-xs);
}
```

**Update the title** when `hasForkContext` is true: keep "Fork Branch Messages" but update the count display to show fork message count (totalCount from response) rather than total including context.

**Preserve all existing functionality:** expand/collapse, content truncation, timestamp formatting, overflow detection. These work on any message regardless of zone.
  </action>
  <verify>
Run `npm run build` to confirm the frontend compiles without errors. Visually verify by:
1. Opening a session with fork branches in the UI
2. Clicking a fork branch to open the modal
3. Confirming context zones appear dim, fork point divider shows, fork messages render normally
4. Opening a primary branch modal to confirm no changes
  </verify>
  <done>
Fork modal displays three zones: dim session-start context, skip count divider, dim pre-fork context, fork point divider, then normal-styled fork messages. Primary branch modal unchanged.
  </done>
</task>

</tasks>

<verification>
- `npm run build` succeeds
- Fork branch modal shows context zones (session start, skip count, pre-fork, fork point divider, fork messages)
- Context messages are visually dim/muted compared to fork messages
- Primary branch modal displays identically to current behavior (no zone field, same head/tail split)
- "all branches" modal displays identically to current behavior
- Fork branches with very few primary messages (fork point within first 5 messages) handle gracefully without duplicate messages
</verification>

<success_criteria>
- Fork modal shows primary branch context before fork messages in three visual zones
- Context messages are clearly distinct (dim/muted) from fork messages (normal)
- Fork point divider visually separates context from fork content
- No regressions to primary branch or "all branches" message modal views
</success_criteria>

<output>
After completion, create `.planning/quick/004-fork-message-modal-context-zones/004-SUMMARY.md`
</output>
