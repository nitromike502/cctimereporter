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

/**
 * Parse task-notification XML tags into human-readable text.
 *
 * @param {string} text - Raw text potentially containing task-notification XML
 * @returns {string|null} Formatted string like "Task completed: summary", or null if not task-notification XML
 */
export function parseTaskNotification(text) {
  if (!text || typeof text !== 'string') return null;

  if (!text.includes('<task-notification>')) return null;

  const statusMatch = text.match(/<status>\s*(.*?)\s*<\/status>/);
  const summaryMatch = text.match(/<summary>\s*(.*?)\s*<\/summary>/);

  if (!statusMatch || !summaryMatch) return null;

  return `Task ${statusMatch[1]}: ${summaryMatch[1]}`;
}

/**
 * Clean a user message by replacing known XML patterns with readable text.
 *
 * Handles (in order):
 * 1. Slash command XML → "/command args"
 * 2. Task notification XML → "Task status: summary"
 * 3. Local command output → extracted stdout text
 * 4. Bash input/output → "$ command" / output text
 * 5. Skill expansion tags → stripped (objective, process, context, etc.)
 *
 * @param {string} text - Raw user message text
 * @returns {string} Cleaned text for display
 */
export function cleanUserMessage(text) {
  if (!text || typeof text !== 'string') return text;

  // 1. Slash command — return just the command string
  const cmd = parseCommandXml(text);
  if (cmd) return cmd;

  // 2. Task notification — return formatted summary
  const task = parseTaskNotification(text);
  if (task) return task;

  let cleaned = text;

  // 3. Local command stdout — extract inner text
  cleaned = cleaned.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '');
  cleaned = cleaned.replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g, '$1');

  // 4. Bash input → "$ command", bash stdout/stderr → plain output
  cleaned = cleaned.replace(/<bash-input>([\s\S]*?)<\/bash-input>/g, '$ $1');
  cleaned = cleaned.replace(/<bash-stdout>([\s\S]*?)<\/bash-stdout>/g, '$1');
  cleaned = cleaned.replace(/<bash-stderr>([\s\S]*?)<\/bash-stderr>/g, '$1');

  // 5. Skill expansion tags — strip entirely (these are long generated prompts)
  const skillTags = [
    'objective', 'context', 'process', 'success_criteria', 'execution_context',
    'offer_next', 'additional_context', 'planning_context', 'verification_context',
    'phase_context', 'milestone_context', 'project_context', 'research_type',
    'research_files', 'expected_output', 'output', 'task', 'instructions',
    'quality_gate', 'downstream_consumer', 'wave_execution', 'commit_rules',
    'deviation_rules', 'checkpoint_handling', 'critical_rules', 'anti_patterns',
    'revision', 'revision_context', 'gap_to_phase_mapping',
  ];
  for (const tag of skillTags) {
    const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g');
    cleaned = cleaned.replace(re, '');
  }

  // Collapse multiple blank lines left by stripping
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned || text;
}
