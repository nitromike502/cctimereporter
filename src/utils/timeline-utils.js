/**
 * Shared utility functions for timeline computation.
 *
 * These are pure functions with no dependencies, used by
 * src/services/timeline.js and potentially CLI/MCP layers.
 */

/**
 * Compute working time from an array of ISO8601 timestamp strings.
 * Consecutive message gaps <= thresholdMs are counted as working time.
 * Larger gaps (idle periods, overnight, etc.) are excluded.
 *
 * @param {string[]} timestamps - ISO8601 timestamp strings
 * @param {number} thresholdMs - Idle threshold in milliseconds
 * @returns {number} Working time in milliseconds
 */
export function computeWorkingTime(timestamps, thresholdMs) {
  if (timestamps.length < 2) return 0;
  const parsed = timestamps.map(t => new Date(t).getTime());
  let workingMs = 0;
  for (let i = 1; i < parsed.length; i++) {
    const gap = parsed[i] - parsed[i - 1];
    if (gap <= thresholdMs) workingMs += gap;
  }
  return workingMs;
}

/**
 * Compute idle gap spans from an array of ISO8601 timestamp strings.
 * Returns entries for consecutive message gaps > thresholdMs.
 *
 * @param {string[]} timestamps - ISO8601 timestamp strings
 * @param {number} thresholdMs - Idle threshold in milliseconds
 * @returns {{ start: string, end: string }[]} Array of idle gap objects
 */
export function computeIdleGaps(timestamps, thresholdMs) {
  if (timestamps.length < 2) return [];
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = new Date(timestamps[i]).getTime() - new Date(timestamps[i - 1]).getTime();
    if (gap > thresholdMs) {
      gaps.push({ start: timestamps[i - 1], end: timestamps[i] });
    }
  }
  return gaps;
}

/**
 * Sum the union of a set of half-open intervals [start, end), clamped to a window.
 * Used for strict "Agent Time" computation from per-turn durations: overlapping
 * intervals (parallel agent activity) are counted once.
 *
 * @param {{start: number, end: number}[]} intervals - epoch-ms intervals (start < end)
 * @param {number} windowStart - epoch-ms inclusive lower bound
 * @param {number} windowEnd   - epoch-ms inclusive upper bound
 * @returns {number} total covered milliseconds within the window
 */
export function sumIntervalUnion(intervals, windowStart, windowEnd) {
  if (intervals.length === 0 || windowEnd <= windowStart) return 0;
  const clipped = [];
  for (const { start, end } of intervals) {
    const s = Math.max(start, windowStart);
    const e = Math.min(end, windowEnd);
    if (e > s) clipped.push([s, e]);
  }
  if (clipped.length === 0) return 0;
  clipped.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curS, curE] = clipped[0];
  for (let i = 1; i < clipped.length; i++) {
    const [s, e] = clipped[i];
    if (s <= curE) {
      if (e > curE) curE = e;
    } else {
      total += curE - curS;
      curS = s;
      curE = e;
    }
  }
  total += curE - curS;
  return total;
}

// Generic build directory names — use parent directory for display instead
export const BUILD_DIR_NAMES = new Set(['httpdocs', 'htdocs', 'public_html', 'www', 'dist', 'build']);

/**
 * Derive a human-friendly display name from a project path.
 * If the last segment is a generic build directory name, use the parent instead.
 *
 * @param {string} projectPath
 * @returns {string}
 */
export function getDisplayName(projectPath) {
  const parts = projectPath.split('/').filter(Boolean);
  const last = parts.at(-1) ?? projectPath;
  if (BUILD_DIR_NAMES.has(last) && parts.length >= 2) {
    return parts.at(-2);
  }
  return last;
}

// Worktree path patterns:
// Actual paths: /home/user/project/.claude/worktrees/branch-name
// Encoded orphan dirs: -home-user-project--claude-worktrees-branch-name
const WORKTREE_PATH_RE = /\/\.claude\/worktrees\/[^/]+$/;
const WORKTREE_ENCODED_RE = /--claude-worktrees-[^/]+$/;

/**
 * If a project path is a worktree, extract the parent project path.
 * Works for both actual paths and encoded orphan directory names.
 *
 * @param {string} projectPath
 * @returns {string|null} Parent project path, or null if not a worktree
 */
export function getWorktreeParentPath(projectPath) {
  if (WORKTREE_PATH_RE.test(projectPath)) {
    return projectPath.replace(/\/\.claude\/worktrees\/[^/]+$/, '');
  }
  if (WORKTREE_ENCODED_RE.test(projectPath)) {
    return projectPath.replace(/--claude-worktrees-[^/]+$/, '');
  }
  return null;
}
