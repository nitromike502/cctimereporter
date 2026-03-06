/**
 * Import routes:
 *   POST /api/import          — trigger import, return JSON result (non-streaming fallback)
 *   GET  /api/import/progress  — trigger import, stream SSE progress events
 *
 * Both share a module-level concurrency guard (importRunning).
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

  fastify.post('/api/import', async (request, reply) => {
    if (importRunning) {
      reply.code(409);
      return { error: 'Import already in progress' };
    }

    importRunning = true;
    try {
      const { maxAgeDays } = request.body ?? {};
      const result = await importAll(db, { maxAgeDays });
      return { ok: true, ...result };
    } finally {
      importRunning = false;
    }
  });

  fastify.get('/api/import/progress', async (request, reply) => {
    if (importRunning) {
      reply.code(409);
      return { error: 'Import already in progress' };
    }

    importRunning = true;
    reply.hijack();

    // Write SSE headers
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Track client disconnect
    let clientConnected = true;
    request.raw.on('close', () => { clientConnected = false; });

    function sendEvent(eventName, data) {
      if (clientConnected) {
        raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    }

    try {
      const maxAgeDays = request.query.maxAgeDays != null
        ? parseInt(request.query.maxAgeDays, 10)
        : undefined;

      const result = await importAll(db, {
        maxAgeDays,
        onProgress(progress) {
          sendEvent('progress', progress);
        },
      });

      sendEvent('complete', result);
    } catch (err) {
      sendEvent('error', { message: err.message });
    } finally {
      importRunning = false;
      raw.end();
    }
  });
}
