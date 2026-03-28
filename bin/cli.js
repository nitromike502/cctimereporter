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
// Read version from package.json without a static import (static imports are hoisted).
const { readFileSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const { join, dirname } = await import('node:path');

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const { Command } = await import('commander');
const { openDatabase } = await import('../src/db/index.js');
const { readConfig, writeConfig } = await import('../src/utils/config.js');
const { summaryCommand } = await import('../src/cli/commands/summary.js');
const { sessionsCommand } = await import('../src/cli/commands/sessions.js');
const { importCommand } = await import('../src/cli/commands/import.js');

// Handle --debug-import flag BEFORE Commander parses argv.
// Register it with Commander below so it doesn't error, but handle
// the actual logic here to match the original early-exit behavior.
const debugImportIdx = process.argv.indexOf('--debug-import');
if (debugImportIdx !== -1) {
  const config = readConfig();
  const arg = process.argv[debugImportIdx + 1];
  if (arg === 'on') {
    config.importLog.enabled = true;
    writeConfig(config);
    process.stdout.write(`Import debug logging enabled.\n`);
    process.stdout.write(`Config: ~/.cctimereporter/config.json\n`);
    process.stdout.write(`Log file: ~/.cctimereporter/import.log\n`);
  } else if (arg === 'off') {
    config.importLog.enabled = false;
    writeConfig(config);
    process.stdout.write(`Import debug logging disabled.\n`);
    process.stdout.write(`Config: ~/.cctimereporter/config.json\n`);
  } else {
    process.stdout.write(`Import debug logging is currently ${config.importLog.enabled ? 'enabled' : 'disabled'}.\n`);
    process.stdout.write(`Config: ~/.cctimereporter/config.json\n`);
    if (config.importLog.enabled) {
      process.stdout.write(`Log file: ~/.cctimereporter/import.log\n`);
    }
  }
  process.exit(0);
}

// Open the database (creates and migrates if needed).
const { db, migrated } = openDatabase();

// Ensure DB is closed on normal process exit (CLI subcommands exit naturally
// after their action completes; signal handlers in serve command handle SIGINT/SIGTERM).
process.on('exit', () => { try { db.close(); } catch (_) {} });

// Build Commander program.
const program = new Command();
program
  .name('cctimereporter')
  .description('Visual timeline of Claude Code sessions')
  .version(pkg.version);

// Register --debug-import as a program-level option so Commander does not
// error when it appears in argv (actual handling is done above, before parseAsync).
program.option('--debug-import [on_off]', 'Enable/disable import debug logging');

// Register CLI subcommands.
program.addCommand(summaryCommand(db));
program.addCommand(sessionsCommand(db));
program.addCommand(importCommand(db));

// Default serve command — starts the web server and opens the browser.
// All server-only dependencies are loaded inside the action handler so
// that CLI subcommands do not pay the Fastify startup cost.
const serve = new Command('serve')
  .description('Start web server and open browser (default)');

serve.action(async () => {
  const { createServer } = await import('../src/server/index.js');
  const { spawn } = await import('node:child_process');
  const { claimLock, releaseLock } = await import('../src/services/coordination.js');

  // Create and start the Fastify server with port fallback.
  const DEFAULT_PORT = 3847;
  const fastify = createServer(db, { migrated });

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

  // Claim the server lock — detect if another cctimereporter instance is already running.
  const lockResult = claimLock(db, 'server', process.pid, 'web', actualPort);
  if (!lockResult.claimed) {
    const ownerUrl = `http://127.0.0.1:${lockResult.owner.port}`;
    process.stdout.write(`Server already running at ${ownerUrl} (PID ${lockResult.owner.pid})\n`);
    try { await fastify.close(); } catch (_) {}
    try { db.close(); } catch (_) {}
    process.exit(0);
  }

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
      releaseLock(db, 'server', process.pid);
      try { await fastify.close(); } catch (_) {}
      try { db.close(); } catch (_) {}
      process.exit(0);
    });
  }
});

program.addCommand(serve, { isDefault: true });

await program.parseAsync(process.argv);
