/**
 * Fork detector for Claude Code session message trees.
 *
 * Identifies fork points (parents with multiple children), classifies them
 * as progress forks (non-real) or real conversation forks, and marks all
 * secondary branch message UUIDs.
 *
 * Ported from Python PoC detect_forks() in scripts/import_transcripts.py.
 */

/**
 * Detect forks in a session's message tree.
 *
 * @param {Array<object>} messages - Messages array from parseTranscript()
 * @returns {{
 *   forkCount: number,
 *   realForkCount: number,
 *   forkBranchUuids: Set<string>,
 * }}
 */
export function detectForks(messages) {
  // Build childrenMap: parentUuid -> [childUuid, ...]
  // Build msgByUuid: uuid -> message object
  const childrenMap = new Map();
  const msgByUuid = new Map();

  for (const msg of messages) {
    const { uuid, parentUuid } = msg;
    if (uuid) {
      msgByUuid.set(uuid, msg);
    }
    if (parentUuid && uuid) {
      if (!childrenMap.has(parentUuid)) {
        childrenMap.set(parentUuid, []);
      }
      childrenMap.get(parentUuid).push(uuid);
    }
  }

  let forkCount = 0;
  let realForkCount = 0;
  const forkBranchUuids = new Set();

  // Find fork points: parents with 2+ children
  for (const [, childUuids] of childrenMap) {
    if (childUuids.length < 2) continue;

    forkCount++;

    // Classify: progress fork if all non-first children are progress/file_history_snapshot types
    const isProgressFork = childUuids.slice(1).every(childUuid => {
      const childMsg = msgByUuid.get(childUuid);
      const t = childMsg?.type;
      return t === 'progress' || t === 'file_history_snapshot';
    });

    if (isProgressFork) continue;

    // Real fork — count descendants per branch to find primary
    realForkCount++;

    // Count descendants using iterative DFS (stack-based, not recursive)
    function countDescendants(startUuid) {
      let count = 0;
      const stack = [startUuid];
      while (stack.length > 0) {
        const current = stack.pop();
        count++;
        const children = childrenMap.get(current);
        if (children) {
          for (const child of children) {
            stack.push(child);
          }
        }
      }
      return count;
    }

    // Build branch info: [uuid, descendantCount] sorted descending
    const branchInfo = childUuids.map(uuid => [uuid, countDescendants(uuid)]);
    branchInfo.sort((a, b) => b[1] - a[1]);

    // Mark all secondary branch descendants as fork branches
    for (const [childUuid] of branchInfo.slice(1)) {
      const stack = [childUuid];
      while (stack.length > 0) {
        const current = stack.pop();
        forkBranchUuids.add(current);
        const children = childrenMap.get(current);
        if (children) {
          for (const child of children) {
            stack.push(child);
          }
        }
      }
    }
  }

  return { forkCount, realForkCount, forkBranchUuids };
}
