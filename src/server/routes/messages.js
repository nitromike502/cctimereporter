/**
 * GET /api/sessions/:id/messages
 *
 * Thin HTTP wrapper around the sessions service.
 * All business logic lives in src/services/sessions.js.
 *
 * Query params:
 *   forkBranchId  - If provided, return only messages from that fork branch.
 *                   If omitted, return primary-branch messages (fork_branch_id IS NULL).
 *                   Special value "all" returns messages across all branches.
 */

import { createSessionsService } from '../../services/sessions.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function messagesRoute(fastify, opts) {
  const { db } = opts;

  const svc = createSessionsService(db);

  fastify.get('/api/sessions/:id/messages', async (request, reply) => {
    const sessionId = request.params.id;
    const { forkBranchId } = request.query;

    const result = svc.getMessages(sessionId, { forkBranchId });

    if (result === null) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    return result;
  });
}
