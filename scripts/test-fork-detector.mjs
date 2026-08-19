/**
 * Self-check for detectForks() — run with: node scripts/test-fork-detector.mjs
 *
 * Regression guard for the duplicate-UUID hang: Claude Code sometimes writes the
 * same message line twice (same uuid, same parentUuid). Before the fix, childrenMap
 * stored children in an array, so a duplicated line looked like a parent with two
 * children (a phantom fork), and the descendant walks had no visited set — so each
 * duplicated level doubled the number of paths, making deep chains unfinishable.
 *
 * Observed in the wild: a 35.7MB transcript with 666 duplicated edges reported 667
 * forks (only 5 real) and never completed detectForks().
 */

import assert from 'node:assert/strict';
import { detectForks } from '../src/importer/fork-detector.js';

const msg = (uuid, parentUuid, type = 'assistant') => ({ uuid, parentUuid, type });

let failures = 0;
function check(name, fn) {
  try {
    fn();
    process.stdout.write(`ok   ${name}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`FAIL ${name}\n     ${err.message}\n`);
  }
}

// A duplicated line is not a fork: same uuid listed twice under the same parent.
check('duplicated message line is not a fork', () => {
  const messages = [
    msg('root', null, 'user'),
    msg('a', 'root'),
    msg('a', 'root'), // byte-identical duplicate, as written by Claude Code
  ];
  const { forkCount, realForkCount } = detectForks(messages);
  assert.equal(forkCount, 0, `expected 0 forks, got ${forkCount}`);
  assert.equal(realForkCount, 0, `expected 0 real forks, got ${realForkCount}`);
});

// Dedup must not swallow genuine forks: two distinct non-progress children.
check('genuine fork is still detected', () => {
  const messages = [
    msg('root', null, 'user'),
    msg('a', 'root', 'user'),
    msg('b', 'root', 'user'),
  ];
  const { forkCount, realForkCount, forkBranchUuids } = detectForks(messages);
  assert.equal(forkCount, 1, `expected 1 fork, got ${forkCount}`);
  assert.equal(realForkCount, 1, `expected 1 real fork, got ${realForkCount}`);
  assert.equal(forkBranchUuids.size, 1, 'exactly one secondary branch should be marked');
});

// Progress forks stay classified as non-real.
check('progress-only branch is not a real fork', () => {
  const messages = [
    msg('root', null, 'user'),
    msg('a', 'root', 'progress'),
    msg('b', 'root', 'user'),
  ];
  const { forkCount, realForkCount } = detectForks(messages);
  assert.equal(forkCount, 1, `expected 1 fork point, got ${forkCount}`);
  assert.equal(realForkCount, 0, `expected 0 real forks, got ${realForkCount}`);
});

// The hang itself. A chain of duplicated edges costs 2^DEPTH path-walks without a
// visited set. DEPTH=25 is ~33M steps on the unfixed code (seconds, and it fails the
// time assertion) but stays terminating, so this test reports rather than hangs.
// The real-world file chained ~284 levels, i.e. 2^284.
check('deep chain of duplicated edges completes quickly', () => {
  const DEPTH = 25;
  const messages = [msg('n0', null, 'user')];
  for (let i = 1; i <= DEPTH; i++) {
    messages.push(msg(`n${i}`, `n${i - 1}`));
    messages.push(msg(`n${i}`, `n${i - 1}`)); // duplicate of the same line
  }
  // Give the chain one genuine fork at the tip so the descendant walk actually runs.
  messages.push(msg('x', `n${DEPTH}`, 'user'));
  messages.push(msg('y', `n${DEPTH}`, 'user'));

  const started = Date.now();
  const { forkCount, realForkCount } = detectForks(messages);
  const elapsedMs = Date.now() - started;

  assert.equal(forkCount, 1, `duplicated edges must not register as forks (got ${forkCount})`);
  assert.equal(realForkCount, 1, `expected the single genuine fork (got ${realForkCount})`);
  assert.ok(elapsedMs < 1000, `detectForks took ${elapsedMs}ms — exponential path walk is back`);
});

process.stdout.write(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
