/**
 * Server factory.
 *
 * createServer(db) returns a configured Fastify instance with all API routes
 * registered. The caller (CLI) is responsible for calling app.listen().
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { timelineRoute } from './routes/timeline.js';
import { projectsRoute } from './routes/projects.js';
import { importRoute } from './routes/import.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '../../dist');

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

  // Serve built Vue SPA from dist/
  app.register(fastifyStatic, {
    root: distPath,
    wildcard: false,
  });

  // SPA catch-all: any non-API, non-file request serves index.html
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html');
  });

  return app;
}
