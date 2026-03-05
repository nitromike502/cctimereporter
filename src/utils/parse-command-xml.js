/**
 * Parse Claude Code slash command XML tags into human-readable text.
 *
 * Handles patterns like:
 *   <command-name>/gsd:execute-phase</command-name>
 *   <command-args>7</command-args>
 *   <command-message>gsd:execute-phase</command-message>
 *
 * @param {string} text - Raw text potentially containing command XML
 * @returns {string|null} Parsed command string like "/gsd:execute-phase 7", or null if not command XML
 */
export function parseCommandXml(text) {
  if (!text || typeof text !== 'string') return null;

  // Must contain at least one command XML tag to be relevant
  if (!/<command-(name|message)>/.test(text)) return null;

  // Extract command name (preferred) or command message as fallback
  const nameMatch = text.match(/<command-name>\s*(.*?)\s*<\/command-name>/);
  const messageMatch = text.match(/<command-message>\s*(.*?)\s*<\/command-message>/);

  let command = nameMatch?.[1] || messageMatch?.[1];
  if (!command) return null;

  // Ensure command starts with /
  if (!command.startsWith('/')) {
    command = '/' + command;
  }

  // Extract optional args
  const argsMatch = text.match(/<command-args>\s*(.*?)\s*<\/command-args>/s);
  const args = argsMatch?.[1]?.trim();

  return args ? `${command} ${args}` : command;
}
