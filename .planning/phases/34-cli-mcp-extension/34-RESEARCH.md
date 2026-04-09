# Phase 34: CLI and MCP Extension - Research

**Researched:** 2026-04-07
**Domain:** Node.js CLI command enrichment, MCP tool response extension
**Confidence:** HIGH

## Summary

Phase 34 is a purely additive change: token totals get appended to existing CLI JSON output (summary and sessions commands) and existing MCP tool responses (get_day_summary and get_sessions). No new files, no new commands, no new tools — just additional fields on outputs that already exist. The entire implementation lives in four locations: `src/cli/commands/summary.js`, `src/cli/commands/sessions.js`, `src/mcp/tools/query.js`, and `src/cli/format.js`.

The correct pattern to follow is the existing `enrichWithFormattedTime` function in `format.js`, which wraps report data with additional derived fields without mutating the original structure. Phase 33 will produce a token service (`src/services/tokens.js`) that Phase 34 calls to retrieve token aggregates. Since Phase 34 can run in parallel with Phase 33 per the roadmap, the planner must account for a potential dependency on Phase 33's service API shape.

The key architectural decision already made in STATE.md: sidechain exclusion (`is_sidechain=0`) is the default for all token aggregates, and fork branch exclusion (`is_fork_branch=0`) is the default for "actual spend" totals. Phase 33's token service implements this filtering at the SQL layer. Phase 34 merely calls that service and attaches its output to the existing response structures.

**Primary recommendation:** Mirror the `enrichWithFormattedTime` pattern — write a parallel enrichment function (or inline the logic) that attaches a `tokens` object to the summary report and per-session token fields to the sessions list. Call Phase 33's token service with the same `date` parameter already in scope in each command/tool handler.

## Standard Stack

This phase uses only existing project infrastructure — no new dependencies.

### Core
| Component | Location | Purpose |
|-----------|----------|---------|
| `src/services/tokens.js` | project (Phase 33) | Token aggregate queries, day totals and per-session breakdowns |
| `src/cli/format.js` | project | Enrichment pattern to follow (enrichWithFormattedTime) |
| `src/cli/commands/summary.js` | project | CLI summary command — add top-level `tokens` object |
| `src/cli/commands/sessions.js` | project | CLI sessions command — add per-session token fields |
| `src/mcp/tools/query.js` | project | MCP tools — extend get_day_summary and get_sessions |

**Installation:** No new packages required.

## Architecture Patterns

### Existing CLI Command Structure

Both CLI commands follow the same pattern:
1. Import `createTimelineService` lazily inside the action handler (avoids Fastify startup cost)
2. Call `svc.getTimelineReport(date, { thresholdMin })` or `svc.getTimelineUI(date, ...)`
3. Enrich/transform the result
4. Call `outputJSON(enriched, options.pretty)`

The token enrichment must slot in between step 2 and 4.

### Existing MCP Tool Structure

Both MCP tools follow the same pattern:
1. Call `timeline.getTimelineReport()` or `timeline.getTimelineUI()`
2. Optionally call `enrichWithFormattedTime()` (get_day_summary does, get_sessions does not)
3. Return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`

The token enrichment must happen before step 3.

### Pattern: Additive Field Attachment

The established pattern from `enrichWithFormattedTime` in `format.js` is spread-and-extend:

```javascript
// Source: src/cli/format.js — enrichWithFormattedTime()
return {
  ...report,
  workingTime: formatWorkingTime(report.workingTimeMs),
  byTicket: report.byTicket.map(group => ({
    ...group,
    workingTime: formatWorkingTime(group.workingTimeMs),
    sessions: group.sessions.map(s => ({
      ...s,
      workingTime: formatWorkingTime(s.workingTimeMs),
    })),
  })),
  unticketedSessions: report.unticketedSessions.map(s => ({
    ...s,
    workingTime: formatWorkingTime(s.workingTimeMs),
  })),
};
```

Follow this exact pattern: spread the existing object, add new fields alongside, never replace existing fields.

### Where Token Data Comes From (Phase 33 Dependency)

Phase 33 will produce `src/services/tokens.js` with functions like:

- `getDayTokenSummary(date)` — day-level totals: `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }`
- `getSessionTokens(date)` — per-session map: keyed by `session_id`, values are per-session token breakdowns
- Possibly `getSessionTokenDetail(sessionId)` — single session detail (for Phase 33's UI use, Phase 34 may or may not use this)

The exact function names and signatures will be defined in Phase 33's PLAN. Phase 34's plan should reference Phase 33's service API. Since phases can run in parallel, the planner should design Phase 34's plan to depend on Phase 33's service function signatures being finalized before implementation starts.

### Recommended JSON Shape for summary Command

Per DISP-04: "CLI summary command includes token totals in JSON output." The success criterion specifies "a top-level `tokens` object with input, output, cache creation, and cache read totals for the day."

Following the existing camelCase naming convention (`workingTimeMs`, `sessionCount`):

```javascript
// Top-level tokens object on the summary output
{
  date: "2026-04-07",
  workingTimeMs: 12345000,
  workingTime: "3h 25m",   // existing field from enrichWithFormattedTime
  tokens: {
    inputTokens: 145000,
    outputTokens: 23000,
    cacheCreationInputTokens: 8000,
    cacheReadInputTokens: 115000,
  },
  byTicket: [ ... ],
  unticketedSessions: [ ... ],
}
```

Note: The `tokens` object name matches the column name domain (`input_tokens` → `inputTokens`). Use camelCase for field names inside `tokens` to match the rest of the codebase's JS object conventions.

### Recommended JSON Shape for sessions Command

Per DISP-05: "CLI sessions command includes per-session token totals." Each session in the flat array gets token fields added alongside existing fields:

```javascript
// Per-session enrichment
{
  sessionId: "...",
  project: "...",
  workingTimeMs: 3600000,
  workingTime: "1h",        // existing field
  tokens: {
    inputTokens: 15000,
    outputTokens: 3200,
    cacheCreationInputTokens: 800,
    cacheReadInputTokens: 10200,
  },
  // ... other existing fields unchanged
}
```

Nesting under a `tokens` key is consistent with the summary shape and avoids polluting the top-level session object with four new fields.

### MCP get_day_summary Extension

The existing handler calls `enrichWithFormattedTime(report)` and JSON-serializes. Extend to also attach tokens:

```javascript
// Existing: src/mcp/tools/query.js — get_day_summary handler
({ date, idle_threshold_min }) => {
  const report = timeline.getTimelineReport(date, { thresholdMin: idle_threshold_min ?? 10 });
  const enriched = enrichWithFormattedTime(report);
  // NEW: attach day-level token totals
  const withTokens = { ...enriched, tokens: tokensSvc.getDayTokenSummary(date) };
  return { content: [{ type: 'text', text: JSON.stringify(withTokens) }] };
}
```

### MCP get_sessions Extension

The existing handler calls `timeline.getTimelineUI(date, ...)` and returns `result.projects`. Per-session token fields need to be merged into each session object within each project:

```javascript
// Existing: src/mcp/tools/query.js — get_sessions handler
({ date, idle_threshold_min }) => {
  const result = timeline.getTimelineUI(date, { thresholdMin: idle_threshold_min ?? 10 });
  // NEW: enrich each session with token data
  const sessionTokensMap = tokensSvc.getSessionTokensByDate(date);
  const enrichedProjects = result.projects.map(proj => ({
    ...proj,
    sessions: proj.sessions.map(s => ({
      ...s,
      tokens: sessionTokensMap.get(s.sessionId) ?? null,
    })),
  }));
  return { content: [{ type: 'text', text: JSON.stringify(enrichedProjects) }] };
}
```

### Service Instantiation in MCP vs CLI

In `query.js`, the timeline service is instantiated at factory time (`createTimelineService(db)`) and reused across calls. Follow the same pattern for the token service: instantiate once in `registerQueryTools(server, db)` and close over it in the tool handlers.

In CLI commands, services are imported lazily inside the `.action()` handler to avoid Fastify startup cost. The token service (which does not involve Fastify) can be instantiated inline in the same pattern as `createTimelineService`.

### Null Handling for Sessions Without Token Data

Sessions whose transcripts were purged will have NULL token columns in the database. The token service should return `null` for such sessions (not `{ inputTokens: 0, ... }`). The CLI/MCP output should then propagate `null`:

```javascript
tokens: sessionTokensMap.get(s.sessionId) ?? null
```

This is consistent with the Phase 33 CONTEXT.md decision: "For sessions without token data (purged transcripts), show '—' (dash)" — the API returns null, the UI shows dash.

### Anti-Patterns to Avoid

- **Adding token fields at the timeline service layer:** `getTimelineReport()` and `getTimelineUI()` are the UI/reporting projection functions. Token aggregation is a separate concern, owned by the token service. Do not mix them.
- **Returning zeros instead of null for missing data:** A session with no token data should have `tokens: null`, not `tokens: { inputTokens: 0, ... }`. Zero implies zero tokens were used; null implies data is unavailable.
- **Mutating existing response objects:** Always spread (`{ ...existing, tokens: ... }`), never assign to existing object properties. Preserves the existing data contract.
- **Breaking get_sessions for MCP by nesting inside a new top-level key:** The existing `get_sessions` response is `result.projects` (an array). The token fields are additive inside each session object, not a new wrapper structure.
- **Forgetting unticketedSessions in the summary command:** The `getTimelineReport()` result has both `byTicket` and `unticketedSessions`. If per-session tokens are added to both groups in the summary output, both arrays need enrichment.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token aggregation SQL | Custom SQL in CLI/MCP handlers | Phase 33's `src/services/tokens.js` | Single source of truth for sidechain/fork exclusion policy; avoids duplicating filtering logic |
| camelCase conversion of DB column names | Custom mapping in CLI/MCP | Conventions already set in Phase 33's service | The service handles snake_case → camelCase; CLI/MCP consume the result directly |

**Key insight:** Token SQL logic belongs in the service layer, not scattered across CLI and MCP handlers. Phase 34 is presentation-only — it calls the service and attaches the result.

## Common Pitfalls

### Pitfall 1: Phase 33 Service API Shape Unknown at Plan Time

**What goes wrong:** Phase 34's plan references Phase 33 function names that don't match what Phase 33 actually exports.

**Why it happens:** Phase 33 hasn't been planned yet. The function names, signatures, and return shapes are not yet defined.

**How to avoid:** Phase 34's implementation plan must explicitly note it depends on Phase 33's token service API. The task should reference what Phase 33 is expected to export based on its roadmap description. If Phase 34 executes before Phase 33 is complete, the implementer should check `src/services/tokens.js` for actual exported function names.

**Warning signs:** Import errors when running CLI commands after Phase 34 implementation.

### Pitfall 2: get_sessions MCP Tool Returns Projects Array, Not Report

**What goes wrong:** Token enrichment is applied to the wrong data structure.

**Why it happens:** `get_day_summary` uses `getTimelineReport()` (ticket-grouped), but `get_sessions` uses `getTimelineUI()` (project-grouped) and returns `result.projects`. The two response shapes are different. Applying the same enrichment pattern without accounting for the structural difference causes errors.

**How to avoid:** Read both handlers carefully. `get_day_summary` → `getTimelineReport` → `enrichWithFormattedTime` → add top-level `tokens`. `get_sessions` → `getTimelineUI` → `result.projects` → map projects → map sessions → add per-session `tokens`.

**Warning signs:** Token data appears in wrong location or causes undefined errors.

### Pitfall 3: Duplicate Service Import in sessions Command

**What goes wrong:** `src/cli/commands/sessions.js` already has a redundant `import('../format.js')` inside the action handler (duplicating the top-level import). Adding more inline imports creates further confusion.

**Why it happens:** Looking at the existing code, `sessions.js` line 25 re-imports `outputJSON` inside the action even though it was already imported at line 9. This is a pre-existing code smell.

**How to avoid:** Use the top-level import for `outputJSON`. Do not add more duplicate inline imports. Follow the `summary.js` pattern (single top-level import, lazy `createTimelineService` only).

**Warning signs:** ESLint unused-import warnings, or the action using different references than expected.

### Pitfall 4: Sidechain Exclusion Policy Applied Inconsistently

**What goes wrong:** CLI token totals differ from MCP token totals, or both differ from the web UI session detail panel.

**Why it happens:** If Phase 34 writes its own SQL query (or calls Phase 33 functions with different parameters) instead of using the same service call, the exclusion policy might differ.

**How to avoid:** Phase 34 must call Phase 33's token service functions with the same parameters/defaults used by the web UI (Phase 33's API route). The token service is the single source of truth for "what counts."

**Warning signs:** `node bin/cli.js summary` reports different token totals than the web UI day summary panel for the same date.

## Code Examples

### Existing enrichWithFormattedTime Pattern (to mirror)

```javascript
// Source: src/cli/format.js
export function enrichWithFormattedTime(report) {
  return {
    ...report,
    workingTime: formatWorkingTime(report.workingTimeMs),
    byTicket: report.byTicket.map(group => ({
      ...group,
      workingTime: formatWorkingTime(group.workingTimeMs),
      sessions: group.sessions.map(s => ({
        ...s,
        workingTime: formatWorkingTime(s.workingTimeMs),
      })),
    })),
    unticketedSessions: report.unticketedSessions.map(s => ({
      ...s,
      workingTime: formatWorkingTime(s.workingTimeMs),
    })),
  };
}
```

### Existing summary Command (Phase 34 modifies this)

```javascript
// Source: src/cli/commands/summary.js
.action(async (options) => {
  const { createTimelineService } = await import('../../services/timeline.js');
  const svc = createTimelineService(db);
  // ... date validation ...
  const report = svc.getTimelineReport(date, { thresholdMin: idleThresholdMin });
  const enriched = enrichWithFormattedTime(report);
  outputJSON(enriched, options.pretty);
  // Phase 34 adds: const tokenSvc = createTokensService(db);
  //                const dayTokens = tokenSvc.getDayTokenSummary(date);
  //                outputJSON({ ...enriched, tokens: dayTokens }, options.pretty);
});
```

### Existing MCP get_day_summary Handler (Phase 34 modifies this)

```javascript
// Source: src/mcp/tools/query.js — tool 1
({ date, idle_threshold_min }) => {
  const report = timeline.getTimelineReport(date, { thresholdMin: idle_threshold_min ?? 10 });
  const enriched = enrichWithFormattedTime(report);
  return { content: [{ type: 'text', text: JSON.stringify(enriched) }] };
  // Phase 34 changes last two lines to:
  // const withTokens = { ...enriched, tokens: tokensSvc.getDayTokenSummary(date) };
  // return { content: [{ type: 'text', text: JSON.stringify(withTokens) }] };
}
```

### Existing MCP get_sessions Handler (Phase 34 modifies this)

```javascript
// Source: src/mcp/tools/query.js — tool 2
({ date, idle_threshold_min }) => {
  const result = timeline.getTimelineUI(date, { thresholdMin: idle_threshold_min ?? 10 });
  return { content: [{ type: 'text', text: JSON.stringify(result.projects) }] };
  // Phase 34 changes to:
  // const sessionTokenMap = tokensSvc.getSessionTokensByDate(date);
  // const enriched = result.projects.map(proj => ({
  //   ...proj,
  //   sessions: proj.sessions.map(s => ({ ...s, tokens: sessionTokenMap.get(s.sessionId) ?? null })),
  // }));
  // return { content: [{ type: 'text', text: JSON.stringify(enriched) }] };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLI/MCP output static (no tokens) | CLI/MCP output includes token totals | Phase 34 (now) | Consumers (scripts, AI tools) can access token data without web UI |

**No deprecated patterns** — this is new additive functionality.

## Open Questions

1. **Phase 33 Token Service API Shape**
   - What we know: Phase 33 will create `src/services/tokens.js` with day-summary and per-session query functions; sidechain+fork exclusion applied at SQL layer
   - What's unclear: Exact function names, exact return type shapes (camelCase vs snake_case field names, whether it returns a Map or array for per-session data)
   - Recommendation: Phase 34's plan should note that the implementer reads `src/services/tokens.js` to discover actual function signatures before calling them. The plan can use placeholder names (`getDayTokenSummary`, `getSessionTokensByDate`) that should be verified against the actual file.

2. **Whether enrichWithFormattedTime should be extended or a new function written**
   - What we know: `enrichWithFormattedTime` adds `workingTime` strings; it does not know about tokens
   - What's unclear: Should token enrichment be added to `enrichWithFormattedTime` (making it do double duty) or should a separate `enrichWithTokens` function be written?
   - Recommendation: Keep them separate. `enrichWithFormattedTime` is a pure transformation of time data. Token enrichment requires a DB call. Mixing them would make `enrichWithFormattedTime` impure (side-effectful). Write inline logic or a separate helper in each command/tool handler.

3. **sessions Command: tokens on byTicket sessions vs flat list**
   - What we know: `sessions` command flattens `byTicket[].sessions` and `unticketedSessions` into a single array
   - What's unclear: Does the `tokens` field need to appear on byTicket group level in summary, or only on per-session level?
   - Recommendation: DISP-04 says "top-level tokens object" for summary (day total), DISP-05 says "per-session token totals" for sessions. These are already clear: summary gets a top-level `tokens` object (day aggregate), sessions gets `tokens` per session object. No group-level tokens on sessions command.

## Sources

### Primary (HIGH confidence)
- `src/cli/commands/summary.js` — Full inspection of command structure
- `src/cli/commands/sessions.js` — Full inspection of command structure and enrichment pattern
- `src/mcp/tools/query.js` — Full inspection of all 4 MCP tool handlers
- `src/cli/format.js` — Full inspection of `enrichWithFormattedTime` and `outputJSON`
- `src/services/timeline.js` — Full inspection of `getTimelineReport()` and `getTimelineUI()` return shapes
- `.planning/STATE.md` — Confirmed sidechain exclusion and fork exclusion decisions
- `.planning/REQUIREMENTS.md` — DISP-04 through DISP-07 exact requirements
- `.planning/ROADMAP.md` — Phase 33 and 34 goals, success criteria, dependency relationship
- `.planning/phases/33-service-api-token-queries/33-CONTEXT.md` — Phase 33 decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all files inspected directly
- Architecture patterns: HIGH — derived from direct codebase inspection of both CLI and MCP layers
- Phase 33 dependency shape: MEDIUM — Phase 33 not yet planned; function names are inferred from roadmap description and context, not from actual code
- Pitfalls: HIGH — derived from reading actual code paths and spotting pre-existing issues

**Research date:** 2026-04-07
**Valid until:** Stable once Phase 33 token service API is defined (likely within days); re-verify function names against `src/services/tokens.js` before implementing Phase 34
