# prompt-cache-lens ⚡

> **LLM Prompt Cache Invalidation & Cost Leak Detector**  
> Pinpoint exact cache break points, diagnose root causes (dynamic timestamps, tool permutations, CRLF/whitespace drift), and stop silent API dollar leaks.

---

## The Problem: The Silent $1,000/mo Cache Leak

Prompt caching (Anthropic Claude 3.5, OpenAI GPT-4o, DeepSeek V3/R1) cuts input token pricing by **50% to 90%** and reduces latency by up to 80%.

However, prompt caching relies strictly on **100% exact prefix matching**. A single divergent character in your prefix shatters the cache for every subsequent token:
- A dynamic timestamp in system instructions (`Current time: ...`)
- Reordered function tools or unsorted JSON schema keys
- Windows `\r\n` vs Unix `\n` line ending drift
- A per-request UUID or nonce

**The trap:** LLM providers **never return an error** when your prompt cache misses. They silently process the entire prompt at full price (10x higher cost) with added latency.

`prompt-cache-lens` acts as an X-ray for your prompt stream. It diffs consecutive requests, flags the exact break point, categorizes the root cause, and calculates the exact money wasted.

---

## 3 Real-World Failure Scenarios

| Scenario | Symptom | Detection & Fix |
| :--- | :--- | :--- |
| **1. Dynamic Prefix Poisoning** | `new Date().toISOString()` injected at top of 20k system prompt | 🚨 `DYNAMIC_TIMESTAMP_IN_PREFIX` flagged. Recommends moving timestamps to the final user message suffix. |
| **2. Tool Schema Permutation** | Python dictionary serialization shuffles tool array order across turns | ⚠️ `TOOL_DEFINITION_ORDER_PERMUTATION` flagged. Recommends deterministic alphabetized tool sorting. |
| **3. Invisible CRLF / Whitespace Drift** | Text looks identical to human eyes, but `\r\n` vs `\n` mismatch breaks byte prefix | 🚨 `INVISIBLE_WHITESPACE_OR_CRLF_DRIFT` flagged + Anthropic <1024 token underflow warning. |

---

## Quick Start

### 1. Interactive Demo
Simulate all 3 failure scenarios directly in your terminal:
```bash
npx prompt-cache-lens demo
```

### 2. Diff Two Prompt Payloads
Compare two consecutive JSON requests to see where the cache shattered:
```bash
npx prompt-cache-lens diff turn1.json turn2.json
```

### 3. Real-Time Reverse Proxy
Start a transparent local proxy. Point your agent or client `baseURL` to `http://localhost:8080`:
```bash
npx prompt-cache-lens proxy --port 8080 --target https://api.anthropic.com
```

Every time your app makes a call, `prompt-cache-lens` streams the request to Anthropic/OpenAI while printing live cache diagnostics in your terminal:
```text
⚡ PROMPT-CACHE-LENS — Invalidation & Cost Leak Diagnostic
Model Target: Anthropic Claude 3.5 Sonnet (Base: $3/M | Cached: $0.3/M)
────────────────────────────────────────────────────────────────────────
Cache Hit Ratio:  ██████████████████░░░░░░ 74.2%
Token Metrics:    31,200 cached | 10,800 uncached | 42,000 total

💸 ESTIMATED COST LEAK:
  • Waste Per Request:     -$0.0291
  • At 1,000 req/day:      -$873.00 / month
────────────────────────────────────────────────────────────────────────
```

---

## Programmatic SDK Usage

```javascript
import { analyzePromptCache, formatReport } from 'prompt-cache-lens';

const turn1 = {
  model: 'claude-3-5-sonnet',
  system: 'You are an AI assistant...',
  messages: [{ role: 'user', content: 'Hello' }]
};

const turn2 = {
  model: 'claude-3-5-sonnet',
  system: 'Current time: 2026-10-09T14:30:00Z\nYou are an AI assistant...',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'What time is it?' }
  ]
};

const report = analyzePromptCache(turn1, turn2);
console.log(formatReport(report));
```

---

## Supported Models & Providers

- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku (with 1024 / 2048 token boundary checks)
- **OpenAI**: GPT-4o, GPT-4o-mini
- **DeepSeek**: DeepSeek V3, DeepSeek R1

---

## License

MIT © MrSkelee
