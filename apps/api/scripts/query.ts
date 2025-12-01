// Query script for searching the indexed codebase
// Usage: npm run query -- "how does authentication work?"

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadStore } from '../src/lib/retrieval';
import { retrieve, simpleRetrieve } from '../src/lib/retrieval';
import { generate, getLLMConfig } from '../src/lib/llm';
import type { DependencyGraph, Import } from '../src/lib/graph';
import type { CodeChunk } from '../src/lib/ast';

// config
const DATA_DIR = join(process.cwd(), '.nexu');
const STORE_FILE = join(DATA_DIR, 'vectors.json');
const GRAPH_FILE = join(DATA_DIR, 'graph.json');
const META_FILE = join(DATA_DIR, 'meta.json');

import type { RerankerType } from '../src/lib/retrieval';

interface QueryOptions {
  query: string;
  topK: number;
  reranker: RerankerType;
  expandGraph: boolean;
  verbose: boolean;
}

// load graph from file
function loadGraph(): DependencyGraph | null {
  if (!existsSync(GRAPH_FILE)) return null;

  const data = JSON.parse(readFileSync(GRAPH_FILE, 'utf-8'));

  // reconstruct Maps and Sets from JSON
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
      chunks: [], // will be populated from store
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
function attachChunksFromStore(graph: DependencyGraph, store: { entries: Array<{ chunk: CodeChunk }> }) {
  for (const entry of store.entries) {
    const node = graph.nodes.get(entry.chunk.filepath);
    if (node) {
      node.chunks.push(entry.chunk);
    }
  }
}

async function main() {
  // parse args
  const args = process.argv.slice(2);

  // check for flags
  const verboseIdx = args.indexOf('--verbose');
  const noRerankIdx = args.indexOf('--no-rerank');
  const noExpandIdx = args.indexOf('--no-expand');
  const topKIdx = args.indexOf('--top-k');

  // remove flags from args
  const queryParts = args.filter((arg, i) => {
    if (arg.startsWith('--')) return false;
    if (i > 0 && args[i - 1] === '--top-k') return false;
    return true;
  });

  const options: QueryOptions = {
    query: queryParts.join(' '),
    topK: topKIdx >= 0 ? parseInt(args[topKIdx + 1], 10) : 5,
    reranker: noRerankIdx < 0 ? 'llm' : 'none',
    expandGraph: noExpandIdx < 0,
    verbose: verboseIdx >= 0,
  };

  if (!options.query) {
    console.log('Usage: npm run query -- "your question here"');
    console.log('');
    console.log('Options:');
    console.log('  --top-k N      Number of results (default: 5)');
    console.log('  --no-rerank    Skip LLM reranking');
    console.log('  --no-expand    Skip graph expansion');
    console.log('  --verbose      Show detailed output');
    process.exit(1);
  }

  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║            nexu query                 ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');

  // check if index exists
  if (!existsSync(STORE_FILE)) {
    console.error('Error: Index not found. Run `npm run ingest` first.');
    process.exit(1);
  }

  // load index
  console.log('→ Loading index...');
  const store = loadStore(STORE_FILE);
  if (!store) {
    console.error('Error: Failed to load vector store.');
    process.exit(1);
  }
  console.log(`  ${store.entries.length} chunks loaded`);

  const graph = loadGraph();
  if (graph) {
    attachChunksFromStore(graph, store);
    console.log(`  Graph loaded (${graph.nodes.size} files)`);
  }

  const llmConfig = getLLMConfig();
  console.log(`  LLM: ${llmConfig.provider} / ${llmConfig.model}`);

  // run query
  console.log('');
  console.log(`→ Query: "${options.query}"`);
  console.log('');

  let result;
  if (graph && options.expandGraph) {
    result = await retrieve(store, graph, options.query, {
      topK: 10,
      reranker: options.reranker,
      rerankTopK: options.topK,
      expandGraph: true,
      maxHops: 2,
      maxExpandedChunks: 15,
    });
  } else {
    result = await simpleRetrieve(store, options.query, {
      topK: options.topK,
    });
  }

  console.log(`→ Retrieved ${result.chunks.length} chunks (stage: ${result.stage})`);

  if (options.verbose) {
    console.log('');
    console.log('Chunks:');
    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      const score = result.scores[i];
      console.log(`  [${i + 1}] ${chunk.filepath}:${chunk.startLine}-${chunk.endLine}`);
      console.log(`      ${chunk.nodeType}: ${chunk.name} (score: ${score.toFixed(3)})`);
    }
  }

  // generate response
  console.log('');
  console.log('→ Generating response...');
  console.log('');

  const response = await generate({
    query: options.query,
    chunks: result.chunks,
  });

  console.log('─'.repeat(50));
  console.log('');
  console.log(response.response);
  console.log('');
  console.log('─'.repeat(50));
  console.log('');
  console.log(`Tokens used: ${response.tokensUsed}`);
  console.log('');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
