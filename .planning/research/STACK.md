# Stack Research: v0.4.0 Session Intelligence

**Researched:** 2026-03-07
**Confidence:** HIGH

## Key Finding: Zero New Dependencies Needed

Both features build entirely on the existing installed stack.

## Session Naming UI

### Reka UI Editable Component (already installed)
- Reka UI v2.8.2 includes an `Editable` headless component
- Sub-components: EditableRoot, EditableArea, EditableInput, EditablePreview, triggers
- Supports `submitMode: 'blur'`, `activationMode: 'focus'`, v-model binding, `@submit` events
- Verified from source code in `node_modules/reka-ui/dist/Editable/EditableRoot.js`
- Exactly what's needed for inline session title editing

### API Endpoint
- Fastify 5 natively supports `fastify.patch()` for update endpoints
- No plugins or middleware required
- Pattern: `PATCH /api/sessions/:id` with `{ customTitle: "new name" }`

### Database
- `custom_title` column already exists on sessions table
- No schema migration needed

### Critical Concern: Import Overwrites
- Existing `upsertSession()` uses `INSERT OR REPLACE`, which will overwrite user-set custom titles on re-import
- The importer must be modified to preserve user-set titles
- Consider: `custom_title_source` flag ('user' vs 'import') to distinguish user edits

## Ticket Auto-Discovery

### Approach: Pure Algorithmic (no NLP/ML)
- Ticket detection improvements are purely algorithmic — regex on structured data
- NLP/ML libraries would be overkill for the structured `[A-Z]{2,8}-\d{1,6}` pattern domain
- Sources to scan:
  - Git commit messages in tool_result content blocks
  - GitHub/GitLab URLs in assistant messages
  - PR/issue references in tool outputs
  - CLAUDE.md or project config references

### What NOT to Add
- No NLP libraries (unnecessary for structured patterns)
- No external API calls (local-only tool)
- No ML models (overkill, would bloat package)

## Recommendations

| Component | Recommendation | Confidence |
|-----------|---------------|------------|
| Inline editing UI | Reka UI Editable (already installed) | HIGH |
| API endpoint | Fastify PATCH route (native) | HIGH |
| DB changes | None for naming; possible flag column for source | HIGH |
| Ticket detection | Pure regex/scoring algorithm improvements | HIGH |

## Roadmap Implications

- **Session naming is low-risk**: DB column exists, API pattern established, UI primitive installed. Wiring task.
- **Ticket detection is medium-risk**: Algorithmic improvements need testing against real transcripts to tune scoring and avoid false positives.
- **Import-preserving custom titles is hidden complexity**: INSERT OR REPLACE will clobber user edits unless upsert logic changes.

---
*Research completed: 2026-03-07*
