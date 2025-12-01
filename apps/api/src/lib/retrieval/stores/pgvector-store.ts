// PostgreSQL + pgvector store implementation

import type {
  IVectorStore,
  VectorEntry,
  SearchResult,
  StoreStats,
  SearchOptions,
  VectorStoreConfig,
} from './types';

// Use dynamic import for pg to avoid issues when not installed
let Pool: typeof import('pg').Pool;

export class PgVectorStore implements IVectorStore {
  private pool: InstanceType<typeof Pool> | null = null;
  private dimension: number;
  private model: string;
  private connectionString: string;
  private initialized = false;

  constructor(config: VectorStoreConfig) {
    if (!config.connectionString) {
      throw new Error('PgVectorStore requires connectionString in config');
    }
    this.dimension = config.dimension;
    this.model = config.model;
    this.connectionString = config.connectionString;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // Dynamic import pg and dns
    const pg = await import('pg');
    const dns = await import('dns');
    Pool = pg.Pool;

    // Parse connection string to extract host
    const url = new URL(this.connectionString);
    const host = url.hostname;

    // Custom lookup that prefers IPv6 (for Supabase IPv6-only)
    const lookup = (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
      dns.lookup(hostname, { family: 6, ...options }, (err, address, family) => {
        if (err) {
          // Fallback to IPv4 if IPv6 fails
          dns.lookup(hostname, { family: 4, ...options }, callback);
        } else {
          callback(err, address, family);
        }
      });
    };

    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: { rejectUnauthorized: false },
      // @ts-ignore - lookup is not in PoolConfig types but works
      lookup,
    });

    // Test connection
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.pool) {
      throw new Error('PgVectorStore not initialized. Call init() first.');
    }
  }

  async add(entries: VectorEntry[]): Promise<void> {
    this.ensureInitialized();

    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');

      for (const entry of entries) {
        if (entry.embedding.length !== this.dimension) {
          throw new Error(
            `Embedding dimension ${entry.embedding.length} doesn't match store dimension ${this.dimension}`
          );
        }

        // format embedding as pgvector string
        const embeddingStr = `[${entry.embedding.join(',')}]`;

        await client.query(
          `INSERT INTO chunks (
            id, filepath, start_line, end_line, node_type, name, language,
            content, imports, exports, types, embedding
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::vector)
          ON CONFLICT (id) DO UPDATE SET
            filepath = EXCLUDED.filepath,
            start_line = EXCLUDED.start_line,
            end_line = EXCLUDED.end_line,
            node_type = EXCLUDED.node_type,
            name = EXCLUDED.name,
            language = EXCLUDED.language,
            content = EXCLUDED.content,
            imports = EXCLUDED.imports,
            exports = EXCLUDED.exports,
            types = EXCLUDED.types,
            embedding = EXCLUDED.embedding`,
          [
            entry.id,
            entry.chunk.filepath,
            entry.chunk.startLine,
            entry.chunk.endLine,
            entry.chunk.nodeType,
            entry.chunk.name,
            entry.chunk.language,
            entry.chunk.content,
            entry.chunk.imports,
            entry.chunk.exports,
            entry.chunk.types,
            embeddingStr,
          ]
        );
      }

      // update metadata
      await client.query(
        `INSERT INTO index_meta (key, value) VALUES ('model', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(this.model)]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async search(queryEmbedding: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    this.ensureInitialized();

    const { topK = 10, minScore = 0 } = options;

    if (queryEmbedding.length !== this.dimension) {
      throw new Error(
        `Query dimension ${queryEmbedding.length} doesn't match store dimension ${this.dimension}`
      );
    }

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const result = await this.pool!.query(
      `SELECT
        id, filepath, start_line, end_line, node_type, name, language,
        content, imports, exports, types,
        1 - (embedding <=> $1::vector) AS similarity
       FROM chunks
       WHERE 1 - (embedding <=> $1::vector) > $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [embeddingStr, minScore, topK]
    );

    return result.rows.map(row => ({
      entry: {
        id: row.id,
        embedding: [], // don't return embeddings from search
        chunk: {
          id: row.id,
          filepath: row.filepath,
          startLine: row.start_line,
          endLine: row.end_line,
          nodeType: row.node_type,
          name: row.name,
          language: row.language,
          content: row.content,
          imports: row.imports || [],
          exports: row.exports || [],
          types: row.types || [],
        },
      },
      score: row.similarity,
    }));
  }

  async delete(ids: string[]): Promise<number> {
    this.ensureInitialized();

    const result = await this.pool!.query(
      'DELETE FROM chunks WHERE id = ANY($1) RETURNING id',
      [ids]
    );

    return result.rowCount || 0;
  }

  async deleteByFilepath(filepath: string): Promise<number> {
    this.ensureInitialized();

    const result = await this.pool!.query(
      'DELETE FROM chunks WHERE filepath = $1 RETURNING id',
      [filepath]
    );

    return result.rowCount || 0;
  }

  async getByFilepath(filepath: string): Promise<VectorEntry[]> {
    this.ensureInitialized();

    const result = await this.pool!.query(
      `SELECT id, filepath, start_line, end_line, node_type, name, language,
              content, imports, exports, types
       FROM chunks WHERE filepath = $1`,
      [filepath]
    );

    return result.rows.map(row => ({
      id: row.id,
      embedding: [],
      chunk: {
        id: row.id,
        filepath: row.filepath,
        startLine: row.start_line,
        endLine: row.end_line,
        nodeType: row.node_type,
        name: row.name,
        language: row.language,
        content: row.content,
        imports: row.imports || [],
        exports: row.exports || [],
        types: row.types || [],
      },
    }));
  }

  async getStats(): Promise<StoreStats> {
    this.ensureInitialized();

    const countResult = await this.pool!.query('SELECT COUNT(*) FROM chunks');
    const metaResult = await this.pool!.query(
      "SELECT value, updated_at FROM index_meta WHERE key = 'model'"
    );

    const model = metaResult.rows[0]?.value || this.model;
    const updatedAt = metaResult.rows[0]?.updated_at?.toISOString() || new Date().toISOString();

    return {
      totalEntries: parseInt(countResult.rows[0].count, 10),
      dimension: this.dimension,
      model: typeof model === 'string' ? model : JSON.stringify(model),
      createdAt: updatedAt,
      updatedAt: updatedAt,
    };
  }

  // clear all data (useful for re-indexing)
  async clear(): Promise<void> {
    this.ensureInitialized();

    await this.pool!.query('TRUNCATE chunks, graph_edges, graph_nodes, index_meta');
  }
}
