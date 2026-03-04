/**
 * Database writer module for the import pipeline.
 * All functions accept a DatabaseSync instance as their first parameter.
 * Batch operations use manual BEGIN/COMMIT — db.transaction() does not exist
 * in node:sqlite.
 */

/**
 * Upserts a session row.
 * Uses INSERT OR REPLACE so repeated imports update existing rows.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} sessionData
 * @param {string}  sessionData.session_id
 * @param {number}  sessionData.project_id
 * @param {string}  sessionData.file_path
 * @param {number}  [sessionData.file_size]
 * @param {string}  [sessionData.file_modified_at]
 * @param {string}  [sessionData.working_branch]
 * @param {string}  [sessionData.primary_ticket]
 * @param {string}  [sessionData.summary]
 * @param {string}  [sessionData.custom_title]
 * @param {string}  [sessionData.slug]
 * @param {string}  [sessionData.first_message_at]
 * @param {string}  [sessionData.last_message_at]
 * @param {string}  [sessionData.last_updated_at]
 * @param {number}  [sessionData.message_count]
 * @param {number}  [sessionData.user_message_count]
 * @param {number}  [sessionData.assistant_message_count]
 * @param {number}  [sessionData.tool_use_count]
 * @param {number}  [sessionData.fork_count]
 * @param {number}  [sessionData.real_fork_count]
 * @param {number}  [sessionData.is_compacted]
 * @param {number}  [sessionData.has_subagents]
 */
export function upsertSession(db, sessionData) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (
      session_id,
      project_id,
      file_path,
      file_size,
      file_modified_at,
      working_branch,
      primary_ticket,
      summary,
      custom_title,
      slug,
      first_message_at,
      last_message_at,
      last_updated_at,
      message_count,
      user_message_count,
      assistant_message_count,
      tool_use_count,
      fork_count,
      real_fork_count,
      is_compacted,
      has_subagents,
      is_subagent,
      team_name,
      agent_name
    ) VALUES (
      $session_id,
      $project_id,
      $file_path,
      $file_size,
      $file_modified_at,
      $working_branch,
      $primary_ticket,
      $summary,
      $custom_title,
      $slug,
      $first_message_at,
      $last_message_at,
      $last_updated_at,
      $message_count,
      $user_message_count,
      $assistant_message_count,
      $tool_use_count,
      $fork_count,
      $real_fork_count,
      $is_compacted,
      $has_subagents,
      $is_subagent,
      $team_name,
      $agent_name
    )
  `);

  stmt.run({
    $session_id:              sessionData.session_id,
    $project_id:              sessionData.project_id,
    $file_path:               sessionData.file_path,
    $file_size:               sessionData.file_size            ?? null,
    $file_modified_at:        sessionData.file_modified_at     ?? null,
    $working_branch:          sessionData.working_branch       ?? null,
    $primary_ticket:          sessionData.primary_ticket       ?? null,
    $summary:                 sessionData.summary              ?? null,
    $custom_title:            sessionData.custom_title         ?? null,
    $slug:                    sessionData.slug                 ?? null,
    $first_message_at:        sessionData.first_message_at     ?? null,
    $last_message_at:         sessionData.last_message_at      ?? null,
    $last_updated_at:         sessionData.last_updated_at      ?? null,
    $message_count:           sessionData.message_count        ?? 0,
    $user_message_count:      sessionData.user_message_count   ?? 0,
    $assistant_message_count: sessionData.assistant_message_count ?? 0,
    $tool_use_count:          sessionData.tool_use_count       ?? 0,
    $fork_count:              sessionData.fork_count           ?? 0,
    $real_fork_count:         sessionData.real_fork_count      ?? 0,
    $is_compacted:            sessionData.is_compacted         ?? 0,
    $has_subagents:           sessionData.has_subagents        ?? 0,
    $is_subagent:             sessionData.is_subagent          ?? 0,
    $team_name:               sessionData.team_name            ?? null,
    $agent_name:              sessionData.agent_name           ?? null,
  });
}

/**
 * Batch-inserts messages for a session in a single transaction.
 * Uses INSERT OR IGNORE so duplicate (session_id, uuid) pairs are silently skipped.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} sessionId
 * @param {Array<{
 *   uuid: string,
 *   type: string,
 *   subtype?: string,
 *   timestamp: string,
 *   parent_uuid?: string,
 *   git_branch?: string,
 *   is_meta?: number,
 *   is_sidechain?: number,
 *   is_fork_branch?: number
 * }>} messages
 */
export function insertMessages(db, sessionId, messages) {
  if (!messages || messages.length === 0) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO messages (
      session_id,
      uuid,
      type,
      subtype,
      timestamp,
      parent_uuid,
      git_branch,
      is_meta,
      is_sidechain,
      is_fork_branch
    ) VALUES (
      $session_id,
      $uuid,
      $type,
      $subtype,
      $timestamp,
      $parent_uuid,
      $git_branch,
      $is_meta,
      $is_sidechain,
      $is_fork_branch
    )
  `);

  db.exec('BEGIN');
  try {
    for (const msg of messages) {
      stmt.run({
        $session_id:    sessionId,
        $uuid:          msg.uuid,
        $type:          msg.type,
        $subtype:       msg.subtype        ?? null,
        $timestamp:     msg.timestamp,
        $parent_uuid:   msg.parent_uuid    ?? null,
        $git_branch:    msg.git_branch     ?? null,
        $is_meta:       msg.is_meta        ?? 0,
        $is_sidechain:  msg.is_sidechain   ?? 0,
        $is_fork_branch: msg.is_fork_branch ?? 0,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Inserts ticket detection rows for a session.
 * Uses INSERT OR IGNORE on UNIQUE(session_id, ticket_key, source) so
 * re-importing is idempotent.
 * Sets is_primary=1 for the ticket matching primaryTicket.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} sessionId
 * @param {Array<{ticket_key: string, source: string, detected_at?: string}>} tickets
 * @param {string|null} primaryTicket  The ticket_key to mark as primary
 */
export function upsertTickets(db, sessionId, tickets, primaryTicket) {
  // Delete existing tickets for this session so re-imports reflect current scoring/denylist
  db.prepare('DELETE FROM tickets WHERE session_id = ?').run(sessionId);

  if (!tickets || tickets.length === 0) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tickets (
      session_id,
      ticket_key,
      source,
      detected_at,
      is_primary
    ) VALUES (
      $session_id,
      $ticket_key,
      $source,
      $detected_at,
      $is_primary
    )
  `);

  for (const ticket of tickets) {
    stmt.run({
      $session_id:  sessionId,
      $ticket_key:  ticket.ticket_key,
      $source:      ticket.source,
      $detected_at: ticket.detected_at ?? null,
      $is_primary:  ticket.ticket_key === primaryTicket ? 1 : 0,
    });
  }
}

/**
 * Records the import status for a file in import_log.
 * Uses INSERT OR REPLACE on UNIQUE(file_path) so re-imports update the record.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string}      filePath
 * @param {string|null} sessionId
 * @param {number}      fileSize
 * @param {string}      status          'ok', 'error', or 'skipped_old'
 * @param {string|null} errorMsg
 * @param {string|null} [firstMessageAt]  ISO timestamp of first message in file
 * @param {string|null} [lastMessageAt]   ISO timestamp of last message in file
 */
export function updateImportLog(db, filePath, sessionId, fileSize, status, errorMsg, firstMessageAt = null, lastMessageAt = null) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO import_log (
      file_path,
      session_id,
      file_size,
      status,
      error_msg,
      first_message_at,
      last_message_at
    ) VALUES (
      $file_path,
      $session_id,
      $file_size,
      $status,
      $error_msg,
      $first_message_at,
      $last_message_at
    )
  `);

  stmt.run({
    $file_path:        filePath,
    $session_id:       sessionId,
    $file_size:        fileSize,
    $status:           status,
    $error_msg:        errorMsg ?? null,
    $first_message_at: firstMessageAt,
    $last_message_at:  lastMessageAt,
  });
}

/**
 * Returns a Map of file_path → { fileSize, lastMessageAt } for all files
 * with status 'ok' or 'skipped_old'. Used by the importer to skip unchanged
 * files on re-import, and to cheaply re-skip files already known to be old.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Map<string, { fileSize: number, lastMessageAt: string|null }>}
 */
export function getImportedFileInfo(db) {
  const rows = db.prepare(
    `SELECT file_path, file_size, last_message_at
     FROM import_log
     WHERE status IN ('ok', 'skipped_old')`
  ).all();

  const map = new Map();
  for (const row of rows) {
    map.set(row.file_path, {
      fileSize: row.file_size,
      lastMessageAt: row.last_message_at ?? null,
    });
  }
  return map;
}
