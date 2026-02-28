# Phase 5: Timeline UI - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Interactive Gantt timeline page showing Claude Code sessions on a time-of-day horizontal axis for any selected date. Includes date navigation, project filtering, hover tooltips, and import triggering. This is the final phase — the product works end-to-end after this.

</domain>

<decisions>
## Implementation Decisions

### Gantt bar rendering
- Idle gaps rendered as faded/transparent segments inline within a continuous bar — one connected shape with visual breaks for idle periods
- Overlapping sessions (same project, same time) get stacked sub-rows within the project's swim lane — no visual collision
- Time axis covers full 24h (00:00–23:59) but viewport auto-scrolls/zooms to the active range where sessions exist
- Bar height/density: Claude's discretion based on typical data density

### Session labeling & grouping
- Project colors: Claude's discretion (auto-palette or hash-based)
- Floating legend box mapping colors to project names (not inline row headers)
- Session bar labels truncate with ellipsis when bar is too narrow — full label visible in hover tooltip
- Projects displayed in distinct swim lanes with divider lines between groups

### Date navigation & layout
- Navigation control placement: Claude's discretion (toolbar or sidebar)
- No keyboard shortcuts — all navigation is mouse/touch only
- No daily summary stats — the timeline visualization speaks for itself
- Project filter selections persist across date changes (reset on page reload)
- URL updates to `/timeline?date=YYYY-MM-DD` on each navigation

### Import UX
- Import button always visible in toolbar/header — one-click import anytime
- Inline progress bar appears near the Import button during import
- Timeline auto-refreshes with new data when import completes

### Empty state
- Helpful message when no data: "No sessions found for [date]" with an Import button and suggestion to try another date

### Claude's Discretion
- Bar row height (compact vs comfortable)
- Project color assignment strategy
- Navigation control placement (toolbar vs sidebar)
- Exact tooltip styling and positioning
- Time axis tick mark intervals
- Swim lane visual treatment (background shading, divider style)

</decisions>

<specifics>
## Specific Ideas

- Idle gaps should feel like "the same session, just paused" — faded inline, not broken apart
- Swim lanes per project give clear visual separation without needing to read colors
- The timeline should be clean and uncluttered — no summary stats, no extra chrome
- Import should feel seamless: click, see progress, data appears automatically

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-timeline-ui*
*Context gathered: 2026-02-27*
