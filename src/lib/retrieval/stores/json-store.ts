// JSON file-based vector store implementation

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  IVectorStore,
  VectorEntry,
  SearchResult,
  StoreStats,
  SearchOptions,
  VectorStoreConfig,
} from './types';

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

interface JsonStoreData {
  entries: VectorEntry[];
  dimension: number;
  metadata: {
    createdAt: string;
    updatedAt: string;
    model: string;
  };
}

export class JsonVectorStore implements IVectorStore {
  private entries: VectorEntry[] = [];
  private dimension: number;
  private model: string;
  private filepath: string;
  private createdAt: string;
  private updatedAt: string;

  constructor(config: VectorStoreConfig) {
    if (!config.filepath) {
      throw new Error('JsonVectorStore requires filepath in config');
    }
    this.dimension = config.dimension;
    this.model = config.model;
    this.filepath = config.filepath;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
  }

  async init(): Promise<void> {
    // try to load existing store
    await this.load();
  }

  async close(): Promise<void> {
    // save on close
    await this.save();
  }

  async add(entries: VectorEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.embedding.length !== this.dimension) {
        throw new Error(
          `Embedding dimension ${entry.embedding.length} doesn't match store dimension ${this.dimension}`
        );
      }

      // upsert: replace if exists
      const existingIdx = this.entries.findIndex(e => e.id === entry.id);
      if (existingIdx >= 0) {
        this.entries[existingIdx] = entry;
      } else {
        this.entries.push(entry);
      }
    }

    this.updatedAt = new Date().toISOString();
  }

  async search(queryEmbedding: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const { topK = 10, minScore = 0 } = options;

    if (queryEmbedding.length !== this.dimension) {
      throw new Error(
        `Query dimension ${queryEmbedding.length} doesn't match store dimension ${this.dimension}`
      );
    }

    // calculate similarities
    const scored = this.entries.map(entry => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    // filter and sort
    return scored
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async delete(ids: string[]): Promise<number> {
    const idsSet = new Set(ids);
    const before = this.entries.length;
    this.entries = this.entries.filter(e => !idsSet.has(e.id));
    this.updatedAt = new Date().toISOString();
    return before - this.entries.length;
  }

  async deleteByFilepath(filepath: string): Promise<number> {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.chunk.filepath !== filepath);
    this.updatedAt = new Date().toISOString();
    return before - this.entries.length;
  }

  async getByFilepath(filepath: string): Promise<VectorEntry[]> {
    return this.entries.filter(e => e.chunk.filepath === filepath);
  }

  async getStats(): Promise<StoreStats> {
    return {
      totalEntries: this.entries.length,
      dimension: this.dimension,
      model: this.model,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  async save(): Promise<void> {
    const dir = dirname(this.filepath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data: JsonStoreData = {
      entries: this.entries,
      dimension: this.dimension,
      metadata: {
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        model: this.model,
      },
    };

    writeFileSync(this.filepath, JSON.stringify(data), 'utf-8');
  }

  async load(): Promise<boolean> {
    if (!existsSync(this.filepath)) {
      return false;
    }

    const raw = readFileSync(this.filepath, 'utf-8');
    const data: JsonStoreData = JSON.parse(raw);

    this.entries = data.entries;
    this.dimension = data.dimension;
    this.model = data.metadata.model;
    this.createdAt = data.metadata.createdAt;
    this.updatedAt = data.metadata.updatedAt;

    return true;
  }

  // expose entries for backward compatibility
  getEntries(): VectorEntry[] {
    return this.entries;
  }
}
