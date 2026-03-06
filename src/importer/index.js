/**
 * Import orchestrator — wires discovery, parser, fork detector, ticket scorer,
 * and db-writer into a complete idempotent import pipeline.
 *
 * Entry point: importAll(db, options)
 *
 * Idempotency: files are skipped if their size matches the last successful
 * import record (size-based skip). Force re-import with options.force = true.
 */

import { discoverProjects, findTranscriptFiles, findAgentFiles } from './discovery.js';
import { parseTranscript, peekFirstTimestamp } from './parser.js';
import { readSessionIndex } from './session-index.js';
import { detectForks } from './fork-detector.js';
import { scoreTickets, determineWorkingBranch, TICKET_PATTERN, TICKET_PREFIX_DENYLIST } from './ticket-scorer.js';
import {
  upsertSession,
  insertMessages,
  upsertTickets,
  updateImportLog,
  getImportedFileInfo,
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
        const key = match[0].toUpperCase();
        if (TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) continue;
        results.push({
          ticket_key: key,
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
      const key = match[0].toUpperCase();
      if (TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) continue;
      results.push({
        ticket_key: key,
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
 * @param {Map}    sessionIndex - Map<sessionId, { summary, firstPrompt, customTitle }> from sessions-index.json
 * @returns {{ messageCount: number, workingBranch: string|null, primaryTicket: string|null }}
 */
async function importFile(db, file, projectId, options, sessionIndex = new Map()) {
  const { verbose } = options;

  if (verbose) {
    process.stderr.write(`  Importing ${file.sessionId.slice(0, 8)}...\n`);
  }

  // 1. Parse
  const data = await parseTranscript(file.path);
  const { messages } = data;

  // 1a. Look up session index entry for this session (may be undefined)
  const indexEntry = sessionIndex.get(file.sessionId);

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

  // 7. Detect subagent (Pattern B: team-based)
  // userType === "external" alone is NOT sufficient — team leaders also have it.
  // The agentName check distinguishes subagents from team leaders.
  const isSubagent = data.userType === 'external' && data.agentName != null;

  // 8. Merge session index data with JSONL-parsed data
  // Priority: session-index summary > JSONL summary (JSONL never has summary in practice)
  const summaryValue = indexEntry?.summary ?? data.summary ?? null;
  // Priority: session-index firstPrompt (filtered) > JSONL-parsed firstPrompt
  const indexFirstPrompt = (indexEntry?.firstPrompt && indexEntry.firstPrompt !== 'No prompt')
    ? indexEntry.firstPrompt : null;
  const firstPromptValue = indexFirstPrompt ?? data.firstPrompt ?? null;
  // Also populate customTitle from index if available
  const customTitleValue = indexEntry?.customTitle ?? data.customTitle ?? null;

  // Upsert session
  upsertSession(db, {
    session_id:              file.sessionId,
    project_id:              projectId,
    file_path:               file.path,
    file_size:               file.size,
    working_branch:          workingBranch,
    primary_ticket:          primaryTicket,
    summary:                 summaryValue,
    custom_title:            customTitleValue,
    slug:                    data.slug,
    first_prompt:            firstPromptValue,
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
    is_subagent:             isSubagent ? 1 : 0,
    team_name:               data.teamName,
    agent_name:              data.agentName,
  });

  // 9. Insert messages
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

  // 10. Collect and upsert tickets (always call to clean up old tickets on re-import)
  const tickets = collectTickets(messages);
  upsertTickets(db, file.sessionId, tickets, primaryTicket);

  // 11. Update import log (with timestamps for rolling window re-skip on subsequent runs)
  updateImportLog(db, file.path, file.sessionId, file.size, 'ok', null, firstMessageAt, lastMessageAt);

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
  const { force = false, verbose = false, maxAgeDays = 30, onProgress } = options;

  const cutoffDate = maxAgeDays != null
    ? new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const projects     = discoverProjects();
  const importedInfo = getImportedFileInfo(db);

  let filesSkipped    = 0;
  let totalMessages   = 0;
  const errors        = [];

  // --- First pass: discovery ---
  // Collect all work items so we know total file count upfront.
  const projectWork = [];

  for (const project of projects) {
    const projectId = getOrCreateProject(db, project.projectPath, project.transcriptDir);
    const files = findTranscriptFiles(project.transcriptDir);
    const sessionIndex = readSessionIndex(project.transcriptDir);

    const toImport = [];
    let skippedCount = 0;

    for (const file of files) {
      const cached = importedInfo.get(file.path);

      // Skip 1: size unchanged (existing behavior, fast path)
      if (!force && cached?.fileSize === file.size) {
        skippedCount++;
        continue;
      }

      // Skip 2: rolling window — cached lastMessageAt is before cutoff
      if (!force && cutoffDate && cached?.lastMessageAt && cached.lastMessageAt < cutoffDate) {
        skippedCount++;
        continue;
      }

      // Skip 3: new file (no cache) — peek first timestamp
      if (!force && cutoffDate && !cached) {
        const firstTs = peekFirstTimestamp(file.path);
        if (firstTs && firstTs < cutoffDate) {
          // Record as skipped_old so subsequent imports don't re-peek (IMP-02)
          updateImportLog(db, file.path, file.sessionId, file.size, 'skipped_old', null, firstTs, firstTs);
          filesSkipped++;
          continue;
        }
      }

      toImport.push(file);
    }

    filesSkipped += skippedCount;

    // Discover agent files that need importing
    const agentFiles = findAgentFiles(project.transcriptDir);
    const agentToImport = [];

    for (const agentFile of agentFiles) {
      if (!force && importedInfo.get(agentFile.path)?.fileSize === agentFile.size) continue;
      agentToImport.push(agentFile);
    }

    projectWork.push({ project, projectId, toImport, sessionIndex, agentToImport });
  }

  // Calculate total files across all projects
  let totalFiles = 0;
  for (const pw of projectWork) {
    totalFiles += pw.toImport.length + pw.agentToImport.length;
  }

  let processedFiles = 0;
  let filesProcessed = 0; // Only counts successfully imported transcript files (not agents)

  onProgress?.({ phase: 'importing', processed: 0, total: totalFiles, currentFile: null });

  // --- Second pass: import ---
  for (const { project, projectId, toImport, sessionIndex, agentToImport } of projectWork) {
    // Import each transcript file
    for (const file of toImport) {
      try {
        const result = await importFile(db, file, projectId, { verbose }, sessionIndex);
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

      processedFiles++;
      onProgress?.({ phase: 'importing', processed: processedFiles, total: totalFiles, currentFile: file.sessionId });
    }

    // Import Pattern A subagent files (tool-invoked agents)
    // Messages merge into the parent session — no new session records created.
    for (const agentFile of agentToImport) {
      try {
        const agentData = await parseTranscript(agentFile.path);
        const agentMessages = agentData.messages
          .filter(m => m.timestamp)
          .map(msg => ({
            uuid:          msg.uuid,
            type:          msg.type,
            subtype:       msg.subtype,
            timestamp:     msg.timestamp,
            parent_uuid:   msg.parentUuid,
            git_branch:    msg.gitBranch,
            is_meta:       msg.isMeta ? 1 : 0,
            is_sidechain:  1, // Agent messages are always sidechains
            is_fork_branch: 0,
          }));

        if (agentMessages.length > 0) {
          insertMessages(db, agentFile.parentSessionId, agentMessages);
        }

        updateImportLog(db, agentFile.path, agentFile.parentSessionId, agentFile.size, 'ok', null);

        if (verbose) {
          process.stderr.write(
            `  Merged ${agentMessages.length} agent messages into ${agentFile.parentSessionId.slice(0, 8)}...\n`
          );
        }
      } catch (err) {
        // Parent session may not exist yet or other errors — log and continue
        try {
          updateImportLog(db, agentFile.path, agentFile.parentSessionId, agentFile.size, 'error', err.message);
        } catch (_logErr) { /* ignore */ }

        if (verbose) {
          process.stderr.write(`  Warning: agent file ${agentFile.name}: ${err.message}\n`);
        }
      }

      processedFiles++;
      onProgress?.({ phase: 'importing', processed: processedFiles, total: totalFiles, currentFile: agentFile.parentSessionId });
    }

    // Update project last_import_at after all files processed
    db.prepare(
      `UPDATE projects SET last_import_at = datetime('now') WHERE id = ?`
    ).run(projectId);
  }

  onProgress?.({ phase: 'complete', processed: processedFiles, total: totalFiles, currentFile: null });

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
