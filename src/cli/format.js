/**
 * CLI output formatting utilities.
 *
 * Provides:
 *   formatWorkingTime(ms)          — convert ms to human-readable "Xh Ym"
 *   enrichWithFormattedTime(report) — add workingTime strings to getTimelineReport() output
 *   outputJSON(data, pretty)        — write JSON to stdout
 */

/**
 * Convert milliseconds to a human-readable working time string.
 *
 * @param {number} ms
 * @returns {string} e.g. "2h 15m", "45m", "3h", "0m"
 */
export function formatWorkingTime(ms) {
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Walk a getTimelineReport() result and add a `workingTime` string alongside
 * every `workingTimeMs` field. Returns a new object (does not mutate input).
 *
 * Handles:
 *   - report.workingTimeMs (top-level)
 *   - report.byTicket[].workingTimeMs (per ticket group)
 *   - report.byTicket[].sessions[].workingTimeMs (per session in ticket)
 *   - report.unticketedSessions[].workingTimeMs (unticketed sessions)
 *
 * @param {object} report - Output of createTimelineService(db).getTimelineReport()
 * @returns {object} Enriched report with workingTime strings added
 */
export function enrichWithFormattedTime(report) {
  const fmtAgent = ms => ms == null ? null : formatWorkingTime(ms);
  return {
    ...report,
    workingTime: formatWorkingTime(report.workingTimeMs),
    agentTime:   fmtAgent(report.agentTimeMs),
    byTicket: report.byTicket.map(group => ({
      ...group,
      workingTime: formatWorkingTime(group.workingTimeMs),
      agentTime:   fmtAgent(group.agentTimeMs),
      sessions: group.sessions.map(s => ({
        ...s,
        workingTime: formatWorkingTime(s.workingTimeMs),
        agentTime:   fmtAgent(s.agentTimeMs),
      })),
    })),
    unticketedSessions: report.unticketedSessions.map(s => ({
      ...s,
      workingTime: formatWorkingTime(s.workingTimeMs),
      agentTime:   fmtAgent(s.agentTimeMs),
    })),
  };
}

/**
 * Write JSON to stdout with an optional newline.
 *
 * @param {unknown} data
 * @param {boolean} [pretty] - If true, use 2-space indentation
 */
export function outputJSON(data, pretty) {
  process.stdout.write(JSON.stringify(data, null, pretty ? 2 : undefined) + '\n');
}
