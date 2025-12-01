#!/usr/bin/env npx tsx
// Interactive CLI for chatting with indexed codebase
// Usage: npm run chat

import { createInterface } from 'readline';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadStore, retrieve, simpleRetrieve, type VectorStore } from '../src/lib/retrieval';
import { generateStream, getLLMConfig } from '../src/lib/llm';
import type { DependencyGraph, Import } from '../src/lib/graph';
import type { CodeChunk } from '../src/lib/ast';

// config
const DATA_DIR = join(process.cwd(), '.nexu');
const STORE_FILE = join(DATA_DIR, 'vectors.json');
const GRAPH_FILE = join(DATA_DIR, 'graph.json');
const META_FILE = join(DATA_DIR, 'meta.json');

// colors for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function color(text: string, c: keyof typeof colors): string {
  return `${colors[c]}${text}${colors.reset}`;
}

// load graph from file
function loadGraph(): DependencyGraph | null {
  if (!existsSync(GRAPH_FILE)) return null;

  const data = JSON.parse(readFileSync(GRAPH_FILE, 'utf-8'));

  const nodes = new Map<string, {
    filepath: string;
    exports: Set<string>;
    imports: Import[];
    chunks: CodeChunk[];
  }>();

  for (const [key, value] of Object.entries(data.nodes) as Array<[string, {
    filepath: string;
    exports: string[];
    imports: Import[];
    chunkIds: string[];
  }]>) {
    nodes.set(key, {
      filepath: value.filepath,
      exports: new Set(value.exports),
      imports: value.imports,
      chunks: [],
    });
  }

  const edges = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(data.edges) as Array<[string, string[]]>) {
    edges.set(key, new Set(value));
  }

  const reverseEdges = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(data.reverseEdges) as Array<[string, string[]]>) {
    reverseEdges.set(key, new Set(value));
  }

  return { nodes, edges, reverseEdges };
}

// attach chunks from store to graph
function attachChunksFromStore(graph: DependencyGraph, store: VectorStore) {
  for (const entry of store.entries) {
    const node = graph.nodes.get(entry.chunk.filepath);
    if (node) {
      node.chunks.push(entry.chunk);
    }
  }
}

// format file path for display
function formatPath(filepath: string): string {
  const parts = filepath.split('/');
  if (parts.length > 3) {
    return '.../' + parts.slice(-3).join('/');
  }
  return filepath;
}

// show help
function showHelp() {
  console.log('');
  console.log(color('Commands:', 'bright'));
  console.log('  /help     - Show this help');
  console.log('  /chunks   - Show retrieved chunks from last query');
  console.log('  /clear    - Clear conversation history');
  console.log('  /config   - Show current configuration');
  console.log('  /exit     - Exit the chat');
  console.log('');
  console.log(color('Tips:', 'dim'));
  console.log('  - Ask questions about the indexed codebase');
  console.log('  - Use specific terms for better retrieval');
  console.log('  - Examples: "how does auth work?", "what does UserService do?"');
  console.log('');
}

async function main() {
  console.log('');
  console.log(color('╔═══════════════════════════════════════╗', 'cyan'));
  console.log(color('║            nexu chat                  ║', 'cyan'));
  console.log(color('╚═══════════════════════════════════════╝', 'cyan'));
  console.log('');

  // check if index exists
  if (!existsSync(STORE_FILE)) {
    console.error(color('Error: Index not found. Run `npm run ingest` first.', 'yellow'));
    process.exit(1);
  }

  // load index
  console.log(color('Loading index...', 'dim'));
  const store = loadStore(STORE_FILE);
  if (!store) {
    console.error(color('Error: Failed to load vector store.', 'yellow'));
    process.exit(1);
  }

  const graph = loadGraph();
  if (graph) {
    attachChunksFromStore(graph, store);
  }

  // load metadata
  let meta: { targetPath?: string; stats?: { files: number; chunks: number } } = {};
  if (existsSync(META_FILE)) {
    meta = JSON.parse(readFileSync(META_FILE, 'utf-8'));
  }

  const llmConfig = getLLMConfig();

  console.log(color(`  ${store.entries.length} chunks loaded`, 'dim'));
  if (graph) {
    console.log(color(`  ${graph.nodes.size} files in graph`, 'dim'));
  }
  console.log(color(`  LLM: ${llmConfig.provider}/${llmConfig.model}`, 'dim'));
  console.log('');
  console.log(color('Type /help for commands, or ask a question.', 'dim'));
  console.log('');

  // conversation history
  let lastChunks: CodeChunk[] = [];

  // create readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(color('you> ', 'green'), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // handle commands
      if (trimmed.startsWith('/')) {
        const cmd = trimmed.toLowerCase();

        if (cmd === '/exit' || cmd === '/quit' || cmd === '/q') {
          console.log(color('\nGoodbye!', 'dim'));
          rl.close();
          process.exit(0);
        }

        if (cmd === '/help' || cmd === '/h') {
          showHelp();
          prompt();
          return;
        }

        if (cmd === '/clear') {
          lastChunks = [];
          console.log(color('Conversation cleared.', 'dim'));
          prompt();
          return;
        }

        if (cmd === '/chunks') {
          if (lastChunks.length === 0) {
            console.log(color('No chunks from last query.', 'dim'));
          } else {
            console.log('');
            console.log(color(`Retrieved ${lastChunks.length} chunks:`, 'bright'));
            for (const chunk of lastChunks) {
              console.log(color(`  [${chunk.language}] `, 'dim') +
                color(formatPath(chunk.filepath), 'blue') +
                color(`:${chunk.startLine}-${chunk.endLine}`, 'dim') +
                color(` (${chunk.nodeType}: ${chunk.name})`, 'gray'));
            }
          }
          console.log('');
          prompt();
          return;
        }

        if (cmd === '/config') {
          console.log('');
          console.log(color('Configuration:', 'bright'));
          console.log(`  LLM Provider: ${llmConfig.provider}`);
          console.log(`  LLM Model: ${llmConfig.model}`);
          console.log(`  Chunks: ${store.entries.length}`);
          console.log(`  Embedding: ${store.metadata.model}`);
          if (meta.targetPath) {
            console.log(`  Indexed: ${meta.targetPath}`);
          }
          console.log('');
          prompt();
          return;
        }

        console.log(color(`Unknown command: ${trimmed}. Type /help for help.`, 'yellow'));
        prompt();
        return;
      }

      // regular query
      try {
        // retrieve relevant chunks
        process.stdout.write(color('Searching...', 'dim'));

        let result;
        if (graph) {
          result = await retrieve(store, graph, trimmed, {
            topK: 10,
            reranker: 'llm',
            rerankTopK: 5,
            expandGraph: true,
            maxHops: 2,
          });
        } else {
          result = await simpleRetrieve(store, trimmed, { topK: 5 });
        }

        lastChunks = result.chunks;

        // clear "Searching..." and show chunk count
        process.stdout.write('\r' + ' '.repeat(20) + '\r');

        if (result.chunks.length === 0) {
          console.log(color('No relevant code found for your query.', 'yellow'));
          console.log('');
          prompt();
          return;
        }

        console.log(color(`Found ${result.chunks.length} relevant chunks (stage: ${result.stage})`, 'dim'));
        console.log('');

        // generate response with streaming
        process.stdout.write(color('nexu> ', 'cyan'));

        const stream = generateStream({
          query: trimmed,
          chunks: result.chunks,
        });

        for await (const text of stream) {
          process.stdout.write(text);
        }

        console.log('');
        console.log('');

      } catch (error) {
        console.log('');
        console.error(color(`Error: ${error}`, 'yellow'));
        console.log('');
      }

      prompt();
    });
  };

  // handle Ctrl+C gracefully
  rl.on('close', () => {
    console.log(color('\nGoodbye!', 'dim'));
    process.exit(0);
  });

  // start the prompt
  prompt();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
