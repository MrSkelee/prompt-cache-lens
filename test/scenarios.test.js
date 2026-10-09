import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePromptCache } from '../src/engine.js';
import { resolveModel, calculateCostLeak } from '../src/pricing.js';
import { tokenizeText, findLongestCommonPrefix } from '../src/tokenizer.js';

test('Tokenizer & LCP: accurately finds longest common prefix', () => {
  const textA = 'You are a helpful coding assistant. Rule 1: Clean code.';
  const textB = 'You are a helpful coding assistant. Rule 2: Fast code.';

  const tokensA = tokenizeText(textA);
  const tokensB = tokenizeText(textB);

  const lcp = findLongestCommonPrefix(tokensA, tokensB);

  assert.ok(lcp.matchedTokens > 5, 'Should match at least 6 tokens');
  assert.equal(lcp.tokenAAtBreak?.text.trim(), '1');
  assert.equal(lcp.tokenBAtBreak?.text.trim(), '2');
});

test('Scenario 1: Detects dynamic ISO timestamp in system prefix and computes cost leak', () => {
  const baseSys = 'You are an AI assistant. Follow enterprise standards. '.repeat(100);

  const turn1 = {
    model: 'claude-3-5-sonnet',
    system: `Current time: 2026-10-09T14:30:00Z\n${baseSys}`,
    messages: [{ role: 'user', content: 'Deploy the app.' }]
  };

  const turn2 = {
    model: 'claude-3-5-sonnet',
    system: `Current time: 2026-10-09T14:30:05Z\n${baseSys}`,
    messages: [
      { role: 'user', content: 'Deploy the app.' },
      { role: 'assistant', content: 'App deployed.' },
      { role: 'user', content: 'Check status.' }
    ]
  };

  const analysis = analyzePromptCache(turn1, turn2);

  assert.equal(analysis.rootCause?.code, 'DYNAMIC_TIMESTAMP_IN_PREFIX');
  assert.equal(analysis.rootCause?.severity, 'CRITICAL');
  assert.ok(analysis.divergenceTokenIndex < 25, `Should break in the timestamp prefix, was ${analysis.divergenceTokenIndex}`);
  assert.ok(analysis.costLeak.wastedPerRequest > 0, 'Should register monetary waste');
  assert.ok(analysis.rootCause.remedy.includes('Move dynamic timestamp'), 'Should recommend moving timestamp');
});

test('Scenario 2: Detects tool definition order permutation', () => {
  const toolA = { name: 'read_file', description: 'Reads file from disk' };
  const toolB = { name: 'write_file', description: 'Writes file to disk' };
  const toolC = { name: 'run_bash', description: 'Executes command' };

  const turn1 = {
    model: 'gpt-4o',
    system: 'Standard system prompt.',
    tools: [toolA, toolB, toolC],
    messages: [{ role: 'user', content: 'Read file' }]
  };

  const turn2 = {
    model: 'gpt-4o',
    system: 'Standard system prompt.',
    tools: [toolC, toolA, toolB], // Shuffled!
    messages: [
      { role: 'user', content: 'Read file' },
      { role: 'assistant', content: 'Done' },
      { role: 'user', content: 'Write file' }
    ]
  };

  const analysis = analyzePromptCache(turn1, turn2);

  assert.equal(analysis.rootCause?.code, 'TOOL_DEFINITION_ORDER_PERMUTATION');
  assert.equal(analysis.rootCause?.severity, 'HIGH');
  assert.ok(analysis.rootCause.remedy.includes('Sort tools deterministically'), 'Should recommend deterministic sorting');
});

test('Scenario 3: Detects invisible CRLF vs LF divergence and Anthropic token threshold warning', () => {
  const shortUnix = 'Line 1: System prompt.\nLine 2: Safety guidelines.';
  const shortWin = 'Line 1: System prompt.\r\nLine 2: Safety guidelines.';

  const turn1 = {
    model: 'claude-3-5-sonnet',
    system: shortUnix,
    messages: [{ role: 'user', content: 'Hi' }]
  };

  const turn2 = {
    model: 'claude-3-5-sonnet',
    system: shortWin,
    messages: [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'How are you?' }
    ]
  };

  const analysis = analyzePromptCache(turn1, turn2);

  assert.equal(analysis.rootCause?.code, 'INVISIBLE_WHITESPACE_OR_CRLF_DRIFT');
  assert.ok(analysis.rootCause.remedy.includes('\\r\\n'), 'Remedy should mention CRLF normalization');
  
  // Also check warning since prompt is under 1,024 tokens
  const hasThresholdWarning = analysis.warnings.some(w => w.code === 'CACHE_BLOCK_SIZE_UNDERFLOW');
  assert.ok(hasThresholdWarning, 'Should warn that prompt is under Anthropic 1024 token minimum cache limit');
});

test('Cache Efficiency: Perfect prefix alignment succeeds with 0 waste', () => {
  const largeSystem = 'System instructions for autonomous coding agent. '.repeat(80);

  const turn1 = {
    model: 'claude-3-5-sonnet',
    system: largeSystem,
    messages: [{ role: 'user', content: 'Write a sorting function.' }]
  };

  const turn2 = {
    model: 'claude-3-5-sonnet',
    system: largeSystem,
    messages: [
      { role: 'user', content: 'Write a sorting function.' },
      { role: 'assistant', content: 'Here is quicksort...' },
      { role: 'user', content: 'Now write unit tests.' }
    ]
  };

  const analysis = analyzePromptCache(turn1, turn2);

  assert.ok(analysis.cacheHitRate > 70, `Expected cache hit rate > 70%, got ${analysis.cacheHitRate}%`);
  assert.equal(analysis.costLeak.wastedPerRequest, 0, 'No money should be wasted on normal multi-turn extension');
});

test('Pricing Engine: correctly resolves modern model rates and discounts', () => {
  const sonnet55 = resolveModel('claude-sonnet-5.5');
  assert.equal(sonnet55.name, 'Anthropic Claude Sonnet 5.5');
  assert.equal(sonnet55.inputBase, 2.00);
  assert.equal(sonnet55.inputCached, 0.10);
  assert.equal(sonnet55.discountPercent, 95);

  const opus55 = resolveModel('claude-opus-5.5');
  assert.equal(opus55.name, 'Anthropic Claude Opus 5.5');
  assert.equal(opus55.inputBase, 4.00);
  assert.equal(opus55.inputCached, 0.20);

  const gpt6 = resolveModel('gpt-6-sol');
  assert.equal(gpt6.inputBase, 2.00);
  assert.equal(gpt6.inputCached, 0.10);
  assert.equal(gpt6.discountPercent, 95);

  const leak = calculateCostLeak(100_000, sonnet55);
  // Uncached: $0.20, Cached: $0.01 -> Wasted: $0.19
  assert.equal(leak.wastedPerRequest.toFixed(2), '0.19');
  assert.equal(leak.projectedMonthlyLoss.req100Day.toFixed(2), '570.00');
});
