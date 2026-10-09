// Pricing models per 1M tokens in USD (Updated 2026)
export const PRICING_MODELS = {
  // --- Anthropic Claude 5.5 Series ---
  'claude-sonnet-5-5': {
    name: 'Anthropic Claude Sonnet 5.5',
    provider: 'anthropic',
    inputBase: 2.00,
    inputCached: 0.10,
    cacheWrite: 2.50,
    minCacheTokens: 1024,
    discountPercent: 95
  },
  'claude-opus-5-5': {
    name: 'Anthropic Claude Opus 5.5',
    provider: 'anthropic',
    inputBase: 4.00,
    inputCached: 0.20,
    cacheWrite: 5.00,
    minCacheTokens: 1024,
    discountPercent: 95
  },
  'claude-haiku-5-5': {
    name: 'Anthropic Claude Haiku 5.5',
    provider: 'anthropic',
    inputBase: 0.10,
    inputCached: 0.01,
    cacheWrite: 0.125,
    minCacheTokens: 1024,
    discountPercent: 90
  },
  'claude-3-5-sonnet': {
    name: 'Anthropic Claude 3.5 Sonnet',
    provider: 'anthropic',
    inputBase: 3.00,
    inputCached: 0.30,
    cacheWrite: 3.75,
    minCacheTokens: 1024,
    discountPercent: 90
  },
  'claude-3-opus': {
    name: 'Anthropic Claude 3 Opus',
    provider: 'anthropic',
    inputBase: 15.00,
    inputCached: 1.50,
    cacheWrite: 18.75,
    minCacheTokens: 2048,
    discountPercent: 90
  },

  // --- OpenAI GPT-6 & GPT-4o Series ---
  'gpt-6-sol': {
    name: 'OpenAI GPT-6.1 Sol',
    provider: 'openai',
    inputBase: 2.00,
    inputCached: 0.10,
    cacheWrite: 2.00,
    minCacheTokens: 1024,
    discountPercent: 95
  },
  'gpt-6-astra': {
    name: 'OpenAI GPT-6 Astra',
    provider: 'openai',
    inputBase: 10.00,
    inputCached: 1.00,
    cacheWrite: 10.00,
    minCacheTokens: 1024,
    discountPercent: 90
  },
  'gpt-6-luna': {
    name: 'OpenAI GPT-6 Luna',
    provider: 'openai',
    inputBase: 0.10,
    inputCached: 0.01,
    cacheWrite: 0.10,
    minCacheTokens: 1024,
    discountPercent: 90
  },
  'gpt-4o': {
    name: 'OpenAI GPT-4o',
    provider: 'openai',
    inputBase: 2.50,
    inputCached: 1.25,
    cacheWrite: 2.50,
    minCacheTokens: 1024,
    discountPercent: 50
  },
  'gpt-4o-mini': {
    name: 'OpenAI GPT-4o-mini',
    provider: 'openai',
    inputBase: 0.15,
    inputCached: 0.075,
    cacheWrite: 0.15,
    minCacheTokens: 1024,
    discountPercent: 50
  },

  // --- DeepSeek Series ---
  'deepseek-v3': {
    name: 'DeepSeek V3',
    provider: 'deepseek',
    inputBase: 0.14,
    inputCached: 0.014,
    cacheWrite: 0.14,
    minCacheTokens: 64,
    discountPercent: 90
  },
  'deepseek-r1': {
    name: 'DeepSeek R1',
    provider: 'deepseek',
    inputBase: 0.55,
    inputCached: 0.14,
    cacheWrite: 0.55,
    minCacheTokens: 64,
    discountPercent: 75
  }
};

export function resolveModel(modelName) {
  if (!modelName) return PRICING_MODELS['claude-sonnet-5-5'];
  const lower = String(modelName).toLowerCase();

  // Exact or partial keys
  for (const [key, val] of Object.entries(PRICING_MODELS)) {
    if (lower === key || lower.includes(key)) {
      return val;
    }
  }

  // Modern heuristics
  if (lower.includes('opus') && (lower.includes('5.5') || lower.includes('5-5') || lower.includes('5'))) return PRICING_MODELS['claude-opus-5-5'];
  if (lower.includes('sonnet') && (lower.includes('5.5') || lower.includes('5-5') || lower.includes('5'))) return PRICING_MODELS['claude-sonnet-5-5'];
  if (lower.includes('haiku') && (lower.includes('5.5') || lower.includes('5-5') || lower.includes('5'))) return PRICING_MODELS['claude-haiku-5-5'];

  if (lower.includes('gpt-6') || lower.includes('sol')) return PRICING_MODELS['gpt-6-sol'];
  if (lower.includes('astra')) return PRICING_MODELS['gpt-6-astra'];
  if (lower.includes('luna')) return PRICING_MODELS['gpt-6-luna'];

  if (lower.includes('sonnet')) return PRICING_MODELS['claude-sonnet-5-5'];
  if (lower.includes('opus')) return PRICING_MODELS['claude-opus-5-5'];
  if (lower.includes('haiku')) return PRICING_MODELS['claude-haiku-5-5'];

  if (lower.includes('4o-mini')) return PRICING_MODELS['gpt-4o-mini'];
  if (lower.includes('4o')) return PRICING_MODELS['gpt-4o'];

  if (lower.includes('r1')) return PRICING_MODELS['deepseek-r1'];
  if (lower.includes('deepseek')) return PRICING_MODELS['deepseek-v3'];

  return PRICING_MODELS['claude-sonnet-5-5'];
}

export function calculateCostLeak(tokensLost, modelConfig = PRICING_MODELS['claude-sonnet-5-5']) {
  const uncachedCost = (tokensLost / 1_000_000) * modelConfig.inputBase;
  const cachedCost = (tokensLost / 1_000_000) * modelConfig.inputCached;
  const wastedPerRequest = Math.max(0, uncachedCost - cachedCost);
  
  return {
    tokensLost,
    uncachedCost,
    cachedCost,
    wastedPerRequest,
    projectedMonthlyLoss: {
      req100Day: wastedPerRequest * 100 * 30,
      req1000Day: wastedPerRequest * 1000 * 30,
      req5000Day: wastedPerRequest * 5000 * 30
    }
  };
}
