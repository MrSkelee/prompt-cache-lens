// Pricing models per 1M tokens in USD
export const PRICING_MODELS = {
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
  'claude-3-haiku': {
    name: 'Anthropic Claude 3 Haiku',
    provider: 'anthropic',
    inputBase: 0.25,
    inputCached: 0.025,
    cacheWrite: 0.30,
    minCacheTokens: 2048,
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
  if (!modelName) return PRICING_MODELS['claude-3-5-sonnet'];
  const lower = String(modelName).toLowerCase();
  for (const [key, val] of Object.entries(PRICING_MODELS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return val;
    }
  }
  if (lower.includes('sonnet')) return PRICING_MODELS['claude-3-5-sonnet'];
  if (lower.includes('opus')) return PRICING_MODELS['claude-3-opus'];
  if (lower.includes('4o-mini')) return PRICING_MODELS['gpt-4o-mini'];
  if (lower.includes('4o')) return PRICING_MODELS['gpt-4o'];
  if (lower.includes('r1')) return PRICING_MODELS['deepseek-r1'];
  if (lower.includes('deepseek')) return PRICING_MODELS['deepseek-v3'];
  return PRICING_MODELS['claude-3-5-sonnet'];
}

export function calculateCostLeak(tokensLost, modelConfig = PRICING_MODELS['claude-3-5-sonnet']) {
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
