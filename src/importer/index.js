/**
 * Import orchestrator — wires discovery, parser, fork detector, ticket scorer,
 * and db-writer into a complete idempotent import pipeline.
 *
 * Entry point: importAll(db, options)
 *
 * Idempotency: files are skipped if their size matches the last successful
 * import record (size-based skip). Force re-import with options.force = true.
 */

import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig, CONFIG_DIR } from '../utils/config.js';
import { discoverProjects, findTranscriptFiles, findAgentFiles } from './discovery.js';
import { parseTranscript, peekFirstTimestamp, extractContentText } from './parser.js';
import { cleanUserMessage } from '../utils/parse-command-xml.js';
import { readSessionIndex } from './session-index.js';
import { detectForks } from './fork-detector.js';
import { scoreTickets, determineWorkingBranch, TICKET_PATTERN, TICKET_PREFIX_DENYLIST, MCP_TICKET_PREFIXES } from './ticket-scorer.js';
import {
  upsertSession,
  insertMessages,
  upsertTickets,
  updateImportLog,
  getImportedFileInfo,
} from './db-writer.js';

/**
 * Extract, clean, and truncate displayable text content from a message for DB storage.
 *
 * Only user and assistant messages are stored; all others return null.
 * XML tags (slash commands, bash, skill expansions) are stripped from user messages.
 * Truncates at word boundary near 1000 chars if text exceeds 1250 chars.
 *
 * @param {object} msg - Normalized message from parseTranscript()
 * @returns {string|null}
 */
function extractMessageContent(msg) {
  if (msg.type !== 'user' && msg.type !== 'assistant') return null;

  const raw = extractContentText(msg.rawMessage);
  if (!raw || !raw.trim()) return null;

  // Strip XML tags — cleanUserMessage handles slash commands, bash, skill expansions
  const cleaned = cleanUserMessage(raw).trim();
  if (!cleaned) return null;

  // Truncate at word boundary near 1000 chars if text exceeds 1250 chars
  if (cleaned.length > 1250) {
    const spaceIdx = cleaned.lastIndexOf(' ', 1000);
    const cutIdx = spaceIdx !== -1 ? spaceIdx : 1000;
    return cleaned.slice(0, cutIdx) + '...';
  }

  return cleaned;
}

/**
 * Extract token usage data from an assistant message for DB storage.
 * Returns null for non-assistant messages (they should store NULL in all token columns).
 * Ephemeral cache tiers are nested under usage.cache_creation, not at the top level.
 *
 * @param {object} msg - Normalized message from parseTranscript()
 * @returns {{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, ephemeral_5m_input_tokens, ephemeral_1h_input_tokens }|null}
 */
function extractTokenUsage(msg) {
  if (msg.type !== 'assistant') return null;
  const usage = msg.rawMessage?.message?.usage;
  if (!usage) return null;
  return {
    input_tokens:                usage.input_tokens                              ?? null,
    output_tokens:               usage.output_tokens                             ?? null,
    cache_creation_input_tokens: usage.cache_creation_input_tokens               ?? null,
    cache_read_input_tokens:     usage.cache_read_input_tokens                   ?? null,
    ephemeral_5m_input_tokens:   usage.cache_creation?.ephemeral_5m_input_tokens ?? null,
    ephemeral_1h_input_tokens:   usage.cache_creation?.ephemeral_1h_input_tokens ?? null,
  };
}

// Worktree-based subagent project path patterns.
// Claude Code's EnterWorktree creates projects at paths like:
//   /home/user/project/.claude/worktrees/tmp-pr-review-abc123/
// These are registered in ~/.claude.json as separate projects with -tmp- in the path.
const WORKTREE_PROJECT_RE = /\/-tmp-|\/\.claude\/worktrees\//;

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

    // Git commit messages in tool_result blocks
    // Pattern: [branch hash] commit message
    const rawContent = msg.rawMessage?.message?.content;
    if (Array.isArray(rawContent)) {
      for (const block of rawContent) {
        if (block.type !== 'tool_result') continue;
        let resultText = '';
        if (typeof block.content === 'string') {
          resultText = block.content;
        } else if (Array.isArray(block.content)) {
          resultText = block.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');
        }
        if (!resultText) continue;

        const commitPattern = /\[[^\]]+\s+[0-9a-f]{7,}\]\s+(.+?)(?:\n|$)/g;
        for (const commitMatch of resultText.matchAll(commitPattern)) {
          TICKET_PATTERN.lastIndex = 0;
          for (const ticketMatch of commitMatch[1].matchAll(TICKET_PATTERN)) {
            const key = ticketMatch[0].toUpperCase();
            if (TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) continue;
            results.push({
              ticket_key: key,
              source: 'git_commit',
              detected_at: msg.timestamp,
            });
          }
        }
      }
    }
  }

  // Assistant messages: scan MCP tool_use inputs for ticket references
  if (msg.type === 'assistant') {
    const rawContent = msg.rawMessage?.message?.content;
    if (Array.isArray(rawContent)) {
      for (const block of rawContent) {
        if (block.type !== 'tool_use' || !block.name?.startsWith('mcp__')) continue;
        const parts = block.name.split('__');
        const server = parts[1] || '';
        if (!MCP_TICKET_PREFIXES.some(p => server.startsWith(p))) continue;

        const inputStr = JSON.stringify(block.input || {});
        TICKET_PATTERN.lastIndex = 0;
        for (const ticketMatch of inputStr.matchAll(TICKET_PATTERN)) {
          const key = ticketMatch[0].toUpperCase();
          if (TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) continue;
          results.push({
            ticket_key: key,
            source: 'mcp_tool',
            detected_at: msg.timestamp,
          });
        }
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
  const { verbose, isWorktreeProject = false } = options;

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

  // 4. Fork detection
  const forkData = detectForks(messages);

  // 5. Time bounds — ISO8601 strings sort lexicographically
  const timestamps = timedMessages.map(m => m.timestamp).sort();
  const firstMessageAt = timestamps.length > 0 ? timestamps[0] : null;
  const lastMessageAt  = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  // 6. Tool use count
  const toolUseCount = countToolUses(messages);

  // 7. Detect subagent
  // Pattern B: team-based subagents — identified by having teamName + agentName on
  // regular messages from the start. Team leaders and renamed sessions are NOT subagents;
  // they only get agentName via standalone "agent-name" metadata entries.
  // Pattern C: worktree-based subagent projects (-tmp- or .claude/worktrees/ in path)
  const isSubagent = data.isTeamMember || isWorktreeProject;

  // 8. Merge session index data with JSONL-parsed data
  // Priority: session-index summary > JSONL summary (JSONL never has summary in practice)
  const summaryValue = indexEntry?.summary ?? data.summary ?? null;
  // Priority: session-index firstPrompt (filtered) > JSONL-parsed firstPrompt
  const indexFirstPrompt = (indexEntry?.firstPrompt && indexEntry.firstPrompt !== 'No prompt')
    ? indexEntry.firstPrompt : null;
  const firstPromptValue = indexFirstPrompt ?? data.firstPrompt ?? null;
  // Also populate customTitle from index if available
  const customTitleValue = indexEntry?.customTitle ?? data.customTitle ?? null;

  // Scan summary/title for ticket references (session-level, not message-level)
  const summaryTexts = [summaryValue, customTitleValue].filter(Boolean);
  const summaryTickets = [];
  for (const text of summaryTexts) {
    for (const match of text.matchAll(TICKET_PATTERN)) {
      const key = match[0].toUpperCase();
      if (!TICKET_PREFIX_DENYLIST.has(key.split('-')[0])) {
        summaryTickets.push({ ticket_key: key, source: 'summary', detected_at: null });
      }
    }
  }
  const uniqueSummaryTickets = [...new Map(summaryTickets.map(t => [t.ticket_key, t])).values()];

  const primaryTicket = scoreTickets(messages, workingBranch, { summary: summaryValue, customTitle: customTitleValue });

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
  const messagesForDb = messages.map(msg => {
    const tokens = extractTokenUsage(msg);
    return {
      uuid:           msg.uuid,
      type:           msg.type,
      subtype:        msg.subtype,
      timestamp:      msg.timestamp,
      parent_uuid:    msg.parentUuid,
      git_branch:     msg.gitBranch,
      is_meta:        msg.isMeta ? 1 : 0,
      is_sidechain:   msg.isSidechain ? 1 : 0,
      is_fork_branch: forkData.forkBranchUuids.has(msg.uuid) ? 1 : 0,
      fork_branch_id: forkData.forkBranchMap.get(msg.uuid) ?? null,
      content:        extractMessageContent(msg),
      input_tokens:                tokens?.input_tokens                   ?? null,
      output_tokens:               tokens?.output_tokens                  ?? null,
      cache_creation_input_tokens: tokens?.cache_creation_input_tokens    ?? null,
      cache_read_input_tokens:     tokens?.cache_read_input_tokens        ?? null,
      ephemeral_5m_input_tokens:   tokens?.ephemeral_5m_input_tokens      ?? null,
      ephemeral_1h_input_tokens:   tokens?.ephemeral_1h_input_tokens      ?? null,
      model:                       msg.type === 'assistant' ? (msg.rawMessage?.message?.model ?? null) : null,
      duration_ms:                 msg.durationMs                         ?? null,
    };
  });
  // Filter null-timestamp messages (system metadata) — explicit rather than relying on NOT NULL constraint
  const messagesWithTimestamps = messagesForDb.filter(m => m.timestamp != null);
  insertMessages(db, file.sessionId, messagesWithTimestamps);

  // 10. Collect and upsert tickets (always call to clean up old tickets on re-import)
  const tickets = collectTickets(messages);
  tickets.push(...uniqueSummaryTickets);
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

  const importStart = Date.now();
  const config = readConfig();
  const logEnabled = config.importLog.enabled;
  const logFile = join(CONFIG_DIR, 'import.log');

  if (logEnabled) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    if (config.importLog.clearOnStart) {
      try { writeFileSync(logFile, ''); } catch (_) {}
    }
  }

  const log = (msg) => {
    if (!logEnabled) return;
    try {
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      appendFileSync(logFile, line);
    } catch (_) { /* logging should not crash imports */ }
  };

  log(`Starting import: maxAgeDays=${maxAgeDays}, force=${force}`);

  const cutoffDate = maxAgeDays != null
    ? new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  if (cutoffDate) log(`Cutoff date: ${cutoffDate}`);

  const projects     = discoverProjects();
  const importedInfo = getImportedFileInfo(db);

  log(`Discovered ${projects.length} projects, ${importedInfo.size} cached entries`);

  let filesSkipped    = 0;
  let totalMessages   = 0;
  const errors        = [];

  // --- First pass: discovery ---
  // Collect all work items so we know total file count upfront.
  const projectWork = [];

  onProgress?.({ phase: 'discovering', discovered: 0, total: projects.length, currentProject: null });

  for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
    const project = projects[projectIndex];
    const projectId = getOrCreateProject(db, project.projectPath, project.transcriptDir);
    const files = findTranscriptFiles(project.transcriptDir);
    const sessionIndex = readSessionIndex(project.transcriptDir);

    const toImport = [];
    let skippedSize = 0;
    let skippedWindow = 0;
    let skippedOld = 0;

    for (const file of files) {
      const cached = importedInfo.get(file.path);

      // Skip 1: size unchanged (existing behavior, fast path)
      if (!force && cached?.fileSize === file.size) {
        skippedSize++;
        continue;
      }

      // Skip 2: rolling window — cached lastMessageAt is before cutoff
      if (!force && cutoffDate && cached?.lastMessageAt && cached.lastMessageAt < cutoffDate) {
        skippedWindow++;
        continue;
      }

      // Skip 3: new file (no cache) — peek first timestamp
      if (!force && cutoffDate && !cached) {
        const firstTs = peekFirstTimestamp(file.path);
        if (firstTs && firstTs < cutoffDate) {
          // Record as skipped_old so subsequent imports don't re-peek (IMP-02)
          updateImportLog(db, file.path, file.sessionId, file.size, 'skipped_old', null, firstTs, firstTs);
          skippedOld++;
          continue;
        }
      }

      toImport.push(file);
    }

    const skippedCount = skippedSize + skippedWindow + skippedOld;
    filesSkipped += skippedCount;

    // Discover agent files that need importing
    const agentFiles = findAgentFiles(project.transcriptDir);
    const agentToImport = [];

    let agentsSkipped = 0;
    for (const agentFile of agentFiles) {
      const cached = importedInfo.get(agentFile.path);
      // Skip 1: size unchanged
      if (!force && cached?.fileSize === agentFile.size) { agentsSkipped++; continue; }
      // Skip 2: rolling window — cached lastMessageAt before cutoff
      if (!force && cutoffDate && cached?.lastMessageAt && cached.lastMessageAt < cutoffDate) { agentsSkipped++; continue; }
      // Skip 3: new file — peek first timestamp
      if (!force && cutoffDate && !cached) {
        const firstTs = peekFirstTimestamp(agentFile.path);
        if (firstTs && firstTs < cutoffDate) {
          updateImportLog(db, agentFile.path, agentFile.parentSessionId, agentFile.size, 'skipped_old', null, firstTs, firstTs);
          agentsSkipped++;
          continue;
        }
      }
      agentToImport.push(agentFile);
    }
    filesSkipped += agentsSkipped;

    log(`  ${project.projectPath}: ${files.length} files, ${toImport.length} to import, ${skippedCount} skipped (size=${skippedSize}, window=${skippedWindow}, old=${skippedOld}), agents: ${agentToImport.length} to import / ${agentsSkipped} skipped`);

    projectWork.push({ project, projectId, toImport, sessionIndex, agentToImport });

    onProgress?.({ phase: 'discovering', discovered: projectIndex + 1, total: projects.length, currentProject: project.projectPath });
  }

  // Calculate total files across all projects
  let totalFiles = 0;
  for (const pw of projectWork) {
    totalFiles += pw.toImport.length + pw.agentToImport.length;
  }

  let processedFiles = 0;
  let filesProcessed = 0; // Only counts successfully imported transcript files (not agents)

  const discoveryMs = Date.now() - importStart;
  log(`Discovery complete in ${discoveryMs}ms: ${totalFiles} to process, ${filesSkipped} skipped`);

  onProgress?.({ phase: 'discovered', totalFiles, totalProjects: projects.length, skipped: filesSkipped });
  onProgress?.({ phase: 'importing', processed: 0, total: totalFiles, skipped: filesSkipped, currentFile: null });

  // --- Second pass: import ---
  for (const { project, projectId, toImport, sessionIndex, agentToImport } of projectWork) {
    // Import each transcript file
    for (const file of toImport) {
      const fileStart = Date.now();
      try {
        const isWorktreeProject = WORKTREE_PROJECT_RE.test(project.projectPath);
        const result = await importFile(db, file, projectId, { verbose, isWorktreeProject }, sessionIndex);
        filesProcessed++;
        totalMessages += result.messageCount;
        const fileMs = Date.now() - fileStart;
        if (fileMs > 500) log(`  Slow file (${fileMs}ms, ${result.messageCount} msgs, ${(file.size / 1024).toFixed(0)}KB): ${file.name}`);
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
      onProgress?.({ phase: 'importing', processed: processedFiles, total: totalFiles, skipped: filesSkipped, currentFile: file.sessionId });
    }

    // Import Pattern A subagent files (tool-invoked agents)
    // Messages merge into the parent session — no new session records created.
    for (const agentFile of agentToImport) {
      try {
        const agentData = await parseTranscript(agentFile.path);
        const agentMessages = agentData.messages
          .filter(m => m.timestamp)
          .map(msg => {
            const tokens = extractTokenUsage(msg);
            return {
              uuid:           msg.uuid,
              type:           msg.type,
              subtype:        msg.subtype,
              timestamp:      msg.timestamp,
              parent_uuid:    msg.parentUuid,
              git_branch:     msg.gitBranch,
              is_meta:        msg.isMeta ? 1 : 0,
              is_sidechain:   1, // Agent messages are always sidechains
              is_fork_branch: 0,
              fork_branch_id: null, // Agent messages never have fork branches
              content:        null, // Agent sidechain messages do not store content
              input_tokens:                tokens?.input_tokens                   ?? null,
              output_tokens:               tokens?.output_tokens                  ?? null,
              cache_creation_input_tokens: tokens?.cache_creation_input_tokens    ?? null,
              cache_read_input_tokens:     tokens?.cache_read_input_tokens        ?? null,
              ephemeral_5m_input_tokens:   tokens?.ephemeral_5m_input_tokens      ?? null,
              ephemeral_1h_input_tokens:   tokens?.ephemeral_1h_input_tokens      ?? null,
              model:                       msg.type === 'assistant' ? (msg.rawMessage?.message?.model ?? null) : null,
              duration_ms:                 msg.durationMs                         ?? null,
            };
          });

        if (agentMessages.length > 0) {
          insertMessages(db, agentFile.parentSessionId, agentMessages);
        }

        const firstAt = agentMessages[0]?.timestamp ?? null;
        const lastAt = agentMessages.at(-1)?.timestamp ?? null;
        updateImportLog(db, agentFile.path, agentFile.parentSessionId, agentFile.size, 'ok', null, firstAt, lastAt);

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
      onProgress?.({ phase: 'importing', processed: processedFiles, total: totalFiles, skipped: filesSkipped, currentFile: agentFile.parentSessionId });
    }

    // Update project last_import_at after all files processed
    db.prepare(
      `UPDATE projects SET last_import_at = datetime('now') WHERE id = ?`
    ).run(projectId);
  }

  onProgress?.({ phase: 'complete', processed: processedFiles, total: totalFiles, skipped: filesSkipped, currentFile: null });

  const totalMs = Date.now() - importStart;
  log(`Import complete in ${(totalMs / 1000).toFixed(1)}s: ${filesProcessed} files, ${totalMessages} messages, ${filesSkipped} skipped, ${errors.length} errors`);

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
