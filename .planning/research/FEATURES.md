# Features Research: v0.4.0 Session Intelligence

**Researched:** 2026-03-07
**Confidence:** MEDIUM-HIGH

## Session Naming

### Table Stakes
- **Inline edit in detail panel** — click session name to edit, blur/Enter to save, Escape to cancel
- **Persistence** — user-set names survive app restarts and re-imports
- **Separate user_label column** — don't reuse custom_title (overwritten on re-import). New column needed.
- **PATCH endpoint** — first write endpoint in the app (`PATCH /api/sessions/:id`)
- **Label fallback chain update** — user_label → customTitle → ticket → branch → firstPrompt

### Differentiators
- **Inline edit on Gantt bar** — edit directly on the bar label (complex with narrow bars)
- **Bulk rename** — rename multiple sessions at once
- **Auto-suggest names** — suggest names based on ticket, branch, or summary

### Anti-Features
- **Sync back to Claude Code** — don't write to Claude's sessions-index.json
- **Required names** — naming must be optional, not forced

### Complexity Notes
- Detail panel inline edit: LOW (Reka UI Editable component already installed)
- PATCH endpoint: LOW (first write endpoint, but pattern is simple)
- DB migration: LOW (single column addition)
- Import protection: MEDIUM (must change INSERT OR REPLACE logic)

## Ticket Auto-Discovery

### Table Stakes
- **Git commit message scanning** — highest-impact new source. Commit messages often contain ticket refs. Score ~50pts/mention.
- **Claude summary scanning** — summary text exists in DB but isn't fed into scoring pipeline. Easy win.
- **User ticket override** — let users manually set/correct the primary ticket via UI

### Differentiators
- **Multi-ticket display** — show all detected tickets, not just primary
- **Worktree scoring boost** — worktree branch names often contain ticket refs
- **Ticket link template** — configurable URL pattern (e.g., `https://jira.example.com/browse/{TICKET}`)

### Anti-Features
- **External API integration** — no calls to JIRA/Linear/GitHub APIs (conflicts with local-only philosophy)
- **NLP/ML detection** — overkill for structured patterns, would bloat package
- **Automatic ticket creation** — out of scope, read-only relationship with ticket systems

### Complexity Notes
- Summary scanning: LOW (data already in DB, add to scoring pipeline)
- Git commit scanning: MEDIUM (need git log within session time window, parse output)
- User ticket override: LOW (extends PATCH endpoint from session naming)
- Multi-ticket display: LOW (tickets table already stores all detections)
- Ticket link template: LOW (configurable URL pattern, stored in localStorage)

## Data Model Changes

### New Column: user_label
- On sessions table, separate from custom_title
- custom_title = from Claude Code (import-managed)
- user_label = from app UI (user-managed, never overwritten by import)
- Label chain becomes: user_label → customTitle → ticket → branch → firstPrompt

### New Column: user_ticket (optional)
- On sessions table, user-set ticket override
- Takes precedence over auto-detected primary_ticket in display

### Import Protection
- upsertSession() currently uses INSERT OR REPLACE (clobbers everything)
- Must change to conditional UPDATE that preserves user_label and user_ticket

## Suggested Phase Structure

**Phase 1 — Session Naming:** DB migration, PATCH endpoint, Reka UI Editable in detail panel, label chain update
**Phase 2 — Ticket Detection Improvements:** Summary scanning, git commit scanning, scoring adjustments
**Phase 3 — User Overrides:** User ticket override, multi-ticket display, ticket link template

## Open Questions
- Inline edit on Gantt bar vs detail-panel-only? (narrow bars suggest detail-panel-only)
- Git commit scanning at import time or on-demand?
- Ticket link URL template now or deferred?

---
*Research completed: 2026-03-07*
