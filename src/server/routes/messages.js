/**
 * GET /api/sessions/:id/messages
 *
 * Returns messages for a session from the database. Only messages with
 * content (user and assistant) are returned. Supports fork-branch filtering
 * via the optional `forkBranchId` query parameter.
 *
 * Query params:
 *   forkBranchId  - If provided, return only messages from that fork branch.
 *                   If omitted, return primary-branch messages (fork_branch_id IS NULL).
 *                   Special value "all" returns messages across all branches.
 *
 * Returns first 10 and last 10 messages with a skip count in between,
 * preserving the same response shape as the previous JSONL-based route.
 */

const HEAD_COUNT = 10;
const TAIL_COUNT = 10;

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function messagesRoute(fastify, opts) {
  const { db } = opts;

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

  const forkBranchStmt = db.prepare(`
    SELECT uuid, type, content, timestamp, is_fork_branch, fork_branch_id
    FROM messages
    WHERE session_id = ?
      AND content IS NOT NULL
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

  fastify.get('/api/sessions/:id/messages', async (request, reply) => {
    const sessionId = request.params.id;
    const { forkBranchId } = request.query;

    const row = sessionExistsStmt.get(sessionId);
    if (!row) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    // Choose query based on forkBranchId param
    let rows;
    if (forkBranchId === 'all') {
      rows = allBranchesStmt.all(sessionId);
    } else if (forkBranchId) {
      rows = forkBranchStmt.all(sessionId, forkBranchId);
    } else {
      rows = primaryBranchStmt.all(sessionId);
    }

    // Map DB rows to response shape
    const allMessages = rows.map(r => ({
      uuid: r.uuid,
      role: r.type, // 'user' or 'assistant'
      content: r.content,
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
  });
}
