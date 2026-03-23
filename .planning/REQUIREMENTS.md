# Requirements: CC Time Reporter v0.7.0

**Defined:** 2026-03-20
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v0.7.0 Requirements

Requirements for fork branch visualization and stored messages. Each maps to roadmap phases.

### Schema & Import — Forks

- [x] **SCHM-01**: Messages table has `fork_branch_id` column identifying which fork branch a message belongs to
- [x] **SCHM-02**: Schema auto-migrates adding `fork_branch_id` column
- [x] **SCHM-03**: Fork detector populates `fork_branch_id` during import (unique ID per distinct fork branch)

### Backend — Fork Segments

- [x] **FSEG-01**: Timeline API returns fork segment data for sessions with real forks
- [x] **FSEG-02**: Each fork segment has start time, end time, and fork branch ID
- [x] **FSEG-03**: Sessions without forks return unchanged (no fork data)

### Frontend — Gantt Rendering

- [x] **GANT-01**: Fork branches displayed as 50% height sub-bars beneath their parent session bar
- [x] **GANT-02**: Each fork bar starts at the fork point timestamp on the timeline
- [x] **GANT-03**: Fork bars are visually distinct from parent (lighter color, reduced height)
- [x] **GANT-04**: Sessions without forks render unchanged

### Frontend — Interaction

- [x] **INTR-01**: Clicking a fork bar opens the detail panel with fork-specific information
- [x] **INTR-02**: Show/hide toggle for fork sub-rows (persisted preference)

### Frontend — Detail Panel

- [x] **DETL-01**: Detail panel shows fork-specific info when a fork bar is clicked (fork branch ID, time range, message count)

### Schema & Import — Stored Messages

- [ ] **MSGS-01**: Messages table has `content` column storing user/assistant text (truncated to 1000 chars)
- [ ] **MSGS-02**: Schema auto-migrates adding `content` column
- [ ] **MSGS-03**: Importer populates `content` for user and assistant messages only (skips tool_use, tool_result, progress, internal)

### Messages Modal

- [ ] **MODL-01**: Messages modal reads from DB instead of JSONL files
- [ ] **MODL-02**: Messages modal shows fork messages when a fork bar is selected (filtered by fork_branch_id)
- [ ] **MODL-03**: Messages display with role labels (user/assistant) and timestamps

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Fork Enhancements

- **FORK-01**: Fork bar tooltip showing branch summary on hover
- **FORK-03**: Fork working time attributed to parent session total

### Messages Enhancements

- **MSGS-04**: Full-text search across stored messages
- **MSGS-05**: Message content shown in session detail panel preview

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Fork tree visualization (graph/network view) | Too complex for timeline; Gantt sub-rows are sufficient |
| Fork editing (user labels per fork) | No storage model for per-fork metadata yet |
| Progress fork display | Only real forks are meaningful; progress forks filtered at import |
| Storing tool_use/tool_result content | Large payloads, low display value; user/assistant text is sufficient |
| Storing full message text (no truncation) | 1000 char limit keeps DB size manageable |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 22 | Implemented (unverified) |
| SCHM-02 | Phase 22 | Implemented (unverified) |
| SCHM-03 | Phase 22 | Implemented (unverified) |
| FSEG-01 | Phase 23 | Implemented (unverified) |
| FSEG-02 | Phase 23 | Implemented (unverified) |
| FSEG-03 | Phase 23 | Implemented (unverified) |
| GANT-01 | Phase 24 | Implemented (unverified) |
| GANT-02 | Phase 24 | Implemented (unverified) |
| GANT-03 | Phase 24 | Implemented (unverified) |
| GANT-04 | Phase 24 | Implemented (unverified) |
| INTR-01 | Phase 25 | Implemented (unverified) |
| INTR-02 | Phase 25 | Implemented (unverified) |
| DETL-01 | Phase 25 | Implemented (unverified) |
| MSGS-01 | Phase 26 | Pending |
| MSGS-02 | Phase 26 | Pending |
| MSGS-03 | Phase 26 | Pending |
| MODL-01 | Phase 27 | Pending |
| MODL-02 | Phase 27 | Pending |
| MODL-03 | Phase 27 | Pending |

**Coverage:**
- v0.7.0 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-23 after adding stored messages scope*
