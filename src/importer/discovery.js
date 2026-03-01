/**
 * Project discovery and transcript file filtering for the import pipeline.
 *
 * Two sources of project discovery:
 *   1. ~/.claude.json `projects` property (authoritative list from Claude app)
 *   2. Filesystem scan of ~/.claude/projects/ (catches orphaned directories)
 *
 * Encoding convention (from RESEARCH.md):
 *   project path → transcript dir name: replace all '/' with '-'
 *   e.g. /home/claude/cctimereporter → -home-claude-cctimereporter
 *   Note: the encoding is lossy — do NOT attempt to decode orphaned dir names.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE_DIR = join(homedir(), '.claude');
const CLAUDE_JSON_PATH = join(homedir(), '.claude.json');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

/**
 * Encode a project path to its transcript directory name.
 * Replaces all '/' with '-'.
 *
 * @param {string} projectPath - Absolute project path, e.g. '/home/claude/foo'
 * @returns {string} - Directory name, e.g. '-home-claude-foo'
 */
function encodeProjectPath(projectPath) {
  return projectPath.replace(/\//g, '-');
}

/**
 * Discover all projects with transcript directories.
 *
 * Merges two sources:
 * - ~/.claude.json `projects` object (keys are project paths)
 * - Filesystem scan of ~/.claude/projects/ for ALL directories
 *
 * Orphaned directories (not listed in ~/.claude.json) are included with the
 * directory name used as-is for projectPath — decoding is not attempted
 * because the encoding is lossy (RESEARCH.md).
 *
 * @returns {Array<{ projectPath: string, transcriptDir: string }>}
 *   Sorted by projectPath, deduplicated by transcriptDir.
 */
export function discoverProjects() {
  if (!existsSync(PROJECTS_DIR)) {
    process.stderr.write(`Warning: projects directory not found: ${PROJECTS_DIR}\n`);
    return [];
  }

  // Map of transcriptDir (full path) → project object, for deduplication
  const byTranscriptDir = new Map();

  // Source 1: ~/.claude.json projects property
  try {
    const raw = readFileSync(CLAUDE_JSON_PATH, 'utf8');
    const config = JSON.parse(raw);
    const projects = config.projects;

    if (projects && typeof projects === 'object') {
      for (const projectPath of Object.keys(projects)) {
        const dirName = encodeProjectPath(projectPath);
        const transcriptDir = join(PROJECTS_DIR, dirName);

        if (existsSync(transcriptDir)) {
          byTranscriptDir.set(transcriptDir, { projectPath, transcriptDir });
        }
      }
    }
  } catch (err) {
    process.stderr.write(`Warning: could not read ~/.claude.json: ${err.message}\n`);
  }

  // Source 2: filesystem scan — catches orphaned directories
  try {
    const entries = readdirSync(PROJECTS_DIR);
    for (const name of entries) {
      const fullPath = join(PROJECTS_DIR, name);

      // Only include directories
      try {
        if (!statSync(fullPath).isDirectory()) continue;
      } catch (err) {
        // stat failure — skip
        continue;
      }

      if (!byTranscriptDir.has(fullPath)) {
        // Orphaned: use directory name as projectPath without decoding
        byTranscriptDir.set(fullPath, { projectPath: name, transcriptDir: fullPath });
      }
    }
  } catch (err) {
    process.stderr.write(`Warning: could not scan projects directory: ${err.message}\n`);
  }

  // Return sorted by projectPath
  return [...byTranscriptDir.values()].sort((a, b) =>
    a.projectPath.localeCompare(b.projectPath)
  );
}

// UUID pattern — 36-char hex with dashes (e.g. 68955549-b874-4966-9873-48e2853ee488)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Find tool-invoked subagent transcript files (agent-*.jsonl) inside
 * UUID-named session subdirectories.
 *
 * Structure: transcriptDir/<uuid>/subagents/agent-*.jsonl
 *
 * @param {string} transcriptDir - Full path to the project's transcript directory
 * @returns {Array<{ name: string, path: string, parentSessionId: string, size: number }>}
 */
export function findAgentFiles(transcriptDir) {
  const results = [];

  let entries;
  try {
    entries = readdirSync(transcriptDir);
  } catch (_err) {
    return results;
  }

  for (const name of entries) {
    // Only UUID-named directories
    if (!UUID_RE.test(name)) continue;

    const subagentsDir = join(transcriptDir, name, 'subagents');
    let agentEntries;
    try {
      agentEntries = readdirSync(subagentsDir);
    } catch (_err) {
      // No subagents dir — skip
      continue;
    }

    for (const agentFile of agentEntries) {
      if (!agentFile.startsWith('agent-') || !agentFile.endsWith('.jsonl')) continue;

      const fullPath = join(subagentsDir, agentFile);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch (_err) {
        continue;
      }

      if (!stat.isFile()) continue;

      results.push({
        name: agentFile,
        path: fullPath,
        parentSessionId: name,
        size: stat.size,
      });
    }
  }

  return results;
}

/**
 * Find all importable transcript files in a single project's transcript directory.
 *
 * Filters to:
 * - Files with .jsonl extension (excludes sessions-index.json, etc.)
 * - NOT starting with 'agent-' (excludes sub-agent transcript files)
 * - Actual files (not subdirectories — UUID session dirs have no extension anyway)
 *
 * @param {string} transcriptDir - Full path to the project's transcript directory
 * @returns {Array<{ name: string, path: string, sessionId: string, size: number }>}
 */
export function findTranscriptFiles(transcriptDir) {
  try {
    const entries = readdirSync(transcriptDir);
    const files = [];

    for (const name of entries) {
      // Must be a .jsonl file
      if (!name.endsWith('.jsonl')) continue;

      // Must not be an agent- prefixed file
      if (name.startsWith('agent-')) continue;

      const fullPath = join(transcriptDir, name);

      // Must be a regular file (not a directory)
      let stat;
      try {
        stat = statSync(fullPath);
      } catch (err) {
        // Can't stat — skip
        continue;
      }

      if (!stat.isFile()) continue;

      files.push({
        name,
        path: fullPath,
        sessionId: name.slice(0, -6), // strip '.jsonl'
        size: stat.size,
      });
    }

    return files;
  } catch (err) {
    process.stderr.write(`Warning: could not read transcript directory ${transcriptDir}: ${err.message}\n`);
    return [];
  }
}
