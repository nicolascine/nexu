// Local file-based vector store with cosine similarity search

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { CodeChunk } from '../ast';

export interface VectorEntry {
  id: string;
  embedding: number[];
  chunk: CodeChunk;
}

export interface VectorStore {
  entries: VectorEntry[];
  dimension: number;
  metadata: {
    createdAt: string;
    updatedAt: string;
    model: string;
  };
}

// cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// create empty store
export function createStore(dimension: number, model: string): VectorStore {
  return {
    entries: [],
    dimension,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model,
    },
  };
}

// add entries to store
export function addToStore(store: VectorStore, entries: VectorEntry[]): void {
  for (const entry of entries) {
    if (entry.embedding.length !== store.dimension) {
      throw new Error(
        `Embedding dimension ${entry.embedding.length} doesn't match store dimension ${store.dimension}`
      );
    }

    // upsert: replace if exists
    const existingIdx = store.entries.findIndex(e => e.id === entry.id);
    if (existingIdx >= 0) {
      store.entries[existingIdx] = entry;
    } else {
      store.entries.push(entry);
    }
  }

  store.metadata.updatedAt = new Date().toISOString();
}

// search store with query embedding
export function searchStore(
  store: VectorStore,
  queryEmbedding: number[],
  options: {
    topK?: number;
    minScore?: number;
  } = {}
): Array<{ entry: VectorEntry; score: number }> {
  const { topK = 10, minScore = 0 } = options;

  if (queryEmbedding.length !== store.dimension) {
    throw new Error(
      `Query dimension ${queryEmbedding.length} doesn't match store dimension ${store.dimension}`
    );
  }

  // calculate similarities
  const scored = store.entries.map(entry => ({
    entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  // filter and sort
  return scored
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// save store to file
export function saveStore(store: VectorStore, filepath: string): void {
  const dir = dirname(filepath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filepath, JSON.stringify(store), 'utf-8');
}

// load store from file
export function loadStore(filepath: string): VectorStore | null {
  if (!existsSync(filepath)) {
    return null;
  }

  const data = readFileSync(filepath, 'utf-8');
  return JSON.parse(data) as VectorStore;
}

// get store stats
export function getStoreStats(store: VectorStore): {
  totalEntries: number;
  dimension: number;
  model: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    totalEntries: store.entries.length,
    dimension: store.dimension,
    model: store.metadata.model,
    createdAt: store.metadata.createdAt,
    updatedAt: store.metadata.updatedAt,
  };
}

// delete entries by id
export function deleteFromStore(store: VectorStore, ids: string[]): number {
  const idsSet = new Set(ids);
  const before = store.entries.length;
  store.entries = store.entries.filter(e => !idsSet.has(e.id));
  store.metadata.updatedAt = new Date().toISOString();
  return before - store.entries.length;
}

// get entries by filepath
export function getEntriesByFilepath(store: VectorStore, filepath: string): VectorEntry[] {
  return store.entries.filter(e => e.chunk.filepath === filepath);
}

// delete entries by filepath (useful when re-indexing a file)
export function deleteByFilepath(store: VectorStore, filepath: string): number {
  const before = store.entries.length;
  store.entries = store.entries.filter(e => e.chunk.filepath !== filepath);
  store.metadata.updatedAt = new Date().toISOString();
  return before - store.entries.length;
}
