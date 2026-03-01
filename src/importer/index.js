/**
 * Import orchestrator — wires discovery, parser, fork detector, ticket scorer,
 * and db-writer into a complete idempotent import pipeline.
 *
 * Entry point: importAll(db, options)
 *
 * Idempotency: files are skipped if their size matches the last successful
 * import (size-based skip). Force re-import with options.force = true.
 */

import { discoverProjects, findTranscriptFiles } from './discovery.js';
import { parseTranscript } from './parser.js';
import { detectForks } from './fork-detector.js';
import { scoreTickets, determineWorkingBranch, TICKET_PATTERN } from './ticket-scorer.js';
import {
  upsertSession,
  insertMessages,
  upsertTickets,
  updateImportLog,
  getImportedFileSizes,
} from './db-writer.js';

// /prep-ticket slash command patterns (mirrors ticket-scorer.js internals)
const PREP_TICKET_INLINE = /\/prep-ticket\s+([a-zA-Z]{2,8}-\d+)/i;
const PREP_TICKET_XML = /<command-name>\/prep-ticket<\/command-name>.*?<command-args>([a-zA-Z]{2,8}-\d+)<\/command-args>/is;

/**
 * Collect all ticket detections from a single message.
 * Returns an array of { ticket_key, source, detected_at } objects.
 * Mirrors the Python PoC's detect_ticket_from_message().
 *
 * @param {object} msg - Normalized message from parseTranscript()
 * @returns {Array<{ ticket_key: string, source: string, detected_at: string|null }>}
 */
function detectTicketsFromMessage(msg) {
  const results = [];

  // User messages: scan for /prep-ticket and generic content mentions
  if (msg.type === 'user') {
    const content = msg.rawMessage?.message?.content;
    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = JSON.stringify(content);
    }

    if (text) {
      // /prep-ticket slash command (inline or XML format)
      const prepMatch = PREP_TICKET_INLINE.exec(text) || PREP_TICKET_XML.exec(text);
      if (prepMatch) {
        results.push({
          ticket_key: prepMatch[1].toUpperCase(),
          source: 'slash_command',
          detected_at: msg.timestamp,
        });
      }

      // Generic ticket mentions (TICKET-123 style)
      TICKET_PATTERN.lastIndex = 0;
      for (const match of text.matchAll(TICKET_PATTERN)) {
        results.push({
          ticket_key: match[0].toUpperCase(),
          source: 'content',
          detected_at: msg.timestamp,
        });
      }
    }
  }

  // All messages: scan gitBranch for ticket patterns
  if (msg.gitBranch) {
    TICKET_PATTERN.lastIndex = 0;
    for (const match of msg.gitBranch.matchAll(TICKET_PATTERN)) {
      results.push({
        ticket_key: match[0].toUpperCase(),
        source: 'branch',
        detected_at: msg.timestamp,
      });
    }
  }

  return results;
}

/**
 * Collect unique (ticket_key, source) ticket detections across all messages.
 * Deduplicates by (ticket_key + source) — preserves earliest detected_at.
 *
 * @param {Array<object>} messages - Parsed messages from parseTranscript()
 * @returns {Array<{ ticket_key: string, source: string, detected_at: string|null }>}
 */
function collectTickets(messages) {
  // Map of `${ticket_key}|${source}` → ticket object
  const seen = new Map();

  for (const msg of messages) {
    for (const detection of detectTicketsFromMessage(msg)) {
      const dedupeKey = `${detection.ticket_key}|${detection.source}`;
      if (!seen.has(dedupeKey)) {
        seen.set(dedupeKey, detection);
      }
    }
  }

  return [...seen.values()];
}

/**
 * Count tool_use blocks across all assistant messages.
 *
 * @param {Array<object>} messages - Parsed messages
 * @returns {number}
 */
function countToolUses(messages) {
  let count = 0;
  for (const msg of messages) {
    if (msg.type === 'assistant') {
      const content = msg.rawMessage?.message?.content;
      if (Array.isArray(content)) {
        count += content.filter(block => block.type === 'tool_use').length;
      }
    }
  }
  return count;
}

/**
 * Get or create a project record, returning its numeric id.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} projectPath
 * @param {string} transcriptDir
 * @returns {number} project_id
 */
function getOrCreateProject(db, projectPath, transcriptDir) {
  const existing = db.prepare(
    'SELECT id FROM projects WHERE project_path = ?'
  ).get(projectPath);

  if (existing) return existing.id;

  db.prepare(
    'INSERT INTO projects (project_path, transcript_dir) VALUES (?, ?)'
  ).run(projectPath, transcriptDir);

  return db.prepare(
    'SELECT id FROM projects WHERE project_path = ?'
  ).get(projectPath).id;
}

/**
 * Process a single transcript file: parse → detect forks → score tickets
 * → write session/messages/tickets/import_log to database.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} file        - From findTranscriptFiles()
 * @param {number} projectId
 * @param {object} options     - { force, verbose }
 * @returns {{ messageCount: number, workingBranch: string|null, primaryTicket: string|null }}
 */
async function importFile(db, file, projectId, options) {
  const { verbose } = options;

  if (verbose) {
    process.stderr.write(`  Importing ${file.sessionId.slice(0, 8)}...\n`);
  }

  // 1. Parse
  const data = await parseTranscript(file.path);
  const { messages } = data;

  // 2. Derived message sets
  const timedMessages     = messages.filter(m => m.timestamp);
  const userMessages      = timedMessages.filter(m => m.type === 'user' && !m.isMeta);
  const assistantMessages = timedMessages.filter(m => m.type === 'assistant');

  // 3. Ticket / branch detection
  const workingBranch = determineWorkingBranch(messages);
  const primaryTicket = scoreTickets(messages, workingBranch);

  // 4. Fork detection
  const forkData = detectForks(messages);

  // 5. Time bounds — ISO8601 strings sort lexicographically
  const timestamps = timedMessages.map(m => m.timestamp).sort();
  const firstMessageAt = timestamps.length > 0 ? timestamps[0] : null;
  const lastMessageAt  = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  // 6. Tool use count
  const toolUseCount = countToolUses(messages);

  // 7. Upsert session
  upsertSession(db, {
    session_id:              file.sessionId,
    project_id:              projectId,
    file_path:               file.path,
    file_size:               file.size,
    working_branch:          workingBranch,
    primary_ticket:          primaryTicket,
    summary:                 data.summary,
    custom_title:            data.customTitle,
    slug:                    data.slug,
    first_message_at:        firstMessageAt,
    last_message_at:         lastMessageAt,
    last_updated_at:         new Date().toISOString(),
    message_count:           messages.length,
    user_message_count:      userMessages.length,
    assistant_message_count: assistantMessages.length,
    tool_use_count:          toolUseCount,
    fork_count:              forkData.forkCount,
    real_fork_count:         forkData.realForkCount,
    is_compacted:            data.hasCompactBoundary ? 1 : 0,
    has_subagents:           data.hasSubagents ? 1 : 0,
  });

  // 8. Insert messages
  const messagesForDb = messages.map(msg => ({
    uuid:          msg.uuid,
    type:          msg.type,
    subtype:       msg.subtype,
    timestamp:     msg.timestamp,
    parent_uuid:   msg.parentUuid,
    git_branch:    msg.gitBranch,
    is_meta:       msg.isMeta ? 1 : 0,
    is_sidechain:  msg.isSidechain ? 1 : 0,
    is_fork_branch: forkData.forkBranchUuids.has(msg.uuid) ? 1 : 0,
  }));
  // Filter null-timestamp messages (system metadata) — explicit rather than relying on NOT NULL constraint
  const messagesWithTimestamps = messagesForDb.filter(m => m.timestamp != null);
  insertMessages(db, file.sessionId, messagesWithTimestamps);

  // 9. Collect and upsert tickets
  const tickets = collectTickets(messages);
  if (tickets.length > 0) {
    upsertTickets(db, file.sessionId, tickets, primaryTicket);
  }

  // 10. Update import log
  updateImportLog(db, file.path, file.sessionId, file.size, 'ok', null);

  if (verbose) {
    process.stderr.write(
      `  ${messages.length} messages, branch: ${workingBranch || 'none'}, ticket: ${primaryTicket || 'none'}\n`
    );
  }

  return { messageCount: messages.length, workingBranch, primaryTicket };
}

/**
 * Run the full import pipeline across all discovered projects.
 *
 * @param {import('node:sqlite').DatabaseSync} db - Open DatabaseSync instance
 * @param {{ force?: boolean, verbose?: boolean }} options
 * @returns {Promise<{
 *   projectsFound: number,
 *   filesProcessed: number,
 *   filesSkipped: number,
 *   totalMessages: number,
 *   errors: string[],
 * }>}
 */
export async function importAll(db, options = {}) {
  const { force = false, verbose = false } = options;

  const projects      = discoverProjects();
  const importedSizes = getImportedFileSizes(db);

  let filesProcessed  = 0;
  let filesSkipped    = 0;
  let totalMessages   = 0;
  const errors        = [];

  for (const project of projects) {
    // Get or create project record
    const projectId = getOrCreateProject(db, project.projectPath, project.transcriptDir);

    // Find transcript files for this project
    const files = findTranscriptFiles(project.transcriptDir);

    // Split into files to import and files to skip
    const toImport = [];
    const toSkip   = [];

    for (const file of files) {
      if (!force && importedSizes.get(file.path) === file.size) {
        toSkip.push(file);
      } else {
        toImport.push(file);
      }
    }

    filesSkipped += toSkip.length;

    // Import each file
    for (const file of toImport) {
      try {
        const result = await importFile(db, file, projectId, { verbose });
        filesProcessed++;
        totalMessages += result.messageCount;
      } catch (err) {
        const errMsg = `${file.name}: ${err.message}`;
        errors.push(errMsg);
        process.stderr.write(`Warning: import failed for ${file.path}: ${err.message}\n`);

        // Record error in import log
        try {
          updateImportLog(db, file.path, file.sessionId, file.size, 'error', err.message);
        } catch (logErr) {
          // Don't propagate log errors
        }
      }
    }

    // Update project last_import_at after all files processed
    db.prepare(
      `UPDATE projects SET last_import_at = datetime('now') WHERE id = ?`
    ).run(projectId);
  }

  if (verbose) {
    process.stderr.write(
      `Import complete: ${filesProcessed} files, ${totalMessages} messages\n`
    );
  }

  return {
    projectsFound:  projects.length,
    filesProcessed,
    filesSkipped,
    totalMessages,
    errors,
  };
}
