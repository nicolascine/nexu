// LLM abstraction layer - vendor lock-in free

import type { CodeChunk } from '../ast';
import { getEmbeddingConfig, getLLMConfig } from './config';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { OpenAICompatibleProvider, createOllamaProvider } from './providers/openai-compatible';
import type { ChatOptions, EmbedOptions, EmbeddingProvider, LLMProvider } from './types';

// re-export types
export type {
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  EmbeddingProvider,
  LLMProvider,
  Message,
} from './types';

export { getEmbeddingConfig, getLLMConfig } from './config';

// provider factory
export function createLLMProvider(): LLMProvider {
  const config = getLLMConfig();

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAICompatibleProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'ollama':
      return createOllamaProvider(config);
    case 'custom':
      return new OpenAICompatibleProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const config = getEmbeddingConfig();

  switch (config.provider) {
    case 'openai':
      return new OpenAICompatibleProvider({
        ...config,
        baseUrl: 'https://api.openai.com/v1',
      });
    case 'gemini':
      return new GeminiProvider({
        ...config,
        apiKey: config.apiKey || process.env.GEMINI_API_KEY,
      });
    case 'ollama':
      return new OpenAICompatibleProvider({
        ...config,
        baseUrl: config.baseUrl || 'http://localhost:11434/v1',
        apiKey: 'ollama',
      });
    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}

// generation types
export interface GenerateOptions {
  query: string;
  chunks: CodeChunk[];
  stream?: boolean;
  sessionContext?: string; // Optional session context markdown
}

export interface Citation {
  filepath: string;
  startLine: number;
  endLine: number;
}

export interface GenerateResult {
  response: string;
  citations: Citation[];
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are a senior software engineer and code assistant. Your task is to answer questions about the provided codebase context.

CRITICAL INSTRUCTIONS:
1. Answer in the same language as the user's question (English or Spanish).
2. START YOUR RESPONSE IMMEDIATELY with the answer.
3. DO NOT use introductory filler phrases like "Based on the provided code context...", "The code shows...", "According to the repository...".
4. Be concise and professional. Focus on the most relevant parts.
5. Always cite file paths and line numbers.
6. Do not output excessive code blocks; only what is necessary.
7. When explaining flows, architecture, or relationships, include a Mermaid diagram using \`\`\`mermaid blocks.

Example:
User: "How is auth handled?"
Bad Answer: "Based on the code in src/auth.ts, authentication is handled using..."
Good Answer: "Authentication is handled in \`src/auth.ts\` using the \`AuthService\` class..."`;

// context construction
function buildContext(query: string, chunks: CodeChunk[], sessionContext?: string): string {
  const chunksContext = chunks
    .map(
      (chunk, i) => `
--- Chunk ${i + 1} ---
File: ${chunk.filepath}
Lines: ${chunk.startLine}-${chunk.endLine}
Type: ${chunk.nodeType}
Name: ${chunk.name}

${chunk.content}

[Imports: ${chunk.imports.join(', ') || 'none'}]
[Exports: ${chunk.exports.join(', ') || 'none'}]
`
    )
    .join('\n');

  // Include session context if provided
  const sessionSection = sessionContext
    ? `<session_context>
${sessionContext}
</session_context>

`
    : '';

  return `${sessionSection}<codebase_context>
${chunksContext}
</codebase_context>

<instructions>
Answer the user's query based on the code context above.
${sessionContext ? 'Consider the session context (git state, TODOs, recent work) when providing relevant suggestions.' : ''}
Always cite your sources with exact file paths and line numbers.
If information is not in the provided code, say so.
DO NOT start your answer with "Based on the code...", "The provided context...", or similar phrases. Start directly with the answer.
</instructions>

<query>
${query}
</query>`;
}

/**
 * Generates a response using the configured LLM provider.
 * Builds context from code chunks and returns response with citations.
 *
 * @param options.query - The user's question
 * @param options.chunks - Retrieved code chunks to use as context
 * @returns Generated response with citations and token usage
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const provider = createLLMProvider();
  const context = buildContext(options.query, options.chunks, options.sessionContext);

  const chatOptions: ChatOptions = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
    ],
  };

  const result = await provider.chat(chatOptions);

  // citations are extracted from chunk metadata, not parsed from LLM response
  const citations: Citation[] = options.chunks.map((chunk) => ({
    filepath: chunk.filepath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
  }));

  return {
    response: result.content,
    citations,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
  };
}

/**
 * Streaming version of generate. Yields text chunks as they arrive.
 * Use this for real-time chat interfaces.
 */
export async function* generateStream(options: GenerateOptions): AsyncIterable<string> {
  const provider = createLLMProvider();
  const context = buildContext(options.query, options.chunks, options.sessionContext);

  const chatOptions: ChatOptions = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
    ],
  };

  yield* provider.chatStream(chatOptions);
}

/**
 * Generates embeddings for text using the configured embedding provider.
 * Supports both single strings and arrays for batch processing.
 *
 * @param text - Single string or array of strings to embed
 * @returns Array of embedding vectors (1536 dimensions for text-embedding-3-small)
 */
export async function embed(text: string | string[]): Promise<number[][]> {
  const provider = createEmbeddingProvider();
  const result = await provider.embed({ input: text });
  return result.embeddings;
}
