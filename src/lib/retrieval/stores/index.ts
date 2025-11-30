// Vector store factory and exports

import { join } from 'path';
import type { IVectorStore, VectorStoreConfig, VectorStoreType } from './types';
import { JsonVectorStore } from './json-store';
import { PgVectorStore } from './pgvector-store';

export type { IVectorStore, VectorEntry, SearchResult, StoreStats, SearchOptions, VectorStoreConfig, VectorStoreType } from './types';
export { JsonVectorStore } from './json-store';
export { PgVectorStore } from './pgvector-store';

// embedding dimension based on model
function getEmbeddingDimension(model: string): number {
  const dimensions: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
    'text-embedding-004': 768,
    'nomic-embed-text': 768,
    'mxbai-embed-large': 1024,
    'all-minilm': 384,
  };
  return dimensions[model] || 1536;
}

// get store type from environment
export function getStoreType(): VectorStoreType {
  const type = process.env.VECTOR_STORE_TYPE || 'json';
  if (type !== 'json' && type !== 'pgvector') {
    throw new Error(`Invalid VECTOR_STORE_TYPE: ${type}. Must be 'json' or 'pgvector'.`);
  }
  return type;
}

// get store config from environment
export function getStoreConfig(): VectorStoreConfig {
  const type = getStoreType();
  const model = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
  const dimension = getEmbeddingDimension(model);

  if (type === 'pgvector') {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for pgvector store');
    }
    return {
      type,
      dimension,
      model,
      connectionString,
    };
  }

  // JSON store
  const filepath = process.env.VECTOR_STORE_PATH || join(process.cwd(), '.nexu', 'vectors.json');
  return {
    type,
    dimension,
    model,
    filepath,
  };
}

// factory function to create the appropriate store
export function createVectorStore(config?: VectorStoreConfig): IVectorStore {
  const cfg = config || getStoreConfig();

  switch (cfg.type) {
    case 'pgvector':
      return new PgVectorStore(cfg);
    case 'json':
    default:
      return new JsonVectorStore(cfg);
  }
}

// singleton instance for the app
let storeInstance: IVectorStore | null = null;

export async function getVectorStore(): Promise<IVectorStore> {
  if (!storeInstance) {
    storeInstance = createVectorStore();
    await storeInstance.init();
  }
  return storeInstance;
}

export async function closeVectorStore(): Promise<void> {
  if (storeInstance) {
    await storeInstance.close();
    storeInstance = null;
  }
}
