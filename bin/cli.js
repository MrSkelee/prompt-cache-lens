#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { analyzePromptCache } from '../src/engine.js';
import { formatReport } from '../src/visualizer.js';
import { startCacheProxy } from '../src/proxy.js';
import { runDemoScenarios } from '../src/demo.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
\x1b[36m\x1b[1m⚡ prompt-cache-lens\x1b[0m — LLM Prompt Cache Invalidation & Cost Leak Detector

\x1b[1mUSAGE:\x1b[0m
  npx prompt-cache-lens <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[32mdiff <turn1.json> <turn2.json>\x1b[0m   Diff two consecutive prompt requests and pinpoint cache breaks
  \x1b[32mproxy [options]\x1b[0m                   Start transparent reverse proxy to inspect cache in real-time
  \x1b[32mdemo\x1b[0m                            Run interactive demo with 3 real-world failure scenarios
  \x1b[32m--help, -h\x1b[0m                      Display this help guide

\x1b[1mPROXY OPTIONS:\x1b[0m
  --port <num>       Port to listen on (default: 8080)
  --target <url>     Upstream API (default: https://api.anthropic.com)
  --model <name>     Default model for pricing (default: claude-3-5-sonnet)

\x1b[1mEXAMPLES:\x1b[0m
  npx prompt-cache-lens diff turn1.json turn2.json
  npx prompt-cache-lens proxy --port 8080 --target https://api.anthropic.com
  npx prompt-cache-lens demo
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === 'demo') {
    runDemoScenarios();
    return;
  }

  if (command === 'diff') {
    const fileA = args[1];
    const fileB = args[2];

    if (!fileA || !fileB) {
      console.error('\x1b[31mError: Please provide two JSON payload files to diff.\x1b[0m');
      console.log('Usage: prompt-cache-lens diff <turn1.json> <turn2.json>');
      process.exit(1);
    }

    try {
      const contentA = JSON.parse(fs.readFileSync(path.resolve(fileA), 'utf8'));
      const contentB = JSON.parse(fs.readFileSync(path.resolve(fileB), 'utf8'));

      const analysis = analyzePromptCache(contentA, contentB);
      console.log(formatReport(analysis));
    } catch (err) {
      console.error(`\x1b[31mError reading or parsing diff files:\x1b[0m ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'proxy') {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 8080;

    const targetIdx = args.indexOf('--target');
    const target = targetIdx !== -1 ? args[targetIdx + 1] : 'https://api.anthropic.com';

    startCacheProxy({ port, target });
    return;
  }

  console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`);
  printHelp();
  process.exit(1);
}

main();
