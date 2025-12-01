-- Migration: Add multi-repository support
-- Run this in Supabase SQL Editor after initial setup

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

-- Add repository_id to chunks (nullable for backwards compatibility)
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS repository_id TEXT REFERENCES repositories(id);

-- Index for filtering chunks by repository
CREATE INDEX IF NOT EXISTS chunks_repository_idx ON chunks(repository_id);

-- Function to get repository stats
CREATE OR REPLACE FUNCTION update_repository_stats(repo_id TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE repositories
    SET
        chunk_count = (SELECT COUNT(*) FROM chunks WHERE repository_id = repo_id),
        file_count = (SELECT COUNT(DISTINCT filepath) FROM chunks WHERE repository_id = repo_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = repo_id;
END;
$$;
