# Backlog

Future phases and ideas not yet assigned to a milestone.

## Database Migration System

**Goal:** Implement tracked migration scripts that run automatically on server start. Migrations can correct data, alter schema, or trigger re-imports when detection logic changes.

**Context:** Currently, if import logic changes (e.g., subagent detection), existing records keep stale values. A force re-import is the only fix. A proper migration system would:
- Track executed migrations by version/name
- Run pending migrations on server start (before accepting requests)
- Support both schema changes (DDL) and data corrections (DML/re-import triggers)

**Notes:**
- Low urgency for now — full re-import is acceptable at this stage
- Import optimization (incremental re-processing, partial updates) could be part of this or a separate phase

## Token Usage Reporting

**Goal:** Investigate whether Claude Code transcript data contains token usage information, and if so, surface it in the UI.

**Context:** JSONL transcripts may include token counts (input/output/cache) per message or per session. If available, this data could power:
- Per-session token usage display
- Daily/weekly token consumption summaries
- Cost estimation based on model and token counts

**Investigation needed:**
- Check transcript JSONL schema for token-related fields (e.g., `usage`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`)
- Determine granularity (per-message vs per-session totals)
- Assess whether the data is consistently present across session types

## Import Optimization

**Goal:** Improve import performance and incremental update handling.

**Context:** Current import skips files by size match. Potential improvements:
- Smarter change detection (file modification time, content hash)
- Partial re-import of changed sessions without full re-parse
- Parallel file processing
