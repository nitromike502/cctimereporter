/**
 * GET /api/sessions/:id/messages
 *
 * Returns the first messages of a session for preview in the UI modal.
 * Reads the original JSONL file to extract message content (not stored in DB).
 *
 * Stops at 10 user/assistant messages or the first assistant message
 * containing a tool_use block, whichever comes first.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const MAX_MESSAGES = 10;

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
 * Check if an assistant message's content contains a tool_use block.
 *
 * @param {*} content - message.content array
 * @returns {boolean}
 */
function hasToolUse(content) {
  if (!Array.isArray(content)) return false;
  return content.some(block => block.type === 'tool_use');
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
    const messages = [];

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

        const role = msg.type; // 'user' or 'assistant'

        // For assistant messages, check for tool_use before adding
        if (role === 'assistant' && hasToolUse(content)) {
          // Include any text from this message before stopping
          const text = extractText(content);
          if (text.trim()) {
            messages.push({
              role,
              content: text,
              timestamp: msg.timestamp ?? null,
            });
          }
          break;
        }

        const text = extractText(content);
        if (!text.trim()) continue;

        messages.push({
          role,
          content: text,
          timestamp: msg.timestamp ?? null,
        });

        if (messages.length >= MAX_MESSAGES) break;
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        reply.code(404);
        return { error: 'Session transcript file not found' };
      }
      throw err;
    }

    return { messages };
  });
}
