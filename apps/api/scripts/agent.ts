#!/usr/bin/env tsx
// CLI for agent mode - interactive chat with tool use
// Usage: pnpm agent "your question about the codebase"

import 'dotenv/config';
import { runAgentStream } from '../src/lib/agent';
import { initIndexAsync } from '../src/lib/nexu';

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

async function main() {
  const query = process.argv.slice(2).join(' ');

  if (!query) {
    console.log(`
${COLORS.cyan}Nexu Agent${COLORS.reset} - AI-powered codebase exploration

${COLORS.dim}Usage:${COLORS.reset}
  pnpm agent "your question about the codebase"

${COLORS.dim}Examples:${COLORS.reset}
  pnpm agent "How does authentication work in this codebase?"
  pnpm agent "Where is the booking validation logic?"
  pnpm agent "What API endpoints handle payments?"
`);
    process.exit(0);
  }

  console.log(`\n${COLORS.cyan}Nexu Agent${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Query:${COLORS.reset} ${query}\n`);
  console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}\n`);

  // check index
  const { jsonStore, pgStore } = await initIndexAsync();
  if (!jsonStore && !pgStore) {
    console.error(`${COLORS.red}Error: Index not initialized. Run 'pnpm ingest' first.${COLORS.reset}`);
    process.exit(1);
  }

  // run agent with streaming
  try {
    for await (const event of runAgentStream(query)) {
      switch (event.type) {
        case 'thinking':
          console.log(`${COLORS.dim}${event.content}${COLORS.reset}`);
          break;

        case 'tool_call':
          console.log(`\n${COLORS.yellow}[Tool]${COLORS.reset} ${event.tool}`);
          console.log(`${COLORS.dim}${JSON.stringify(event.input, null, 2)}${COLORS.reset}`);
          break;

        case 'tool_result':
          if (event.isError) {
            console.log(`${COLORS.red}[Error] ${event.result}${COLORS.reset}`);
          } else {
            console.log(`${COLORS.green}[Result]${COLORS.reset} ${event.result}`);
          }
          break;

        case 'text':
          process.stdout.write(event.content);
          break;

        case 'done':
          console.log(`\n\n${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`);
          console.log(`${COLORS.dim}Steps: ${event.result.steps.length}${COLORS.reset}`);
          console.log(`${COLORS.dim}Searches: ${event.result.searchesPerformed}${COLORS.reset}`);
          console.log(`${COLORS.dim}Files accessed: ${event.result.filesAccessed.length}${COLORS.reset}`);
          console.log(`${COLORS.dim}Tokens used: ${event.result.totalTokensUsed}${COLORS.reset}`);
          break;

        case 'error':
          console.error(`\n${COLORS.red}Error: ${event.message}${COLORS.reset}`);
          process.exit(1);
      }
    }
  } catch (error) {
    console.error(`\n${COLORS.red}Error: ${error instanceof Error ? error.message : 'Unknown error'}${COLORS.reset}`);
    process.exit(1);
  }

  console.log();
}

main();
