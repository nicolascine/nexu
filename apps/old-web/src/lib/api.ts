const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ChunkInfo {
  filepath: string
  startLine: number
  endLine: number
  nodeType: string
  name?: string
  score?: number
}

export interface StatusResponse {
  ok: boolean
  ready: boolean
  indexed: boolean
  meta?: {
    stats: {
      chunks: number
      files: number
    }
  }
  llm: {
    provider: string
    model: string
  }
  embedding: {
    provider: string
    model: string
  }
}

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch(`${API_URL}/api/status`)
  if (!res.ok) throw new Error('Failed to fetch status')
  return res.json()
}

export async function search(query: string, options?: {
  topK?: number
  reranker?: 'bge' | 'llm' | 'none'
  expandGraph?: boolean
}) {
  const res = await fetch(`${API_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, options }),
  })
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

export async function* chatStream(
  messages: Message[],
  options?: {
    topK?: number
    reranker?: 'bge' | 'llm' | 'none'
    expandGraph?: boolean
  }
): AsyncGenerator<{ type: 'text' | 'chunks' | 'done', data: string | ChunkInfo[] }> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, options }),
  })

  if (!res.ok) {
    throw new Error('Chat request failed')
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line) continue

      // vercel ai sdk format: "0:\"text\"" for text, "2:[...]" for data
      const match = line.match(/^(\d):(.+)$/)
      if (!match) continue

      const [, type, data] = match

      if (type === '0') {
        // text chunk
        yield { type: 'text', data: JSON.parse(data) }
      } else if (type === '2') {
        // metadata (chunks)
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed) && parsed[0]?.type === 'chunks') {
          yield { type: 'chunks', data: parsed[0].data }
        }
      } else if (type === 'd') {
        // done
        yield { type: 'done', data: '' }
      }
    }
  }
}

export { API_URL }
