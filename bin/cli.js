#!/usr/bin/env node

// Version check MUST run before any node:sqlite imports.
// ESM static imports are hoisted, so we do the version check inline here
// using only process.versions.node (no import needed), then use dynamic
// await import() for everything else.
const _nodeVersion = process.versions.node;
const _nodeMajor = parseInt(_nodeVersion.split('.')[0], 10);
if (_nodeMajor < 22) {
  process.stderr.write(
    `cctimereporter requires Node.js 22 or later.\n` +
    `You are running Node.js ${_nodeVersion}.\n` +
    `Please upgrade: https://nodejs.org/\n`
  );
  process.exit(1);
}

// Node 22+ confirmed — safe to import node:sqlite-dependent modules.
const { openDatabase } = await import('../src/db/index.js');
const { createServer } = await import('../src/server/index.js');
const { spawn } = await import('node:child_process');

// Open the database (creates and migrates if needed).
const db = openDatabase();

// Create and start the Fastify server with port fallback.
const DEFAULT_PORT = 3847;
const fastify = createServer(db);

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
    process.stderr.write(`Failed to start server: ${err.message}\n`);
    db.close();
    process.exit(1);
  }
}

const actualPort = fastify.server.address().port;
const url = `http://127.0.0.1:${actualPort}`;
process.stdout.write(`cctimereporter running at ${url}\nPress Ctrl+C to stop.\n`);

// Open browser to today's timeline (best-effort — URL is already printed).
const today = new Date().toISOString().slice(0, 10);
const browserUrl = `${url}/timeline?date=${today}`;

const cmd = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32'  ? 'cmd'
          : 'xdg-open';
const args = process.platform === 'win32' ? ['/c', 'start', '', browserUrl] : [browserUrl];

try {
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
} catch (_) {
  // Browser open is best-effort — URL is already printed to stdout.
}

// Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    process.stdout.write('\ncctimereporter stopped.\n');
    try { await fastify.close(); } catch (_) {}
    try { db.close(); } catch (_) {}
    process.exit(0);
  });
}
