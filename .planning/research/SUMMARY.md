# Project Research Summary

**Project:** CC Time Reporter v0.4.0 — Session Intelligence
**Domain:** Developer tool enhancement (CLI + Web UI, existing codebase)
**Researched:** 2026-03-07
**Confidence:** HIGH

## Executive Summary

The v0.4.0 "Session Intelligence" release adds two features to CC Time Reporter: user-editable session names and improved ticket auto-discovery. The critical finding across all research is that zero new dependencies are needed. Reka UI Editable (already installed) handles inline editing, Fastify natively supports PATCH routes, and ticket detection improvements are purely algorithmic regex work on structured data. The `custom_title` column already exists on the sessions table. This is a wiring and refinement release, not a greenfield build.

The recommended approach is backend-first: fix the database upsert layer before touching UI. The current `INSERT OR REPLACE` pattern in `upsertSession()` will silently destroy any user-editable data on re-import, making it the single most important issue to solve first. A new `user_label` column (separate from the import-managed `custom_title`) with `INSERT ... ON CONFLICT DO UPDATE` preserving user fields is the correct pattern. This same pattern extends to user ticket overrides later. The FEATURES research independently arrived at the same conclusion as PITFALLS: do not reuse `custom_title` for user edits.

The primary risk is data loss through import clobbering user edits. Secondary risk is false positives from new ticket detection sources overwhelming the scoring system. Both are well-understood with clear prevention strategies. Ticket detection scoring weights need empirical tuning against real transcripts, which introduces some uncertainty but is bounded work.

## Key Findings

### Recommended Stack

No new dependencies. Everything builds on the existing installed stack.

**Core technologies (all already present):**
- **Reka UI Editable**: inline text editing -- headless component with blur-save, keyboard handling, and v-model binding; verified in `node_modules/reka-ui/dist/Editable/EditableRoot.js`
- **Fastify PATCH route**: first write endpoint -- native support via `fastify.patch()`, no plugins needed
- **node:sqlite ON CONFLICT**: upsert with field preservation -- replaces destructive INSERT OR REPLACE pattern

See `.planning/research/STACK.md` for full rationale.

### Expected Features

**Must have (table stakes):**
- Inline edit session name in detail panel (click to edit, blur/Enter saves, Escape cancels)
- User-set names persist across re-imports (separate `user_label` column, never touched by import)
- PATCH endpoint for session updates (first write endpoint in the app)
- Git commit message scanning for ticket detection (highest-impact new source, ~50pts)
- Summary text scanning for tickets (data already in DB, easy win, ~25pts)

**Should have (competitive):**
- User ticket override (manually set/correct primary ticket)
- Multi-ticket display (show all detected tickets, not just primary)
- Ticket link URL template (configurable Jira/Linear/GitHub URL pattern)
- Label source indicator (show "user-set" vs "from Claude" vs "auto-detected")

**Defer (v2+):**
- Inline edit on Gantt bar (narrow bars make this impractical)
- Bulk rename sessions
- Auto-suggest names from AI summary
- External API integration with ticket systems

See `.planning/research/FEATURES.md` for full feature matrix.

### Architecture Approach

Two independent feature tracks that share a common foundation: the database migration and upsert protection layer. Session naming introduces the app's first write-back capability (UI to API to SQLite), establishing patterns for all future user edits. Ticket detection improvements extend the existing import pipeline with new scoring sources. Both tracks modify 5-6 existing files and add 1 new route file (`src/server/routes/sessions.js`).

**Major components:**
1. **DB migration** -- adds `user_label` column, changes upsert to ON CONFLICT with COALESCE preservation of user fields
2. **Sessions PATCH route** -- new `src/server/routes/sessions.js` with input validation, 404 handling, and return-updated-state pattern
3. **Reka UI Editable integration** -- replaces static name display in SessionDetailPanel with inline editing
4. **Ticket scoring pipeline extensions** -- new sources (commit messages at ~50pts, summary at ~25pts) fed into existing scoring system

See `.planning/research/ARCHITECTURE.md` for data flow diagrams and file-level change map.

### Critical Pitfalls

1. **INSERT OR REPLACE destroys user edits** -- switch to INSERT ON CONFLICT DO UPDATE with COALESCE for user columns. Must be solved before any UI work ships.
2. **First write endpoint has no precedent** -- establish validation, 404 handling, and response patterns carefully since all future write endpoints will copy this pattern.
3. **Ticket denylist does not scale** -- lean into scoring weights (MIN_TICKET_SCORE = 15) rather than growing the 35-entry denylist. Keep new sources in 25-75pt range, well below slash commands at 500-700pts.
4. **upsertTickets DELETE destroys user overrides** -- store user ticket override on sessions table (like user_label), not in tickets table which gets wiped on re-import.
5. **Regex statefulness bugs** -- use `matchAll()` for all new patterns to avoid `lastIndex` issues from `/gi` flag patterns in the codebase.

See `.planning/research/PITFALLS.md` for full catalog with prevention strategies.

## Implications for Roadmap

Based on combined research, suggested three-phase structure. Phases 1 and 2 are technically independent but should be sequenced because Phase 1 establishes the user-data protection pattern that Phase 3 extends.

### Phase 1: Session Naming

**Rationale:** Establishes the write-back foundation that all user-edit features depend on. DB migration must come first since both session naming and ticket overrides need import-safe user columns. This is the app's first write endpoint -- getting the pattern right here matters for everything that follows.
**Delivers:** Users can rename sessions in the detail panel; names survive re-imports; first PATCH endpoint established as a reusable pattern.
**Addresses features:** Inline edit, PATCH endpoint, user_label column, label fallback chain update (user_label at top), import protection via ON CONFLICT.
**Avoids pitfalls:** #1 (INSERT OR REPLACE clobber), #3 (first write endpoint patterns), #4 (inline edit UX discoverability).

Build order within phase:
1. DB migration (user_label column, schema version bump)
2. Modify upsertSession() from INSERT OR REPLACE to INSERT ON CONFLICT DO UPDATE with COALESCE
3. New PATCH route (`src/server/routes/sessions.js`) with validation
4. Frontend Reka UI Editable integration in SessionDetailPanel
5. Label chain update in GanttBar (user_label at top of fallback)

### Phase 2: Ticket Detection Improvements

**Rationale:** Independent from Phase 1. Extends the existing import pipeline with new scoring sources. Best sequenced after Phase 1 so the upsert protection pattern is established and tested before adding more import-time complexity.
**Delivers:** Better automatic ticket detection from git commits and summaries; more accurate primary ticket assignment; fewer false positives through scoring rather than denylist expansion.
**Addresses features:** Git commit message scanning, summary scanning, scoring weight calibration.
**Avoids pitfalls:** #2 (denylist scaling), #5 (regex statefulness), #6 (git availability assumptions), #7 (scoring weight tuning).

Build order within phase:
1. Summary scanning (lowest risk -- data already in DB, add to scoring pipeline)
2. Git commit message scanning (medium complexity -- needs graceful fallback when repo unavailable)
3. Score weight tuning against real transcripts
4. Integration testing with full re-import

### Phase 3: User Overrides and Polish

**Rationale:** Builds on the PATCH endpoint pattern from Phase 1 and the improved ticket detection from Phase 2. Lets users correct what the algorithm still gets wrong after Phase 2 improvements.
**Delivers:** User ticket override, multi-ticket display, ticket link template, label source indicator.
**Addresses features:** User ticket override, multi-ticket display, ticket link URL template, label source indicator.
**Avoids pitfalls:** #8 (upsertTickets DELETE destroying user overrides -- store on sessions table, not tickets table).

### Phase Ordering Rationale

- **Phase 1 before 2:** The ON CONFLICT upsert pattern established in Phase 1 is the safety net that makes all user-editable data possible. Without it, any user edit feature is broken by the next import.
- **Phase 2 before 3:** User overrides are a fallback for when auto-detection fails. Better auto-detection (Phase 2) reduces how often users need overrides (Phase 3).
- **All phases are small:** Each is 5-8 files modified, 0-1 new files. This is a refinement release, not a large feature build.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Ticket Detection):** Scoring weight calibration requires empirical testing against real transcripts. The specific format of git commit output in tool_result blocks needs investigation during implementation. Consider `/gsd:research-phase` for this one.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Session Naming):** All patterns are well-documented. Reka UI Editable API verified in node_modules. Fastify PATCH is native. SQLite ON CONFLICT is standard SQL. No unknowns.
- **Phase 3 (User Overrides):** Extends patterns established in Phase 1. No new technical unknowns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new deps. All components verified in installed node_modules. |
| Features | MEDIUM-HIGH | Table stakes are clear. Differentiators need UX validation (Gantt bar edit correctly deferred). |
| Architecture | HIGH | Existing codebase is well-structured. Changes are surgical (5-6 files), not structural. |
| Pitfalls | HIGH | INSERT OR REPLACE issue confirmed by reading db-writer.js source. All pitfalls grounded in actual code. |

**Overall confidence:** HIGH

### Gaps to Address

- **Scoring weight calibration:** Optimal point values for git commit (50pts?) and summary (25pts?) sources need validation against real transcript data. Plan for a tuning step in Phase 2.
- **Git commit output format:** Need to verify what git commit output looks like inside tool_result blocks during Phase 2 implementation. May need to parse multiple git output formats (short log, full log, merge commits).
- **Schema version number:** Research references v6, but current schema is v3. Need to verify whether intermediate versions (v4, v5) exist from other branches or planned work. The migration should use the next available version.
- **Inline edit discoverability:** No research on how users will discover the edit capability. Add a visual hover affordance (pencil icon or underline) during Phase 1 UI work.
- **Concurrent import + edit:** What happens if a user edits a session name while an import is running? The ON CONFLICT COALESCE pattern should handle this correctly (import preserves user_label), but needs explicit testing.

## Sources

### Primary (HIGH confidence)
- Reka UI Editable source code -- verified in `node_modules/reka-ui/dist/Editable/EditableRoot.js`
- `src/importer/db-writer.js` -- confirmed INSERT OR REPLACE pattern that must change
- `src/db/schema.js` -- confirmed current schema version (v3) and migration pattern
- `src/importer/ticket-scorer.js` -- confirmed scoring weights, denylist, and MIN_TICKET_SCORE threshold

### Secondary (MEDIUM confidence)
- Fastify 5 documentation -- PATCH route support
- SQLite ON CONFLICT documentation -- upsert with selective column preservation

---
*Research completed: 2026-03-07*
*Ready for roadmap: yes*
