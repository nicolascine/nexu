// nexu core service - unified API for all frontends
// handles index loading, retrieval, and generation

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CodeChunk } from '../ast';
import type { DependencyGraph, Import } from '../graph';
import { loadStore, retrieve, simpleRetrieve, type VectorStore, type RetrievalResult, type RetrievalOptions } from '../retrieval';
import { generate, generateStream, createLLMProvider, getLLMConfig, getEmbeddingConfig, type GenerateResult, type Citation } from '../llm';

// config paths
const DATA_DIR = join(process.cwd(), '.nexu');
const STORE_FILE = join(DATA_DIR, 'vectors.json');
const GRAPH_FILE = join(DATA_DIR, 'graph.json');
const META_FILE = join(DATA_DIR, 'meta.json');

// cached state (singleton pattern for serverless)
let cachedStore: VectorStore | null = null;
let cachedGraph: DependencyGraph | null = null;
let cachedMeta: IndexMeta | null = null;

export interface IndexMeta {
  version: string;
  indexedAt: string;
  targetPath: string;
  stats: {
    files: number;
    chunks: number;
    embeddings: number;
    totalFiles: number;
    totalEdges: number;
    avgImportsPerFile: number;
    avgDependentsPerFile: number;
  };
  config: {
    embeddingProvider: string;
    embeddingModel: string;
  };
}

export interface NexuStatus {
  ready: boolean;
  indexed: boolean;
  meta: IndexMeta | null;
  llm: {
    provider: string;
    model: string;
  };
  embedding: {
    provider: string;
    model: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  query: string;
  history?: ChatMessage[];
  options?: RetrievalOptions;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  chunks: Array<{
    filepath: string;
    startLine: number;
    endLine: number;
    nodeType: string;
    name: string;
    content: string;
  }>;
  tokensUsed: number;
  retrievalStage: string;
}

export interface SearchRequest {
  query: string;
  options?: RetrievalOptions;
}

export interface SearchResponse {
  chunks: Array<{
    filepath: string;
    startLine: number;
    endLine: number;
    nodeType: string;
    name: string;
    content: string;
    score: number;
    language: string;
  }>;
  stage: string;
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

// load meta from file
function loadMeta(): IndexMeta | null {
  if (!existsSync(META_FILE)) return null;
  return JSON.parse(readFileSync(META_FILE, 'utf-8'));
}

// attach chunks from store to graph
function attachChunksToGraph(graph: DependencyGraph, store: VectorStore) {
  for (const entry of store.entries) {
    const node = graph.nodes.get(entry.chunk.filepath);
    if (node) {
      node.chunks.push(entry.chunk);
    }
  }
}

// initialize/load index (cached for serverless)
export function initIndex(): { store: VectorStore | null; graph: DependencyGraph | null; meta: IndexMeta | null } {
  if (cachedStore && cachedGraph && cachedMeta) {
    return { store: cachedStore, graph: cachedGraph, meta: cachedMeta };
  }

  if (!existsSync(STORE_FILE)) {
    return { store: null, graph: null, meta: null };
  }

  const store = loadStore(STORE_FILE);
  if (!store) {
    return { store: null, graph: null, meta: null };
  }

  const graph = loadGraph();
  if (graph) {
    attachChunksToGraph(graph, store);
  }

  const meta = loadMeta();

  // cache for subsequent requests
  cachedStore = store;
  cachedGraph = graph;
  cachedMeta = meta;

  return { store, graph, meta };
}

// clear cache (useful for hot reloading in dev)
export function clearCache(): void {
  cachedStore = null;
  cachedGraph = null;
  cachedMeta = null;
}

// get system status
export function getStatus(): NexuStatus {
  const { store, meta } = initIndex();
  const llmConfig = getLLMConfig();
  const embeddingConfig = getEmbeddingConfig();

  return {
    ready: store !== null,
    indexed: store !== null && store.entries.length > 0,
    meta,
    llm: {
      provider: llmConfig.provider,
      model: llmConfig.model,
    },
    embedding: {
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
    },
  };
}

// search chunks (retrieval only, no generation)
export async function search(request: SearchRequest): Promise<SearchResponse> {
  const { store, graph } = initIndex();

  if (!store) {
    throw new Error('Index not initialized. Run `npm run ingest` first.');
  }

  const options: RetrievalOptions = {
    topK: 10,
    reranker: 'llm',
    rerankTopK: 5,
    expandGraph: true,
    maxHops: 2,
    maxExpandedChunks: 15,
    ...request.options,
  };

  let result: RetrievalResult;

  if (graph && options.expandGraph !== false) {
    result = await retrieve(store, graph, request.query, options);
  } else {
    result = await simpleRetrieve(store, request.query, {
      topK: options.rerankTopK || 5,
    });
  }

  return {
    chunks: result.chunks.map((chunk, i) => ({
      filepath: chunk.filepath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      nodeType: chunk.nodeType,
      name: chunk.name,
      content: chunk.content,
      score: result.scores[i],
      language: chunk.language,
    })),
    stage: result.stage,
  };
}

// chat with generation (non-streaming)
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const searchResult = await search({
    query: request.query,
    options: request.options,
  });

  const chunks: CodeChunk[] = searchResult.chunks.map(c => ({
    id: `${c.filepath}:${c.startLine}-${c.endLine}`,
    filepath: c.filepath,
    startLine: c.startLine,
    endLine: c.endLine,
    nodeType: c.nodeType as CodeChunk['nodeType'],
    name: c.name,
    content: c.content,
    language: c.language as CodeChunk['language'],
    imports: [],
    exports: [],
    types: [],
  }));

  const result = await generate({
    query: request.query,
    chunks,
  });

  return {
    answer: result.response,
    citations: result.citations,
    chunks: searchResult.chunks,
    tokensUsed: result.tokensUsed,
    retrievalStage: searchResult.stage,
  };
}

// chat with streaming
export async function* chatStream(request: ChatRequest): AsyncIterable<string> {
  const searchResult = await search({
    query: request.query,
    options: request.options,
  });

  const chunks: CodeChunk[] = searchResult.chunks.map(c => ({
    id: `${c.filepath}:${c.startLine}-${c.endLine}`,
    filepath: c.filepath,
    startLine: c.startLine,
    endLine: c.endLine,
    nodeType: c.nodeType as CodeChunk['nodeType'],
    name: c.name,
    content: c.content,
    language: c.language as CodeChunk['language'],
    imports: [],
    exports: [],
    types: [],
  }));

  yield* generateStream({
    query: request.query,
    chunks,
  });
}

// get raw chunks for a specific context (useful for debugging)
export function getRetrievedChunks(request: ChatRequest): Promise<SearchResponse> {
  return search({
    query: request.query,
    options: request.options,
  });
}

// re-export types
export type { CodeChunk } from '../ast';
export type { RetrievalOptions, RetrievalResult } from '../retrieval';
export type { Citation, GenerateResult } from '../llm';
