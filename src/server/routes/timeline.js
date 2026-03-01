/**
 * GET /api/timeline?date=YYYY-MM-DD
 *
 * Returns sessions grouped by project for the requested date (local time).
 * Each session includes working time computed using the idle-gap algorithm
 * (gaps > 10 minutes are excluded from working time).
 *
 * Timestamps in the database are UTC (ISO8601 with Z suffix). Day boundaries
 * are computed from the server's local timezone and converted to UTC for
 * accurate comparison.
 *
 * Defaults to today if no date is provided.
 */

const IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Compute working time from an array of ISO8601 timestamp strings.
 * Consecutive message gaps <= IDLE_THRESHOLD_MS are counted as working time.
 * Larger gaps (idle periods, overnight, etc.) are excluded.
 *
 * @param {string[]} timestamps - ISO8601 timestamp strings
 * @returns {number} Working time in milliseconds
 */
function computeWorkingTime(timestamps) {
  if (timestamps.length < 2) return 0;
  const parsed = timestamps.map(t => new Date(t).getTime());
  let workingMs = 0;
  for (let i = 1; i < parsed.length; i++) {
    const gap = parsed[i] - parsed[i - 1];
    if (gap <= IDLE_THRESHOLD_MS) workingMs += gap;
  }
  return workingMs;
}

/**
 * Compute idle gap spans from an array of ISO8601 timestamp strings.
 * Returns entries for consecutive message gaps > IDLE_THRESHOLD_MS.
 *
 * @param {string[]} timestamps - ISO8601 timestamp strings
 * @returns {{ start: string, end: string }[]} Array of idle gap objects
 */
function computeIdleGaps(timestamps) {
  if (timestamps.length < 2) return [];
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = new Date(timestamps[i]).getTime() - new Date(timestamps[i - 1]).getTime();
    if (gap > IDLE_THRESHOLD_MS) {
      gaps.push({ start: timestamps[i - 1], end: timestamps[i] });
    }
  }
  return gaps;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function timelineRoute(fastify, opts) {
  const { db } = opts;

  // Sessions overlapping a UTC time range (local day converted to UTC)
  const sessionStmt = db.prepare(`
    SELECT
      s.session_id,
      s.primary_ticket,
      s.working_branch,
      s.summary,
      s.first_message_at,
      s.last_message_at,
      s.message_count,
      s.user_message_count,
      s.fork_count,
      s.real_fork_count,
      p.project_path,
      p.id AS project_id
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    WHERE s.first_message_at < ? AND s.last_message_at >= ?
      AND (s.is_subagent = 0 OR s.is_subagent IS NULL)
    ORDER BY s.first_message_at
  `);

  const messageStmt = db.prepare(`
    SELECT timestamp
    FROM messages
    WHERE session_id = ?
      AND type IN ('user', 'assistant')
      AND timestamp IS NOT NULL
    ORDER BY timestamp
  `);

  fastify.get('/api/timeline', async (request, reply) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = request.query.date ?? today;

    if (!DATE_RE.test(date)) {
      reply.code(400);
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }

    // Convert local day boundaries to UTC for correct comparison with Z timestamps
    const dayStartUTC = new Date(date + 'T00:00:00').toISOString();
    const dayEndUTC   = new Date(date + 'T23:59:59.999').toISOString();

    // first_message_at < dayEnd AND last_message_at >= dayStart → overlaps the day
    const sessions = sessionStmt.all(dayEndUTC, dayStartUTC);

    // Group sessions by project using a Map keyed by project_id
    const projectMap = new Map();

    for (const row of sessions) {
      // Get message timestamps for working time computation
      const msgRows = messageStmt.all(row.session_id);
      const allTimestamps = msgRows.map(m => m.timestamp);

      // Filter to only messages within the local day (UTC boundaries)
      const clampedTimestamps = allTimestamps.filter(t => t >= dayStartUTC && t < dayEndUTC);
      const workingTimeMs = computeWorkingTime(clampedTimestamps);

      // For overnight sessions, use first/last in-day message instead of midnight
      const continuesFromPrevDay = row.first_message_at < dayStartUTC;
      const continuesIntoNextDay = row.last_message_at  >= dayEndUTC;
      const clampedStart = continuesFromPrevDay ? (clampedTimestamps[0] ?? dayStartUTC) : row.first_message_at;
      const clampedEnd   = continuesIntoNextDay ? (clampedTimestamps.at(-1) ?? dayEndUTC) : row.last_message_at;

      // Skip sessions with no messages on this day
      if (clampedTimestamps.length === 0) continue;

      // Compute idle gaps from clamped timestamps
      const idleGaps = computeIdleGaps(clampedTimestamps);

      const sessionObj = {
        sessionId: row.session_id,
        startTime: clampedStart,
        endTime:   clampedEnd,
        continuesFromPrevDay,
        continuesIntoNextDay,
        workingTimeMs,
        idleGaps,
        ticket: row.primary_ticket,
        branch: row.working_branch,
        summary: row.summary,
        messageCount: clampedTimestamps.length,
        userMessageCount: row.user_message_count,
        forkCount: row.fork_count,
        realForkCount: row.real_fork_count,
      };

      if (!projectMap.has(row.project_id)) {
        projectMap.set(row.project_id, {
          projectId: row.project_id,
          projectPath: row.project_path,
          displayName: row.project_path.split('/').pop(),
          sessions: [],
        });
      }
      projectMap.get(row.project_id).sessions.push(sessionObj);
    }

    return {
      date,
      projects: [...projectMap.values()],
    };
  });
}
