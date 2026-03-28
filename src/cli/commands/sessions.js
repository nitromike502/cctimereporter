/**
 * sessions subcommand — print JSON session list to stdout.
 *
 * Exports:
 *   sessionsCommand(db) → Commander Command
 */

import { Command } from 'commander';
import { formatWorkingTime, outputJSON } from '../format.js';

/**
 * Build the `sessions` Commander command bound to the given DB handle.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Command}
 */
export function sessionsCommand(db) {
  return new Command('sessions')
    .description('Print JSON session list to stdout')
    .option('--date <YYYY-MM-DD>', 'Date to list sessions for (default: today)')
    .option('--pretty', 'Pretty-print JSON output')
    .option('--idle <minutes>', 'Idle threshold in minutes', '10')
    .action(async (options) => {
      const { createTimelineService } = await import('../../services/timeline.js');
      const svc = createTimelineService(db);
      const date = options.date ?? new Date().toISOString().slice(0, 10);
      const idleThresholdMin = parseInt(options.idle, 10);
      const report = svc.getTimelineReport(date, { thresholdMin: idleThresholdMin });

      // Collect flat session list from byTicket groups and unticketed sessions
      const allSessions = [
        ...report.byTicket.flatMap(group => group.sessions),
        ...report.unticketedSessions,
      ];

      // Add workingTime string to each session and sort by startTime ascending
      const enrichedSessions = allSessions
        .map(s => ({ ...s, workingTime: formatWorkingTime(s.workingTimeMs) }))
        .sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));

      outputJSON(enrichedSessions, options.pretty);
    });
}
