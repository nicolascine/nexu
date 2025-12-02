-- Nexu Schema for Supabase with pgvector
-- Run this in the SQL Editor: https://supabase.com/dashboard/project/<YOUR_PROJECT_ID>/sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Chunks table with vector embeddings (OpenAI text-embedding-3-small = 1536 dims)
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
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for vector similarity search (HNSW is better for Supabase)
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks
USING hnsw (embedding vector_cosine_ops);

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

-- Repositories table (tracks indexed repos)
CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,              -- 'github:owner/repo'
    name TEXT NOT NULL,               -- 'react'
    owner TEXT NOT NULL,              -- 'facebook'
    full_name TEXT NOT NULL,          -- 'facebook/react'
    url TEXT NOT NULL,                -- 'https://github.com/facebook/react'
    description TEXT,
    stars INTEGER DEFAULT 0,
    language TEXT,
    default_branch TEXT DEFAULT 'main',
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chunk_count INTEGER DEFAULT 0,
    file_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending'     -- 'pending' | 'indexing' | 'ready' | 'error'
);

-- Add repository_id to chunks
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS repository_id TEXT REFERENCES repositories(id);
CREATE INDEX IF NOT EXISTS chunks_repository_idx ON chunks(repository_id);

-- Function to search similar vectors
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(1536),
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
