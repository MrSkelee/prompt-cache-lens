import { tokenizeText, findLongestCommonPrefix } from './tokenizer.js';
import { resolveModel, calculateCostLeak } from './pricing.js';

// Canonical serialization of API payloads
export function canonicalizePayload(payload) {
  if (typeof payload === 'string') {
    return {
      rawText: payload,
      sections: [{ type: 'text', content: payload }],
      tools: [],
      hasCacheControl: false,
      tokenCount: 0
    };
  }

  if (!payload || typeof payload !== 'object') {
    return { rawText: '', sections: [], tools: [], hasCacheControl: false, tokenCount: 0 };
  }

  const sections = [];
  let rawText = '';
  let hasCacheControl = false;
  const tools = payload.tools || [];

  // 1. System Prompt
  if (payload.system) {
    let sysText = '';
    if (typeof payload.system === 'string') {
      sysText = payload.system;
    } else if (Array.isArray(payload.system)) {
      sysText = payload.system.map(part => {
        if (typeof part === 'string') return part;
        if (part?.cache_control) hasCacheControl = true;
        return part?.text || '';
      }).join('\n');
    }
    sections.push({ type: 'system', content: sysText });
    rawText += `[SYSTEM]\n${sysText}\n\n`;
  }

  // 2. Tools (Anthropic & OpenAI style)
  if (Array.isArray(tools) && tools.length > 0) {
    const serializedTools = tools.map(t => {
      if (t?.cache_control) hasCacheControl = true;
      return JSON.stringify(t);
    }).join('\n');
    sections.push({ type: 'tools', content: serializedTools, rawTools: tools });
    rawText += `[TOOLS]\n${serializedTools}\n\n`;
  }

  // 3. Messages History
  if (Array.isArray(payload.messages)) {
    for (const msg of payload.messages) {
      let contentStr = '';
      if (typeof msg.content === 'string') {
        contentStr = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentStr = msg.content.map(part => {
          if (typeof part === 'string') return part;
          if (part?.cache_control) hasCacheControl = true;
          return part?.text || JSON.stringify(part);
        }).join('\n');
      }

      if (msg?.cache_control) hasCacheControl = true;

      sections.push({ type: 'message', role: msg.role, content: contentStr });
      rawText += `[${(msg.role || 'user').toUpperCase()}]\n${contentStr}\n\n`;
    }
  }

  return {
    rawText,
    sections,
    tools,
    hasCacheControl
  };
}

export function detectRootCause(tokensA, tokensB, divergenceIndex, canonicalA, canonicalB, modelConfig) {
  const tokenA = tokensA[divergenceIndex] || null;
  const tokenB = tokensB[divergenceIndex] || null;

  const breakOffsetA = tokenA?.start ?? 0;
  const breakOffsetB = tokenB?.start ?? 0;

  // Context snippet around break point
  const snippetA = canonicalA.rawText.slice(Math.max(0, breakOffsetA - 40), breakOffsetA + 80);
  const snippetB = canonicalB.rawText.slice(Math.max(0, breakOffsetB - 40), breakOffsetB + 80);

  // Check 1: Invisible whitespace / CRLF line ending differences
  const normSnippetA = snippetA.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  const normSnippetB = snippetB.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  const isCrlfOrSpaceMismatch = (snippetA !== snippetB && normSnippetA === normSnippetB) ||
    (tokenA && tokenB && (tokenA.text === '\n' && tokenB.text === '\r\n' || tokenA.text === '\r\n' && tokenB.text === '\n')) ||
    (canonicalA.sections[0]?.type === 'system' && canonicalB.sections[0]?.type === 'system' &&
     canonicalA.sections[0].content !== canonicalB.sections[0].content &&
     canonicalA.sections[0].content.replace(/\r\n/g, '\n') === canonicalB.sections[0].content.replace(/\r\n/g, '\n'));

  if (isCrlfOrSpaceMismatch) {
    return {
      code: 'INVISIBLE_WHITESPACE_OR_CRLF_DRIFT',
      severity: 'CRITICAL',
      title: 'Invisible CRLF (\\r\\n vs \\n) or Trailing Whitespace Mismatch',
      description: 'The semantic content is 100% identical, but divergent newline formats (Windows CRLF vs Unix LF) or trailing spaces broke the byte-level cache prefix.',
      snippetA,
      snippetB,
      remedy: 'Normalize all incoming strings with `.replace(/\\r\\n/g, "\\n").trimEnd()` before sending to the model.'
    };
  }

  // Check 2: Dynamic ISO timestamp or Date in prefix
  const dateRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\b\d{4}-\d{2}-\d{2}\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\b\d{10,13}\b/i;
  const matchA = dateRegex.exec(snippetA);
  const matchB = dateRegex.exec(snippetB);
  if (matchA || matchB) {
    return {
      code: 'DYNAMIC_TIMESTAMP_IN_PREFIX',
      severity: 'CRITICAL',
      title: 'Dynamic Timestamp / Date Injected at Prefix',
      description: `A dynamic timestamp was detected near break offset (${(matchA || matchB)[0]}). Placing dynamic dates in system instructions causes every subsequent turn to suffer a 100% cache miss.`,
      snippetA,
      snippetB,
      remedy: 'Move dynamic timestamps or session metadata from system instructions to the LAST user message, or to a dedicated non-cached message suffix.'
    };
  }

  // Check 3: UUID, Nonce, or Random Token
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|nonce-[a-zA-Z0-9]+|[0-9a-f]{32,64}/i;
  const uuidMatchA = uuidRegex.exec(snippetA);
  const uuidMatchB = uuidRegex.exec(snippetB);
  if (uuidMatchA || uuidMatchB) {
    return {
      code: 'DYNAMIC_UUID_OR_NONCE_IN_PREFIX',
      severity: 'CRITICAL',
      title: 'Dynamic UUID / Nonce / Hash in Cached Prefix',
      description: `A unique identifier was detected (${(uuidMatchA || uuidMatchB)[0]}). Random request IDs or nonces in system prompts invalidate token cache across calls.`,
      snippetA,
      snippetB,
      remedy: 'Remove per-request UUIDs from system prompts, or pass request IDs via HTTP headers instead of prompt tokens.'
    };
  }

  // Check 4: Tool Definition Order Permutation or Unsorted Schema Keys
  const toolsA = canonicalA.tools || [];
  const toolsB = canonicalB.tools || [];
  if (toolsA.length > 0 && toolsB.length > 0 && toolsA.length === toolsB.length) {
    const namesA = toolsA.map(t => t.name || t.function?.name || '').filter(Boolean);
    const namesB = toolsB.map(t => t.name || t.function?.name || '').filter(Boolean);

    const setA = new Set(namesA);
    const hasSameTools = namesB.length === namesA.length && namesB.every(n => setA.has(n));

    if (hasSameTools && JSON.stringify(namesA) !== JSON.stringify(namesB)) {
      return {
        code: 'TOOL_DEFINITION_ORDER_PERMUTATION',
        severity: 'HIGH',
        title: 'Tool Definitions List Shuffled in Random Order',
        description: `Tools were sent in different orders: [${namesA.slice(0, 3).join(', ')}...] vs [${namesB.slice(0, 3).join(', ')}...]. Python dictionaries or non-deterministic serialization alter tool token ordering.`,
        snippetA: `Order A: ${namesA.join(' -> ')}`,
        snippetB: `Order B: ${namesB.join(' -> ')}`,
        remedy: 'Sort tools deterministically by name before passing to API: `tools.sort((a, b) => a.name.localeCompare(b.name))`.'
      };
    }

    // Check key order inside tool schemas
    const sortedStringify = obj => JSON.stringify(obj, Object.keys(obj).sort());
    const toolAStr = toolsA.map(sortedStringify).join('');
    const toolBStr = toolsB.map(sortedStringify).join('');
    if (toolAStr === toolBStr && JSON.stringify(toolsA) !== JSON.stringify(toolsB)) {
      return {
        code: 'UNSORTED_JSON_SCHEMA_KEYS',
        severity: 'HIGH',
        title: 'Unsorted JSON Schema Property Keys in Tools',
        description: 'Tool definitions share identical properties, but object keys are serialized in different order, altering the byte token sequence.',
        snippetA,
        snippetB,
        remedy: 'Use a deterministic JSON serializer with sorted keys (e.g. `fast-json-stable-stringify`) for all tool parameters schemas.'
      };
    }
  }

  // Check 5: Standard Multi-turn Divergence (new user turn or altered message)
  return {
    code: 'PROMPT_CONTENT_DIVERGENCE',
    severity: 'MEDIUM',
    title: 'Standard Prompt Content Divergence',
    description: 'Prompt diverged due to normal new user input or modified message history.',
    snippetA,
    snippetB,
    remedy: 'Ensure shared context (system instructions, documents, tool definitions) is strictly placed at the prefix before dynamic turn messages.'
  };
}

export function analyzePromptCache(payloadA, payloadB, options = {}) {
  const modelConfig = resolveModel(options.model || payloadB?.model || payloadA?.model);
  
  const canonicalA = canonicalizePayload(payloadA);
  const canonicalB = canonicalizePayload(payloadB);

  const tokensA = tokenizeText(canonicalA.rawText);
  const tokensB = tokenizeText(canonicalB.rawText);

  const lcp = findLongestCommonPrefix(tokensA, tokensB);

  const cachedTokens = lcp.matchedTokens;
  const totalTokensB = tokensB.length;
  const uncachedTokensB = Math.max(0, totalTokensB - cachedTokens);

  const cacheHitRate = totalTokensB > 0 ? (cachedTokens / totalTokensB) * 100 : 0;

  // Check Anthropic minimum cache threshold warning
  const warnings = [];
  if (modelConfig.provider === 'anthropic') {
    if (cachedTokens > 0 && cachedTokens < modelConfig.minCacheTokens) {
      warnings.push({
        code: 'CACHE_BLOCK_SIZE_UNDERFLOW',
        severity: 'WARNING',
        message: `Matched prefix is only ${cachedTokens} tokens. ${modelConfig.name} requires a minimum of ${modelConfig.minCacheTokens} tokens to create an ephemeral cache breakpoint! (This turn will NOT be cached by Anthropic).`
      });
    }
  }

  const rootCause = cachedTokens < totalTokensB 
    ? detectRootCause(tokensA, tokensB, lcp.divergenceIndex, canonicalA, canonicalB, modelConfig)
    : null;

  // Calculate potential cost leak
  // If the break occurred due to preventable issues (timestamp, tool shuffle, whitespace), the lost tokens could have been cached!
  const preventableTokensLost = (rootCause && ['DYNAMIC_TIMESTAMP_IN_PREFIX', 'TOOL_DEFINITION_ORDER_PERMUTATION', 'UNSORTED_JSON_SCHEMA_KEYS', 'INVISIBLE_WHITESPACE_OR_CRLF_DRIFT', 'DYNAMIC_UUID_OR_NONCE_IN_PREFIX'].includes(rootCause.code))
    ? uncachedTokensB
    : 0;

  const costLeak = calculateCostLeak(preventableTokensLost, modelConfig);

  const escapeToken = t => {
    if (!t) return null;
    return t.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  };

  return {
    model: modelConfig,
    cachedTokens,
    uncachedTokens: uncachedTokensB,
    totalTokens: totalTokensB,
    cacheHitRate: Number(cacheHitRate.toFixed(1)),
    divergenceTokenIndex: lcp.divergenceIndex,
    divergenceCharOffset: lcp.tokenBAtBreak?.start ?? lcp.charLengthB,
    rootCause,
    warnings,
    costLeak,
    tokenAAtBreak: escapeToken(lcp.tokenAAtBreak?.text),
    tokenBAtBreak: escapeToken(lcp.tokenBAtBreak?.text)
  };
}
