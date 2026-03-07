# Pitfalls Research: v0.4.0 Session Intelligence

**Researched:** 2026-03-07
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: INSERT OR REPLACE Destroys User Edits (CRITICAL)
**Problem:** `upsertSession()` in db-writer.js uses `INSERT OR REPLACE`, which replaces the entire row including any user-edited fields. Re-importing will silently destroy user-set session names.
**Warning signs:** User renames a session, clicks Import, name reverts to auto-detected value.
**Prevention:** Add separate `user_title` column that the import pipeline never touches. Keep it independent from `custom_title` (which comes from Claude Code's sessions-index.json).
**Phase:** Must be addressed in session naming phase, before UI work.

### Pitfall 2: Denylist Doesn't Scale (CRITICAL)
**Problem:** The 35-entry `TICKET_PREFIX_DENYLIST` doesn't scale to new detection sources. Each new source (commit messages, summaries) will surface new false positives requiring more denylist entries.
**Warning signs:** Every new ticket source requires 5-10 new denylist entries.
**Prevention:** Lean into the scoring system (`MIN_TICKET_SCORE = 15`) instead of exclusion lists. Never scan assistant messages (too noisy). Weight sources by reliability.
**Phase:** Address in ticket detection phase.

### Pitfall 3: First Write Endpoint Patterns (CRITICAL)
**Problem:** This is the app's first user-data write endpoint. The existing codebase is entirely read-only (except import, which is system-initiated). PATCH endpoint needs input validation, 404 handling, and response-with-updated-state — patterns that don't exist yet.
**Warning signs:** No validation on user input, silent failures on invalid session IDs.
**Prevention:** Establish the write endpoint pattern carefully: validate input, check session exists, return updated state, handle concurrent access.
**Phase:** Address in session naming phase.

## Important Pitfalls

### Pitfall 4: Inline Edit UX Mistakes
**Problem:** Inline editing needs clear visual affordance (users must know it's editable), keyboard handling (Enter saves, Escape cancels), and empty-state handling.
**Warning signs:** Users don't discover the edit capability, or accidentally save empty names.
**Prevention:** Use Reka UI Editable component (handles keyboard). Add visual hover indicator. Prevent saving empty/whitespace-only values.
**Phase:** Session naming UI phase.

### Pitfall 5: Regex Statefulness Bugs
**Problem:** The codebase uses `/gi` flag regex patterns with manual `lastIndex` resets throughout. New ticket detection patterns must follow the same convention or use `matchAll()`.
**Warning signs:** Intermittent ticket detection failures (regex starts matching from wrong position).
**Prevention:** Use `matchAll()` for all new patterns (already used in some places). Audit existing patterns.
**Phase:** Ticket detection phase.

### Pitfall 6: Git Commit Scanning Assumptions
**Problem:** Git commit scanning assumes the repo is available during import. Worktree sessions may not have the repo present. Remote machines may not have git history.
**Warning signs:** Import errors when git repo not found at session's cwd path.
**Prevention:** Make git scanning optional/graceful — skip silently if repo unavailable. Don't make it a required source.
**Phase:** Ticket detection phase.

### Pitfall 7: Scoring Weight Tuning
**Problem:** Adding new ticket sources requires careful weight calibration. Too high and new sources override reliable ones (slash commands). Too low and they never contribute.
**Warning signs:** New source consistently overrides /prep-ticket results.
**Prevention:** Test against real transcript data at /tmp/cctimereporter-research/. Keep slash command at 500-700pts (highest). New sources should be in 30-75pt range.
**Phase:** Ticket detection phase.

### Pitfall 8: upsertTickets DELETE Destroys User Overrides
**Problem:** `upsertTickets()` does `DELETE FROM tickets WHERE session_id = ?` before re-inserting. If user ticket overrides are stored in the tickets table, they'll be destroyed on re-import.
**Warning signs:** User sets ticket override, re-import removes it.
**Prevention:** Store user ticket override in a separate column on sessions table (like user_title), not in tickets table. Or exclude user-sourced tickets from the DELETE.
**Phase:** Address if user ticket override is implemented.

## Minor Pitfalls

### Pitfall 9: Label Chain Complexity
**Problem:** Adding user_title to the label fallback chain (user_title → customTitle → ticket → branch → firstPrompt) creates a 5-level chain. Debugging "why does this session show X?" becomes harder.
**Warning signs:** Confusion about which source is providing the displayed label.
**Prevention:** Show the source in the detail panel (e.g., "Name: foo (user-set)" vs "Name: foo (from Claude)").
**Phase:** Session naming UI phase.

### Pitfall 10: Database Delete-and-Recreate Destroys User Data
**Problem:** `openDatabase()` has an escape hatch that deletes and recreates the database for unknown schema versions. With user-editable data, this now destroys user work, not just importable cache.
**Warning signs:** Schema version mismatch causes silent data loss.
**Prevention:** Remove or guard the delete-and-recreate behavior. Require explicit user confirmation before destructive schema operations.
**Phase:** Consider during DB migration work.

## Roadmap Implications

1. Session naming must start with DB layer (new column + upsert protection), not UI
2. Ticket detection should define scoring approach before implementing new sources
3. User overrides (titles and tickets) should share a pattern: separate user-editable columns never touched by import

---
*Research completed: 2026-03-07*
