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

openDatabase();

process.stdout.write('cctimereporter v0.1.0\n');
process.exit(0);
