/**
 * GET /api/timeline?date=YYYY-MM-DD
 *
 * Thin HTTP wrapper around the timeline service.
 * All business logic lives in src/services/timeline.js.
 *
 * Defaults to today if no date is provided.
 */

import { createTimelineService, DEFAULT_IDLE_THRESHOLD_MIN } from '../../services/timeline.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync, migrated?: boolean }} opts
 */
export async function timelineRoute(fastify, opts) {
  const { db, migrated = false } = opts;

  const svc = createTimelineService(db);

  fastify.get('/api/timeline', async (request, reply) => {
    const date = request.query.date ?? getTodayString();

    if (!DATE_RE.test(date)) {
      reply.code(400);
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }

    // Idle threshold: optional query param in minutes, clamped 1-60, default 10
    const thresholdMin = Math.max(1, Math.min(60, parseInt(request.query.threshold, 10) || DEFAULT_IDLE_THRESHOLD_MIN));

    const result = await svc.getTimelineUI(date, { thresholdMin });

    return {
      ...result,
      schemaMigrated: migrated,
    };
  });
}
