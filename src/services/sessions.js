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
    const allMessages = rows.map(r => ({
      uuid: r.uuid,
      role: r.type, // 'user' or 'assistant'
      content: r.content ?? (isForkQuery ? '(no text content)' : null),
      timestamp: r.timestamp,
      is_fork_branch: r.is_fork_branch === 1,
      fork_branch_id: r.fork_branch_id ?? null,
    }));

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

  return { getMessages, updateSession };
}
