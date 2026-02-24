# Requirements

## v1 Requirements

### Distribution
- [ ] **DIST-01**: User can run `npx cctimereporter` to launch the app (starts server, opens browser)
- [ ] **DIST-02**: App requires Node 22 LTS minimum, enforced via `engines` field

### Data Pipeline
- [ ] **DATA-01**: App auto-discovers all projects under ~/.claude/projects/
- [ ] **DATA-02**: App imports JSONL transcripts into SQLite with fork detection (parent→children tree)
- [ ] **DATA-03**: App scores and assigns tickets to sessions (slash commands, branch patterns, content mentions)
- [ ] **DATA-04**: App skips unchanged files on re-import (idempotent)
- [ ] **DATA-05**: User can trigger import from the UI with visible progress feedback

### Visualization
- [ ] **VIZ-01**: User can see sessions as Gantt-style horizontal bars on a time-of-day axis
- [ ] **VIZ-02**: User can see idle gaps within session bars as visually distinct (faded/lighter segments)
- [ ] **VIZ-03**: User can see session labels using ticket → branch → first 5 words fallback chain
- [ ] **VIZ-04**: User can see sessions grouped by Claude project directory with color-coding and legend
- [ ] **VIZ-05**: User can hover over a session bar to see tooltip (session ID, ticket, branch, working time, wall-clock span, message count)

### Component System
- [ ] **COMP-01**: App has a custom component library with consistent theming (colors, spacing, typography, states)
- [ ] **COMP-02**: A hidden preview page (`/components`) displays every component and its variants/states
- [ ] **COMP-03**: New components must be added to the component library and preview page before use in app features
- [ ] **COMP-04**: Component library includes at minimum: Button, DatePicker, Checkbox, Tooltip, ProgressBar, Badge/Tag (components needed for v1 features)

### Navigation & Filtering
- [ ] **NAV-01**: App opens to today's date by default
- [ ] **NAV-02**: User can navigate to previous/next day
- [ ] **NAV-03**: User can jump to "Today" or "Yesterday" with quick shortcuts
- [ ] **NAV-04**: URL updates to `/timeline?date=YYYY-MM-DD` (bookmarkable)
- [ ] **NAV-05**: User can filter projects (show/hide individual projects)

## v1.x Requirements (deferred)

- Lightweight file index (first/last timestamps) for selective import by date
- Rolling 30-day window — default import scope for performance at scale
- Fork visualization as sub-rows or visual indicators on parent bars
- Configurable idle threshold in UI (currently CLI flag only)
- Static HTML export for sharing timelines
- Keyboard shortcuts for date navigation (← →)
- Arbitrary date range picker
- Ticket-based cross-day view (multi-day ticket summary)

## Out of Scope

- Dashboard / landing page — URL path reserved but not built
- User accounts or authentication — local tool only
- Remote or cloud storage — SQLite only, local machine
- Real-time updates — manual refresh via UI button
- Mobile-responsive design — desktop browser tool
- Manual time editing — transcripts are immutable source of truth
- Team sharing or multi-user features
- AI-powered insights or summaries
- CSV/JSON data export (Python PoC query.py covers this)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIST-01 | — | Pending |
| DIST-02 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| COMP-01 | — | Pending |
| COMP-02 | — | Pending |
| COMP-03 | — | Pending |
| COMP-04 | — | Pending |
| VIZ-01 | — | Pending |
| VIZ-02 | — | Pending |
| VIZ-03 | — | Pending |
| VIZ-04 | — | Pending |
| VIZ-05 | — | Pending |
| NAV-01 | — | Pending |
| NAV-02 | — | Pending |
| NAV-03 | — | Pending |
| NAV-04 | — | Pending |
| NAV-05 | — | Pending |

---
*Last updated: 2026-02-23 after requirements definition*
