# Phase 30: CLI Subcommands - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Non-interactive CLI subcommands (`summary`, `sessions`, `import`) that output machine-readable JSON to stdout. Default no-argument invocation remains backward compatible (web server + browser open). Uses the service layer from Phase 28 and coordination locks from Phase 29.

</domain>

<decisions>
## Implementation Decisions

### Command invocation design
- Positional subcommands: `npx cctimereporter summary --date 2026-03-25` (like git, npm)
- No --date provided defaults to today (matches web UI)
- Import supports both `--days N` (window) and `--all` (everything). Default is 2 days (matches web UI)
- Per-subcommand --help (commander handles this automatically)
- `npx cctimereporter` with no subcommand starts web server + opens browser (backward compatible)

### JSON output shape
- Summary command returns full report: ticket-grouped totals AND individual sessions nested under each ticket (the `getTimelineReport` shape from Phase 28)
- Compact JSON by default (no indentation). `--pretty` flag for human-readable indented output
- Working time returned as both ms and formatted: `workingTimeMs: 8100000, workingTime: "2h 15m"`

### Import CLI behavior
- Triggers import, blocks until done
- Simple counter on stderr ("Importing: 5/120...") — counts only, no file names
- JSON result on stdout when complete (sessions imported, time taken)
- If import already running (DB lock), shows "already running" with PID/elapsed/source and exits with non-zero code
- No progress tracking in DB — just the existing progress callback wired to stderr
- Import source passed as 'cli' to the coordination lock

### Error handling and exit codes

Claude's Discretion — Claude has flexibility to decide:
- Exit code conventions (0 success, 1 error, specific codes for conflicts)
- Error output format (JSON on stdout vs message on stderr)
- Behavior on empty results (still output empty JSON, or special message)
- Sessions command detail level (same as summary sessions, or richer with idle gaps/forks)

</decisions>

<specifics>
## Specific Ideas

- Progress goes to stderr so stdout stays clean for JSON piping: `npx cctimereporter import | jq '.sessionsImported'`
- The import command passes `source: 'cli'` to `runImport()` so the DB lock records the correct source

</specifics>

<deferred>
## Deferred Ideas

- Import progress tracking in DB (allowing status checks from other processes) — future enhancement if needed
- Import status subcommand — deferred, not needed without progress tracking

</deferred>

---

*Phase: 30-cli-subcommands*
*Context gathered: 2026-03-27*
