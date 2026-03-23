---
phase: 27-messages-modal-from-db
plan: 01
subsystem: ui
tags: [vue, sqlite, modal, messages, fork-filtering]

# Dependency graph
requires:
  - phase: 26-store-message-content
    provides: content column on messages table, populated for user/assistant rows

provides:
  - Messages API reads from DB (no JSONL file access)
  - Fork-branch filtering via ?forkBranchId= query param
  - Modal displays timestamps alongside role labels
  - Fork bar "view messages" link filters modal to that branch

affects:
  - future phases touching fork UI or message display

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DB-based message reading: query messages WHERE content IS NOT NULL, ORDER BY timestamp ASC"
    - "Fork filtering: primary = fork_branch_id IS NULL; fork = fork_branch_id = X; all = no filter"

key-files:
  created: []
  modified:
    - src/server/routes/messages.js
    - src/client/components/SessionMessagesModal.vue
    - src/client/components/SessionDetailPanel.vue
    - src/client/pages/TimelinePage.vue

key-decisions:
  - "Default (no forkBranchId param) returns primary-branch only (fork_branch_id IS NULL)"
  - "fork_branch_id=all is reserved for future all-branch view"
  - "Modal title changes to 'Fork Branch Messages' with branch ID subtitle when filtered"
  - "Timestamp shown as H:MM AM/PM inline with role label"

patterns-established:
  - "Fork show-messages flow: SessionDetailPanel emits show-messages-fork(forkBranchId), TimelinePage routes to modal"

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 27 Plan 01: Messages Modal from DB Summary

**Messages API rewritten to query SQLite DB with fork-branch filtering; modal shows timestamps and fork-specific message views via "view messages" link on fork detail panel**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T23:02:50Z
- **Completed:** 2026-03-23T23:05:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Removed all JSONL file reading from messages route; pure DB query
- Fork-branch filtering: `?forkBranchId=X` returns only that branch's messages; default returns primary branch
- Modal displays timestamp (H:MM AM/PM) next to User/Assistant role label
- Fork detail panel now has "view" link that opens messages modal filtered to that fork branch
- Modal title/subtitle adapts to show fork context when filtered

## Task Commits

1. **Task 1: Update messages API to serve from DB** - `4f39108` (feat)
2. **Task 2: Update SessionMessagesModal + fork filtering** - `fe22eff` (feat)

**Plan metadata:** (in final docs commit)

## Files Created/Modified

- `src/server/routes/messages.js` - Rewritten to query DB; supports ?forkBranchId filtering; removed fs/readline imports
- `src/client/components/SessionMessagesModal.vue` - Added forkBranchId prop, fork title/subtitle, timestamp display, fork-aware fetch URL
- `src/client/components/SessionDetailPanel.vue` - Added show-messages-fork emit + "view" link in fork detail grid
- `src/client/pages/TimelinePage.vue` - Split modal state into sessionId + forkBranchId; added onShowMessages/onShowMessagesFork handlers; watch to reset on close

## Decisions Made

- Default fetch (no `forkBranchId` param) returns primary-branch messages where `fork_branch_id IS NULL`. This is consistent with the primary branch being the "main" conversation.
- `forkBranchId=all` reserved as a special value if a future "all branches" view is needed; not exposed in the UI yet.
- Modal title changes to "Fork Branch Messages" with an italic subtitle showing the first 8 chars of the branch ID when filtered — clear visual affordance that filtering is active.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 27 complete — messages modal now reads from DB with fork awareness
- Users must re-import (or have already re-imported after v8 schema migration) to populate content column
- The re-import banner from Phase 26 handles this migration prompt automatically
- No blockers for future phases

---
*Phase: 27-messages-modal-from-db*
*Completed: 2026-03-23*
