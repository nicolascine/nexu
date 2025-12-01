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
