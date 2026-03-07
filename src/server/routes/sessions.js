/**
 * PATCH /api/sessions/:id
 *
 * Updates user-editable fields on a session (user_label, user_ticket).
 * These fields are preserved across re-imports since the upsert omits them.
 */

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function sessionsRoute(fastify, opts) {
  const { db } = opts;

  const updateStmt = db.prepare(`
    UPDATE sessions
    SET user_label = $user_label, user_ticket = $user_ticket
    WHERE session_id = $session_id
  `);

  const findStmt = db.prepare('SELECT session_id FROM sessions WHERE session_id = ?');

  fastify.patch('/api/sessions/:id', async (request, reply) => {
    const sessionId = request.params.id;
    const { userLabel, userTicket } = request.body ?? {};

    // Normalize empty strings to null
    const label = userLabel || null;
    const ticket = userTicket || null;

    const row = findStmt.get(sessionId);
    if (!row) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    updateStmt.run({
      $user_label: label,
      $user_ticket: ticket,
      $session_id: sessionId,
    });

    return { ok: true };
  });
}
