/**
 * GET /api/projects
 *
 * Returns a flat list of all known projects with display names and last import time.
 */

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function projectsRoute(fastify, opts) {
  const { db } = opts;

  // Cache the prepared statement at registration time (inside the plugin, outside the handler)
  const stmt = db.prepare(`
    SELECT id, project_path, last_import_at
    FROM projects
    ORDER BY project_path
  `);

  fastify.get('/api/projects', async (_request, _reply) => {
    const rows = stmt.all();
    return rows.map(row => ({
      projectId: row.id,
      projectPath: row.project_path,
      displayName: row.project_path.split('/').pop(),
      lastImportAt: row.last_import_at,
    }));
  });
}
