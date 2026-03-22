# Requirements: CC Time Reporter v0.7.0

**Defined:** 2026-03-20
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v0.7.0 Requirements

Requirements for fork branch visualization. Each maps to roadmap phases.

### Schema & Import

- [ ] **SCHM-01**: Messages table has `fork_branch_id` column identifying which fork branch a message belongs to
- [ ] **SCHM-02**: Schema auto-migrates adding `fork_branch_id` column
- [ ] **SCHM-03**: Fork detector populates `fork_branch_id` during import (unique ID per distinct fork branch)

### Backend — Fork Segments

- [ ] **FSEG-01**: Timeline API returns fork segment data for sessions with real forks
- [ ] **FSEG-02**: Each fork segment has start time, end time, and fork branch ID
- [ ] **FSEG-03**: Sessions without forks return unchanged (no fork data)

### Frontend — Gantt Rendering

- [ ] **GANT-01**: Fork branches displayed as 50% height sub-bars beneath their parent session bar
- [ ] **GANT-02**: Each fork bar starts at the fork point timestamp on the timeline
- [ ] **GANT-03**: Fork bars are visually distinct from parent (lighter color, reduced height)
- [ ] **GANT-04**: Sessions without forks render unchanged

### Frontend — Interaction

- [ ] **INTR-01**: Clicking a fork bar opens the detail panel with fork-specific information
- [ ] **INTR-02**: Show/hide toggle for fork sub-rows (persisted preference)

### Frontend — Detail Panel

- [ ] **DETL-01**: Detail panel shows fork-specific info when a fork bar is clicked (fork branch ID, time range, message count)

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Fork Enhancements

- **FORK-01**: Fork bar tooltip showing branch summary on hover
- **FORK-02**: Fork messages viewable in messages modal (filtered to fork branch)
- **FORK-03**: Fork working time attributed to parent session total

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Fork tree visualization (graph/network view) | Too complex for timeline; Gantt sub-rows are sufficient |
| Fork editing (user labels per fork) | No storage model for per-fork metadata yet |
| Progress fork display | Only real forks are meaningful; progress forks filtered at import |
| Fork-based session splitting | Forks are sub-elements, not independent sessions |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 22 | Pending |
| SCHM-02 | Phase 22 | Pending |
| SCHM-03 | Phase 22 | Pending |
| FSEG-01 | Phase 23 | Pending |
| FSEG-02 | Phase 23 | Pending |
| FSEG-03 | Phase 23 | Pending |
| GANT-01 | Phase 24 | Pending |
| GANT-02 | Phase 24 | Pending |
| GANT-03 | Phase 24 | Pending |
| GANT-04 | Phase 24 | Pending |
| INTR-01 | Phase 25 | Pending |
| INTR-02 | Phase 25 | Pending |
| DETL-01 | Phase 25 | Pending |

**Coverage:**
- v0.7.0 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-21 after roadmap creation*
