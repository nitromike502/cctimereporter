/**
 * Timeline service — business logic for timeline queries.
 *
 * Provides:
 *   createTimelineService(db) → { getTimelineUI, getTimelineReport }
 *
 * getTimelineUI:     Returns the UI projection (project-grouped sessions with all
 *                    visual fields). Identical shape to GET /api/timeline, minus
 *                    schemaMigrated (that's an HTTP concern added by the route).
 *
 * getTimelineReport: Returns a reporting projection for CLI/MCP consumption,
 *                    grouped by ticket with per-ticket working time totals.
 */

import {
  computeWorkingTime,
  computeIdleGaps,
  getDisplayName,
  getWorktreeParentPath,
} from '../utils/timeline-utils.js';

export const DEFAULT_IDLE_THRESHOLD_MIN = 10;

/**
 * Compute fork segments for a single session from raw DB rows.
 * Clamps start/end timestamps to day boundaries (consistent with overnight session clamping).
 *
 * @param {Array<{fork_branch_id: string, start_time: string, end_time: string, message_count: number}>} rows
 * @param {string} dayStartUTC - ISO8601 start of day in UTC
 * @param {string} dayEndUTC   - ISO8601 end of day in UTC
 * @param {string} sessionId
 * @param {Map<string, string[]>} forkTimestampsByBranch - Map of "sessionId:branchId" → sorted timestamps
 * @param {number} thresholdMs
 * @returns {{ forkBranchId: string, startTime: string, endTime: string, messageCount: number, workingTimeMs: number, elapsedTimeMs: number }[]}
 */
function computeForkSegments(rows, dayStartUTC, dayEndUTC, sessionId, forkTimestampsByBranch, thresholdMs) {
  return rows
    .filter(row => row.end_time >= dayStartUTC && row.start_time < dayEndUTC && row.message_count >= 2)
    .flatMap(row => {
      // Compute working time from individual fork message timestamps
      const key = sessionId + ':' + row.fork_branch_id;
      const allTs = forkTimestampsByBranch.get(key) ?? [];
      const dayTs = allTs.filter(t => t >= dayStartUTC && t < dayEndUTC);

      // Skip forks with no messages on this day
      if (dayTs.length === 0) return [];

      const workingTimeMs = computeWorkingTime(dayTs, thresholdMs);

      // Filter out forks with zero working time (all gaps exceed idle threshold)
      if (workingTimeMs === 0) return [];

      // For overnight forks, use first/last in-day message instead of midnight
      // (consistent with main session clamping at lines 211-214)
      const clampedStart = row.start_time < dayStartUTC ? dayTs[0] : row.start_time;
      const clampedEnd = row.end_time > dayEndUTC ? dayTs.at(-1) : row.end_time;
      const elapsedTimeMs = new Date(clampedEnd).getTime() - new Date(clampedStart).getTime();

      return [{
        forkBranchId: row.fork_branch_id,
        startTime: clampedStart,
        endTime: clampedEnd,
        messageCount: row.message_count,
        workingTimeMs,
        elapsedTimeMs,
      }];
    });
}

/**
 * Factory: create a timeline service bound to a database connection.
 *
 * Prepared statements that don't have variable-length IN clauses are created
 * here at factory time and reused across calls. Statements with dynamic IN
 * clauses (fork queries) are created inside getTimelineUI() where needed.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ getTimelineUI: Function, getTimelineReport: Function }}
 */
export function createTimelineService(db) {
  // Sessions overlapping a UTC time range (local day converted to UTC).
  // Excludes team-member subagents (is_subagent=1 with team_name) but
  // includes team leaders and worktree sessions (grouped in JS below).
  const sessionStmt = db.prepare(`
    SELECT
      s.session_id,
      s.primary_ticket,
      s.working_branch,
      s.summary,
      s.first_prompt,
      s.custom_title,
      s.user_label,
      s.user_ticket,
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
      AND (s.is_subagent = 0 OR s.is_subagent IS NULL
           OR (p.project_path LIKE '%/.claude/worktrees/%'
               OR p.project_path LIKE '%--claude-worktrees-%'))
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

  const totalSessionsStmt = db.prepare('SELECT COUNT(*) AS cnt FROM sessions');
  const allProjectPathsStmt = db.prepare('SELECT project_path FROM projects');

  /**
   * Fetch and process sessions for a given date, returning enriched session objects
   * with computed working time, idle gaps, fork segments, and overnight clamping.
   *
   * Used internally by both getTimelineUI and getTimelineReport.
   *
   * @param {string} date - 'YYYY-MM-DD'
   * @param {number} thresholdMin
   * @returns {{ sessions: object[], dayStartUTC: string, dayEndUTC: string, thresholdMs: number, projectPathLookup: Map }}
   */
  function _querySessions(date, thresholdMin) {
    const thresholdMs = thresholdMin * 60 * 1000;

    // Convert local day boundaries to UTC for correct comparison with Z timestamps
    const dayStartUTC = new Date(date + 'T00:00:00').toISOString();
    const dayEndUTC   = new Date(date + 'T23:59:59.999').toISOString();

    // first_message_at < dayEnd AND last_message_at >= dayStart → overlaps the day
    const rawSessions = sessionStmt.all(dayEndUTC, dayStartUTC);

    // Build lookups for worktree→parent resolution.
    // Maps both actual paths and their encoded forms to the canonical project_path.
    const projectPathLookup = new Map();
    for (const { project_path } of allProjectPathsStmt.all()) {
      projectPathLookup.set(project_path, project_path);
      // Also map the encoded form so orphan dirs can find their parent
      const encoded = project_path.replace(/\//g, '-');
      projectPathLookup.set(encoded, project_path);
    }

    // Collect session IDs that have real forks so we can batch-query fork segments.
    // Gate on real_fork_count > 0 to avoid any DB overhead for the common (no-fork) case.
    const sessionIdsWithForks = rawSessions
      .filter(s => s.real_fork_count > 0)
      .map(s => s.session_id);

    // Maps session_id → array of fork segment DB rows
    const forkRowsBySession = new Map();
    // Maps "session_id:fork_branch_id" → sorted timestamp array (for working time)
    const forkTimestampsByBranch = new Map();
    if (sessionIdsWithForks.length > 0) {
      const placeholders = sessionIdsWithForks.map(() => '?').join(', ');
      const forkRows = db.prepare(`
        SELECT session_id, fork_branch_id,
               MIN(timestamp) AS start_time,
               MAX(timestamp) AS end_time,
               COUNT(*) AS message_count
        FROM messages
        WHERE session_id IN (${placeholders})
          AND fork_branch_id IS NOT NULL
          AND type IN ('user', 'assistant')
          AND timestamp IS NOT NULL
        GROUP BY session_id, fork_branch_id
      `).all(...sessionIdsWithForks);

      for (const forkRow of forkRows) {
        if (!forkRowsBySession.has(forkRow.session_id)) {
          forkRowsBySession.set(forkRow.session_id, []);
        }
        forkRowsBySession.get(forkRow.session_id).push(forkRow);
      }

      // Second batch query: get individual fork message timestamps for working time computation.
      const forkTimestampRows = db.prepare(`
        SELECT session_id, fork_branch_id, timestamp
        FROM messages
        WHERE session_id IN (${placeholders})
          AND fork_branch_id IS NOT NULL
          AND timestamp IS NOT NULL
        ORDER BY timestamp ASC
      `).all(...sessionIdsWithForks);

      for (const r of forkTimestampRows) {
        const key = r.session_id + ':' + r.fork_branch_id;
        if (!forkTimestampsByBranch.has(key)) {
          forkTimestampsByBranch.set(key, []);
        }
        forkTimestampsByBranch.get(key).push(r.timestamp);
      }
    }

    const sessions = [];

    for (const row of rawSessions) {
      // Get message timestamps for working time computation
      const msgRows = messageStmt.all(row.session_id);
      const allTimestamps = msgRows.map(m => m.timestamp);

      // Filter to only messages within the local day (UTC boundaries)
      const clampedTimestamps = allTimestamps.filter(t => t >= dayStartUTC && t < dayEndUTC);

      // Skip sessions with no messages on this day
      if (clampedTimestamps.length === 0) continue;

      const workingTimeMs = computeWorkingTime(clampedTimestamps, thresholdMs);

      // For overnight sessions, use first/last in-day message instead of midnight
      const continuesFromPrevDay = row.first_message_at < dayStartUTC;
      const continuesIntoNextDay = row.last_message_at  >= dayEndUTC;
      const clampedStart = continuesFromPrevDay ? (clampedTimestamps[0] ?? dayStartUTC) : row.first_message_at;
      const clampedEnd   = continuesIntoNextDay ? (clampedTimestamps.at(-1) ?? dayEndUTC) : row.last_message_at;

      // Compute idle gaps from clamped timestamps
      const idleGaps = computeIdleGaps(clampedTimestamps, thresholdMs);

      const elapsedTimeMs = new Date(clampedEnd).getTime() - new Date(clampedStart).getTime();

      // Compute fork segments (empty array for sessions with no real forks)
      const rawForkRows = forkRowsBySession.get(row.session_id) ?? [];
      const forkSegments = computeForkSegments(rawForkRows, dayStartUTC, dayEndUTC, row.session_id, forkTimestampsByBranch, thresholdMs);

      sessions.push({
        // Raw DB fields (for internal use, prefixed with _)
        _projectPath: row.project_path,
        _projectId: row.project_id,
        // Computed session object fields
        sessionId: row.session_id,
        startTime: clampedStart,
        endTime: clampedEnd,
        continuesFromPrevDay,
        continuesIntoNextDay,
        workingTimeMs,
        elapsedTimeMs,
        idleGaps,
        forkSegments,
        ticket: row.primary_ticket,
        branch: row.working_branch,
        summary: row.summary,
        firstPrompt: row.first_prompt,
        customTitle: row.custom_title,
        userLabel: row.user_label,
        userTicket: row.user_ticket,
        messageCount: clampedTimestamps.length,
        userMessageCount: row.user_message_count,
        forkCount: row.fork_count,
        realForkCount: row.real_fork_count,
      });
    }

    return { sessions, dayStartUTC, dayEndUTC, thresholdMs, projectPathLookup };
  }

  /**
   * Get the timeline data in UI projection format (project-grouped sessions).
   * Returns the EXACT same shape as GET /api/timeline, minus schemaMigrated.
   *
   * @param {string} date - 'YYYY-MM-DD'
   * @param {{ thresholdMin?: number }} [opts]
   * @returns {{ date: string, totalSessions: number, projects: object[] }}
   */
  function getTimelineUI(date, { thresholdMin = DEFAULT_IDLE_THRESHOLD_MIN } = {}) {
    const { sessions, projectPathLookup } = _querySessions(date, thresholdMin);

    // Group sessions by project using a Map keyed by display project path.
    // Worktree sessions are merged under their parent project.
    const projectMap = new Map();

    for (const session of sessions) {
      // Resolve worktree projects to their parent for grouping.
      const extractedParent = getWorktreeParentPath(session._projectPath);
      const resolvedParent = extractedParent ? projectPathLookup.get(extractedParent) : null;
      const groupPath = resolvedParent ?? session._projectPath;

      if (!projectMap.has(groupPath)) {
        projectMap.set(groupPath, {
          projectId: session._projectId,
          projectPath: groupPath,
          displayName: getDisplayName(groupPath),
          sessions: [],
        });
      }

      // Strip internal fields before pushing to output
      const { _projectPath, _projectId, ...sessionObj } = session;
      projectMap.get(groupPath).sessions.push(sessionObj);
    }

    const { cnt: totalSessions } = totalSessionsStmt.get();

    return {
      date,
      totalSessions,
      projects: [...projectMap.values()],
    };
  }

  /**
   * Get the timeline data in reporting projection format (ticket-grouped totals).
   * Designed for CLI/MCP consumption.
   *
   * @param {string} date - 'YYYY-MM-DD'
   * @param {{ thresholdMin?: number }} [opts]
   * @returns {{ date: string, workingTimeMs: number, byTicket: object[], unticketedSessions: object[] }}
   */
  function getTimelineReport(date, { thresholdMin = DEFAULT_IDLE_THRESHOLD_MIN } = {}) {
    const { sessions, projectPathLookup } = _querySessions(date, thresholdMin);

    // Group by ticket (user override preferred over detected ticket)
    const ticketMap = new Map();

    for (const session of sessions) {
      // Resolve display name for project
      const extractedParent = getWorktreeParentPath(session._projectPath);
      const resolvedParent = extractedParent ? projectPathLookup.get(extractedParent) : null;
      const groupPath = resolvedParent ?? session._projectPath;
      const displayName = getDisplayName(groupPath);

      const ticketKey = session.userTicket ?? session.ticket ?? null;

      if (!ticketMap.has(ticketKey)) {
        ticketMap.set(ticketKey, {
          ticket: ticketKey,
          workingTimeMs: 0,
          sessionCount: 0,
          projects: [],
          sessions: [],
        });
      }

      const group = ticketMap.get(ticketKey);
      group.workingTimeMs += session.workingTimeMs;
      group.sessionCount++;
      if (!group.projects.includes(displayName)) {
        group.projects.push(displayName);
      }
      group.sessions.push({
        sessionId:    session.sessionId,
        project:      displayName,
        ticket:       ticketKey,
        branch:       session.branch,
        workingTimeMs: session.workingTimeMs,
        summary:      session.summary,
        customTitle:  session.customTitle,
        startTime:    session.startTime,
        endTime:      session.endTime,
        userLabel:    session.userLabel,
        userTicket:   session.userTicket,
      });
    }

    const totalWorkingTimeMs = sessions.reduce((sum, s) => sum + s.workingTimeMs, 0);

    // Separate ticketed from unticketed
    const byTicket = [];
    const unticketedSessions = [];

    for (const [key, group] of ticketMap) {
      if (key === null) {
        unticketedSessions.push(...group.sessions);
      } else {
        byTicket.push(group);
      }
    }

    // Sort by working time descending
    byTicket.sort((a, b) => b.workingTimeMs - a.workingTimeMs);

    return {
      date,
      workingTimeMs: totalWorkingTimeMs,
      byTicket,
      unticketedSessions,
    };
  }

  return { getTimelineUI, getTimelineReport };
}
