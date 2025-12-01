const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface Repository {
  id: string
  name: string
  owner: string
  fullName: string
  url: string
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

// Generate slug from owner/name
export function getRepoSlug(owner: string, name: string): string {
  return `${owner}--${name}`.toLowerCase()
}

// Parse slug back to owner and name
export function parseRepoSlug(slug: string): { owner: string; name: string } | null {
  const parts = slug.split('--')
  if (parts.length !== 2) return null
  return { owner: parts[0], name: parts[1] }
}

export interface StatusResponse {
  ok: boolean
  status: 'ready' | 'not_indexed'
  stats?: {
    chunks: number
    files: number
    lastIndexed: string
  }
}

export interface RepositoriesResponse {
  ok: boolean
  repositories: Repository[]
  count: number
}

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch(`${API_URL}/api/status`)
  if (!res.ok) throw new Error('Failed to fetch status')
  return res.json()
}

export async function getRepositories(): Promise<RepositoriesResponse> {
  const res = await fetch(`${API_URL}/api/repositories`)
  if (!res.ok) throw new Error('Failed to fetch repositories')
  return res.json()
}

export function getChatEndpoint(repositoryId?: string): string {
  const base = `${API_URL}/api/chat`
  if (repositoryId) {
    return `${base}?repository=${encodeURIComponent(repositoryId)}`
  }
  return base
}

export { API_URL }
