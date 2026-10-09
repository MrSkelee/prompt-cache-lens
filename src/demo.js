import { analyzePromptCache } from './engine.js';
import { formatReport } from './visualizer.js';

export function runDemoScenarios() {
  console.log('\n\x1b[35m\x1b[1m═══════════════════════════════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[35m\x1b[1m   PROMPT-CACHE-LENS — 3 REAL-WORLD FAILURE SCENARIOS & DIAGNOSTIC SIMULATION   \x1b[0m');
  console.log('\x1b[35m\x1b[1m═══════════════════════════════════════════════════════════════════════════════════════\x1b[0m\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Dynamic ISO Timestamp in System Prompt (Claude Sonnet 5.5)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\x1b[1m[SCENARIO 1 / 3] Dynamic ISO Timestamp Injected into System Prefix\x1b[0m');
  console.log('\x1b[2mContext: Developer puts `Current time: ${new Date().toISOString()}` at the top of a 5,000-token system prompt.\x1b[0m');

  const baseDocs = 'You are an autonomous engineering assistant. Maintain strict safety protocols. '.repeat(150);

  const turn1_sys = {
    model: 'claude-sonnet-5-5',
    system: `Current time: 2026-10-09T14:30:00Z\n${baseDocs}`,
    messages: [{ role: 'user', content: 'Explain the database connection lifecycle.' }]
  };

  const turn2_sys = {
    model: 'claude-sonnet-5-5',
    system: `Current time: 2026-10-09T14:30:15Z\n${baseDocs}`,
    messages: [
      { role: 'user', content: 'Explain the database connection lifecycle.' },
      { role: 'assistant', content: 'Database connections are pooled...' },
      { role: 'user', content: 'What happens during a failover?' }
    ]
  };

  const report1 = analyzePromptCache(turn1_sys, turn2_sys);
  console.log(formatReport(report1));

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Tool Definitions Shuffled by Non-Deterministic Serialization (GPT-6.1 Sol)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[SCENARIO 2 / 3] Tool Schema Permutation & Random Python Dict Jitter\x1b[0m');
  console.log('\x1b[2mContext: 4 function tools serialized in fluctuating order between turns.\x1b[0m');

  const toolA = { name: 'bash', description: 'Executes arbitrary shell command safely', parameters: { type: 'object', properties: { cmd: { type: 'string' } } } };
  const toolB = { name: 'git_status', description: 'Checks local git status', parameters: { type: 'object', properties: {} } };
  const toolC = { name: 'read_file', description: 'Reads file contents from disk', parameters: { type: 'object', properties: { path: { type: 'string' } } } };
  const toolD = { name: 'web_search', description: 'Searches public web endpoints', parameters: { type: 'object', properties: { q: { type: 'string' } } } };

  const turn1_tools = {
    model: 'gpt-6-sol',
    system: 'You are a coding assistant. Use available tools when appropriate.',
    tools: [toolA, toolB, toolC, toolD],
    messages: [{ role: 'user', content: 'Check the git status.' }]
  };

  const turn2_tools = {
    model: 'gpt-6-sol',
    system: 'You are a coding assistant. Use available tools when appropriate.',
    tools: [toolC, toolA, toolD, toolB], // Shuffled!
    messages: [
      { role: 'user', content: 'Check the git status.' },
      { role: 'assistant', content: 'Ran git_status.' },
      { role: 'user', content: 'Now read package.json' }
    ]
  };

  const report2 = analyzePromptCache(turn1_tools, turn2_tools);
  console.log(formatReport(report2));

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Invisible Line Ending Divergence (CRLF \r\n vs LF \n) (Claude Opus 5.5)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[SCENARIO 3 / 3] Invisible CRLF (\\r\\n vs \\n) Drift & Anthropic Underflow Warning\x1b[0m');
  console.log('\x1b[2mContext: Text looks 100% identical, but Windows git checkout converted newlines to CRLF.\x1b[0m');

  const unixPrompt = 'Role: Senior Architect.\nMission: Review system reliability.\nGuideline 1: Fail fast.\nGuideline 2: Safe defaults.';
  const winPrompt = 'Role: Senior Architect.\r\nMission: Review system reliability.\r\nGuideline 1: Fail fast.\r\nGuideline 2: Safe defaults.';

  const turn1_crlf = {
    model: 'claude-opus-5-5',
    system: unixPrompt,
    messages: [{ role: 'user', content: 'Analyze architecture risk.' }]
  };

  const turn2_crlf = {
    model: 'claude-opus-5-5',
    system: winPrompt,
    messages: [
      { role: 'user', content: 'Analyze architecture risk.' },
      { role: 'assistant', content: 'System is evaluated.' },
      { role: 'user', content: 'Give mitigations.' }
    ]
  };

  const report3 = analyzePromptCache(turn1_crlf, turn2_crlf);
  console.log(formatReport(report3));
}
