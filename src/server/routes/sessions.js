/**
 * PATCH /api/sessions/:id
 *
 * Thin HTTP wrapper around the sessions service.
 * All business logic lives in src/services/sessions.js.
 *
 * Updates user-editable fields on a session (user_label, user_ticket).
 * These fields are preserved across re-imports since the upsert omits them.
 */

import { createSessionsService } from '../../services/sessions.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function sessionsRoute(fastify, opts) {
  const { db } = opts;

  const svc = createSessionsService(db);

  fastify.patch('/api/sessions/:id', async (request, reply) => {
    const sessionId = request.params.id;
    const { userLabel, userTicket } = request.body ?? {};

    const result = svc.updateSession(sessionId, { userLabel, userTicket });

    if (result === null) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    return result;
  });
}
