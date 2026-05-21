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

      // Collect flat session list from byTicket groups and unticketed sessions
      const allSessions = [
        ...report.byTicket.flatMap(group => group.sessions),
        ...report.unticketedSessions,
      ];

      // Build per-session token lookup map from the day token data
      const tokenData = tokenSvc.getDayTokens(date);
      const sessionTokenMap = new Map(tokenData.sessions.map(s => [s.sessionId, s]));

      // Add workingTime string and token data to each session, sort by startTime ascending
      const enrichedSessions = allSessions
        .map(s => {
          const st = sessionTokenMap.get(s.sessionId);
          return {
            ...s,
            workingTime: formatWorkingTime(s.workingTimeMs),
            agentTime: s.agentTimeMs == null ? null : formatWorkingTime(s.agentTimeMs),
            tokens: st ? {
              inputTokens: st.inputTokens,
              outputTokens: st.outputTokens,
              cacheCreationInputTokens: st.cacheCreationInputTokens,
              cacheReadInputTokens: st.cacheReadInputTokens,
              totalTokens: st.totalTokens,
              cacheHitRate: st.cacheHitRate,
            } : null,
          };
        })
        .sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));

      outputJSON(enrichedSessions, options.pretty);
    });
}
