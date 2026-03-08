/**
 * GET /api/sessions/:id/messages
 *
 * Returns the first 5 and last 5 text-bearing messages of a session for
 * preview in the UI modal. Skips tool-only messages (no visible text).
 * Returns both groups plus a count of skipped messages in between.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const HEAD_COUNT = 5;
const TAIL_COUNT = 5;

/**
 * Extract plain text from a message's content field.
 * Content can be a string or an array of content blocks.
 *
 * @param {*} content - message.content value
 * @returns {string}
 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('\n');
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('node:sqlite').DatabaseSync }} opts
 */
export async function messagesRoute(fastify, opts) {
  const { db } = opts;

  const sessionStmt = db.prepare(
    'SELECT file_path FROM sessions WHERE session_id = ?'
  );

  fastify.get('/api/sessions/:id/messages', async (request, reply) => {
    const sessionId = request.params.id;

    const row = sessionStmt.get(sessionId);
    if (!row) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const filePath = row.file_path;
    const allTextMessages = [];

    try {
      const rl = createInterface({
        input: createReadStream(filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let msg;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          continue;
        }

        // Only user and assistant messages
        if (msg.type !== 'user' && msg.type !== 'assistant') continue;

        // Skip meta, sidechain, compact summary messages
        if (msg.isMeta || msg.isSidechain || msg.isCompactSummary) continue;

        const content = msg.message?.content;
        if (content == null) continue;

        const text = extractText(content);
        if (!text.trim()) continue;

        allTextMessages.push({
          role: msg.type,
          content: text,
          timestamp: msg.timestamp ?? null,
        });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        reply.code(404);
        return { error: 'Session transcript file not found' };
      }
      throw err;
    }

    const total = allTextMessages.length;

    // If 10 or fewer, return all as a single list (no split needed)
    if (total <= HEAD_COUNT + TAIL_COUNT) {
      return { messages: allTextMessages, totalCount: total, skipped: 0 };
    }

    // Otherwise, return first N and last N with skip count
    const first = allTextMessages.slice(0, HEAD_COUNT);
    const last = allTextMessages.slice(-TAIL_COUNT);
    const skipped = total - HEAD_COUNT - TAIL_COUNT;

    return { messages: [...first, ...last], totalCount: total, skipped };
  });
}
