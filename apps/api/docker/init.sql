-- Nexu Database Schema
-- This runs automatically when using docker-compose
-- For Supabase/production, run docker/supabase-init.sql instead

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding dimension: 768 for Ollama/nomic-embed-text, 1536 for OpenAI
-- Default: 768 for local development (Ollama)
-- Change to 1536 if using EMBEDDING_MODEL=text-embedding-3-small

-- Chunks table with vector embeddings
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    filepath TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    node_type TEXT NOT NULL,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    content TEXT NOT NULL,
    imports TEXT[] DEFAULT '{}',
    exports TEXT[] DEFAULT '{}',
    types TEXT[] DEFAULT '{}',
    embedding vector(768),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for vector similarity search (ivfflat for local, hnsw for production)
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for filepath lookups
CREATE INDEX IF NOT EXISTS chunks_filepath_idx ON chunks (filepath);

-- Graph edges table
CREATE TABLE IF NOT EXISTS graph_edges (
    from_file TEXT NOT NULL,
    to_file TEXT NOT NULL,
    PRIMARY KEY (from_file, to_file)
);

-- Graph nodes table
CREATE TABLE IF NOT EXISTS graph_nodes (
    filepath TEXT PRIMARY KEY,
    exports TEXT[] DEFAULT '{}',
    imports JSONB DEFAULT '[]'
);

-- Metadata table
CREATE TABLE IF NOT EXISTS index_meta (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to search similar vectors
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(768),
    match_count INTEGER DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id TEXT,
    filepath TEXT,
    start_line INTEGER,
    end_line INTEGER,
    node_type TEXT,
    name TEXT,
    language TEXT,
    content TEXT,
    imports TEXT[],
    exports TEXT[],
    types TEXT[],
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.filepath,
        c.start_line,
        c.end_line,
        c.node_type,
        c.name,
        c.language,
        c.content,
        c.imports,
        c.exports,
        c.types,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM chunks c
    WHERE 1 - (c.embedding <=> query_embedding) > min_similarity
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
