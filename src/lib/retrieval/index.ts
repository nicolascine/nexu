// Retrieval pipeline: vector search + graph expansion + reranking
// TODO: implement two-stage retrieval

import type { CodeChunk } from '../ast';

export interface RetrievalResult {
  chunks: CodeChunk[];
  scores: number[];
  expandedFrom: string[];
}

export async function retrieve(
  _query: string,
  _options?: { maxChunks?: number; minScore?: number }
): Promise<RetrievalResult> {
  throw new Error('Not implemented');
}

export async function rerank(
  _query: string,
  _chunks: CodeChunk[]
): Promise<CodeChunk[]> {
  throw new Error('Not implemented');
}
