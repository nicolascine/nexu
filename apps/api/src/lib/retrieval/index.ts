// Retrieval pipeline: vector search → graph expansion → reranking

import { spawn } from 'child_process';
import { join } from 'path';
import type { CodeChunk } from '../ast';
import type { DependencyGraph } from '../graph';
import { getExpandedChunks } from '../graph';
import { embed, createLLMProvider } from '../llm';
import type { VectorStore } from './vector-store';
import { searchStore } from './vector-store';

export { createStore, addToStore, saveStore, loadStore, searchStore, getStoreStats } from './vector-store';
export type { VectorStore, VectorEntry } from './vector-store';

export interface RetrievalResult {
  chunks: CodeChunk[];
  scores: number[];
  expandedFrom: string[];
  stage: 'vector' | 'graph' | 'reranked';
}

export type RerankerType = 'bge' | 'llm' | 'none';

export interface RetrievalOptions {
  // vector search options
  topK?: number;
  minScore?: number;
  // graph expansion options
  expandGraph?: boolean;
  maxHops?: number;
  maxExpandedChunks?: number;
  // reranking options
  reranker?: RerankerType;
  rerankTopK?: number;
}

const DEFAULT_OPTIONS: Required<RetrievalOptions> = {
  topK: 10,
  minScore: 0,
  expandGraph: true,
  maxHops: 2,
  maxExpandedChunks: 20,
  reranker: 'bge',  // default to fast BGE reranker
  rerankTopK: 5,
};

// stage 1: vector search
export async function vectorSearch(
  store: VectorStore,
  query: string,
  options: Pick<RetrievalOptions, 'topK' | 'minScore'> = {}
): Promise<RetrievalResult> {
  const { topK = DEFAULT_OPTIONS.topK, minScore = DEFAULT_OPTIONS.minScore } = options;

  // embed query
  const [queryEmbedding] = await embed(query);

  // search
  const results = searchStore(store, queryEmbedding, { topK, minScore });

  return {
    chunks: results.map(r => r.entry.chunk),
    scores: results.map(r => r.score),
    expandedFrom: [],
    stage: 'vector',
  };
}

// stage 2: graph expansion
export function graphExpand(
  vectorResult: RetrievalResult,
  graph: DependencyGraph,
  options: Pick<RetrievalOptions, 'maxHops' | 'maxExpandedChunks'> = {}
): RetrievalResult {
  const {
    maxHops = DEFAULT_OPTIONS.maxHops,
    maxExpandedChunks = DEFAULT_OPTIONS.maxExpandedChunks,
  } = options;

  // get initial file paths
  const initialFiles = [...new Set(vectorResult.chunks.map(c => c.filepath))];

  // expand via graph
  const expandedChunks = getExpandedChunks(graph, vectorResult.chunks, {
    maxHops,
    maxChunks: maxExpandedChunks,
  });

  // merge scores: original chunks keep their scores, expanded get 0
  const originalIds = new Set(vectorResult.chunks.map(c => c.id));
  const scores = expandedChunks.map(chunk => {
    const originalIdx = vectorResult.chunks.findIndex(c => c.id === chunk.id);
    return originalIdx >= 0 ? vectorResult.scores[originalIdx] : 0;
  });

  return {
    chunks: expandedChunks,
    scores,
    expandedFrom: initialFiles,
    stage: 'graph',
  };
}

const BGE_RERANK_TIMEOUT_MS = 30000; // 30 seconds max for reranking

// stage 3a: BGE reranking (fast, dedicated reranker)
async function bgeRerank(
  query: string,
  result: RetrievalResult,
  options: Pick<RetrievalOptions, 'rerankTopK'> = {}
): Promise<RetrievalResult> {
  const { rerankTopK = DEFAULT_OPTIONS.rerankTopK } = options;

  if (result.chunks.length === 0 || result.chunks.length <= rerankTopK) {
    return { ...result, stage: 'reranked' };
  }

  // prepare passages for reranker
  const passages = result.chunks.map(
    chunk => `${chunk.filepath}:${chunk.startLine}-${chunk.endLine} (${chunk.nodeType}: ${chunk.name})\n${chunk.content}`
  );

  const fallbackResult: RetrievalResult = {
    chunks: result.chunks.slice(0, rerankTopK),
    scores: result.scores.slice(0, rerankTopK),
    expandedFrom: result.expandedFrom,
    stage: 'reranked',
  };

  return new Promise((resolve) => {
    const scriptPath = join(__dirname, '../../../scripts/rerank.py');
    const proc = spawn('python3', [scriptPath]);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const cleanup = () => {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    };

    const settle = (res: RetrievalResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve(res);
    };

    const timeout = setTimeout(() => {
      console.warn('BGE rerank timed out after', BGE_RERANK_TIMEOUT_MS, 'ms');
      settle(fallbackResult);
    }, BGE_RERANK_TIMEOUT_MS);

    proc.on('error', (err) => {
      console.warn('BGE rerank process error:', err.message);
      settle(fallbackResult);
    });

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (settled) return;

      if (code !== 0 || !stdout.trim()) {
        console.warn('BGE rerank failed with code', code, ':', stderr);
        settle(fallbackResult);
        return;
      }

      try {
        const scores: number[] = JSON.parse(stdout);

        // create index-score pairs and sort by score descending
        const ranked = result.chunks
          .map((chunk, i) => ({ chunk, score: scores[i] ?? 0, originalScore: result.scores[i] }))
          .sort((a, b) => b.score - a.score)
          .slice(0, rerankTopK);

        settle({
          chunks: ranked.map(r => r.chunk),
          scores: ranked.map(r => r.score),
          expandedFrom: result.expandedFrom,
          stage: 'reranked',
        });
      } catch (err) {
        console.warn('Failed to parse BGE scores:', err);
        settle(fallbackResult);
      }
    });

    // send input to Python script
    proc.stdin.write(JSON.stringify({ query, passages }));
    proc.stdin.end();
  });
}

// stage 3b: LLM reranking (slower, uses chat model)
export async function llmRerank(
  query: string,
  result: RetrievalResult,
  options: Pick<RetrievalOptions, 'rerankTopK'> = {}
): Promise<RetrievalResult> {
  const { rerankTopK = DEFAULT_OPTIONS.rerankTopK } = options;

  if (result.chunks.length === 0) {
    return { ...result, stage: 'reranked' };
  }

  // if already at or below target, skip reranking
  if (result.chunks.length <= rerankTopK) {
    return { ...result, stage: 'reranked' };
  }

  const provider = createLLMProvider();

  // build reranking prompt
  const chunksDesc = result.chunks
    .map(
      (chunk, i) =>
        `[${i}] ${chunk.filepath}:${chunk.startLine}-${chunk.endLine} (${chunk.nodeType}: ${chunk.name})\n${chunk.content.slice(0, 500)}${chunk.content.length > 500 ? '...' : ''}`
    )
    .join('\n\n');

  const prompt = `Given the following code chunks and a user query, rank the chunks by relevance to answering the query.

Query: ${query}

Code chunks:
${chunksDesc}

Return ONLY the indices of the ${rerankTopK} most relevant chunks, in order of relevance, as a JSON array.
Example response: [2, 0, 5, 1, 4]

Your response (JSON array only):`;

  try {
    const response = await provider.chat({
      messages: [
        {
          role: 'system',
          content: 'You are a code relevance ranker. Return only valid JSON arrays of integers.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      maxTokens: 100,
    });

    // parse response
    const match = response.content.match(/\[[\d,\s]+\]/);
    if (!match) {
      console.warn('Failed to parse reranking response, falling back to vector scores');
      return {
        chunks: result.chunks.slice(0, rerankTopK),
        scores: result.scores.slice(0, rerankTopK),
        expandedFrom: result.expandedFrom,
        stage: 'reranked',
      };
    }

    const indices: number[] = JSON.parse(match[0]);
    const validIndices = indices
      .filter(i => i >= 0 && i < result.chunks.length)
      .slice(0, rerankTopK);

    // reorder chunks by LLM ranking
    const rerankedChunks = validIndices.map(i => result.chunks[i]);
    const rerankedScores = validIndices.map((i, rank) => 1 - rank * 0.1); // synthetic scores

    return {
      chunks: rerankedChunks,
      scores: rerankedScores,
      expandedFrom: result.expandedFrom,
      stage: 'reranked',
    };
  } catch (error) {
    console.warn('Reranking failed, falling back to vector scores:', error);
    return {
      chunks: result.chunks.slice(0, rerankTopK),
      scores: result.scores.slice(0, rerankTopK),
      expandedFrom: result.expandedFrom,
      stage: 'reranked',
    };
  }
}

// unified rerank dispatcher
export async function rerank(
  query: string,
  result: RetrievalResult,
  options: Pick<RetrievalOptions, 'reranker' | 'rerankTopK'> = {}
): Promise<RetrievalResult> {
  const reranker = options.reranker ?? DEFAULT_OPTIONS.reranker;

  if (reranker === 'none') {
    return { ...result, stage: 'reranked' };
  }

  if (reranker === 'bge') {
    return bgeRerank(query, result, options);
  }

  return llmRerank(query, result, options);
}

// full retrieval pipeline
export async function retrieve(
  store: VectorStore,
  graph: DependencyGraph,
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // stage 1: vector search
  let result = await vectorSearch(store, query, {
    topK: opts.topK,
    minScore: opts.minScore,
  });

  if (result.chunks.length === 0) {
    return result;
  }

  // stage 2: graph expansion
  if (opts.expandGraph) {
    result = graphExpand(result, graph, {
      maxHops: opts.maxHops,
      maxExpandedChunks: opts.maxExpandedChunks,
    });
  }

  // stage 3: reranking
  if (opts.reranker !== 'none') {
    result = await rerank(query, result, {
      reranker: opts.reranker,
      rerankTopK: opts.rerankTopK,
    });
  }

  return result;
}

// simple retrieve without graph (for quick searches)
export async function simpleRetrieve(
  store: VectorStore,
  query: string,
  options: Pick<RetrievalOptions, 'topK' | 'minScore'> = {}
): Promise<RetrievalResult> {
  return vectorSearch(store, query, options);
}
