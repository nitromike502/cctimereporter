# Project Milestones: CC Time Reporter

## v0.8.0 Programmatic Data Access (Shipped: 2026-03-30)

**Delivered:** Session data exposed through a stdio MCP server (8 tools) and CLI subcommands (summary, sessions, import) with multi-instance coordination via DB-based locks — enabling Claude agents to pull time logs programmatically.

**Phases completed:** 28-31 (7 plans total)

**Key accomplishments:**

- Extracted service layer (timeline, sessions, import) shared by web routes, CLI, and MCP
- Built multi-instance coordination: process_locks table, server ownership, import lock with stale PID reclaim
- Added Commander-based CLI dispatch with `summary`, `sessions`, `import` subcommands (~70ms startup)
- Built stdio MCP server with 8 tools: 4 query (get_day_summary, get_sessions, get_session_messages, get_dates) + 4 action (trigger_import, start_server, stop_server, server_status)
- Full documentation: 8 reference docs, test guide with 36 test cases across 4 files

**Stats:**

- 74 files changed, 10,239 insertions
- 9,078 lines of JS/Vue/CSS (total codebase)
- 4 phases, 7 plans
- 4 days (2026-03-26 → 2026-03-30)

**Git range:** `v0.7.0` → `v0.8.0`

**What's next:** Bug fixes (migration banner, empty fork sessions), Agent Teams subagent reporting

---

## v0.7.0 Fork Visualization + Stored Messages (Shipped: 2026-03-24)

**Delivered:** Fork branches display as half-height sub-bars beneath parent sessions in the Gantt chart with clickable detail, and message text is stored in the DB enabling the messages modal to work without JSONL file access.

**Phases completed:** 22-27 (6 plans total)

**Key accomplishments:**

- Schema v7+v8: fork_branch_id and content columns on messages table
- Fork detector correctly distinguishes real user forks from progress forks
- Fork segments computed at query time with working time, elapsed time, day boundary clamping
- GanttForkBar component renders 50% height sub-bars with selection highlight
- Show/hide fork toggle with localStorage persistence
- Detail panel shows fork-specific data with parent session context
- User/assistant message text stored in DB (1000 char truncation, XML stripped)
- Messages modal switched from JSONL file reading to DB queries
- Fork branch message filtering in messages modal

**Stats:**

- 35 files changed, 3,125 insertions
- 7,880 lines of JS/Vue/CSS (total codebase)
- 6 phases, 6 plans
- 5 days (2026-03-20 → 2026-03-24)

**Git range:** `v0.6.0` → `v0.7.0`

**What's next:** TBD — next milestone planning

---

## v0.6.0 Gantt Chart Zoom (Shipped: 2026-03-19)

**Delivered:** Users can zoom the Gantt timeline 1x–4x to inspect short sessions and focus on time ranges, with scroll-wheel zoom, cursor anchoring, drag-to-pan, and adaptive tick density.

**Phases completed:** 19-21 (4 plans total)

**Key accomplishments:**

- Restructured GanttChart.vue to two-column layout: pinned project labels + horizontally scrollable canvas
- Scroll-wheel zoom with cursor-anchor math (content under cursor stays fixed during zoom)
- Click-drag pan when zoomed >1x with grab/grabbing cursors
- Zoom controls (NumberStepper) positioned below the chart with "x" suffix indicator
- Adaptive time axis tick density: 2h at 1x, 1h at 2x, 30min at 3x, 15min at 4x
- Smooth CSS transition on button-triggered zoom; instant on wheel zoom
- Branch display fix: default branches (main, master) now stored instead of null
- NumberStepper parseFloat fix for decimal step values (0.25)

**Stats:**

- 29 files changed, 2,452 insertions
- 7,246 lines of JS/Vue/CSS (total codebase)
- 3 phases, 4 plans
- 2 days (2026-03-19 → 2026-03-19)

**Git range:** `32d46ec` (milestone start) → `727b8fa` (phase 21 complete)

**What's next:** TBD — next milestone planning

---

## v0.5.0 Import Performance (Shipped: 2026-03-12)

**Delivered:** Incremental import with 2-day default window and configurable debug logging — dramatically faster daily imports.

**Phases completed:** Ad-hoc (no GSD phases — done outside planning system)

**Key accomplishments:**

- Incremental import with 2-day rolling window default (split-button: "Import Recent" vs "Full Import")
- Agent files now use same 3-tier skip logic as session files
- Config-driven import debug logging to `~/.cctimereporter/import.log`
- New `~/.cctimereporter/config.json` for application settings
- `npx cctimereporter --debug-import on|off` CLI flag

**Git range:** `v0.4.0` → `v0.5.0` (4 commits)

---

## v0.4.0 Session Intelligence (Shipped: 2026-03-08)

**Delivered:** Users can name sessions and override tickets from the UI with edits surviving re-imports, plus expanded ticket detection from git commits, MCP tool calls, and session summaries.

**Phases completed:** 17-18 (4 plans total)

**Key accomplishments:**

- Schema v6 migration with user_label/user_ticket columns protected from import clobber via ON CONFLICT DO UPDATE
- PATCH /api/sessions/:id endpoint for editing session names and tickets
- Edit modal with persistence notice and copiable CLI resume command
- Three new ticket detection sources: git commit messages (100pt), MCP tool calls (100pt), session summary/title (25pt flat)
- Total ticket scoring now covers 6 sources across slash commands, branches, content, commits, MCP, and summaries
- Messages modal improvements: XML cleaning, expandable cards, 10+10 message display

**Stats:**

- 49 files created/modified
- 6,637 lines of JS/Vue/CSS (total codebase)
- 2 phases, 4 plans
- 3 days (2026-03-06 → 2026-03-08)

**Git range:** `feat(17-01)` → `v0.4.0`

**What's next:** Session splitting at /clear boundaries, storing text messages in DB

---

## v0.3.0 Session Polish (Shipped: 2026-03-05)

**Delivered:** Tour enhancements, slash command XML parsing, session message modal, session naming from Claude Code, and SSE import progress indicator.

**Phases completed:** 12-16 (6 plans total)

**Key accomplishments:**

- Tour steps for project filter checkboxes and day summary panel
- Slash command XML parser for readable summaries
- Session messages modal showing first/last messages from transcripts
- Custom session titles from Claude Code's sessions-index.json
- Two-pass import with SSE streaming progress bar

**Stats:**

- 5 phases, 6 plans
- 2 days (2026-03-04 → 2026-03-05)

**Git range:** `feat(12-01)` → `v0.3.1`

---

## v0.2.0 UX and Insights (Shipped: 2026-03-04)

**Delivered:** Rich session context, day summary breakdowns, onboarding experience, theming, and data quality fixes make the timeline immediately useful for daily time reporting.

**Phases completed:** 7-11 (11 plans total)

**Key accomplishments:**

- Rolling 30-day import with peek-and-skip caching for instant re-imports
- First-time welcome screen with clear onboarding flow
- Session summaries from AI-generated index or first user message fallback
- Day summary panel with project/ticket/branch working time breakdowns
- Light/dark mode toggle with system preference detection and first-visit guided tour
- Fixed data quality: filtered slash command XML from summaries, expanded ticket denylist (35+ patterns), score threshold filtering

**Stats:**

- 19 files created/modified
- 5,127 lines of JS/Vue/CSS (total codebase)
- 5 phases, 11 plans
- 2 days (2026-03-03 → 2026-03-04)

**Git range:** `feat(07-01)` → `docs(11)`

**What's next:** TBD — next milestone planning

---

## v1.0 MVP (Shipped: 2026-03-01)

**Delivered:** A fully working CLI tool that visualizes Claude Code sessions as an interactive Gantt timeline — run `npx cctimereporter` and see your coding day at a glance.

**Phases completed:** 1-6 (14 plans total)

**Key accomplishments:**

- Built full Node.js import pipeline matching Python PoC output — fork detection, ticket scoring, idempotent re-import with size-based skip
- Created Fastify server with timeline/projects/import API routes and `npx` CLI entry point with port fallback and browser auto-open
- Built custom Vue 3 component library (6 components) with CSS design tokens and live preview page at `/components`
- Implemented interactive Gantt timeline with color-coded project swimlanes, idle gap visualization, and overlapping session stacking
- Added click-to-detail session panel with 8-field display, replacing tooltip hover
- Implemented overnight session clipping to day boundaries and configurable idle threshold

**Stats:**

- 50 files created/modified
- 4,483 lines of JavaScript/Vue/CSS (+ 2,257 lines Python PoC)
- 6 phases, 14 plans
- 7 days from project start to ship (2026-02-22 → 2026-03-01)

**Git range:** `a7de89a` (first phase commit) → `e3d84c4` (docs update)

**What's next:** Documentation, npm publish preparation, and potential v1.1 features (keyboard shortcuts, date range picker, ticket cross-day view)

---
