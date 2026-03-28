/**
 * Import routes:
 *   POST /api/import          — trigger import, return JSON result (non-streaming fallback)
 *   GET  /api/import/progress  — trigger import, stream SSE progress events
 *
 * Thin HTTP wrappers around the import service.
 * Concurrency guard lives in src/services/import.js.
 * SSE setup and HTTP concerns stay here in the route.
 */

import { runImport, ImportConflictError } from '../../services/import.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function importRoute(fastify, opts) {
  const { db } = opts;

  fastify.post('/api/import', async (request, reply) => {
    const parsed = parseInt(request.body?.maxAgeDays, 10);
    const maxAgeDays = Number.isFinite(parsed) ? parsed : undefined;

    try {
      const result = await runImport(db, { maxAgeDays });
      return { ok: true, ...result };
    } catch (err) {
      if (err instanceof ImportConflictError) {
        reply.code(409);
        return { error: err.message };
      }
      throw err;
    }
  });

  fastify.get('/api/import/progress', async (request, reply) => {
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
      const parsed = parseInt(request.query.maxAgeDays, 10);
      const maxAgeDays = Number.isFinite(parsed) ? parsed : undefined;

      const result = await runImport(db, {
        maxAgeDays,
        onProgress(progress) {
          sendEvent('progress', progress);
        },
      });

      sendEvent('complete', result);
    } catch (err) {
      if (err instanceof ImportConflictError) {
        sendEvent('error', { message: err.message, conflict: true });
      } else {
        sendEvent('error', { message: err.message });
      }
    } finally {
      raw.end();
    }
  });
}
