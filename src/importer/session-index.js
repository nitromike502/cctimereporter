/**
 * Session index reader for Claude Code projects.
 * Reads sessions-index.json from a project's transcriptDir and returns a
 * Map<sessionId, { summary, firstPrompt, customTitle }> for O(1) lookup.
 *
 * Returns an empty Map if the file is absent, unreadable, or malformed.
 * Most projects won't have this file — only those with session summaries generated
 * (e.g., via /resume or when Claude Code generates session summaries).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read sessions-index.json from a project's transcriptDir.
 * Returns Map<sessionId, { summary, firstPrompt, customTitle }>.
 * Returns empty Map if file absent, unreadable, or malformed.
 *
 * The "No prompt" sentinel value in firstPrompt is filtered to null —
 * it indicates a session had no user message (e.g., slash command sessions).
 *
 * @param {string} transcriptDir - Full path to project transcript directory
 * @returns {Map<string, { summary: string|null, firstPrompt: string|null, customTitle: string|null }>}
 */
export function readSessionIndex(transcriptDir) {
  const indexPath = join(transcriptDir, 'sessions-index.json');
  if (!existsSync(indexPath)) return new Map();

  let data;
  try {
    const raw = readFileSync(indexPath, 'utf8');
    data = JSON.parse(raw);
  } catch (_err) {
    return new Map();
  }

  const entries = data?.entries;
  if (!Array.isArray(entries)) return new Map();

  const map = new Map();
  for (const entry of entries) {
    if (!entry.sessionId) continue;
    map.set(entry.sessionId, {
      summary:     entry.summary     ?? null,
      // Filter sentinel value — "No prompt" means absent (session had no user message)
      firstPrompt: (entry.firstPrompt && entry.firstPrompt !== 'No prompt')
        ? entry.firstPrompt
        : null,
      customTitle: entry.customTitle ?? null,
    });
  }
  return map;
}
