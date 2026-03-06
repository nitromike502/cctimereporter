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

## Import Optimization

**Goal:** Improve import performance and incremental update handling.

**Context:** Current import skips files by size match. Potential improvements:
- Smarter change detection (file modification time, content hash)
- Partial re-import of changed sessions without full re-parse
- Parallel file processing
