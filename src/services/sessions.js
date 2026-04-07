/**
 * Sessions service — business logic for session message retrieval and updates.
 *
 * Provides:
 *   createSessionsService(db) → { getMessages, updateSession }
 *
 * getMessages:    Returns messages for a session with head/tail truncation.
 *                 Returns null if session not found (route maps to 404).
 *
 * updateSession:  Updates user-editable fields (user_label, user_ticket).
 *                 Returns null if session not found (route maps to 404).
 */

const HEAD_COUNT = 10;
const TAIL_COUNT = 10;

/**
 * Factory: create a sessions service bound to a database connection.
 *
 * All prepared statements are created here at factory time.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ getMessages: Function, updateSession: Function }}
 */
export function createSessionsService(db) {
  const sessionExistsStmt = db.prepare(
    'SELECT session_id FROM sessions WHERE session_id = ?'
  );

  // Prepared statements for the three query modes
  const primaryBranchStmt = db.prepare(`
    SELECT uuid, type, content, timestamp, is_fork_branch, fork_branch_id
    FROM messages
    WHERE session_id = ?
      AND content IS NOT NULL
      AND (fork_branch_id IS NULL OR fork_branch_id = '')
    ORDER BY timestamp ASC
  `);

  // Fork branch query: includes messages with NULL content (shown with placeholder).
  // Fork branches often have only tool-use messages with no stored text content;
  // returning them with a placeholder gives the modal something to display.
  const forkBranchStmt = db.prepare(`
    SELECT uuid, type, content, timestamp, is_fork_branch, fork_branch_id
    FROM messages
    WHERE session_id = ?
      AND type IN ('user', 'assistant')
      AND fork_branch_id = ?
    ORDER BY timestamp ASC
  `);

  // Find the parent_uuid of the first message in a fork branch (the fork point).
  const forkPointStmt = db.prepare(`
    SELECT parent_uuid FROM messages
    WHERE session_id = ? AND fork_branch_id = ?
    ORDER BY timestamp ASC LIMIT 1
  `);

  const allBranchesStmt = db.prepare(`
    SELECT uuid, type, content, timestamp, is_fork_branch, fork_branch_id
    FROM messages
    WHERE session_id = ?
      AND content IS NOT NULL
    ORDER BY timestamp ASC
  `);

  const findStmt = db.prepare('SELECT session_id FROM sessions WHERE session_id = ?');

  const updateStmt = db.prepare(`
    UPDATE sessions
    SET user_label = $user_label, user_ticket = $user_ticket
    WHERE session_id = $session_id
  `);

  /**
   * Get messages for a session, with optional fork-branch filtering.
   * Returns first/last HEAD_COUNT/TAIL_COUNT messages with a skip count.
   *
   * @param {string} sessionId
   * @param {{ forkBranchId?: string }} [opts]
   * @returns {{ messages: object[], totalCount: number, skipped: number } | null}
   */
  function getMessages(sessionId, { forkBranchId } = {}) {
    const row = sessionExistsStmt.get(sessionId);
    if (!row) return null;

    // Choose query based on forkBranchId param
    let rows;
    if (forkBranchId === 'all') {
      rows = allBranchesStmt.all(sessionId);
    } else if (forkBranchId) {
      rows = forkBranchStmt.all(sessionId, forkBranchId);
    } else {
      rows = primaryBranchStmt.all(sessionId);
    }

    // Map DB rows to response shape.
    // For fork branch queries, content may be null (tool-use only messages);
    // use a placeholder so the modal can display something meaningful.
    const isForkQuery = forkBranchId && forkBranchId !== 'all';
    const mapRow = (r) => ({
      uuid: r.uuid,
      role: r.type, // 'user' or 'assistant'
      content: r.content ?? (isForkQuery ? '(no text content)' : null),
      timestamp: r.timestamp,
      is_fork_branch: r.is_fork_branch === 1,
      fork_branch_id: r.fork_branch_id ?? null,
    });

    // For fork branch queries, build zone-annotated response with primary branch context
    if (isForkQuery) {
      return buildForkContextResponse(sessionId, forkBranchId, rows, mapRow);
    }

    const allMessages = rows.map(mapRow);
    const total = allMessages.length;

    // If 20 or fewer, return all as a single list (no split needed)
    if (total <= HEAD_COUNT + TAIL_COUNT) {
      return { messages: allMessages, totalCount: total, skipped: 0 };
    }

    // Otherwise, return first N and last N with skip count
    const first = allMessages.slice(0, HEAD_COUNT);
    const last = allMessages.slice(-TAIL_COUNT);
    const skipped = total - HEAD_COUNT - TAIL_COUNT;

    return { messages: [...first, ...last], totalCount: total, skipped };
  }

  /**
   * Update user-editable fields on a session.
   * Normalizes empty strings to null (business logic, not HTTP concern).
   *
   * @param {string} sessionId
   * @param {{ userLabel?: string, userTicket?: string }} fields
   * @returns {{ ok: true } | null}
   */
  function updateSession(sessionId, { userLabel, userTicket } = {}) {
    const row = findStmt.get(sessionId);
    if (!row) return null;

    // Normalize empty strings to null
    const label = userLabel || null;
    const ticket = userTicket || null;

    updateStmt.run({
      $user_label: label,
      $user_ticket: ticket,
      $session_id: sessionId,
    });

    return { ok: true };
  }

  /**
   * Build a zone-annotated response for fork branch message queries.
   * Returns session-start context, pre-fork context, and fork branch messages
   * with zone labels so the UI can render them with appropriate styling.
   *
   * @param {string} sessionId
   * @param {string} forkBranchId
   * @param {object[]} forkRows - Raw DB rows for the fork branch
   * @param {Function} mapRow - Row mapper function
   * @returns {{ messages: object[], totalCount: number, skipped: number, hasForkContext: boolean }}
   */
  function buildForkContextResponse(sessionId, forkBranchId, forkRows, mapRow) {
    const forkMessages = forkRows.map(r => ({ ...mapRow(r), zone: 'fork' }));

    // Find the fork point: parent_uuid of the first fork branch message
    const forkPointRow = forkPointStmt.get(sessionId, forkBranchId);
    const parentUuid = forkPointRow?.parent_uuid;

    // If no parent_uuid, can't build context — return fork messages only
    if (!parentUuid) {
      return {
        messages: forkMessages,
        totalCount: forkMessages.length,
        skipped: 0,
        hasForkContext: false,
      };
    }

    // Get all primary branch messages with content
    const primaryRows = primaryBranchStmt.all(sessionId);
    const primaryMessages = primaryRows.map(mapRow);

    // Find fork point index in primary branch
    const forkPointIdx = primaryMessages.findIndex(m => m.uuid === parentUuid);
    if (forkPointIdx === -1) {
      // Edge case: parent_uuid not found in primary branch — return fork only
      return {
        messages: forkMessages,
        totalCount: forkMessages.length,
        skipped: 0,
        hasForkContext: false,
      };
    }

    // Build context zones
    const SESSION_START_COUNT = 2;
    const PRE_FORK_COUNT = 3;

    // Session start: first 2 primary messages
    const sessionStartEnd = Math.min(SESSION_START_COUNT, primaryMessages.length);
    const sessionStartMsgs = primaryMessages.slice(0, sessionStartEnd)
      .map(m => ({ ...m, zone: 'context-start' }));

    // Pre-fork context: last 3 messages at or before the fork point
    const preForkStart = Math.max(0, forkPointIdx - PRE_FORK_COUNT + 1);
    const preForkEnd = forkPointIdx + 1;
    // Only include pre-fork messages that don't overlap with session start
    const preForkMsgs = primaryMessages.slice(preForkStart, preForkEnd)
      .filter((_, i) => (preForkStart + i) >= sessionStartEnd)
      .map(m => ({ ...m, zone: 'context-prefork' }));

    // Calculate skipped count: primary messages between session start and pre-fork
    const firstGapStart = sessionStartEnd;
    const firstGapEnd = preForkMsgs.length > 0
      ? preForkStart + (preForkEnd - preForkStart - preForkMsgs.length)  // adjusted for dedup
      : preForkEnd;
    // Simpler: count messages not included in either zone
    const includedContextCount = sessionStartMsgs.length + preForkMsgs.length;
    const totalContextAvailable = forkPointIdx + 1; // messages up to and including fork point
    const skippedCount = Math.max(0, totalContextAvailable - includedContextCount);

    return {
      messages: [...sessionStartMsgs, ...preForkMsgs, ...forkMessages],
      totalCount: forkMessages.length,
      skipped: skippedCount,
      hasForkContext: true,
    };
  }

  return { getMessages, updateSession };
}
