# Phase 13-01 Summary: Parse Slash Command XML in Session Summaries

## What Was Done
Created `src/utils/parse-command-xml.js` utility that converts XML command tags into human-readable slash commands:
- `<command-name>/gsd:execute-phase</command-name> <command-args>7</command-args>` → `/gsd:execute-phase 7`
- `<command-message>dev-workflow</command-message>` → `/dev-workflow`
- Handles missing args, ensures `/` prefix, trims whitespace

## Files Changed
- **`src/utils/parse-command-xml.js`** (new) — Shared utility, works in both Node.js and browser
- **`src/importer/parser.js`** — Uses parseCommandXml at import time; narrowed SYNTHETIC_MSG_RE to only skip `teammate-message` and `local-command` (no longer skips command-name XML)
- **`src/client/components/SessionDetailPanel.vue`** — Display-time parsing for summary text
- **`src/client/components/GanttBar.vue`** — Display-time parsing for bar labels

## Design Decisions
- **Dual approach**: Import-time for new imports + display-time for existing data = no re-import needed
- **Shared utility**: Single `parseCommandXml()` used by both server and client code
- **Preserved SYNTHETIC_MSG_RE**: Still filters teammate-message and local-command, which are truly synthetic

## Verification
- All 6 unit test cases pass (real data patterns + edge cases)
- `npm run build` succeeds
- Commit: `feat(13-01): parse slash command XML in session summaries`
