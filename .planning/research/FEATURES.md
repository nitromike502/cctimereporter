# Feature Research

**Domain:** Developer session timeline and time-tracking visualization CLI tool
**Researched:** 2026-02-22
**Confidence:** MEDIUM — Table stakes derived from surveying WakaTime, Toggl, Clockify, TMetric, and general Gantt/timeline visualization tools. This is a niche domain (AI coding session visualization) with no direct comparators; features are inferred from the nearest analogues.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Gantt-style horizontal bars per session | Core visual metaphor — users can't orient without it | LOW | Bars = wall-clock span, not working time |
| Idle gap visualization | Working time ≠ wall clock — gaps must be visible to be meaningful | MEDIUM | Existing Python impl uses faded bars; must carry over to Node version |
| Session label (ticket / branch / fallback) | Rows with no label are uninterpretable | LOW | Three-tier fallback chain: ticket → branch → first 5 words already defined |
| Grouping by project directory | Multiple Claude projects coexist; mixing them destroys readability | LOW | Color-coded groups with headers |
| Date navigation (prev/next day) | Users check yesterday, today, specific dates constantly | LOW | Keyboard shortcuts expected (← →) |
| "Today" / "Yesterday" shortcuts | Typing full dates is friction for daily use | LOW | Buttons or keyboard shortcut |
| Rolling N-day default window | Single-day view is limiting; users want a week or month at a glance | MEDIUM | 30-day default per spec; must handle sparse days gracefully |
| Hover tooltip with session detail | Bars are small; users need detail-on-demand | LOW | Session ID, ticket, branch, working time, span, message count |
| Working time vs wall-clock distinction | Users care about both; conflating them is wrong | MEDIUM | Must display both, clearly labeled |
| Color-coding by project | Visual differentiation at a glance | LOW | Already in Python version; carry forward |
| Single command launch (`npx cctimereporter`) | If it requires setup, half the value is gone | MEDIUM | Import + serve + open browser all in one command |
| On-demand import from JSONL | Data must be fresh; stale data is misleading | MEDIUM | Import before render, or flag if data is stale |
| Project filtering | Users with 5+ Claude projects can't see one project's sessions in the noise | LOW | Checkbox or select; already noted in spec |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Claude-specific session understanding (forks) | Generic tools don't know what a "fork" is; showing forked branches as distinct is unique | HIGH | Fork detection logic already exists in Python; exposing forks visually is novel |
| Ticket-aware grouping and labeling | No generic time tracker knows about AILASUP-NNN; surfacing ticket context is high-signal | MEDIUM | Scoring system already implemented; needs to surface well in UI |
| Auto-derivation of session titles from message content | Generic tools show raw IDs or empty; meaningful labels from first user message is a quality-of-life win | MEDIUM | Already in Python version; must carry forward robustly |
| Gap annotation (idle vs active differentiation within a bar) | Most Gantt tools show a single solid bar; showing internal idle structure is rare and useful | MEDIUM | Faded segments for idle gaps; tooltip showing gap threshold |
| Configurable idle threshold | Different workflows have different natural pause patterns; 10-min default suits most but not all | LOW | `--threshold` flag already exists; expose in UI as well |
| Date range view (rolling 30 days) with sparse-day handling | Most session trackers show individual days; cross-day patterns require a wider view | MEDIUM | Empty days should collapse or be visually compact, not occupy equal space |
| WSL/cross-platform auto-open in browser | Developer tools that fight the environment lose adoption fast | LOW | Already in Python version for WSL; must generalize |
| Import progress / status feedback | Large transcript dirs take seconds; silent progress = user thinks it hung | LOW | Spinner or progress line during import |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time / live-updating view | "I want to watch my session grow" | Claude Code sessions are written to disk incrementally but not in a way that supports polling reliably; adds complexity for minimal value during normal review use | On-demand refresh (F5 or a Refresh button) is sufficient |
| Manual time entry / editing | Users notice their estimates are off and want to correct | Introduces a parallel "source of truth" that diverges from transcript data; correctness guarantees break | Read-only view with clear data provenance; if editing is needed, that's a separate workflow tool |
| Team / multi-user sharing | "Can I share this with my manager?" | Out of scope for a personal developer tool; introduces auth, server-side storage, privacy questions | Export to static HTML (already done in Python version) is the right escape valve |
| Billing / invoice generation | Users see time data and want to use it for billing | This tool tracks AI assistant sessions, not billable time directly; conflating the two will mislead | Provide export format that feeds into Harvest/Jira; don't build invoicing |
| Per-message granularity in the timeline | "Show every message as a dot" | At scale (thousands of messages) this creates visual noise and performance issues | Hover tooltip with message count; separate detail view if needed |
| Drag-to-resize bars (editing durations) | Familiar from project Gantt tools | Sessions have fixed timestamps from transcripts; editable bars create illusion of control over immutable data | Display what happened, not what someone wishes happened |
| AI-powered insights ("you worked X% on feature Y") | Sounds impressive | Requires ML pipeline, significant complexity, and transcript content analysis that raises privacy concerns | Surface ticket/branch time summaries; let the user draw conclusions |

---

## Feature Dependencies

```
[SQLite DB with imported data]
    └──required by──> [Timeline rendering]
                          └──required by──> [Date navigation]
                          └──required by──> [Project filter]
                          └──required by──> [Rolling window view]

[On-demand import]
    └──feeds──> [SQLite DB with imported data]

[Fork detection in DB]
    └──enhances──> [Session labels]
    └──enables──> [Fork visualization in bars]

[Session label derivation (ticket → branch → fallback)]
    └──required by──> [Meaningful row labels]
    └──required by──> [Grouping by ticket in summary]

[Idle gap calculation]
    └──required by──> [Working time display]
    └──required by──> [Gap visualization within bars]

[Project color scheme]
    └──required by──> [Color-coded bars]
    └──required by──> [Legend]

[Import pipeline (Node equivalent of Python import)]
    └──conflicts with──> [Zero-dependency constraint]
    (Node version WILL have dependencies; better-sqlite3 is the key one)
```

### Dependency Notes

- **SQLite DB requires import pipeline:** The rendering layer has no data without a working import. Import must run (or validate data is current) on every CLI invocation.
- **Idle gap calculation requires raw message timestamps:** The DB must store per-message timestamps at import time. Post-hoc calculation from session-level data is insufficient.
- **Fork visualization enhances session labels:** You can show fork branches as sub-rows only if fork detection ran at import time. Fork-unaware imports produce flat session lists.
- **On-demand import conflicts with zero-dependency Python constraint:** The Node version removes this constraint — `better-sqlite3` is a required dependency.
- **Rolling window view requires sparse-day handling:** A 30-day view that allocates equal width to every day (including weekends/days off) produces unreadable compressed bars. Needs design decision: proportional time axis vs. collapsed empty days.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept and replace the Python `timeline.py` as daily driver.

- [ ] Single `npx cctimereporter [date]` command launches browser — no setup required
- [ ] Gantt-style bars per session for the given date, grouped by project
- [ ] Idle gap visualization (faded segments) with configurable threshold
- [ ] Three-tier session label (ticket → branch → first-5-words fallback)
- [ ] Hover tooltip: session ID, ticket, branch, working time, wall-clock span, message count
- [ ] Date navigation: prev/next day buttons and keyboard arrows
- [ ] "Today" / "Yesterday" quick nav
- [ ] Project color-coding with legend showing per-project working/span totals
- [ ] On-demand import from JSONL transcripts before render
- [ ] Project filter (show/hide individual projects)
- [ ] Import status feedback (progress during import)

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Rolling 30-day view (date range) — trigger: users ask "how was my week?"
- [ ] Fork visualization as sub-rows or visual indicator — trigger: user confusion about why session bar looks discontinuous
- [ ] Configurable idle threshold in UI (not just CLI flag) — trigger: users complaining default is wrong for their workflow
- [ ] Static HTML export — trigger: first "can I share this?" request

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Date range picker (arbitrary start/end) — defer: rolling window covers most use cases; custom range adds UI complexity
- [ ] Keyboard shortcut reference overlay — defer: discoverability issue only surfaces with regular users
- [ ] Per-project working time summary report (not just timeline) — defer: `query.py --working-time` covers this; avoid duplicating
- [ ] Ticket-based grouping across days (multi-day ticket view) — defer: requires cross-day data model changes
- [ ] CSV/JSON data export — defer: Python `query.py` covers this for now

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Single command launch | HIGH | MEDIUM | P1 |
| Gantt bars with idle gaps | HIGH | MEDIUM | P1 |
| Session labels (3-tier) | HIGH | LOW | P1 |
| Date navigation | HIGH | LOW | P1 |
| Hover tooltips | HIGH | LOW | P1 |
| Project grouping + color | HIGH | LOW | P1 |
| On-demand import | HIGH | MEDIUM | P1 |
| Project filter | MEDIUM | LOW | P1 |
| Import progress feedback | MEDIUM | LOW | P1 |
| Rolling 30-day view | HIGH | MEDIUM | P2 |
| Fork sub-row visualization | MEDIUM | HIGH | P2 |
| Threshold UI control | LOW | LOW | P2 |
| Static HTML export | MEDIUM | LOW | P2 |
| Date range picker | LOW | MEDIUM | P3 |
| Ticket cross-day view | MEDIUM | HIGH | P3 |
| CSV/JSON export | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

No direct competitor exists for Claude Code session timeline visualization. The nearest analogues are:

| Feature | WakaTime | TMetric | Python timeline.py (current) | Our Approach |
|---------|----------|---------|-------------------------------|--------------|
| Session timeline bars | Coding activity chart (not Gantt) | Activity timeline with intervals | Gantt bars with idle gaps | Gantt bars, same design |
| Idle detection | Editor-based; no idle gaps shown | "Work Session Analysis" breaks down intervals | Faded gap segments | Carry forward faded segments |
| Ticket awareness | No (project-level only) | No (manual tags only) | Yes (scoring system) | Yes — core differentiator |
| Fork awareness | N/A | N/A | Yes (is_fork_branch marking) | Yes — show forks visually |
| Project grouping | Yes | Yes | Yes (by Claude project dir) | Yes |
| Date navigation | Calendar picker | Date range picker | CLI args only | Prev/next + quick nav |
| Single-command install | No (IDE plugin required) | No (account signup required) | No (Python script, manual) | Yes — npx one-liner |
| Export | Yes (CSV, reports) | Yes (CSV, PDF) | Static HTML to Downloads | Static HTML (v1.x) |
| Privacy | Cloud-stored data | Cloud-stored data | Local only | Local only — key advantage |

**Key insight:** The privacy-first, local-only, single-command approach combined with Claude-specific context (tickets, forks, project dirs) is the entire value proposition. Do not erode these with cloud features.

---

## Sources

- WakaTime product overview: [https://wakatime.com/](https://wakatime.com/) (WebSearch, MEDIUM confidence)
- Developer time tracking tools comparison: [https://super-productivity.com/blog/time-tracking-for-developers/](https://super-productivity.com/blog/time-tracking-for-developers/) (WebSearch, LOW confidence — single source)
- TMetric "Work Session Analysis": [https://tmetric.com/best-software/10-best-time-trackers-for-developers](https://tmetric.com/best-software/10-best-time-trackers-for-developers) (WebSearch, LOW confidence — secondary source)
- Gantt interactivity patterns (hover, zoom, tooltip): [https://www.anychart.com/blog/2025/11/05/best-javascript-gantt-chart-libraries/](https://www.anychart.com/blog/2025/11/05/best-javascript-gantt-chart-libraries/) (WebSearch, LOW confidence — blog, not official docs)
- Date filter UX patterns: [https://evolvingweb.com/blog/most-popular-date-filter-ui-patterns-and-how-decide-each-one](https://evolvingweb.com/blog/most-popular-date-filter-ui-patterns-and-how-decide-each-one) (WebSearch, LOW confidence)
- Existing Python implementation (direct inspection): `references/PROJECT-STATUS.md`, `scripts/timeline.py` — HIGH confidence for current feature set
- Project specification (direct inspection): `CLAUDE.md` — HIGH confidence for intended features

---

*Feature research for: developer session Gantt timeline visualization (CC Time Reporter)*
*Researched: 2026-02-22*
