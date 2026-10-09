// Terminal ANSI formatter for prompt-cache-lens

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const UNDERLINE = '\x1b[4m';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

const BG_RED = '\x1b[41m';
const BG_GREEN = '\x1b[42m';
const BG_YELLOW = '\x1b[43m';

export function renderProgressBar(percentage, width = 30) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = `${GREEN}${'█'.repeat(filled)}${DIM}${RED}${'░'.repeat(empty)}${RESET}`;
  return `${bar} ${BOLD}${percentage}%${RESET}`;
}

export function formatReport(analysis) {
  const { model, cachedTokens, uncachedTokens, totalTokens, cacheHitRate, rootCause, warnings, costLeak, divergenceTokenIndex, tokenAAtBreak, tokenBAtBreak } = analysis;

  const lines = [];

  // Header Banner
  lines.push('');
  lines.push(`${CYAN}${BOLD}⚡ PROMPT-CACHE-LENS — Invalidation & Cost Leak Diagnostic${RESET}`);
  lines.push(`${DIM}Model Target: ${BOLD}${model.name}${RESET} ${DIM}(${model.provider.toUpperCase()} | Base: $${model.inputBase}/M | Cached: $${model.inputCached}/M)${RESET}`);
  lines.push(`${DIM}────────────────────────────────────────────────────────────────────────${RESET}`);

  // Cache Meter
  lines.push(`${BOLD}Cache Hit Ratio:${RESET}  ${renderProgressBar(cacheHitRate)}`);
  lines.push(`${BOLD}Token Metrics:${RESET}    ${GREEN}${cachedTokens.toLocaleString()} cached${RESET} ${DIM}|${RESET} ${RED}${uncachedTokens.toLocaleString()} uncached / recomputed${RESET} ${DIM}|${RESET} ${BOLD}${totalTokens.toLocaleString()} total${RESET}`);

  // Warnings (e.g. Anthropic min threshold)
  if (warnings && warnings.length > 0) {
    for (const w of warnings) {
      lines.push('');
      lines.push(`${YELLOW}${BOLD}⚠️  THRESHOLD WARNING: ${w.message}${RESET}`);
    }
  }

  // Root Cause Diagnosis Box
  if (rootCause) {
    lines.push('');
    const severityColor = rootCause.severity === 'CRITICAL' ? `${BG_RED}${WHITE}${BOLD}` : `${BG_YELLOW}${WHITE}${BOLD}`;
    lines.push(`${severityColor} ROOT CAUSE: ${rootCause.title} ${RESET}`);
    lines.push(`${BOLD}Severity:${RESET}        ${rootCause.severity === 'CRITICAL' ? RED + 'CRITICAL' : YELLOW + 'HIGH'}${RESET}`);
    lines.push(`${BOLD}Break Point:${RESET}     Token index ${BOLD}#${divergenceTokenIndex}${RESET}`);
    lines.push(`${BOLD}Token Mismatch:${RESET}  Previous: ${GREEN}"${tokenAAtBreak || '<EOF>'}"${RESET} vs Current: ${RED}${UNDERLINE}"${tokenBAtBreak || '<EOF>'}"${RESET}`);
    lines.push(`${BOLD}Details:${RESET}         ${rootCause.description}`);

    if (rootCause.snippetA && rootCause.snippetB) {
      lines.push('');
      lines.push(`${BOLD}Diff Inspection Snapshot:${RESET}`);
      lines.push(`  ${DIM}Prev [turn N-1]:${RESET} ${GREEN}${rootCause.snippetA.trim()}${RESET}`);
      lines.push(`  ${DIM}Curr [turn N  ]:${RESET} ${RED}${rootCause.snippetB.trim()}${RESET}`);
    }

    lines.push('');
    lines.push(`${CYAN}${BOLD}💡 ACTIONABLE FIX:${RESET}`);
    lines.push(`  ${CYAN}${rootCause.remedy}${RESET}`);
  } else {
    lines.push('');
    lines.push(`${GREEN}${BOLD}✅ 100% CACHE EFFICIENCY: Perfect prefix alignment detected across turns.${RESET}`);
  }

  // Cost Leak Ledger
  if (costLeak && costLeak.wastedPerRequest > 0) {
    lines.push('');
    lines.push(`${RED}${BOLD}💸 ESTIMATED COST LEAK (Avoidable API Waste):${RESET}`);
    lines.push(`  • Waste Per Request:     ${RED}${BOLD}-$${costLeak.wastedPerRequest.toFixed(4)}${RESET}`);
  lines.push(`  • At 100 req/day:        ${RED}${BOLD}-$${costLeak.projectedMonthlyLoss.req100Day.toFixed(2)} / month${RESET}`);
    lines.push(`  • At 1,000 req/day:      ${RED}${BOLD}-$${costLeak.projectedMonthlyLoss.req100Day.toFixed(2) * 10} / month${RESET}`);
    lines.push(`  • At 5,000 req/day:      ${RED}${BOLD}-$${costLeak.projectedMonthlyLoss.req100Day.toFixed(2) * 50} / month${RESET}`);
  }

  lines.push(`${DIM}────────────────────────────────────────────────────────────────────────${RESET}`);
  return lines.join('\n');
}
