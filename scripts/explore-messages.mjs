import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const filePath = process.argv[2];
if (!filePath) { console.log('Usage: node scripts/explore-messages.mjs <jsonl-path>'); process.exit(1); }

const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
const msgs = [];

for await (const line of rl) {
  try {
    const m = JSON.parse(line.trim());
    if (!m.type || m.isMeta || m.isSidechain || m.isCompactSummary) continue;
    const content = m.message?.content;
    if (!content) continue;
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: content }];
    const textParts = blocks.filter(b => b.type === 'text').map(b => b.text || '').join(' ').trim();
    const toolUses = blocks.filter(b => b.type === 'tool_use').map(b => b.name || '?');
    const trCount = blocks.filter(b => b.type === 'tool_result').length;
    msgs.push({ role: m.type, textLen: textParts.length, textPreview: textParts.slice(0, 120), toolUses, trCount });
  } catch {}
}

console.log('Total conversation messages:', msgs.length);
console.log('');

function printMsg(m, idx) {
  const tools = m.toolUses.length ? ' | tools: ' + m.toolUses.join(', ') : '';
  const results = m.trCount ? ' | tool_results: ' + m.trCount : '';
  console.log(`${idx}. [${m.role}] ${m.textLen}ch${tools}${results}`);
  if (m.textPreview) console.log('   ' + m.textPreview);
}

console.log('--- FIRST 5 ---');
msgs.slice(0, 5).forEach((m, i) => printMsg(m, i + 1));

console.log('');
console.log('--- LAST 5 ---');
const start = Math.max(0, msgs.length - 5);
msgs.slice(-5).forEach((m, i) => printMsg(m, start + i + 1));
