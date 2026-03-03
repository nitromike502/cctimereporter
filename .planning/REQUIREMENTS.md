# Requirements: CC Time Reporter

**Defined:** 2026-03-02
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v0.2.0 Requirements

Requirements for v0.2.0 UX & Insights. Each maps to roadmap phases.

### Import & Onboarding

- [ ] **IMP-01**: Import defaults to rolling 30-day window — files older than cutoff are peeked and skipped
- [ ] **IMP-02**: Cached timestamps in import_log enable instant re-skip on subsequent imports
- [ ] **IMP-03**: First-time users see a welcome message explaining the tool and prompting import (distinct from empty-date state)
- [ ] **IMP-04**: Import progress provides clear feedback that first import may take a moment

### Day Summary

- [ ] **SUM-01**: Day summary section below Gantt chart shows total working time for the day
- [ ] **SUM-02**: Per-project breakdown table with session count and working time
- [ ] **SUM-03**: Per-ticket breakdown table with session count and working time
- [ ] **SUM-04**: Per-branch breakdown table with session count and working time

### Session Context

- [ ] **CTX-01**: Import AI-generated session summaries from Claude Code's sessions-index.json
- [ ] **CTX-02**: Extract first user message from JSONL as fallback when no AI summary exists
- [ ] **CTX-03**: SessionDetailPanel shows session summary (AI summary preferred, first prompt as fallback)

### UI/UX

- [ ] **UIX-01**: Light/dark mode toggle in toolbar, persisted to localStorage, system preference as default
- [ ] **UIX-02**: Beginner tutorial/tour highlights key UI elements on first visit using a lightweight tour library

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Visualization

- **VIZ-01**: Fork visualization as sub-rows or visual indicators
- **VIZ-02**: Arbitrary date range picker
- **VIZ-03**: Ticket-based cross-day view (multi-day ticket summary)

### Navigation

- **NAV-01**: Keyboard shortcuts for date navigation

### Export

- **EXP-01**: Static HTML export for sharing

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI-generated summaries for sessions without index | Requires API key config, adds complexity — use firstPrompt fallback instead |
| Dashboard/landing page | URL reserved but not needed for v0.2.0 |
| Mobile-responsive design | Desktop browser tool |
| Manual time editing | Transcripts are immutable source of truth |
| Real-time session updates | Manual refresh via UI button is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMP-01 | Phase 7 | Pending |
| IMP-02 | Phase 7 | Pending |
| IMP-03 | Phase 7 | Pending |
| IMP-04 | Phase 7 | Pending |
| SUM-01 | Phase 9 | Pending |
| SUM-02 | Phase 9 | Pending |
| SUM-03 | Phase 9 | Pending |
| SUM-04 | Phase 9 | Pending |
| CTX-01 | Phase 8 | Pending |
| CTX-02 | Phase 8 | Pending |
| CTX-03 | Phase 8 | Pending |
| UIX-01 | Phase 10 | Pending |
| UIX-02 | Phase 10 | Pending |

**Coverage:**
- v0.2.0 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — traceability populated after roadmap creation*
