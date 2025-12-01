// Vector store abstraction - allows switching between JSON file and pgvector

import type { CodeChunk } from '../../ast';

export interface VectorEntry {
  id: string;
  embedding: number[];
  chunk: CodeChunk;
}

export interface SearchResult {
  entry: VectorEntry;
  score: number;
}

export interface StoreStats {
  totalEntries: number;
  dimension: number;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchOptions {
  topK?: number;
  minScore?: number;
}

// Abstract interface for vector stores
export interface IVectorStore {
  // initialization
  init(): Promise<void>;
  close(): Promise<void>;

  // CRUD operations
  add(entries: VectorEntry[]): Promise<void>;
  search(queryEmbedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
  delete(ids: string[]): Promise<number>;
  deleteByFilepath(filepath: string): Promise<number>;

  // queries
  getByFilepath(filepath: string): Promise<VectorEntry[]>;
  getStats(): Promise<StoreStats>;

  // persistence (for JSON store) - optional
  save?(): Promise<void>;
  load?(): Promise<boolean>;
}

export type VectorStoreType = 'json' | 'pgvector';

export interface VectorStoreConfig {
  type: VectorStoreType;
  dimension: number;
  model: string;
  // JSON-specific
  filepath?: string;
  // pgvector-specific
  connectionString?: string;
}
