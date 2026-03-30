/**
 * import subcommand — import Claude Code session transcripts.
 *
 * Exports:
 *   importCommand(db) → Commander Command
 */

import { Command } from 'commander';

/**
 * Build the `import` Commander command bound to the given DB handle.
 *
 * Exit codes:
 *   0 — success
 *   1 — general error
 *   2 — import already running (ImportConflictError)
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Command}
 */
export function importCommand(db) {
  return new Command('import')
    .description('Import Claude Code session transcripts')
    .option('--days <N>', 'Import window in days', '2')
    .option('--all', 'Import all history (overrides --days)')
    .option('--pretty', 'Pretty-print JSON result')
    .action(async (options) => {
      const { runImport, ImportConflictError } = await import('../../services/import.js');
      const { outputJSON } = await import('../format.js');

      const maxAgeDays = options.all ? undefined : parseInt(options.days, 10);
      const sep = process.stderr.isTTY ? '\r' : '\n';
      let discoveryWritten = false;

      const onProgress = ({ phase, processed, total }) => {
        if (phase === 'discovering') {
          if (!discoveryWritten) {
            process.stderr.write('Discovering files...\n');
            discoveryWritten = true;
          }
        } else if (phase === 'importing') {
          process.stderr.write(`Importing: ${processed}/${total}...${sep}`);
          // On final call in TTY mode, write newline to clear the \r line
          if (process.stderr.isTTY && processed === total) {
            process.stderr.write('\n');
          }
        }
      };

      try {
        const result = await runImport(db, { maxAgeDays, source: 'cli', onProgress });
        outputJSON(result, options.pretty);
        process.exitCode = 0;
      } catch (err) {
        if (err instanceof ImportConflictError) {
          process.stderr.write(`${err.message}\n`);
          process.exitCode = 2;
        } else {
          process.stderr.write(`Import failed: ${err.message}\n`);
          process.exitCode = 1;
        }
      }
    });
}
