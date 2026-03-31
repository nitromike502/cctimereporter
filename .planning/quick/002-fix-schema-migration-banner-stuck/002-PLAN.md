---
phase: quick
plan: 002
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/index.js
  - src/server/routes/timeline.js
  - src/server/routes/import.js
  - src/client/pages/TimelinePage.vue
autonomous: true

must_haves:
  truths:
    - "Migration banner appears when schema was migrated on server startup"
    - "After successful reimport, banner does not reappear on page refresh"
    - "Dismissing banner persists across page refresh (keyed to schema version)"
    - "Banner reappears if app upgrades again (new schema version invalidates localStorage key)"
  artifacts:
    - path: "src/server/routes/timeline.js"
      provides: "Dynamic schemaMigrated flag that clears after import"
    - path: "src/client/pages/TimelinePage.vue"
      provides: "localStorage-persisted dismissal keyed to schema version"
  key_links:
    - from: "src/server/routes/import.js"
      to: "server migrated state"
      via: "clearing shared migrated flag after successful import"
      pattern: "migrated.*=.*false"
    - from: "src/client/pages/TimelinePage.vue"
      to: "localStorage"
      via: "persist migration dismissal keyed to schema version"
      pattern: "localStorage.*schemaMigrated"
---

<objective>
Fix the schema migration banner so it properly dismisses after reimport or manual dismissal. Currently the banner reappears on every timeline fetch because the `migrated` flag is a static boolean baked into the server at startup, and frontend dismissal is a transient component ref lost on refresh.

Purpose: The banner is stuck in a permanent-on state after any migration, making it useless and annoying.
Output: Working banner lifecycle -- appears on migration, clears after reimport, dismissal persists across refresh.
</objective>

<execution_context>
@/home/meckert/.claude/get-shit-done/workflows/execute-plan.md
@/home/meckert/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/db/index.js
@src/db/schema.js
@src/server/index.js
@src/server/routes/timeline.js
@src/server/routes/import.js
@src/client/pages/TimelinePage.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make server-side migrated flag mutable and clear it after import</name>
  <files>src/server/index.js, src/server/routes/timeline.js, src/server/routes/import.js</files>
  <action>
The root cause: `migrated` is passed as a plain boolean into the timeline route closure at registration time. It never changes, so the API always returns `schemaMigrated: true` even after a successful reimport.

Fix approach: Use a shared mutable state object instead of a plain boolean.

1. In `src/server/index.js`:
   - Create a shared state object: `const serverState = { migrated }` where `migrated` comes from openDatabase().
   - Pass `serverState` (the object reference) to both `timelineRoute` and `importRoute` via opts.
   - This replaces passing the plain boolean `migrated` to timelineRoute.

2. In `src/server/routes/timeline.js`:
   - Destructure `serverState` from opts (instead of `migrated`).
   - In the GET handler, read `serverState.migrated` dynamically instead of the closed-over boolean.
   - Also include `schemaVersion` in the response (import SCHEMA_VERSION from schema.js). The frontend needs this to key its localStorage dismissal.

3. In `src/server/routes/import.js`:
   - Destructure `serverState` from opts.
   - After successful import (in both POST and SSE complete paths), set `serverState.migrated = false`.
   - For POST: set it before returning the success response.
   - For SSE: set it before sending the 'complete' event.

Do NOT introduce a new API endpoint or separate state management module. The shared object reference is the simplest correct fix.
  </action>
  <verify>
Run `node -e "import('./src/server/index.js').then(m => console.log('OK'))"` to confirm no syntax errors.
Grep for `serverState` in the three files to confirm wiring.
Grep to confirm no remaining references to the old `migrated` boolean pattern in timeline.js opts destructuring.
  </verify>
  <done>
Server returns `schemaMigrated: true` only until the first successful import completes, then returns `schemaMigrated: false` for all subsequent timeline requests (without server restart). Timeline response also includes `schemaVersion` number.
  </done>
</task>

<task type="auto">
  <name>Task 2: Persist banner dismissal in localStorage keyed to schema version</name>
  <files>src/client/pages/TimelinePage.vue</files>
  <action>
The frontend has two dismissal paths that both need fixing:

1. Replace transient `migrationDismissed` ref with localStorage-backed state:
   - Add a constant: `const MIGRATION_DISMISSED_KEY = 'cctimereporter:migrationDismissed'`
   - Initialize `migrationDismissed` as a ref that reads from localStorage on mount.
   - The localStorage value should store the schema version that was dismissed (e.g., "9"). This way, if the app upgrades again to v10, the old dismissal for v9 doesn't suppress the new banner.

2. Update the dismiss button click handler:
   - When user clicks Dismiss, write the current `schemaVersion` (from the API response) to localStorage under the key.
   - Set `migrationDismissed.value = true` for immediate UI update.

3. Update `fetchTimeline` response handling:
   - Read `data.schemaVersion` from the response and store it in a ref.
   - Read `data.schemaMigrated` as before.
   - After setting `schemaMigrated.value`, check if localStorage has a dismissal for this exact schema version. If so, set `migrationDismissed.value = true`.

4. Update the import complete handler:
   - On 'complete' SSE event, set `schemaMigrated.value = false` (already done).
   - Also write the current schema version to localStorage dismissal key (since a successful reimport is equivalent to acknowledging the migration).

5. The banner v-if condition stays the same: `schemaMigrated && !importRunning && !migrationDismissed`.

Do NOT remove the existing `schemaMigrated.value = false` on import complete -- keep it for immediate reactivity. The server-side fix (Task 1) ensures subsequent fetches also return false.
  </action>
  <verify>
Run `npm run build` to confirm the frontend builds without errors.
Manually verify the logic: grep for `MIGRATION_DISMISSED_KEY` and `schemaVersion` in TimelinePage.vue to confirm all paths are wired.
  </verify>
  <done>
Banner dismissal persists across page refresh (stored in localStorage). Banner reappears on next schema upgrade (localStorage key is version-specific). Successful reimport also persists dismissal.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` succeeds (frontend compiles)
2. `node -e "import('./src/server/index.js').then(m => console.log('OK'))"` succeeds (server module loads)
3. Grep confirms `serverState.migrated = false` appears in import route (server clears flag)
4. Grep confirms `localStorage` usage with schema version key in TimelinePage.vue (frontend persists dismissal)
5. No references to old `{ migrated }` destructuring pattern remain in timeline route opts
</verification>

<success_criteria>
- Migration banner appears when DB was migrated on startup
- Clicking "Re-import Now" runs full import, banner disappears, stays gone on refresh
- Clicking "Dismiss" hides banner, stays hidden on refresh
- New schema upgrade (version bump) causes banner to reappear despite prior dismissal
- Server stops returning schemaMigrated=true after successful import (no server restart needed)
</success_criteria>

<output>
After completion, create `.planning/quick/002-fix-schema-migration-banner-stuck/002-SUMMARY.md`
</output>
