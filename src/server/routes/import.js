/**
 * POST /api/import
 *
 * Triggers the full import pipeline. Returns import result counts.
 * Returns 409 Conflict if an import is already in progress.
 */

import { importAll } from '../../importer/index.js';

// Module-level concurrency guard — shared across all requests
let importRunning = false;

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function importRoute(fastify, opts) {
  const { db } = opts;

  fastify.post('/api/import', async (_request, reply) => {
    if (importRunning) {
      reply.code(409);
      return { error: 'Import already in progress' };
    }

    importRunning = true;
    try {
      const result = await importAll(db, {});
      return { ok: true, ...result };
    } finally {
      importRunning = false;
    }
  });
}
