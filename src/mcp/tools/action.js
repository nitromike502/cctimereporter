/**
 * MCP action tool registrations.
 *
 * Provides:
 *   registerActionTools(server, db) — registers 4 action tools
 *   cleanupMcpServer(db)            — release server lock on exit
 *
 * Tools:
 *   trigger_import   — run import pipeline, return stats or conflict error
 *   start_server     — start inline Fastify or return URL of existing server
 *   stop_server      — terminate any running cctimereporter server
 *   server_status    — report whether web server is running with URL and PID
 */

import { z } from 'zod';
import { runImport, ImportConflictError } from '../../services/import.js';
import { claimLock, releaseLock, isProcessAlive } from '../../services/coordination.js';

// Module-level state for tracking the inline Fastify instance started by this MCP process.
let _fastifyInstance = null;

/**
 * Register all 4 action tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function registerActionTools(server, db) {

  // --- Tool 1: trigger_import ---
  server.registerTool(
    'trigger_import',
    {
      description: 'Trigger a data import from Claude Code session files. Returns import stats on success or error if already running.',
      inputSchema: {
        max_age_days: z.number().int().min(1).max(365).optional().describe('Max age of sessions to import in days (default: 2)'),
      },
    },
    async ({ max_age_days }) => {
      try {
        const result = await runImport(db, { maxAgeDays: max_age_days ?? 2, source: 'mcp' });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...result }) }] };
      } catch (err) {
        if (err instanceof ImportConflictError) {
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify({ error: 'already_running', message: err.message }) }],
          };
        }
        throw err;
      }
    }
  );

  // --- Tool 2: start_server ---
  server.registerTool(
    'start_server',
    {
      description: 'Start the cctimereporter web server. Returns URL of existing server if one is running, or starts a new one.',
    },
    async () => {
      // If this MCP process already started a Fastify instance, return its URL.
      if (_fastifyInstance) {
        const port = _fastifyInstance.server.address().port;
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'already_running', url: `http://127.0.0.1:${port}` }) }] };
      }

      // Check DB lock — another process may own the server.
      const lock = db.prepare('SELECT * FROM process_locks WHERE lock_name = ?').get('server');
      if (lock && isProcessAlive(lock.pid)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'already_running', url: `http://127.0.0.1:${lock.port}`, pid: lock.pid }),
          }],
        };
      }

      // Start Fastify inline with port fallback.
      try {
        const { createServer } = await import('../../server/index.js');
        const fastify = createServer(db, {});

        const DEFAULT_PORT = 3847;
        let port = DEFAULT_PORT;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            await fastify.listen({ port, host: '127.0.0.1' });
            break;
          } catch (err) {
            if (err.code === 'EADDRINUSE' && attempt < 9) {
              port++;
              continue;
            }
            throw err;
          }
        }

        const actualPort = fastify.server.address().port;
        claimLock(db, 'server', process.pid, 'mcp', actualPort);
        _fastifyInstance = fastify;

        return { content: [{ type: 'text', text: JSON.stringify({ status: 'started', url: `http://127.0.0.1:${actualPort}` }) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: 'start_failed', message: err.message }) }],
        };
      }
    }
  );

  // --- Tool 3: stop_server ---
  server.registerTool(
    'stop_server',
    {
      description: 'Stop the cctimereporter web server. Stops any running instance regardless of how it was started.',
    },
    async () => {
      const lock = db.prepare('SELECT * FROM process_locks WHERE lock_name = ?').get('server');

      // No lock or process is dead — clean up stale lock if needed.
      if (!lock || !isProcessAlive(lock.pid)) {
        if (lock) {
          releaseLock(db, 'server', lock.pid);
        }
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'not_running' }) }] };
      }

      const wasPid = lock.pid;

      // This MCP process owns the server — close Fastify gracefully.
      if (lock.pid === process.pid) {
        if (_fastifyInstance) {
          try { await _fastifyInstance.close(); } catch (_) {}
          _fastifyInstance = null;
        }
        releaseLock(db, 'server', process.pid);
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'stopped', was_pid: wasPid }) }] };
      }

      // Another process owns the server — send SIGTERM.
      try {
        process.kill(lock.pid, 'SIGTERM');
      } catch (_) {
        // Process may already be dead — fall through to lock release.
      }

      // Brief pause to allow graceful shutdown, then release lock.
      await new Promise(resolve => setTimeout(resolve, 300));
      releaseLock(db, 'server', lock.pid);

      return { content: [{ type: 'text', text: JSON.stringify({ status: 'stopped', was_pid: wasPid }) }] };
    }
  );

  // --- Tool 4: server_status ---
  server.registerTool(
    'server_status',
    {
      description: 'Check if the cctimereporter web server is running.',
    },
    () => {
      const lock = db.prepare('SELECT * FROM process_locks WHERE lock_name = ?').get('server');

      if (lock && isProcessAlive(lock.pid)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ running: true, url: `http://127.0.0.1:${lock.port}`, pid: lock.pid, source: lock.source }),
          }],
        };
      }

      // Clean up stale lock.
      if (lock) {
        releaseLock(db, 'server', lock.pid);
      }

      return { content: [{ type: 'text', text: JSON.stringify({ running: false }) }] };
    }
  );
}

/**
 * Clean up MCP server resources on exit.
 * Closes inline Fastify instance (if started) and releases the server lock.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function cleanupMcpServer(db) {
  if (_fastifyInstance) {
    try { _fastifyInstance.server.close(); } catch (_) {}
    _fastifyInstance = null;
  }
  releaseLock(db, 'server', process.pid);
}
