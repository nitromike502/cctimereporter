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

  // Fork branch query: only messages with stored text content.
  // Context zones (session start + pre-fork) ensure the modal always has something to show.
  const forkBranchStmt = db.prepare(`
    SELECT uuid, type, content, timestamp, is_fork_branch, fork_branch_id
    FROM messages
    WHERE session_id = ?
      AND content IS NOT NULL
      AND fork_branch_id = ?
    ORDER BY timestamp ASC
  `);

  // Find the timestamp of the first message in a fork branch (used to locate the fork point).
  const forkFirstTimestampStmt = db.prepare(`
    SELECT timestamp FROM messages
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
    const isForkQuery = forkBranchId && forkBranchId !== 'all';
    const mapRow = (r) => ({
      uuid: r.uuid,
      role: r.type, // 'user' or 'assistant'
      content: r.content,
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

    // Find the fork point by timestamp: get the first fork branch message's timestamp,
    // then find the last primary branch message before that time.
    // Using timestamps rather than parent_uuid because the fork point's parent is often
    // a system message with no content, which doesn't appear in the primary branch results.
    const forkFirstRow = forkFirstTimestampStmt.get(sessionId, forkBranchId);
    const forkTimestamp = forkFirstRow?.timestamp;

    // If no timestamp, can't build context — return fork messages only
    if (!forkTimestamp) {
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

    // Find fork point: last primary message at or before the fork timestamp
    let forkPointIdx = -1;
    for (let i = primaryMessages.length - 1; i >= 0; i--) {
      if (primaryMessages[i].timestamp <= forkTimestamp) {
        forkPointIdx = i;
        break;
      }
    }
    if (forkPointIdx === -1) {
      // Fork happened before any primary branch content — return fork only
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

    // Apply head/tail truncation to fork messages (same limits as primary branch)
    const forkTotal = forkMessages.length;
    let displayedForkMsgs;
    let forkSkipped = 0;
    if (forkTotal <= HEAD_COUNT + TAIL_COUNT) {
      displayedForkMsgs = forkMessages;
    } else {
      const head = forkMessages.slice(0, HEAD_COUNT);
      const tail = forkMessages.slice(-TAIL_COUNT);
      forkSkipped = forkTotal - HEAD_COUNT - TAIL_COUNT;
      displayedForkMsgs = [...head, ...tail];
    }

    return {
      messages: [...sessionStartMsgs, ...preForkMsgs, ...displayedForkMsgs],
      totalCount: forkTotal,
      skipped: skippedCount,
      forkSkipped,
      hasForkContext: true,
    };
  }

  return { getMessages, updateSession };
}
