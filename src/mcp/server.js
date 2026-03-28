/**
 * MCP server factory — creates and starts a stdio MCP server.
 *
 * Provides:
 *   startMcpServer(db) — registers all tools and connects to stdio transport
 *
 * Called by bin/cli.js when --mcp flag is detected.
 * All stderr output is suppressed in MCP mode (stdio is owned by the protocol).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerQueryTools } from './tools/query.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

/**
 * Start the MCP server with stdio transport.
 * Registers all available tools and blocks until stdin closes.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 */
export async function startMcpServer(db) {
  const server = new McpServer({
    name: 'cctimereporter',
    version: pkg.version,
  });

  // Register query tools (always available)
  registerQueryTools(server, db);

  // Register action tools (Plan 02 — skip gracefully if not yet created)
  try {
    const { registerActionTools } = await import('./tools/action.js');
    registerActionTools(server, db);
  } catch (_) {
    // action.js not yet created — continue with query tools only
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Exit when stdin closes (MCP host disconnects)
  process.stdin.on('close', () => {
    try { db.close(); } catch (_) {}
    process.exit(0);
  });

  // Ensure DB is closed on any exit
  process.on('exit', () => {
    try { db.close(); } catch (_) {}
  });
}
