/**
 * MCP query tool registrations.
 *
 * Provides:
 *   registerQueryTools(server, db) — registers 4 read-only query tools
 *
 * Tools:
 *   get_day_summary        — ticket-grouped working time for a date
 *   get_sessions           — project-grouped session details for a date
 *   get_session_messages   — messages for a specific session
 *   get_dates              — all dates that have session data
 */

import { z } from 'zod';
import { createTimelineService } from '../../services/timeline.js';
import { createSessionsService } from '../../services/sessions.js';
import { enrichWithFormattedTime } from '../../cli/format.js';

/**
 * Register all 4 query tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function registerQueryTools(server, db) {
  const timeline = createTimelineService(db);
  const sessions = createSessionsService(db);

  // --- Tool 1: get_day_summary ---
  server.registerTool(
    'get_day_summary',
    {
      description: 'Get ticket-grouped working time summary for a date. Returns per-ticket working time totals and session counts.',
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format'),
        idle_threshold_min: z.number().int().min(1).max(120).optional().describe('Idle gap threshold in minutes (default: 10)'),
      },
    },
    ({ date, idle_threshold_min }) => {
      const report = timeline.getTimelineReport(date, { thresholdMin: idle_threshold_min ?? 10 });
      const enriched = enrichWithFormattedTime(report);
      return { content: [{ type: 'text', text: JSON.stringify(enriched) }] };
    }
  );

  // --- Tool 2: get_sessions ---
  server.registerTool(
    'get_sessions',
    {
      description: 'Get all sessions for a date grouped by project. Returns detailed session info including start/end times, tickets, branches, summaries, and working time.',
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format'),
        idle_threshold_min: z.number().int().min(1).max(120).optional().describe('Idle gap threshold in minutes (default: 10)'),
      },
    },
    ({ date, idle_threshold_min }) => {
      const result = timeline.getTimelineUI(date, { thresholdMin: idle_threshold_min ?? 10 });
      return { content: [{ type: 'text', text: JSON.stringify(result.projects) }] };
    }
  );

  // --- Tool 3: get_session_messages ---
  server.registerTool(
    'get_session_messages',
    {
      description: 'Get messages for a session. Returns first and last messages with a skip count for long sessions.',
      inputSchema: {
        session_id: z.string().describe('Session ID (UUID)'),
        fork_branch_id: z.string().optional().describe('Fork branch ID to filter messages (omit for primary branch)'),
      },
    },
    ({ session_id, fork_branch_id }) => {
      const result = sessions.getMessages(session_id, { forkBranchId: fork_branch_id });
      if (result === null) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: 'not_found', message: 'Session not found' }) }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // --- Tool 4: get_dates ---
  server.registerTool(
    'get_dates',
    {
      description: 'Get all dates that have session data. Useful for discovering which dates to query.',
    },
    () => {
      const rows = db.prepare(
        'SELECT DISTINCT DATE(first_message_at) AS date FROM sessions WHERE first_message_at IS NOT NULL ORDER BY date DESC'
      ).all();
      const data = { dates: rows.map(r => r.date) };
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    }
  );
}
