/**
 * Token aggregation service — business logic for token usage queries.
 *
 * Provides:
 *   createTokensService(db) → { getDayTokens, getSessionTokens }
 *
 * getDayTokens:     Returns per-session and day-total token aggregates for a given date.
 *                   Excludes sidechain (is_sidechain=1) and fork-branch (is_fork_branch=1)
 *                   messages — these are the "actual spend" totals as defined in STATE.md.
 *
 * getSessionTokens: Returns token aggregate for a single session (no date filter).
 *                   For future use by Phase 34 (CLI/MCP) and direct session queries.
 *
 * Response shape uses camelCase JSON keys matching existing API conventions.
 * NULL token data (sessions with purged transcripts) returns null fields, not zeros.
 * Cache hit rate is computed in JS (not SQL) with one decimal precision.
 */

/**
 * Convert a YYYY-MM-DD date string to UTC day boundary ISO strings.
 * Matches the same boundary logic used in timeline.js for consistent day filtering.
 *
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {{ dayStartUTC: string, dayEndUTC: string }}
 */
function dayBoundaries(date) {
  return {
    dayStartUTC: new Date(date + 'T00:00:00').toISOString(),
    dayEndUTC:   new Date(date + 'T23:59:59.999').toISOString(),
  };
}

/**
 * Compute cache hit rate as a percentage.
 * Returns one decimal precision. Returns null when no data (avoids NaN/undefined).
 *
 * Formula: cache_read / (cache_read + input) × 100
 *
 * A session with 100% cache hits (cache_read > 0, input = 0) legitimately returns 100.0.
 * A session with no token data at all (both null/0) returns null → renders as "—".
 *
 * @param {number|null} cacheRead
 * @param {number|null} input
 * @returns {number|null}
 */
function computeCacheHitRate(cacheRead, input) {
  const denom = (cacheRead ?? 0) + (input ?? 0);
  if (denom === 0) return null;
  return Math.round(((cacheRead ?? 0) / denom) * 1000) / 10;
}

/**
 * Convert a raw SQL result row to the camelCase JSON response shape.
 * Adds computed cacheHitRate field.
 *
 * @param {{ input_tokens: number|null, output_tokens: number|null, cache_creation_input_tokens: number|null, cache_read_input_tokens: number|null, total_tokens: number|null }} row
 * @returns {{ inputTokens: number|null, outputTokens: number|null, cacheCreationInputTokens: number|null, cacheReadInputTokens: number|null, totalTokens: number|null, cacheHitRate: number|null }}
 */
function enrichRow(row) {
  return {
    inputTokens:              row.input_tokens,
    outputTokens:             row.output_tokens,
    cacheCreationInputTokens: row.cache_creation_input_tokens,
    cacheReadInputTokens:     row.cache_read_input_tokens,
    totalTokens:              row.total_tokens,
    cacheHitRate:             computeCacheHitRate(row.cache_read_input_tokens, row.input_tokens),
  };
}

/**
 * Factory: create a token service bound to a database connection.
 *
 * All SQL prepared statements are created at factory time and reused across calls.
 * This follows the established performance pattern from createTimelineService().
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ getDayTokens: Function, getSessionTokens: Function }}
 */
export function createTokensService(db) {
  // Day total: aggregate all token columns for messages in a UTC time range.
  // Returns a single row (no GROUP BY). SUM columns return NULL if no matching rows.
  // total_tokens uses COALESCE to avoid NULL propagation in arithmetic.
  const dayTotalStmt = db.prepare(`
    SELECT
      SUM(m.input_tokens)                                        AS input_tokens,
      SUM(m.output_tokens)                                       AS output_tokens,
      SUM(m.cache_creation_input_tokens)                         AS cache_creation_input_tokens,
      SUM(m.cache_read_input_tokens)                             AS cache_read_input_tokens,
      SUM(COALESCE(m.input_tokens, 0)
        + COALESCE(m.output_tokens, 0)
        + COALESCE(m.cache_creation_input_tokens, 0)
        + COALESCE(m.cache_read_input_tokens, 0))                AS total_tokens
    FROM messages m
    WHERE m.type = 'assistant'
      AND m.is_sidechain = 0
      AND m.is_fork_branch = 0
      AND m.timestamp >= ?
      AND m.timestamp <  ?
  `);

  // Per-session aggregation for a day range: one row per session.
  // JOINs sessions to get session_id (messages has session_id directly,
  // but the JOIN confirms the session exists and is addressable by sessionId).
  // Uses timestamp filter on messages (not session start/end) for precision.
  const perSessionStmt = db.prepare(`
    SELECT
      m.session_id,
      SUM(m.input_tokens)                                        AS input_tokens,
      SUM(m.output_tokens)                                       AS output_tokens,
      SUM(m.cache_creation_input_tokens)                         AS cache_creation_input_tokens,
      SUM(m.cache_read_input_tokens)                             AS cache_read_input_tokens,
      SUM(COALESCE(m.input_tokens, 0)
        + COALESCE(m.output_tokens, 0)
        + COALESCE(m.cache_creation_input_tokens, 0)
        + COALESCE(m.cache_read_input_tokens, 0))                AS total_tokens
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    WHERE m.type = 'assistant'
      AND m.is_sidechain = 0
      AND m.is_fork_branch = 0
      AND m.timestamp >= ?
      AND m.timestamp <  ?
    GROUP BY m.session_id
  `);

  // Single-session aggregation (no date filter).
  // Used by getSessionTokens() for future Phase 34/35 per-session detail queries.
  const singleSessionStmt = db.prepare(`
    SELECT
      SUM(m.input_tokens)                                        AS input_tokens,
      SUM(m.output_tokens)                                       AS output_tokens,
      SUM(m.cache_creation_input_tokens)                         AS cache_creation_input_tokens,
      SUM(m.cache_read_input_tokens)                             AS cache_read_input_tokens,
      SUM(COALESCE(m.input_tokens, 0)
        + COALESCE(m.output_tokens, 0)
        + COALESCE(m.cache_creation_input_tokens, 0)
        + COALESCE(m.cache_read_input_tokens, 0))                AS total_tokens
    FROM messages m
    WHERE m.session_id = ?
      AND m.type = 'assistant'
      AND m.is_sidechain = 0
      AND m.is_fork_branch = 0
  `);

  /**
   * Get per-session and day-total token aggregates for a given date.
   *
   * Sessions with no token data (purged transcripts, or sessions not yet re-imported
   * after schema v10 migration) will have null token fields in the response.
   *
   * @param {string} date - 'YYYY-MM-DD'
   * @returns {{
   *   date: string,
   *   dayTotal: { inputTokens: number|null, outputTokens: number|null, cacheCreationInputTokens: number|null, cacheReadInputTokens: number|null, totalTokens: number|null, cacheHitRate: number|null },
   *   sessions: Array<{ sessionId: string, inputTokens: number|null, outputTokens: number|null, cacheCreationInputTokens: number|null, cacheReadInputTokens: number|null, totalTokens: number|null, cacheHitRate: number|null }>
   * }}
   */
  function getDayTokens(date) {
    const { dayStartUTC, dayEndUTC } = dayBoundaries(date);

    const dayRow = dayTotalStmt.get(dayStartUTC, dayEndUTC);
    const sessionRows = perSessionStmt.all(dayStartUTC, dayEndUTC);

    return {
      date,
      dayTotal: enrichRow(dayRow),
      sessions: sessionRows.map(r => ({
        sessionId: r.session_id,
        ...enrichRow(r),
      })),
    };
  }

  /**
   * Get token aggregate for a single session (lifetime total, no date filter).
   *
   * Returns null if no rows found (session doesn't exist or has no assistant messages).
   * Returns enriched row with null token fields if session exists but has no token data.
   *
   * @param {string} sessionId
   * @returns {{ sessionId: string, inputTokens: number|null, outputTokens: number|null, cacheCreationInputTokens: number|null, cacheReadInputTokens: number|null, totalTokens: number|null, cacheHitRate: number|null } | null}
   */
  function getSessionTokens(sessionId) {
    const row = singleSessionStmt.get(sessionId);
    // Aggregate queries always return exactly one row (even for non-existent sessions).
    // When the session doesn't exist or has no qualifying messages, all columns are null.
    if (!row || (row.input_tokens === null && row.output_tokens === null &&
                 row.cache_creation_input_tokens === null && row.cache_read_input_tokens === null)) {
      return null;
    }
    return { sessionId, ...enrichRow(row) };
  }

  return { getDayTokens, getSessionTokens };
}
