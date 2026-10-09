// Zero-dependency BPE-aligned heuristic tokenizer
// Mirrors OpenAI cl100k / Anthropic BPE token boundary behavior

const BPE_SPLIT_REGEX = /('s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+)/gu;

export function tokenizeText(text) {
  if (typeof text !== 'string') text = String(text ?? '');
  if (!text) return [];

  const tokens = [];
  let match;
  const regex = new RegExp(BPE_SPLIT_REGEX);

  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // Fallback if regex missed anything
  if (tokens.length === 0 && text.length > 0) {
    return [{ text, start: 0, end: text.length }];
  }

  return tokens;
}

export function estimateTokenCount(text) {
  return tokenizeText(text).length;
}

// Computes the Longest Common Prefix (LCP) across two token arrays
export function findLongestCommonPrefix(tokensA, tokensB) {
  let matchedTokens = 0;
  let charLengthA = 0;
  let charLengthB = 0;

  const minLen = Math.min(tokensA.length, tokensB.length);

  for (let i = 0; i < minLen; i++) {
    if (tokensA[i].text === tokensB[i].text) {
      matchedTokens++;
      charLengthA += tokensA[i].text.length;
      charLengthB += tokensB[i].text.length;
    } else {
      break;
    }
  }

  return {
    matchedTokens,
    totalTokensA: tokensA.length,
    totalTokensB: tokensB.length,
    charLengthA,
    charLengthB,
    divergenceIndex: matchedTokens,
    tokenAAtBreak: tokensA[matchedTokens] || null,
    tokenBAtBreak: tokensB[matchedTokens] || null
  };
}
