# Phase 11: Bug Fixes

## Bug Reports

### BUG-01: Session Summary Mostly Empty

**Severity:** High
**Area:** Session Context (Phase 8)

The summary field in the SessionDetailPanel is mostly empty. Phase 8 decision was to show the first user message as fallback when no AI-generated summary exists. This fallback is either not working or not triggering correctly.

**Expected:** When no `sessions-index.json` summary exists, the first user message from the session should display.
**Actual:** Summary appears blank for most sessions.

---

### BUG-02: Subagent Sessions Polluting Timeline

**Severity:** High
**Area:** Import Pipeline / Timeline Display

Sessions from subagent projects appear in the timeline with names like `-tmp-pr-review-{random}`. These are temporary agent worktrees, not real user sessions.

**Expected behavior:**
- Subagent sessions should NOT appear as separate rows in the Gantt chart
- Subagent working time SHOULD be counted toward the parent agent's session working time

**Pattern to detect:** Project paths containing `-tmp-` or matching temp worktree patterns.

---

### BUG-03: Day Summary Table Column Alignment

**Severity:** Medium
**Area:** Day Summary (Phase 9)

In all three tabs (Project, Ticket, Branch), the "Sessions" and "Working Time" column headers don't line up with the column content below them.

---

### BUG-04: Day Summary Missing Project Column

**Severity:** Medium
**Area:** Day Summary (Phase 9)

When viewing the Ticket or Branch tabs, there's no way to see which project a ticket or branch belongs to. Users need project association to make sense of the data.

---

### BUG-05: Ticket Parser False Positives

**Severity:** High
**Area:** Import Pipeline — Ticket Detection

The ticket regex `[A-Z]{2,8}-\d+` matches non-ticket strings:
- `CLAUDE-1000` — unknown origin (possibly from transcript metadata?)
- `OPUS-4` — model name from statusline (e.g., "Claude Opus 4")
- `VERSION-6` — extracted from release branch names

**Approach (user suggestion):**
1. Add a blocklist/filter for known false positives (model names, common prefixes)
2. Consider regex refinements to reduce false positives
3. For remaining ambiguous cases: offer user a UI to review/correct ticket assignments via bulk DB updates
4. **Priority:** Get session summaries working first (BUG-01) — better context will help inform ticket correction strategy

---

## Suggested Execution Order

1. **BUG-01** (Summary fallback) — highest value, unblocks ticket strategy thinking
2. **BUG-02** (Subagent filtering) — cleans up timeline significantly
3. **BUG-03 + BUG-04** (Day Summary table fixes) — CSS/template fixes, can be done together
4. **BUG-05** (Ticket false positives) — needs more design work, benefits from BUG-01 being done
