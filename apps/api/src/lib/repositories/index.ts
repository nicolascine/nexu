// Repository management for multi-repo support

import { getStoreType } from '../retrieval/stores'

export interface Repository {
  id: string           // 'github:owner/repo'
  name: string         // 'react'
  owner: string        // 'facebook'
  fullName: string     // 'facebook/react'
  url: string          // 'https://github.com/facebook/react'
  description: string | null
  stars: number
  language: string | null
  defaultBranch: string
  indexedAt: string
  updatedAt: string
  chunkCount: number
  fileCount: number
  status: 'pending' | 'indexing' | 'ready' | 'error'
}

// Parse GitHub URL to extract owner/repo
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace('.git', '') }
}

// Generate repository ID from URL
export function getRepositoryId(url: string): string {
  const parsed = parseGitHubUrl(url)
  if (!parsed) throw new Error(`Invalid GitHub URL: ${url}`)
  return `github:${parsed.owner}/${parsed.repo}`
}

// Get all repositories (production: from Supabase, local: from JSON)
export async function getRepositories(): Promise<Repository[]> {
  const storeType = getStoreType()

  if (storeType === 'pgvector') {
    return getRepositoriesFromPg()
  }

  return getRepositoriesFromJson()
}

// Get repositories from PostgreSQL (Supabase)
async function getRepositoriesFromPg(): Promise<Repository[]> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL not configured')
  }

  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString })

  try {
    const result = await pool.query(`
      SELECT
        id, name, owner, full_name, url, description,
        stars, language, default_branch, indexed_at, updated_at,
        chunk_count, file_count, status
      FROM repositories
      WHERE status = 'ready'
      ORDER BY stars DESC, indexed_at DESC
    `)

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      owner: row.owner,
      fullName: row.full_name,
      url: row.url,
      description: row.description,
      stars: row.stars || 0,
      language: row.language,
      defaultBranch: row.default_branch || 'main',
      indexedAt: row.indexed_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
      chunkCount: row.chunk_count || 0,
      fileCount: row.file_count || 0,
      status: row.status || 'ready',
    }))
  } finally {
    await pool.end()
  }
}

// Get repositories from local JSON (development)
async function getRepositoriesFromJson(): Promise<Repository[]> {
  const { existsSync, readFileSync } = await import('fs')
  const { join } = await import('path')

  const reposPath = join(process.cwd(), '.nexu', 'repositories.json')

  if (!existsSync(reposPath)) {
    return []
  }

  const data = JSON.parse(readFileSync(reposPath, 'utf-8'))
  return data.repositories || []
}

// Add or update repository (used by ingest script)
export async function upsertRepository(repo: Omit<Repository, 'indexedAt' | 'updatedAt'>): Promise<void> {
  const storeType = getStoreType()

  if (storeType === 'pgvector') {
    await upsertRepositoryPg(repo)
  } else {
    await upsertRepositoryJson(repo)
  }
}

async function upsertRepositoryPg(repo: Omit<Repository, 'indexedAt' | 'updatedAt'>): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL not configured')

  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString })

  try {
    await pool.query(`
      INSERT INTO repositories (
        id, name, owner, full_name, url, description,
        stars, language, default_branch, chunk_count, file_count, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        stars = EXCLUDED.stars,
        language = EXCLUDED.language,
        chunk_count = EXCLUDED.chunk_count,
        file_count = EXCLUDED.file_count,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `, [
      repo.id,
      repo.name,
      repo.owner,
      repo.fullName,
      repo.url,
      repo.description,
      repo.stars,
      repo.language,
      repo.defaultBranch,
      repo.chunkCount,
      repo.fileCount,
      repo.status,
    ])
  } finally {
    await pool.end()
  }
}

async function upsertRepositoryJson(repo: Omit<Repository, 'indexedAt' | 'updatedAt'>): Promise<void> {
  const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs')
  const { join, dirname } = await import('path')

  const reposPath = join(process.cwd(), '.nexu', 'repositories.json')

  // Ensure directory exists
  mkdirSync(dirname(reposPath), { recursive: true })

  let data: { repositories: Repository[] } = { repositories: [] }

  if (existsSync(reposPath)) {
    data = JSON.parse(readFileSync(reposPath, 'utf-8'))
  }

  const now = new Date().toISOString()
  const existingIndex = data.repositories.findIndex(r => r.id === repo.id)

  const fullRepo: Repository = {
    ...repo,
    indexedAt: existingIndex >= 0 ? data.repositories[existingIndex].indexedAt : now,
    updatedAt: now,
  }

  if (existingIndex >= 0) {
    data.repositories[existingIndex] = fullRepo
  } else {
    data.repositories.push(fullRepo)
  }

  writeFileSync(reposPath, JSON.stringify(data, null, 2))
}

// Update repository status
export async function updateRepositoryStatus(
  id: string,
  status: Repository['status'],
  stats?: { chunkCount?: number; fileCount?: number }
): Promise<void> {
  const storeType = getStoreType()

  if (storeType === 'pgvector') {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL not configured')

    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString })

    try {
      await pool.query(`
        UPDATE repositories SET
          status = $1,
          chunk_count = COALESCE($2, chunk_count),
          file_count = COALESCE($3, file_count),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [status, stats?.chunkCount, stats?.fileCount, id])
    } finally {
      await pool.end()
    }
  }
}

// Fetch GitHub repo metadata
export async function fetchGitHubMetadata(owner: string, repo: string): Promise<{
  description: string | null
  stars: number
  language: string | null
  defaultBranch: string
}> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'nexu-indexer',
      },
    })

    if (!res.ok) {
      console.warn(`Failed to fetch GitHub metadata for ${owner}/${repo}: ${res.status}`)
      return { description: null, stars: 0, language: null, defaultBranch: 'main' }
    }

    const data = await res.json()
    return {
      description: data.description,
      stars: data.stargazers_count || 0,
      language: data.language,
      defaultBranch: data.default_branch || 'main',
    }
  } catch (error) {
    console.warn(`Error fetching GitHub metadata:`, error)
    return { description: null, stars: 0, language: null, defaultBranch: 'main' }
  }
}
