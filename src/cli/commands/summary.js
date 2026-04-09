/**
 * summary subcommand — print JSON day summary to stdout.
 *
 * Exports:
 *   summaryCommand(db) → Commander Command
 */

import { Command } from 'commander';
import { enrichWithFormattedTime, outputJSON } from '../format.js';

/**
 * Build the `summary` Commander command bound to the given DB handle.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Command}
 */
export function summaryCommand(db) {
  return new Command('summary')
    .description('Print JSON day summary to stdout')
    .option('--date <YYYY-MM-DD>', 'Date to summarize (default: today)')
    .option('--pretty', 'Pretty-print JSON output')
    .option('--idle <minutes>', 'Idle threshold in minutes', '10')
    .action(async (options) => {
      const { createTimelineService } = await import('../../services/timeline.js');
      const { createTokensService } = await import('../../services/tokens.js');
      const svc = createTimelineService(db);
      const tokenSvc = createTokensService(db);
      const date = options.date ?? (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        outputJSON({ error: 'Invalid date format. Use YYYY-MM-DD.' }, options.pretty);
        process.exitCode = 1;
        return;
      }
      const idleThresholdMin = parseInt(options.idle, 10);
      const report = svc.getTimelineReport(date, { thresholdMin: idleThresholdMin });
      const enriched = enrichWithFormattedTime(report);
      const tokenData = tokenSvc.getDayTokens(date);
      outputJSON({ ...enriched, tokens: tokenData.dayTotal ?? null }, options.pretty);
    });
}
