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
 *   forkBranchMap: Map<string, string>,
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
        childrenMap.set(parentUuid, new Set());
      }
      childrenMap.get(parentUuid).add(uuid);
    }
  }

  let forkCount = 0;
  let realForkCount = 0;
  const forkBranchUuids = new Set();
  // forkBranchMap: message UUID → branch ID (first child UUID of that secondary branch).
  // Primary branch messages and non-fork messages are NOT in this map (no fork_branch_id).
  const forkBranchMap = new Map();

  // Find fork points: parents with 2+ children
  for (const [, childUuidSet] of childrenMap) {
    const childUuids = [...childUuidSet];
    if (childUuids.length < 2) continue;

    forkCount++;

    // Classify: progress fork if at least one side is entirely progress/file_history_snapshot.
    // Claude Code creates progress forks at every assistant response: assistant → [progress, user].
    // A real user fork looks like: system → [user, system] or assistant → [user, user].
    // Check each child: if it and ALL its descendants are progress/snapshot types, it's a progress branch.
    function isProgressBranch(startUuid) {
      const stack = [startUuid];
      const seen = new Set();
      while (stack.length > 0) {
        const current = stack.pop();
        if (seen.has(current)) continue;
        seen.add(current);
        const msg = msgByUuid.get(current);
        const t = msg?.type;
        if (t !== 'progress' && t !== 'file_history_snapshot') return false;
        const children = childrenMap.get(current);
        if (children) {
          for (const child of children) stack.push(child);
        }
      }
      return true;
    }

    // If removing progress-only branches leaves only 1 branch, it's a progress fork
    const nonProgressChildren = childUuids.filter(uuid => !isProgressBranch(uuid));
    if (nonProgressChildren.length <= 1) {
      // All secondary branches are progress-only — not a real user fork
      continue;
    }

    // Real fork — at least 2 non-progress branches diverge here
    realForkCount++;

    // Count descendants using iterative DFS (stack-based, not recursive)
    function countDescendants(startUuid) {
      let count = 0;
      const stack = [startUuid];
      const seen = new Set();
      while (stack.length > 0) {
        const current = stack.pop();
        if (seen.has(current)) continue;
        seen.add(current);
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

    // Build branch info from non-progress children only: [uuid, descendantCount] sorted descending
    const branchInfo = nonProgressChildren.map(uuid => [uuid, countDescendants(uuid)]);
    branchInfo.sort((a, b) => b[1] - a[1]);

    // Mark all secondary branch descendants as fork branches.
    // The branch ID is the first child UUID of that secondary branch (stable across re-imports).
    for (const [childUuid] of branchInfo.slice(1)) {
      const branchId = childUuid;
      const stack = [childUuid];
      while (stack.length > 0) {
        const current = stack.pop();
        if (forkBranchUuids.has(current)) continue;
        forkBranchUuids.add(current);
        forkBranchMap.set(current, branchId);
        const children = childrenMap.get(current);
        if (children) {
          for (const child of children) {
            stack.push(child);
          }
        }
      }
    }
  }

  return { forkCount, realForkCount, forkBranchUuids, forkBranchMap };
}
