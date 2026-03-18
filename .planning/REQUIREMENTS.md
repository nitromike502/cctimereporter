# Requirements: CC Time Reporter v0.6.0

**Defined:** 2026-03-15
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v0.6.0 Requirements

Requirements for session splitting at `/clear` boundaries. Each maps to roadmap phases.

### Schema & Import

- [ ] **SCHM-01**: Messages table has `command` column storing slash command name when detected
- [ ] **SCHM-02**: Schema auto-migrates from v6 to v7 adding `command` column
- [ ] **SCHM-03**: JSONL parser detects slash commands in user messages and populates `command` field

### Segment Derivation

- [ ] **SEGM-01**: Timeline route derives segment boundaries from messages where `command = 'clear'`
- [ ] **SEGM-02**: Each segment gets independent ticket scoring over its message slice
- [ ] **SEGM-03**: Each segment gets independent branch detection over its message slice
- [ ] **SEGM-04**: Each segment gets independent working time calculation
- [ ] **SEGM-05**: Sessions without `/clear` messages return unchanged (no segment concept)

### Frontend — Gantt

- [ ] **GANT-01**: Segments displayed as separate Gantt bars in the same project row
- [ ] **GANT-02**: Segment bars use `session-id:N` suffix for identification
- [ ] **GANT-03**: Visual grouping cue connects segment bars from the same parent session

### Frontend — Detail & Summary

- [ ] **DETL-01**: Detail panel shows segment-specific messages, ticket, branch, and working time
- [ ] **DETL-02**: Detail panel shows segment indicator ("segment 2 of 3") when session has segments
- [ ] **SUMM-01**: Day summary breakdowns use per-segment working time totals

### Frontend — Messages Modal

- [ ] **MSGS-01**: `/clear` commands shown in messages modal with "context switch" label

### Frontend — Notifications

- [ ] **NOTF-01**: UI shows notification after schema migration informing user that re-import is needed

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Per-Segment Editing

- **EDIT-01**: User can set user_label per segment (not just per session)
- **EDIT-02**: User can set user_ticket per segment (not just per session)

### Extended Notifications

- **NOTF-02**: Notification includes one-click re-import action
- **NOTF-03**: Notification shows which features are degraded without re-import

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Per-segment user editing (user_label/user_ticket) | Requires new key scheme; whole-session overrides apply as fallback |
| Segment splitting in import pipeline | Violates "import raw, derive at query time" philosophy |
| Forced re-import migration for command column | Incremental import handles naturally; document that re-import is needed |
| /rename as split signal | Claude Code now resets session name on /clear; rename no longer signals context switch |
| Configurable coalescing threshold | Not needed since /clear is deterministic (no rename coalescing) |
| Segment-level fork detection | Forks within a segment are uncommon; use session-level fork metadata |
| Store all text messages in DB | Separate milestone; not needed for segment splitting |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 19 | Complete |
| SCHM-02 | Phase 19 | Complete |
| SCHM-03 | Phase 19 | Complete |
| SEGM-01 | Phase 20 | Pending |
| SEGM-02 | Phase 20 | Pending |
| SEGM-03 | Phase 20 | Pending |
| SEGM-04 | Phase 20 | Pending |
| SEGM-05 | Phase 20 | Pending |
| GANT-01 | Phase 21 | Pending |
| GANT-02 | Phase 21 | Pending |
| GANT-03 | Phase 21 | Pending |
| DETL-01 | Phase 22 | Pending |
| DETL-02 | Phase 22 | Pending |
| SUMM-01 | Phase 22 | Pending |
| MSGS-01 | Phase 22 | Pending |
| NOTF-01 | Phase 22 | Pending |

**Coverage:**
- v0.6.0 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-17 after roadmap creation*
