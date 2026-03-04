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

### Active

No active milestone. Next milestone TBD.

### Out of Scope

- Dashboard/landing page — URL reserved but not built
- User accounts or authentication — local tool only
- Remote/cloud storage — SQLite only, local machine
- Real-time updates — manual refresh via UI button
- Mobile-responsive design — desktop browser tool
- Manual time editing — transcripts are immutable source of truth

## Context

**Shipped v0.2.0** with 5,127 LOC (JS/Vue/CSS) + 2,257 LOC (Python PoC reference).
Tech stack: Node.js 22+ (node:sqlite), Fastify 5, Vue 3, Reka UI, driver.js, Vite 7.
Database: SQLite with WAL mode, schema v5, auto-migration.

**Python PoC:** The `scripts/` directory contains the original proof-of-concept. It uses a separate database (`~/.claude/transcripts.db`) and is not a runtime dependency.

**Known tech debt (v0.2.0):**
- GET /api/projects route registered but unused by frontend
- AppTooltip and AppBadge components exist in library but are not used in production UI
- SessionDetailPanel has dead `.detail-placeholder` CSS class
- Subagent working time not attributed to parent session

**Deferred features (candidates for future milestones):**
- Fork visualization as sub-rows
- Keyboard shortcuts for date navigation
- Arbitrary date range picker
- Ticket-based cross-day view
- Static HTML export
- UI for reviewing/correcting ticket assignments via bulk DB updates
- Subagent working time attribution to parent session

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

---
*Last updated: 2026-03-04 after v0.2.0 milestone completion*
