# Phase 35: Tokens Chart Page - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

A new /tokens page with a line chart showing token usage per session over time. Accessible via app header navigation. Includes cumulative/per-message toggle, session visibility control, and session detail on click.

</domain>

<decisions>
## Implementation Decisions

### Page layout and navigation
- Mirror the timeline page structure as closely as possible — same toolbar, same date picker, same overall feel
- The Gantt chart area becomes the token chart area
- No day totals footer (the timeline page's bottom summary goes away)
- Navigation: persistent "Tokens" tab/link in the app header alongside "Timeline"

### Chart visual style
- Match Gantt aesthetic — same color palette as existing Gantt bars (project colors), similar weight/density
- Dark/light theme support matching existing [data-theme='dark'] system

### Session identification in legend
- Claude's discretion — pick the best label that fits chart legend space
- Use the same label resolution logic as the timeline where it makes sense

### Chart interactions
- Clicking a session line opens the session detail panel (same component as clicking a Gantt bar on the timeline page)
- Legend entries toggle session line visibility (show/hide)

### View toggle
- Segmented control: [Cumulative | Per Message] — two-button toggle
- Cumulative: running total of tokens growing over time per session
- Per Message: individual token count per assistant message (shows spikes/patterns)

### Many sessions handling
- Show all sessions, legend scrolls if it overflows
- No grouping or "Other" bucket — all sessions visible

### Compaction markers
- REMOVED from scope — cumulative tokens keep climbing regardless of compaction, and markers would add visual noise when sessions overlap

### Claude's Discretion
- Exact legend label format
- Aggregate "All Sessions" line styling (thicker? different dash pattern?)
- Tooltip content on hover
- Chart responsive sizing
- X-axis time formatting

</decisions>

<specifics>
## Specific Ideas

- "I'd like it to look as close to the timeline page as we can" — the key design principle
- Session detail panel reuse is important — same component, same behavior, just different trigger (click line vs click Gantt bar)

</specifics>

<deferred>
## Deferred Ideas

- Compaction event markers — removed from v1.1.0, could revisit if per-message view makes drops confusing
- Click-through from chart to timeline page (navigate to session on timeline) — separate from detail panel

</deferred>

---

*Phase: 35-tokens-chart-page*
*Context gathered: 2026-04-07*
