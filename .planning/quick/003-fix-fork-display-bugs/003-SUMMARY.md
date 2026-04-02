# Quick Task 003: Fix Fork Display Bugs

## Changes

**File modified:** `src/services/timeline.js` — `computeForkSegments` function (lines 36-62)

### Bug 1: Empty fork sessions visible
Fork sub-bars with messages but zero working time were showing on the Gantt chart. The filter only checked `message_count >= 2` but never verified computed working time.

**Fix:** Restructured from `.filter().map()` to `.flatMap()` with early-exit checks:
- Skip forks with no messages on the queried day (`dayTs.length === 0`)
- Skip forks with zero working time (`workingTimeMs === 0`)

### Bug 2: Fork sessions bleeding past midnight
Overnight fork segments clamped to day boundary (`dayEndUTC = 23:59:59.999`) causing the fork bar to stretch to midnight. Main sessions already used message-based clamping (first/last in-day message).

**Fix:** Changed fork clamping to use `dayTs[0]` / `dayTs.at(-1)` (first/last in-day fork message) instead of `dayStartUTC` / `dayEndUTC`, matching main session behavior at lines 211-214.

## Verification
- `npm run build` succeeds
- Both fixes are in the same function, no other files affected
