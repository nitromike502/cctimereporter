# CC Time Reporter

## What This Is

A Node.js CLI tool (run via `npx cctimereporter`) that gives Claude Code users a visual, interactive Gantt timeline of their coding sessions. It reads Claude Code JSONL transcript files, imports them into a local SQLite database, and serves a Vue 3 web UI showing session timelines grouped by project with idle gap visualization, ticket detection, and click-to-detail session inspection.

## Core Value

A user can run one command and immediately see a clear visual timeline of their Claude Code sessions for any given day.

## Requirements

### Validated

- ✓ JSONL transcript parsing (fork detection, session grouping) — PoC + v1.0
- ✓ Ticket detection via multi-source scoring system — PoC + v1.0
- ✓ Working time calculation with idle gap exclusion — PoC + v1.0
- ✓ SQLite schema for sessions, messages, tickets, fork points — PoC + v1.0
- ✓ HTML timeline generation (static, single-day) — PoC
- ✓ `npx cctimereporter` launches local server and opens browser — v1.0
- ✓ Vue frontend with Gantt-style horizontal bar timeline — v1.0
- ✓ Sessions displayed as bars with idle gaps visually indicated — v1.0
- ✓ Sessions grouped by Claude project directory with color-coding — v1.0
- ✓ Session labels: ticket → branch → first 5 words fallback chain — v1.0
- ✓ Date navigation (prev/next/today/yesterday/picker) — v1.0
- ✓ URL structure: `/timeline?date=YYYY-MM-DD` — v1.0
- ✓ On-demand import refresh via UI button with progress feedback — v1.0
- ✓ Auto-discover all projects under ~/.claude/projects/ — v1.0
- ✓ Project filtering (show/hide individual projects) — v1.0
- ✓ Custom component library with preview page at /components — v1.0
- ✓ Click-to-detail session panel (replaced hover tooltip) — v1.0
- ✓ Overnight session clipping to day boundaries — v1.0
- ✓ Configurable idle threshold in UI — v1.0
- ✓ Rolling 30-day default import window with peek-and-skip caching — v0.2.0
- ✓ First-time welcome message and onboarding flow — v0.2.0
- ✓ Session summaries from sessions-index.json with firstPrompt fallback — v0.2.0
- ✓ Day summary with project/ticket/branch working time breakdowns — v0.2.0
- ✓ Light/dark mode toggle persisted to localStorage — v0.2.0
- ✓ First-visit guided tour using driver.js — v0.2.0
- ✓ Ticket false positive filtering (denylist, score threshold, word boundaries) — v0.2.0
- ✓ Worktree subagent detection and filtering — v0.2.0

- ✓ Session editing from UI with edit modal (custom names and ticket overrides persist across re-imports) — v0.4.0
- ✓ Ticket detection from git commit messages (100pt base + 10/additional) — v0.4.0
- ✓ Ticket detection from MCP tool calls (100pt base + 10/additional) — v0.4.0
- ✓ Ticket detection from session summary/title (25pt flat) — v0.4.0
- ✓ Messages modal XML cleaning (task-notification, bash, local-command, skill expansion tags) — v0.4.0
- ✓ Expandable message cards with DOM overflow detection — v0.4.0

- ✓ Gantt chart zoom 1x–4x with cursor-anchored scroll-wheel zoom — v0.6.0
- ✓ Two-column layout: pinned project labels + scrollable canvas — v0.6.0
- ✓ Click-drag pan when zoomed with grab cursor — v0.6.0
- ✓ Zoom controls (NumberStepper) below chart with "x" suffix — v0.6.0
- ✓ Adaptive time axis tick density (2h→1h→30min→15min by zoom level) — v0.6.0
- ✓ Smooth CSS transition on button zoom, instant on wheel zoom — v0.6.0
- ✓ Branch always stored in DB (including main/master), skipped in label only — v0.6.0
- ✓ NumberStepper parseFloat for decimal step values — v0.6.0

- ✓ Fork branches as 50% height sub-bars beneath parent session bars — v0.7.0
- ✓ Fork bar click shows working time, elapsed time, start/end, messages — v0.7.0
- ✓ Show/hide toggle for fork sub-rows (localStorage persisted) — v0.7.0
- ✓ Progress forks filtered out — only real user forks shown — v0.7.0
- ✓ User/assistant message text stored in DB (1000 char truncation, XML stripped) — v0.7.0
- ✓ Messages modal reads from DB instead of JSONL files — v0.7.0
- ✓ Fork messages viewable in messages modal (filtered by fork_branch_id) — v0.7.0

### Active

(No active milestone — planning next)

### Out of Scope

- Dashboard/landing page — URL reserved but not built
- User accounts or authentication — local tool only
- Remote/cloud storage — SQLite only, local machine
- Real-time updates — manual refresh via UI button
- Mobile-responsive design — desktop browser tool
- Manual time editing — transcripts are immutable source of truth

## Context

**Shipped v0.7.0** with ~7,880 LOC (JS/Vue/CSS) + 2,257 LOC (Python PoC reference).
Tech stack: Node.js 22+ (node:sqlite), Fastify 5, Vue 3, Reka UI, driver.js, Vite 7.
Database: SQLite with WAL mode, schema v8, auto-migration (v1→v8).
Config: `~/.cctimereporter/config.json` for app settings (import debug logging).

**Python PoC:** The `scripts/` directory contains the original proof-of-concept. It uses a separate database (`~/.claude/transcripts.db`) and is not a runtime dependency.

**Known tech debt (v0.6.0):**
- GET /api/projects route registered but unused by frontend
- AppTooltip and AppBadge components exist in library but are not used in production UI
- SessionDetailPanel has dead `.detail-placeholder` CSS class
- Subagent working time not attributed to parent session
- tool_use_count on sessions: computed at import, never queried or displayed

**Deferred features (candidates for future milestones):**
- Fork visualization as sub-rows
- Keyboard shortcuts for date navigation
- Arbitrary date range picker
- Ticket-based cross-day view
- Static HTML export
- UI for reviewing/correcting ticket assignments via bulk DB updates
- Subagent working time attribution to parent session
- **Store all text messages in DB** — capture full user/assistant message text (excluding tool_use/tool_result payloads) in the messages table. Enables richer search, per-segment ticket scoring, and message preview without re-reading JSONL files from disk. Size impact should be manageable if internal/tool messages are excluded.
- **Claude Code /rename tracking** — investigate how repeated /rename commands affect sessions-index.json and whether re-import overwrites user_label set via the edit modal. Ensure rename history or latest-wins behavior is well-defined.
- **Claude Desktop sessions** — import and display sessions from Claude Desktop (not just Claude Code). Investigate transcript format differences, project/conversation structure, and how to represent non-coding sessions in the timeline.
- **Terminal-style messages modal** — restyle the messages modal to visually resemble a Claude Code terminal session (prompt/response styling, monospace, command-line aesthetic). A visual polish touch that reinforces the tool's identity.
- **Daily time review and logging** — review working time for the whole day with a summary view suitable for time reporting. First step toward auto-logging time to Harvest and Jira. Ticket-grouped time totals, editable before submission, API integration with time tracking services.

## Constraints

- **Distribution**: Must work as `npx` package — zero local setup for users
- **Runtime**: Node.js 22+ required (built-in `node:sqlite`)
- **Data location**: All data stays local (~/.cctimereporter/ directory)
- **PoC reference**: Python scripts are reference only, not runtime dependency
- **Frontend**: Vue 3 with custom component library (no UI framework)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + npx distribution | Zero-install experience for users | ✓ Good — works as designed |
| Vue 3 frontend | User preference, good fit for interactive SPA | ✓ Good |
| node:sqlite (built-in) over better-sqlite3 | Eliminates native binary distribution failures | ✓ Good — no install issues |
| SQLite for storage | Proven in PoC, zero-config, local-only | ✓ Good |
| Reimplement PoC logic in JS (not wrap Python) | Single runtime, cleaner distribution | ✓ Good — clean separation |
| Custom component library (no PrimeVue/Vuetify) | Lean package, preview page gates feature use | ✓ Good — 6 components, all working |
| Reka UI headless primitives | Accessible checkbox/tooltip/progress without style lock-in | ✓ Good |
| Pure CSS Gantt positioning (no library) | Simpler, no dependency, percentage-based | ✓ Good — works for all session layouts |
| Generic ticket pattern `[A-Z]{2,8}-\d+` | Works for JIRA, Linear, and custom ticket systems | ✓ Good |
| Size-based skip for idempotent import | Deterministic, no mtime reliability issues | ✓ Good |
| Click-to-detail panel (replaced tooltip) | Better UX for inspecting session details | ✓ Good — Phase 6 evolution |
| Lightweight index deferred | Full import works fast enough for current scale | — Pending (revisit at scale) |
| Rolling 30-day import window | Fast default import, peek-and-skip caching | ✓ Good — instant re-skip |
| sessions-index.json for summaries | AI summaries already generated by Claude Code | ✓ Good — rich context |
| driver.js for guided tour | Lightweight, good API, one-time first-visit | ✓ Good |
| [data-theme='dark'] toggle | User control over light/dark, not just @media | ✓ Good |
| Ticket denylist + score threshold | Eliminates false positives (OPUS-4, UTF-8, etc.) | ✓ Good — 35+ prefixes filtered |
| Worktree path pattern detection | Filters -tmp- and .claude/worktrees/ subagents | ✓ Good |
| Query-time worktree grouping | Group worktree sessions under parent project at display time, not import time | ✓ Good — keeps raw data clean |
| Import raw, derive at query time | User preference: minimize import-time transformations | ✓ Good — philosophy for future changes |
| user_label separate from custom_title | Import-managed vs user-managed columns prevents clobber | ✓ Good — clean separation |
| ON CONFLICT DO UPDATE omits user fields | Simpler than COALESCE, same effect for protecting edits | ✓ Good |
| 6-source ticket scoring system | Comprehensive detection across slash commands, branches, content, commits, MCP, summaries | ✓ Good — covers all sources |
| Summary/title scoring at 25pt flat | Low weight since generated text, not user-authored | ✓ Good |
| Session splitting abandoned | /clear creates new sessions (separate JSONL files), splitting unnecessary | ✗ Invalidated |
| Width-expansion zoom (not transform:scale) | Percentage-based bars reflow correctly with canvas width change | ✓ Good |
| Zoom state in TimelinePage (not GanttChart) | Survives data refreshes and date navigation | ✓ Good |
| Wheel zoom instant, button zoom with CSS transition | Prevents cursor-anchor drift from mid-transition width | ✓ Good |
| Hidden scrollbar | Prevents page height shift on zoom; scroll via wheel/drag | ✓ Good |
| Zoom controls below chart (not toolbar) | User preference; keeps toolbar focused on navigation | ✓ Good |
| Branch always stored (including defaults) | Detail panel always shows branch; label skips defaults | ✓ Good |
| Adaptive tick density (4 tiers) | 2h/1h/30min/15min at thresholds 1/1.75/2.75/3.75x | ✓ Good |

---
*Last updated: 2026-03-24 after v0.7.0 Fork Visualization + Stored Messages milestone complete*
