# Requirements: CC Time Reporter v0.4.0

**Defined:** 2026-03-07
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v0.4.0 Requirements

Requirements for Session Intelligence milestone. Each maps to roadmap phases.

### Session Naming

- [x] **NAME-01**: User can set a custom name for any session via inline edit in the timeline UI
- [x] **NAME-02**: Custom session names persist across re-imports (upsert uses COALESCE to preserve user data)
- [x] **NAME-03**: Custom name takes priority in label chain: custom name > ticket > branch > first words
- [x] **NAME-04**: User can clear a custom name to revert to the auto-generated label

### Ticket Detection

- [ ] **TICK-01**: Import scans git commit messages in tool_result blocks for ticket patterns (~50pts)
- [ ] **TICK-02**: Import scans session summary/title text for ticket patterns (~25pts)
- [x] **TICK-03**: User can manually set or override the primary ticket for a session via UI
- [ ] **TICK-05**: Import scans MCP tool calls (Atlassian, Linear, etc.) in transcripts for ticket patterns

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Ticket Detection

- **TICK-F1**: Multi-ticket display (show all detected tickets, not just primary)
- **TICK-F2**: Ticket denylist management UI (currently hardcoded)
- **TICK-F3**: User-defined regex patterns for custom ticket detection
- **TICK-F4**: Configurable ticket link URL template so ticket IDs link to external issue tracker

### Session Intelligence

- **SESS-F1**: Subagent working time attribution to parent session
- **SESS-F2**: Fork visualization as sub-rows in timeline

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time session tracking | Manual refresh via UI button is sufficient |
| Automatic session naming via AI | Summaries from sessions-index.json already provide this |
| Ticket creation from UI | Read-only tool, not a project management app |
| Multi-ticket scoring display | Complexity; single primary ticket is clear enough for v0.4.0 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAME-01 | Phase 17 | Complete |
| NAME-02 | Phase 17 | Complete |
| NAME-03 | Phase 17 | Complete |
| NAME-04 | Phase 17 | Complete |
| TICK-01 | Phase 18 | Pending |
| TICK-02 | Phase 18 | Pending |
| TICK-03 | Phase 17 | Complete |
| TICK-05 | Phase 18 | Pending |

**Coverage:**
- v0.4.0 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after roadmap creation*
