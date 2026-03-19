# Requirements: CC Time Reporter v0.6.0

**Defined:** 2026-03-18
**Core Value:** A user runs one command and immediately sees a clear visual timeline of their Claude Code sessions for any given day

## v0.6.0 Requirements

Requirements for Gantt chart zoom/pan. Each maps to roadmap phases.

### Layout Restructure

- [ ] **LYOT-01**: Project name column stays pinned on the left while the timeline canvas scrolls horizontally
- [ ] **LYOT-02**: Time axis header stays aligned with the scrollable canvas
- [ ] **LYOT-03**: Chart renders identically to current layout at 1x zoom (no visual regression)

### Zoom Controls

- [ ] **ZOOM-01**: Scroll wheel over the chart zooms in/out (plain wheel, no Ctrl modifier)
- [ ] **ZOOM-02**: Zoom anchors to cursor position (content under cursor stays in place)
- [ ] **ZOOM-03**: +/- zoom buttons in the toolbar
- [ ] **ZOOM-04**: Zoom range: 1x to 4x
- [ ] **ZOOM-05**: Zoom resets to 1x on date navigation

### Zoom Polish

- [ ] **ZPOL-01**: Zoom level indicator in toolbar showing current level (e.g. "2.5x")
- [ ] **ZPOL-02**: Smooth CSS transition during zoom changes
- [ ] **ZPOL-03**: Adaptive time axis tick density at higher zoom levels (e.g. 15min intervals at 4x)

### Interaction Integrity

- [ ] **INTR-01**: Click-to-detail on session bars still works correctly after zoom/scroll
- [ ] **INTR-02**: Existing session detail panel, messages modal, and edit modal unaffected by zoom

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Advanced Navigation

- **NAV-01**: Keyboard shortcuts for zoom (e.g. +/- keys)
- **NAV-02**: Minimap showing viewport position within zoomed chart
- **NAV-03**: Click-to-zoom on a specific time range

### Pinned Labels Enhancement

- **PIN-01**: Pinned label column width adjustable by user
- **PIN-02**: Pinned labels show truncated path with tooltip for full path

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Ctrl+wheel zoom | Conflicts with browser native page zoom |
| Discrete time granularity switching (day/week/month) | This is a single-day view, not a project planner |
| Zoom persistence to localStorage | User wants fresh 1x on each visit |
| Vertical zoom | Horizontal zoom only; rows are already auto-sized |
| Transform-based scaling | Width-expansion is the correct model for percentage-based layout |
| Drag-to-pan | Native horizontal scrollbar handles pan; no custom drag needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LYOT-01 | TBD | Pending |
| LYOT-02 | TBD | Pending |
| LYOT-03 | TBD | Pending |
| ZOOM-01 | TBD | Pending |
| ZOOM-02 | TBD | Pending |
| ZOOM-03 | TBD | Pending |
| ZOOM-04 | TBD | Pending |
| ZOOM-05 | TBD | Pending |
| ZPOL-01 | TBD | Pending |
| ZPOL-02 | TBD | Pending |
| ZPOL-03 | TBD | Pending |
| INTR-01 | TBD | Pending |
| INTR-02 | TBD | Pending |

**Coverage:**
- v0.6.0 requirements: 13 total
- Mapped to phases: 0
- Unmapped: 13

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
