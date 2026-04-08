# Phase 33: Service, API, and Token Queries - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Token aggregates are queryable via a backend service and API endpoint. Session detail panel and day summary panel display token data. This phase defines what "total tokens" means at the SQL layer.

</domain>

<decisions>
## Implementation Decisions

### Token display in session detail panel
- Inline with existing stats — add token total alongside message_count, tool_use_count in the existing stats row
- Show only grand total (single number) — no input/output/cache breakdown in the detail panel
- For sessions without token data (purged transcripts), show "—" (dash)

### Day summary token presentation
- Alongside working time — next to the existing working time display (e.g. "5h 23m | 1.2M tokens")
- Not a separate section — integrated into the existing summary line

### What "total tokens" means
- Everything combined — include sidechain and fork-branch tokens in displayed totals
- Shows true total API consumption, not filtered
- No toggle between parent-only and all — keep it simple, one number

### Claude's Discretion
- Token formatting (e.g. "1.2M" vs "1,234,567" — pick appropriate human-readable format)
- API response shape for GET /api/tokens
- Service function signatures

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches matching existing service/route patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 33-service-api-token-queries*
*Context gathered: 2026-04-07*
