# Phase 17: Session Editing - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can edit session names and ticket IDs from a modal dialog. Custom names and ticket overrides persist across re-imports. The modal includes a persistence notice and a copiable CLI command to resume the session in Claude Code. Session names from Claude Code (summary from sessions-index.json) are read-only.

</domain>

<decisions>
## Implementation Decisions

### Edit modal design
- Stacked form layout: Session Name field on top, Ticket ID field below, with labels
- Persistence notice appears below the form fields, above the save button: "Changes are local to CC Time Reporter and do not persist to Claude Code"
- CLI command displayed as a monospace code block with a copy-to-clipboard button: `claude --session-id <id>`
- Empty fields show auto-detected values as gray placeholder text (ticket from scoring, name from branch/first words)
- If user has already set a custom value, the field is pre-filled with that custom value

### Activation & entry point
- Pencil icon button next to the session name in the detail panel
- Pencil icon appears on hover over the session name area (hidden by default for clean look)
- Pencil icon is always present (ticket is always editable), but see name editability rule below
- Edit modal opens only from the detail panel — no Gantt bar entry point

### Name editability rule
- Session name is ONLY editable when Claude Code did not provide a summary (no sessions-index.json entry)
- If Claude Code already named the session, the name field shows as read-only/disabled with a note: "Named in Claude Code"
- Users who already set a custom name via UI can edit or clear it
- Ticket field is ALWAYS editable regardless of session name status

### Label display logic
- Gantt bar shows custom name only (no combined name+ticket format)
- Subtle icon indicator on Gantt bar or detail panel when a session has been customized
- Custom session names appear in the day summary breakdown, replacing auto-generated labels
- Custom ticket override replaces auto-detected ticket in ALL views: bar, detail panel, and day summary

### Clear/revert behavior
- Reset button ('x') next to each editable field to clear custom value
- No confirmation dialog on reset — instant clear, user can re-edit anytime
- After reset, the auto-detected value reappears as gray placeholder text immediately

### Claude's Discretion
- Exact icon choice for pencil/edit (from existing icon set or simple SVG)
- Exact icon for the "customized" indicator
- Save button label ("Save" vs "Update" vs "Done")
- Modal width and spacing
- Error handling for PATCH failures

</decisions>

<specifics>
## Specific Ideas

- The persistence notice should feel informative, not alarming — a gentle reminder that this is a local tool
- The CLI command helps users who want to rename a session in Claude Code itself, or continue the session
- The read-only state for Claude Code-named sessions should be obvious but not feel like a limitation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-session-editing*
*Context gathered: 2026-03-07*
