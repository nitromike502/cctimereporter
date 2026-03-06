/**
 * Ticket scorer and working branch detector for Claude Code sessions.
 *
 * Uses a multi-source scoring system to identify the primary ticket for a
 * session, and identifies the primary working branch by frequency + ticket
 * pattern preference.
 *
 * Ported from Python PoC determine_primary_ticket() / determine_working_branch()
 * in scripts/import_transcripts.py.
 *
 * KEY DECISION (locked in CONTEXT.md): Ticket pattern is generic [A-Z]{2,8}-\d{1,6}
 * rather than AILASUP-specific, to support any project's ticket system.
 */

import { extractContentText } from './parser.js';

// Generic ticket pattern — matches AILASUP-123, STORY-8, BUG-043, etc.
// Exported so importers and tests can reuse it.
// \b word boundaries prevent mid-word matches; \d{1,6} rejects timestamp-suffixed IDs.
export const TICKET_PATTERN = /\b[A-Z]{2,8}-\d{1,6}\b/gi;

// Prefixes that look like tickets but aren't.
// Does NOT include STORY, BUG, TASK, EPIC, FEATURE, ISSUE — those are legitimate ticket prefixes.
export const TICKET_PREFIX_DENYLIST = new Set([
  // Auto-generated IDs (timestamp or sequential suffixes)
  'SHUTDOWN', 'APPROVAL', 'BASH',
  // AI model names
  'CLAUDE', 'OPUS', 'GEMINI', 'GPT', 'SONNET', 'HAIKU',
  // CSS / design tokens
  'GRAY', 'GREY', 'RED', 'GREEN', 'BLUE', 'ORANGE', 'YELLOW', 'PURPLE', 'PINK', 'WHITE', 'BLACK',
  'PRIMARY', 'SECONDARY', 'SURFACE', 'ACCENT', 'NEUTRAL',
  // Standards, encodings, tooling
  'UTF', 'ISO', 'PSR', 'WSL', 'RFC', 'HTTP', 'SHA', 'MD',
  // Framework / language names
  'VUE', 'REACT', 'NODE', 'LARAVEL', 'CPYTHON', 'PYTHON', 'RUBY',
  // Version identifiers
  'VERSION', 'RELEASE',
  // Placeholder / example ticket prefixes (documentation artifacts)
  'TICKET', 'ABC', 'DEF', 'USER', 'PLAYER', 'TEAM', 'TEST', 'EXAMPLE', 'SAMPLE', 'DEMO',
]);

// /prep-ticket slash command patterns
const PREP_TICKET_INLINE = /\/prep-ticket\s+([A-Z]{2,8}-\d{1,6})/i;
const PREP_TICKET_XML = /<command-name>\/prep-ticket<\/command-name>.*?<command-args>([A-Z]{2,8}-\d{1,6})<\/command-args>/is;

// Minimum score a ticket must achieve to be considered the primary ticket.
// Filters single-mention noise: a ticket mentioned once in content scores 10 pts (below threshold).
// A ticket mentioned twice (20 pts) or once in content + once in branch (110+ pts) passes.
export const MIN_TICKET_SCORE = 15;

// Branches to skip when determining working branch
const SKIP_BRANCHES = new Set(['main', 'master', 'develop', 'dev', 'staging']);
const SKIP_PREFIXES = ['project-', 'target-version-'];

/**
 * Check whether a branch name should be excluded from working branch detection.
 *
 * @param {string|null} branch
 * @returns {boolean}
 */
function shouldSkipBranch(branch) {
  if (!branch) return true;
  if (SKIP_BRANCHES.has(branch)) return true;
  for (const prefix of SKIP_PREFIXES) {
    if (branch.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Determine the primary working branch for a session.
 *
 * Prefers branches containing a ticket pattern match; falls back to the most
 * common non-skipped branch.
 *
 * @param {Array<object>} messages - Messages array from parseTranscript()
 * @returns {string|null}
 */
export function determineWorkingBranch(messages) {
  const branchCounts = new Map();

  for (const msg of messages) {
    const branch = msg.gitBranch;
    if (!shouldSkipBranch(branch)) {
      branchCounts.set(branch, (branchCounts.get(branch) ?? 0) + 1);
    }
  }

  if (branchCounts.size === 0) return null;

  // Prefer the first branch (by insertion/iteration order of most common)
  // that contains a ticket pattern match
  // Sort by count descending for stable iteration
  const sorted = [...branchCounts.entries()].sort((a, b) => b[1] - a[1]);

  for (const [branch] of sorted) {
    // Reset lastIndex before test since TICKET_PATTERN has /g flag
    TICKET_PATTERN.lastIndex = 0;
    if (TICKET_PATTERN.test(branch)) {
      return branch;
    }
  }

  // Fall back to most common non-skipped branch
  return sorted[0][0];
}

/**
 * Score all tickets found in a session and return the primary ticket key.
 *
 * Scoring weights (locked):
 * - /prep-ticket slash command: 500 pts (700 if in first user message)
 * - Working branch contains ticket: 100 pts base
 * - Each message where gitBranch contains ticket: 5 pts/message
 * - Content mention in user messages: 10 pts/mention
 *
 * All ticket keys are normalized to uppercase before scoring.
 *
 * @param {Array<object>} messages - Messages array from parseTranscript()
 * @param {string|null} workingBranch - From determineWorkingBranch()
 * @returns {string|null} - Highest-scoring ticket key or null
 */
export function scoreTickets(messages, workingBranch) {
  const ticketScores = new Map();

  function addScore(ticket, points) {
    const key = ticket.toUpperCase();
    const prefix = key.split('-')[0];
    if (TICKET_PREFIX_DENYLIST.has(prefix)) return;
    ticketScores.set(key, (ticketScores.get(key) ?? 0) + points);
  }

  // Working branch base scoring: 100 pts for each ticket found in branch
  if (workingBranch) {
    TICKET_PATTERN.lastIndex = 0;
    for (const match of workingBranch.matchAll(TICKET_PATTERN)) {
      addScore(match[0], 100);
    }
  }

  // Find first non-meta user message for /prep-ticket bonus
  const firstUserMsg = messages.find(
    msg => msg.type === 'user' && !msg.isMeta
  );

  // Per-message scoring
  for (const msg of messages) {
    // Branch frequency bonus: 5 pts per message per ticket in gitBranch
    if (msg.gitBranch) {
      TICKET_PATTERN.lastIndex = 0;
      for (const match of msg.gitBranch.matchAll(TICKET_PATTERN)) {
        addScore(match[0], 5);
      }
    }

    // User message content scanning
    if (msg.type === 'user') {
      const text = extractContentText(msg.rawMessage);
      if (!text) continue;

      // Check for /prep-ticket slash command (highest priority)
      const prepMatch = PREP_TICKET_INLINE.exec(text) || PREP_TICKET_XML.exec(text);
      if (prepMatch) {
        const isFirst = firstUserMsg && msg.uuid === firstUserMsg.uuid;
        addScore(prepMatch[1], isFirst ? 700 : 500);
      }

      // Check for generic content mentions: 10 pts/mention
      TICKET_PATTERN.lastIndex = 0;
      for (const match of text.matchAll(TICKET_PATTERN)) {
        addScore(match[0], 10);
      }
    }
  }

  if (ticketScores.size === 0) return null;

  // Return highest-scoring ticket, if it meets the minimum threshold
  let best = null;
  let bestScore = -Infinity;
  for (const [ticket, score] of ticketScores) {
    if (score > bestScore) {
      bestScore = score;
      best = ticket;
    }
  }

  return bestScore >= MIN_TICKET_SCORE ? best : null;
}
