---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/importer/index.js
  - src/server/routes/import.js
  - src/server/routes/timeline.js
  - src/client/pages/TimelinePage.vue
  - src/client/components/SessionDetailPanel.vue
autonomous: true

must_haves:
  truths:
    - "User sees 'Discovering sessions...' status text during discovery phase instead of a silent spinner"
    - "User sees progress count of projects scanned during discovery (e.g. 'Scanning project 3 of 12...')"
    - "After schema migration, user sees a notification banner suggesting re-import"
    - "Session detail panel shows total elapsed time alongside working time"
  artifacts:
    - path: "src/importer/index.js"
      provides: "Discovery phase progress callbacks"
    - path: "src/server/routes/timeline.js"
      provides: "Schema migration flag in timeline response and elapsedTimeMs on sessions"
    - path: "src/client/pages/TimelinePage.vue"
      provides: "Discovery status text + re-import notification banner"
    - path: "src/client/components/SessionDetailPanel.vue"
      provides: "Elapsed time display alongside working time"
  key_links:
    - from: "src/importer/index.js"
      to: "src/server/routes/import.js"
      via: "onProgress callback with phase='discovering'"
      pattern: "onProgress.*phase.*discover"
    - from: "src/server/routes/timeline.js"
      to: "src/client/pages/TimelinePage.vue"
      via: "schemaMigrated flag in API response"
      pattern: "schemaMigrated"
---

<objective>
Add three UI improvements: (1) show discovery phase progress during import so users know the app is not frozen, (2) show a re-import notification banner after schema migrations, and (3) show total elapsed time in the session detail panel alongside working time.

Purpose: Users currently see an indeterminate spinner with no text during the discovery phase of import, which can take 10-30 seconds on large transcript sets. The spinner gives no indication of what is happening. Additionally, after a schema migration (e.g. app update), stale data may cause degraded features, but users have no way to know a re-import would fix it.

Output: Updated import pipeline with discovery progress events, updated timeline API with migration metadata, updated TimelinePage with discovery status text and re-import notification banner.
</objective>

<execution_context>
@/home/meckert/.claude/get-shit-done/workflows/execute-plan.md
@/home/meckert/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/importer/index.js
@src/server/routes/import.js
@src/server/routes/timeline.js
@src/client/pages/TimelinePage.vue
@src/db/index.js
@src/db/schema.js
@src/client/components/SessionDetailPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add discovery phase progress events and schema migration tracking</name>
  <files>
    src/importer/index.js
    src/server/routes/import.js
    src/server/routes/timeline.js
    src/db/index.js
  </files>
  <action>
    **Discovery progress in importer/index.js:**

    In the `importAll()` function, add `onProgress` calls during the discovery phase (the first-pass loop starting at line 419). Currently the first `onProgress` call happens at line 502 AFTER discovery is complete. Add progress events during discovery:

    1. Before the discovery loop starts (line 406), emit:
       `onProgress?.({ phase: 'discovering', discovered: 0, total: projects.length, currentProject: null })`

    2. Inside the `for (const project of projects)` loop (line 419), after processing each project's files, emit:
       `onProgress?.({ phase: 'discovering', discovered: projectIndex + 1, total: projects.length, currentProject: project.projectPath })`
       Use a counter variable or convert to indexed for-loop.

    3. After the discovery loop ends (before line 502), emit:
       `onProgress?.({ phase: 'discovered', totalFiles: totalFiles, totalProjects: projects.length, skipped: filesSkipped })`
       This replaces the existing first `onProgress` call at line 502 which currently sends `{ phase: 'importing', processed: 0, ... }`. Keep the existing importing event as well (send both: discovered summary, then the importing-start event).

    The SSE route in import.js already forwards all onProgress events, so no changes needed there.

    **Schema migration tracking in db/index.js:**

    Modify `openDatabase()` to return migration metadata alongside the db. Change the return to:
    `return { db, migrated: boolean }` where `migrated` is true if any migration ran (v1->v2, v2->v3, etc.) or if the database was dropped and recreated due to unknown version.

    Set a `let migrated = false` at the top of the function. Set `migrated = true` in each migration branch and in the drop-and-recreate path. Return `{ db, migrated }`.

    **Update bin/cli.js** to destructure: `const { db, migrated } = openDatabase()` and pass `migrated` into `createServer(db, { migrated })`.

    **Update src/server/index.js** to accept and store the `migrated` option, passing it to routes that need it.

    **Expose migration status in timeline.js:**

    Add `schemaMigrated: boolean` to the timeline API response object. This tells the frontend that a migration happened on this server startup and a re-import is recommended. The value comes from the server options passed through from cli.js.

    The timeline route registration receives opts — add `migrated` to opts in the server factory and read it in the timeline route handler.
  </action>
  <verify>
    1. `node -e "import('./src/db/index.js').then(m => { const r = m.openDatabase(); console.log('migrated:', r.migrated, 'db:', typeof r.db); r.db.close(); })"` — should print `migrated: false` (no migration needed on existing db)
    2. `npm run build` succeeds
    3. Start server, call `curl -s http://localhost:3847/api/timeline | node -e "process.stdin.on('data', d => { const j = JSON.parse(d); console.log('schemaMigrated:', j.schemaMigrated) })"` — should print `schemaMigrated: false` (or true if migration just ran)
  </verify>
  <done>
    - importAll() emits onProgress events with phase='discovering' during the discovery loop, including project count and current project path
    - importAll() emits a phase='discovered' summary event after discovery completes
    - openDatabase() returns { db, migrated } tuple
    - Timeline API response includes schemaMigrated boolean
  </done>
</task>

<task type="auto">
  <name>Task 2: Show discovery status and re-import notification in frontend</name>
  <files>
    src/client/pages/TimelinePage.vue
  </files>
  <action>
    **Discovery phase status text:**

    Update the import progress overlay (lines 14-24 of TimelinePage.vue) to show discovery status when the import is in the discovering phase:

    1. Extend `importProgress` ref to track `phase` (add it to the initial value and to the progress event handler — it already receives the full progress object from SSE).

    2. In the import progress overlay template:
       - When `importProgress.phase === 'discovering'`: Show the indeterminate progress bar (already works when total is 0) with text like "Discovering sessions... (3 of 12 projects)" using `importProgress.discovered` and `importProgress.total`.
       - When `importProgress.phase === 'discovered'`: Briefly show "Found N sessions to import" (this will quickly transition to 'importing').
       - When `importProgress.phase === 'importing'` (existing behavior): Show the determinate progress bar with "X / Y" counts as it already does.

    3. Update the `triggerImport` function's progress event handler (line 371) — it already parses the full event data, just ensure the `phase` field is included in `importProgress.value`.

    **Re-import notification banner:**

    1. Add a reactive ref `schemaMigrated` (default false). In `fetchTimeline()`, after parsing the API response, set `schemaMigrated.value = data.schemaMigrated || false`.

    2. Add a dismissible notification banner between the toolbar and the main content. Show it when `schemaMigrated && !importRunning`:

    ```html
    <div v-if="schemaMigrated && !importRunning && !migrationDismissed" class="reimport-banner">
      <span>CC Time Reporter was updated. A full re-import is recommended to take advantage of new features.</span>
      <AppButton variant="primary" size="sm" @click="triggerImport({ full: true })">
        Re-import Now
      </AppButton>
      <AppButton variant="ghost" size="sm" @click="migrationDismissed = true">
        Dismiss
      </AppButton>
    </div>
    ```

    3. Add `migrationDismissed` ref (default false). When the user clicks "Re-import Now", the import starts and the banner hides (importRunning becomes true). When dismissed, the banner stays hidden for the session. Also auto-dismiss after a successful import completes (in the 'complete' event handler, set `schemaMigrated.value = false`).

    4. Style the banner: use a subtle info-style background (similar to the error banner but using a blue/info tone), positioned below the toolbar. Use existing design tokens:
       - Background: `color-mix(in srgb, var(--color-accent, #4e9af1) 12%, transparent)`
       - Border-bottom: `1px solid color-mix(in srgb, var(--color-accent, #4e9af1) 30%, transparent)`
       - Flex layout with gap, same padding as error banner
       - Font size: `var(--font-size-sm)`
  </action>
  <verify>
    1. `npm run build` succeeds without errors
    2. Start the app with `npm start`, click Import, and observe:
       - During discovery phase: indeterminate progress bar with "Discovering sessions..." text and project count
       - After discovery: progress bar transitions to determinate with "X / Y" file counts
    3. To test re-import banner: temporarily modify timeline route to always return `schemaMigrated: true`, rebuild, reload page — banner should appear with "Re-import Now" and "Dismiss" buttons
  </verify>
  <done>
    - Import progress overlay shows "Discovering sessions... (N of M projects)" during discovery phase
    - Import progress overlay transitions smoothly to file-level "X / Y" progress during importing phase
    - Re-import notification banner appears when schemaMigrated is true in timeline API response
    - Banner has "Re-import Now" button that triggers full import and "Dismiss" button
    - Banner auto-dismisses after successful import
  </done>
</task>

<task type="auto">
  <name>Task 3: Show elapsed time in session detail panel</name>
  <files>
    src/server/routes/timeline.js
    src/client/components/SessionDetailPanel.vue
  </files>
  <action>
    **Backend — add elapsedTimeMs to timeline response:**

    In `src/server/routes/timeline.js`, for each session object in the response, compute `elapsedTimeMs` as the difference between `endTime` and `startTime` (both are already ISO8601 strings on the session object). This is the total wall-clock time from first to last message of the day. For overnight sessions that are clipped to day boundaries, this naturally reflects only the day's portion.

    Add to each session in the response: `elapsedTimeMs: new Date(session.endTime) - new Date(session.startTime)`

    **Frontend — display elapsed time alongside working time:**

    In `src/client/components/SessionDetailPanel.vue`, find where working time is displayed. Add elapsed time next to it so users can compare:

    Format: "Working: 45m / Elapsed: 1h 20m" (or similar layout using the existing `formatDuration` or time-formatting helper already in the codebase).

    Use the same formatting function that formats `workingTimeMs`. Show elapsed time with a slightly muted style to visually distinguish it from working time (it's context, not the primary metric).

    Look at how working time is currently formatted and displayed, and follow the same pattern for elapsed time. Place it adjacent to working time in the detail panel.
  </action>
  <verify>
    1. `npm run build` succeeds
    2. Start app, click a session, verify both working time and elapsed time appear in the detail panel
    3. Elapsed time should always be >= working time (since working time excludes idle gaps)
  </verify>
  <done>
    - Timeline API includes elapsedTimeMs on each session (wall-clock time from start to end)
    - Session detail panel shows elapsed time alongside working time
    - Format is consistent with existing working time display
  </done>
</task>

</tasks>

<verification>
1. Full flow test: Start the app, trigger import, observe discovery phase text followed by file import progress
2. Schema migration test: Delete the database (`rm ~/.cctimereporter/data.db`), restart app — should show `schemaMigrated: false` (fresh db, no migration). To test migration banner, would need an older schema version db.
3. Build verification: `npm run build` produces no errors
4. No regressions: Existing import behavior (file counts, skipped counts, completion) still works correctly
</verification>

<success_criteria>
- Discovery phase shows meaningful progress text instead of silent indeterminate spinner
- Re-import notification banner appears after schema migration and is dismissible
- Both features integrate cleanly with existing import flow without breaking current behavior
</success_criteria>

<output>
After completion, create `.planning/quick/001-import-progress-and-reimport-notification/001-SUMMARY.md`
</output>
