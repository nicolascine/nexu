/**
 * validates chunks before they enter the pipeline
 * catches edge cases from the AST parser
 */

export interface ChunkValidation {
  valid: boolean
  reason?: string
}

export function validateChunk(chunk: { content: string; metadata?: any }): ChunkValidation {
  if (!chunk.content || chunk.content.trim().length === 0) {
    return { valid: false, reason: 'empty content' }
  }

  // chunks that are just comments or whitespace
  if (isOnlyComments(chunk.content)) {
    return { valid: false, reason: 'only comments' }
  }

  // very short chunks are usually noise
  if (chunk.content.trim().length < 10) {
    return { valid: false, reason: 'too short' }
  }

  return { valid: true }
}

function isOnlyComments(content: string): boolean {
  const lines = content.split('\n')
  return lines.every(line => {
    const trimmed = line.trim()
    return trimmed === '' ||
           trimmed.startsWith('//') ||
           trimmed.startsWith('/*') ||
           trimmed.startsWith('*') ||
           trimmed.startsWith('#')
  })
}
