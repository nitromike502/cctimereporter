# Requirements Archive: v1.0 MVP

**Archived:** 2026-03-01
**Status:** SHIPPED

This is the archived requirements specification for v1.0.
For current requirements, see `.planning/REQUIREMENTS.md` (created for next milestone).

---

## v1 Requirements

### Distribution
- [x] **DIST-01**: User can run `npx cctimereporter` to launch the app (starts server, opens browser)
- [x] **DIST-02**: App requires Node 22 LTS minimum, enforced via `engines` field

### Data Pipeline
- [x] **DATA-01**: App auto-discovers all projects under ~/.claude/projects/
- [x] **DATA-02**: App imports JSONL transcripts into SQLite with fork detection (parent→children tree)
- [x] **DATA-03**: App scores and assigns tickets to sessions (slash commands, branch patterns, content mentions)
- [x] **DATA-04**: App skips unchanged files on re-import (idempotent)
- [x] **DATA-05**: User can trigger import from the UI with visible progress feedback

### Visualization
- [x] **VIZ-01**: User can see sessions as Gantt-style horizontal bars on a time-of-day axis
- [x] **VIZ-02**: User can see idle gaps within session bars as visually distinct (faded/lighter segments)
- [x] **VIZ-03**: User can see session labels using ticket → branch → first 5 words fallback chain
- [x] **VIZ-04**: User can see sessions grouped by Claude project directory with color-coding and legend
- [x] **VIZ-05**: User can hover over a session bar to see tooltip (session ID, ticket, branch, working time, wall-clock span, message count) — *evolved to click-to-detail panel in Phase 6*

### Component System
- [x] **COMP-01**: App has a custom component library with consistent theming (colors, spacing, typography, states)
- [x] **COMP-02**: A hidden preview page (`/components`) displays every component and its variants/states
- [x] **COMP-03**: New components must be added to the component library and preview page before use in app features
- [x] **COMP-04**: Component library includes at minimum: Button, DatePicker, Checkbox, Tooltip, ProgressBar, Badge/Tag (components needed for v1 features)

### Navigation & Filtering
- [x] **NAV-01**: App opens to today's date by default
- [x] **NAV-02**: User can navigate to previous/next day
- [x] **NAV-03**: User can jump to "Today" or "Yesterday" with quick shortcuts
- [x] **NAV-04**: URL updates to `/timeline?date=YYYY-MM-DD` (bookmarkable)
- [x] **NAV-05**: User can filter projects (show/hide individual projects)

## v1.x Requirements (deferred)

- Lightweight file index (first/last timestamps) for selective import by date
- Rolling 30-day window — default import scope for performance at scale
- Fork visualization as sub-rows or visual indicators on parent bars
- Static HTML export for sharing timelines
- Keyboard shortcuts for date navigation
- Arbitrary date range picker
- Ticket-based cross-day view (multi-day ticket summary)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIST-01 | Phase 3 | Complete |
| DIST-02 | Phase 1 | Complete |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| DATA-05 | Phase 5 | Complete |
| COMP-01 | Phase 4 | Complete |
| COMP-02 | Phase 4 | Complete |
| COMP-03 | Phase 4 | Complete |
| COMP-04 | Phase 4 | Complete |
| VIZ-01 | Phase 5 | Complete |
| VIZ-02 | Phase 5 | Complete |
| VIZ-03 | Phase 5 | Complete |
| VIZ-04 | Phase 5 | Complete |
| VIZ-05 | Phase 6 | Complete (evolved from tooltip to detail panel) |
| NAV-01 | Phase 5 | Complete |
| NAV-02 | Phase 5 | Complete |
| NAV-03 | Phase 5 | Complete |
| NAV-04 | Phase 5 | Complete |
| NAV-05 | Phase 5 | Complete |

## Milestone Summary

**Shipped:** 23 of 23 v1 requirements
**Adjusted:** VIZ-05 evolved from hover tooltip to click-to-detail panel (Phase 6)
**Dropped:** None

---
*Archived: 2026-03-01 as part of v1.0 milestone completion*
