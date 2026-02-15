/**
 * Ollama embedding provider
 *
 * Uses a local Ollama instance for generating embeddings
 * Supports nomic-embed-text, mxbai-embed-large, etc.
 */

export interface OllamaConfig {
  baseUrl?: string
  model?: string
}

const DEFAULT_CONFIG: Required<OllamaConfig> = {
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text',
}

export async function generateEmbedding(
  text: string,
  config: OllamaConfig = {}
): Promise<number[]> {
  const { baseUrl, model } = { ...DEFAULT_CONFIG, ...config }

  const response = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.embedding
}

export async function generateBatchEmbeddings(
  texts: string[],
  config: OllamaConfig = {}
): Promise<number[][]> {
  // ollama doesn't have native batch support yet
  // so we do sequential calls (could parallelize with Promise.all but
  // that might overload a local instance)
  const embeddings: number[][] = []

  for (const text of texts) {
    const embedding = await generateEmbedding(text, config)
    embeddings.push(embedding)
  }

  return embeddings
}
