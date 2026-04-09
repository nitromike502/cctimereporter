/**
 * GET /api/tokens?date=YYYY-MM-DD
 *
 * Thin HTTP wrapper around the tokens service.
 * All business logic lives in src/services/tokens.js.
 *
 * Returns per-session and day-total token aggregates for a given date:
 *   - inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens
 *   - totalTokens (sum of all four, NULL-safe via COALESCE in SQL)
 *   - cacheHitRate (cache_read / (cache_read + input) × 100, one decimal, null if no data)
 *
 * Sidechain (is_sidechain=1) and fork-branch (is_fork_branch=1) messages are excluded
 * from all aggregates — these are the "actual spend" totals per STATE.md.
 *
 * Defaults to today if no date query param is provided.
 */

import { createTokensService } from '../../services/tokens.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function tokensRoute(fastify, opts) {
  const { db } = opts;
  const svc = createTokensService(db);

  fastify.get('/api/tokens', async (request, reply) => {
    const date = request.query.date ?? getTodayString();

    if (!DATE_RE.test(date)) {
      reply.code(400);
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }

    return svc.getDayTokens(date);
  });
}
