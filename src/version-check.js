/**
 * Node.js version guard.
 * Rejects Node versions older than 22 (when node:sqlite was unflagged in 22.13.0).
 */

export function checkNodeVersion() {
  const version = process.versions.node;
  const major = parseInt(version.split('.')[0], 10);

  if (major < 22) {
    process.stderr.write(
      `cctimereporter requires Node.js 22 or later.\n` +
      `You are running Node.js ${version}.\n` +
      `Please upgrade: https://nodejs.org/\n`
    );
    process.exit(1);
  }
}
