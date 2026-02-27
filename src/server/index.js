/**
 * Server factory.
 *
 * createServer(db) returns a configured Fastify instance with all API routes
 * registered. The caller (CLI) is responsible for calling app.listen().
 */

import Fastify from 'fastify';
import { timelineRoute } from './routes/timeline.js';
import { projectsRoute } from './routes/projects.js';
import { importRoute } from './routes/import.js';

/**
 * Create and configure a Fastify server instance.
 *
 * @param {import('node:sqlite').DatabaseSync} db - Open DatabaseSync instance
 * @returns {import('fastify').FastifyInstance}
 */
export function createServer(db) {
  const app = Fastify({ logger: false });

  app.register(timelineRoute, { db });
  app.register(projectsRoute, { db });
  app.register(importRoute, { db });

  return app;
}
