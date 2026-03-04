/**
 * JSONL transcript parser for Claude Code session files.
 *
 * Streams JSONL files line-by-line via node:readline, extracting messages
 * and session-level metadata. Malformed lines are skipped with a warning.
 */

import { createReadStream, openSync, readSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline';

/**
 * Parse a JSONL transcript file into structured session data.
 *
 * @param {string} filePath - Absolute path to the .jsonl file
 * @returns {Promise<{
 *   messages: Array<object>,
 *   summary: string|null,
 *   customTitle: string|null,
 *   slug: string|null,
 *   hasCompactBoundary: boolean,
 *   hasSubagents: boolean,
 * }>}
 */
export async function parseTranscript(filePath) {
  const messages = [];
  let summary = null;
  let customTitle = null;
  let slug = null;
  let hasCompactBoundary = false;
  let hasSubagents = false;
  let teamName = null;
  let agentName = null;
  let userType = null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;

    const trimmed = line.trim();
    if (!trimmed) continue;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (error) {
      process.stderr.write(
        `Warning: malformed JSONL line ${lineNum} in ${filePath}: ${error.message}\n`
      );
      continue;
    }

    // Session-level metadata extraction
    if (msg.type === 'summary' && msg.summary) {
      summary = msg.summary;
    }

    if (msg.type === 'custom-title' && msg.customTitle) {
      customTitle = msg.customTitle;
    }

    if (msg.slug && !slug) {
      slug = msg.slug;
    }

    if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
      hasCompactBoundary = true;
    }

    if (msg.isSidechain || msg.agentId) {
      hasSubagents = true;
    }

    if (!teamName && msg.teamName) {
      teamName = msg.teamName;
    }
    if (!agentName && msg.agentName) {
      agentName = msg.agentName;
    }
    if (!userType && msg.userType) {
      userType = msg.userType;
    }

    // Store normalized message object
    messages.push({
      uuid: msg.uuid || `line-${lineNum}`,
      type: msg.type,
      subtype: msg.subtype || null,
      timestamp: msg.timestamp || null,
      parentUuid: msg.parentUuid || null,
      gitBranch: msg.gitBranch || null,
      cwd: msg.cwd || null,
      version: msg.version || null,
      isMeta: msg.isMeta || false,
      isSidechain: msg.isSidechain || false,
      isCompactSummary: msg.isCompactSummary || false,
      agentId: msg.agentId || null,
      sourceToolAssistantUuid: msg.sourceToolAssistantUUID || null, // Note: uppercase UUID in source
      rawMessage: msg,
    });
  }

  return {
    messages,
    summary,
    customTitle,
    slug,
    hasCompactBoundary,
    hasSubagents,
    teamName,
    agentName,
    userType,
  };
}

/**
 * Reads the first 8 KB of a JSONL file synchronously and returns the timestamp
 * of the first JSON line, or null on any error (empty file, malformed JSON,
 * missing timestamp field, I/O error).
 *
 * This is intentionally synchronous — it is used as a cheap "should we skip
 * this file?" decision before streaming the whole file, not in hot async code.
 *
 * @param {string} filePath - Absolute path to the .jsonl file
 * @returns {string|null} - ISO timestamp string, or null
 */
export function peekFirstTimestamp(filePath) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = readSync(fd, buf, 0, 8192, 0);
    const text = buf.slice(0, bytesRead).toString('utf8');
    const newlineIdx = text.indexOf('\n');
    const firstLine = newlineIdx === -1 ? text : text.slice(0, newlineIdx);
    const trimmed = firstLine.trim();
    if (!trimmed) return null;
    const msg = JSON.parse(trimmed);
    return msg.timestamp ?? null;
  } catch (_) {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch (_) { /* ignore */ }
  }
}

/**
 * Extract plain text content from a raw message object for ticket scanning.
 *
 * @param {object} rawMsg - The full JSONL line object (rawMessage field)
 * @returns {string} - Extracted text content, or empty string if none
 */
export function extractContentText(rawMsg) {
  const content = rawMsg?.message?.content;

  if (content == null) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text')
      .map(block => block.text ?? '')
      .join('\n');
  }

  return JSON.stringify(content);
}
