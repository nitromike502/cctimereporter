# Phase 30: CLI Subcommands - Research

**Researched:** 2026-03-27
**Domain:** Node.js CLI argument parsing, subcommand routing, stdout/stderr conventions
**Confidence:** HIGH

## Summary

Phase 30 adds three subcommands (`summary`, `sessions`, `import`) to the existing CLI entry point in `bin/cli.js`. The current entry point does all work inline; it must be refactored to dispatch to subcommand handlers or fall through to the server startup path. The locked decision is Commander.js for argument parsing.

The service layer (Phase 28) and coordination locks (Phase 29) are already built. All business logic is available through `createTimelineService(db)`, `createSessionsService(db)`, and `runImport(db, opts)`. This phase is primarily about wiring a clean CLI dispatch layer on top of existing services.

Commander.js v14 is the correct version choice: stable, requires Node 20+ (project requires 22+), supports ESM via `import { Command } from 'commander'`, and provides automatic `--help` per subcommand with no additional work.

**Primary recommendation:** Install `commander@14`, refactor `bin/cli.js` to use a `Program` with three named subcommands plus a default (server) handler using `isDefault: true` on the server command, or a top-level `action()` fallback.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 | Argument parsing, subcommand dispatch, --help | Industry standard for Node CLIs, already referenced in locked decisions |

### Supporting
None needed. All output uses `process.stdout.write` and `process.stderr.write` directly. JSON serialization is native `JSON.stringify`. Date formatting for `workingTime` field is a small utility function.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander | yargs | Yargs has richer validation but more complex API; Commander is simpler for this use case |
| commander | minimist | Minimist is lower-level, no --help generation, more manual work |
| commander@14 | commander@15 | v15 is ESM-only pre-release (15.0.0-0); v14 is stable, CJS+ESM compatible |

**Installation:**
```bash
npm install commander@14
```

## Architecture Patterns

### Recommended Project Structure

The key insight: `bin/cli.js` currently does all work inline. The refactor should extract the server-start logic into a function, then use Commander to dispatch:

```
bin/
├── cli.js                    Entry point — Commander program setup + dispatch
src/
├── cli/
│   ├── commands/
│   │   ├── summary.js        summary subcommand handler
│   │   ├── sessions.js       sessions subcommand handler
│   │   └── import.js         import subcommand handler
│   └── format.js             Shared formatters (workingTime ms → "2h 15m", pretty JSON)
```

The server-start logic can stay in `bin/cli.js` or be extracted to `src/cli/commands/serve.js` — either works. Given the existing inline style, keeping it in cli.js under a named function is simpler.

### Pattern 1: Commander with isDefault Server Command

**What:** Define subcommands explicitly; mark the server command `isDefault: true` so `npx cctimereporter` with no args runs it.

**When to use:** When one subcommand must remain the default for backward compatibility.

```javascript
// Source: https://raw.githubusercontent.com/tj/commander.js/master/examples/defaultCommand.js
import { Command } from 'commander';
const program = new Command();

program
  .command('summary')
  .description('Print JSON day summary to stdout')
  .option('--date <YYYY-MM-DD>', 'Date to summarize (default: today)')
  .option('--pretty', 'Pretty-print JSON output')
  .action(async (options) => {
    // handler
  });

program
  .command('serve', { isDefault: true })
  .description('Start web server and open browser (default)')
  .action(async () => {
    // existing server startup logic
  });

await program.parseAsync(process.argv);
```

**Alternative:** Use `program.action()` as the root fallback (no `isDefault`). This triggers when no subcommand is given. Either approach works; `isDefault` on the serve command is more explicit.

### Pattern 2: parseAsync for Async Action Handlers

Commander's `.parseAsync()` must be used (not `.parse()`) because all handlers are async (DB open, import await, etc.).

```javascript
// Source: commander npm README
await program.parseAsync(process.argv);
```

### Pattern 3: Stdout/Stderr Split

All progress and errors go to stderr. JSON results go to stdout. This allows piping:

```bash
npx cctimereporter import | jq '.filesProcessed'
npx cctimereporter summary --date 2026-03-25 --pretty
```

```javascript
// Progress counter — stderr
process.stderr.write(`Importing: ${processed}/${total}...\r`);

// JSON result — stdout
process.stdout.write(JSON.stringify(result, null, indent) + '\n');

// Errors — stderr, then exit non-zero
process.stderr.write(`Error: ${err.message}\n`);
process.exitCode = 1;
```

### Pattern 4: Exit Code Conventions

Based on CLI conventions and the locked decisions:

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success (all subcommands on success) |
| 1 | General error (unhandled exception, DB failure) |
| 2 | Conflict error (import already running) |

Exit code 2 specifically for "import already running" distinguishes it from general errors, allowing scripts to handle the conflict case distinctly.

### Pattern 5: workingTime Formatter

The locked decision requires both `workingTimeMs` (raw ms) and `workingTime` ("2h 15m" format). This is a pure utility function, no library needed:

```javascript
// src/cli/format.js
export function formatWorkingTime(ms) {
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
```

This must be applied recursively to the `getTimelineReport()` output — each ticket group and each session within it needs a `workingTime` field added alongside `workingTimeMs`.

### Anti-Patterns to Avoid

- **Using `.parse()` instead of `.parseAsync()`:** All action handlers are async; `.parse()` won't await them, causing silent failures.
- **Writing progress to stdout:** Breaks JSON piping. Progress ALWAYS goes to stderr.
- **Calling `process.exit()` directly in handlers:** Prefer `process.exitCode = N` + `return` so cleanup can run; use `process.exit()` only when there's no async cleanup needed.
- **Mixing Commander error output with app errors:** Commander writes its own errors (unknown option, missing arg) to stderr. App-level errors should also go to stderr in a consistent format.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argument parsing | Custom `process.argv` parsing | commander@14 | Edge cases: `--date=2026-03-25` vs `--date 2026-03-25`, `--help` generation, unknown option errors |
| --help per subcommand | Manual help strings | Commander (automatic) | Commander generates help from `.description()`, `.option()`, `.argument()` declarations |
| Option validation | Manual type checks | Commander `.option('<value>')` with parseArg | Commander handles required-value enforcement; add custom validators with `parseArg` callback |

**Key insight:** Commander's automatic `--help` generation is a major reason to use it here. Every subcommand gets `npx cctimereporter summary --help` for free.

## Common Pitfalls

### Pitfall 1: Node Version Check Must Precede All Imports

**What goes wrong:** The existing `bin/cli.js` has a version check at the top before any dynamic imports. Commander must be imported AFTER the version check, or the check loses its purpose.

**Why it happens:** ESM static imports are hoisted; even `await import()` dynamic imports would run before any inline code if not carefully ordered.

**How to avoid:** Keep the version check as the very first thing in `bin/cli.js`, exactly as it is now. Only after passing the check should `commander` be dynamically imported alongside other modules.

**Warning signs:** `import { Command } from 'commander'` as a static top-level import would bypass the version check.

### Pitfall 2: --debug-import Flag Conflicts with Commander Parsing

**What goes wrong:** The existing `bin/cli.js` handles `--debug-import` via raw `process.argv` index scanning before Commander would see it. If Commander is set up without registering `--debug-import`, it will error on unknown options.

**Why it happens:** Commander v13+ errors on unrecognized options by default.

**How to avoid:** Register `--debug-import [on|off]` as a program-level option in Commander so it's recognized. Keep the existing handling logic; just move the option declaration to Commander.

**Warning signs:** `error: unknown option '--debug-import'` at runtime.

### Pitfall 3: Default Command vs No-Action Program

**What goes wrong:** If no subcommand is matched and no default is configured, Commander exits with an error instead of starting the server.

**Why it happens:** Commander requires explicit routing for all input paths.

**How to avoid:** Either use `isDefault: true` on the serve command, or add a root-level `.action()` that runs the server. The `isDefault` pattern is cleaner because it keeps the serve logic in a named command block.

### Pitfall 4: getTimelineReport Shape Doesn't Include workingTime String

**What goes wrong:** `getTimelineReport()` returns `workingTimeMs` but not `workingTime` string. The locked decision requires both.

**Why it happens:** The service returns raw ms; string formatting is a presentation concern.

**How to avoid:** The summary command handler must transform the output — walk `byTicket[].workingTimeMs` and `byTicket[].sessions[].workingTimeMs`, adding a `workingTime` field alongside each. Similarly for the top-level `workingTimeMs`.

**Warning signs:** Forgetting to add `workingTime` to nested session objects, only adding to ticket groups.

### Pitfall 5: Import Progress Counter Overwriting vs Newlines

**What goes wrong:** Using `\r` (carriage return) for the progress counter looks good interactively but leaves partial lines in logs or piped stderr.

**Why it happens:** `\r` resets cursor to start of line in terminals; it doesn't work the same in all environments.

**How to avoid:** Use `\r` for interactive terminals (stderr.isTTY check), fall back to newlines otherwise. Or simply always use newlines — simpler and more robust.

```javascript
const sep = process.stderr.isTTY ? '\r' : '\n';
process.stderr.write(`Importing: ${processed}/${total}...${sep}`);
```

### Pitfall 6: sessions Command Scope

**What goes wrong:** The sessions command could return a very large dataset for busy days (many sessions with full message content, idle gaps, fork segments).

**Why it happens:** No decision was made on detail level (Claude's Discretion).

**How to avoid:** Sessions command should return the same session objects that appear inside `getTimelineReport().byTicket[].sessions` — lightweight, no idle gaps or fork segments. If the full detail is needed later, a `--session-id` flag can fetch one session's messages.

## Code Examples

### Commander Program Setup
```javascript
// Source: https://raw.githubusercontent.com/tj/commander.js/master/Readme.md
import { Command } from 'commander';

const program = new Command();
program
  .name('cctimereporter')
  .description('Visual timeline of Claude Code sessions');

program
  .command('summary')
  .description('Print JSON day summary to stdout')
  .option('--date <YYYY-MM-DD>', 'Date (default: today)')
  .option('--pretty', 'Pretty-print JSON')
  .option('--idle <minutes>', 'Idle threshold in minutes', '10')
  .action(async (options) => { /* ... */ });

await program.parseAsync(process.argv);
```

### Import Conflict Handling
```javascript
// ImportConflictError is already exported from src/services/import.js
import { runImport, ImportConflictError } from '../services/import.js';

try {
  const result = await runImport(db, { maxAgeDays, source: 'cli', onProgress });
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (err) {
  if (err instanceof ImportConflictError) {
    process.stderr.write(`Import already running: ${err.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`Import failed: ${err.message}\n`);
    process.exitCode = 1;
  }
}
```

### workingTime Enrichment
```javascript
function enrichWithFormattedTime(report) {
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

### Today's Date Default
```javascript
const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
const date = options.date ?? today;
```

### Import --all Flag
```javascript
program
  .command('import')
  .option('--days <N>', 'Import window in days (default: 2)', '2')
  .option('--all', 'Import all history (overrides --days)')
  .action(async (options) => {
    const maxAgeDays = options.all ? undefined : parseInt(options.days, 10);
    // maxAgeDays=undefined triggers importAll() to use no date filter
  });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw process.argv parsing | Commander subcommands | This phase | Auto-help, clean dispatch |
| Inline cli.js | Modular command handlers | This phase | Testable, maintainable |

**Deprecated/outdated:**
- commander@12/13: Still supported but v14 has option grouping in help (useful for `summary` options)
- commander@15 (15.0.0-0): Pre-release, ESM-only, do not use yet

## Open Questions

1. **sessions command columns**
   - What we know: Sessions service returns message content via `getMessages()`, but that's for the modal (not CLI)
   - What's unclear: Should `sessions` CLI command use `getTimelineReport().byTicket[].sessions` (no message content) or add some fields?
   - Recommendation: Use the lightweight session objects from `getTimelineReport()` — matches summary's data shape, easy to filter/jq

2. **--debug-import migration**
   - What we know: Currently handled via raw argv scan before any library
   - What's unclear: Should it become `cctimereporter debug-import [on|off]` (subcommand) or stay as a root option?
   - Recommendation: Keep as a program-level option `--debug-import [on|off]` registered with Commander; no behavioral change, just register it so Commander doesn't error

3. **Empty results for summary/sessions**
   - What we know: CONTEXT.md marks this as Claude's Discretion
   - What's unclear: Output `{}` / `[]`, or a message?
   - Recommendation: Always output valid JSON (empty array/object) — never a prose message on stdout. Scripts expect parseable output regardless of result count.

## Sources

### Primary (HIGH confidence)
- `https://raw.githubusercontent.com/tj/commander.js/master/Readme.md` — ESM imports, subcommand syntax, isDefault, configureOutput, exitOverride, error handling
- `https://raw.githubusercontent.com/tj/commander.js/master/examples/defaultCommand.js` — isDefault pattern verified
- npm registry (`npm info commander versions`) — confirmed v14.0.3 is latest stable, v15 is pre-release

### Secondary (MEDIUM confidence)
- GitHub releases page — v14 requires Node 20+, v15 is ESM-only pre-release; verified against npm info
- Node.js process documentation — stdout/stderr/exitCode conventions

### Tertiary (LOW confidence)
- WebSearch results on CLI JSON output conventions — consistent with Node.js docs but not verified against single authoritative source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Commander v14 verified in npm registry, ESM support confirmed in README
- Architecture: HIGH — Based on verified Commander API + reading existing codebase code
- Pitfalls: HIGH for Node version check and --debug-import issues (code inspection); MEDIUM for progress counter TTY handling (pattern knowledge)

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable library, low churn)
