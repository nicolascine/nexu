// LLM abstraction layer - vendor lock-in free

import type { CodeChunk } from '../ast';
import type { LLMProvider, EmbeddingProvider, ChatOptions, EmbedOptions } from './types';
import { getLLMConfig, getEmbeddingConfig } from './config';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAICompatibleProvider, createOllamaProvider } from './providers/openai-compatible';

// re-export types
export type {
  Message,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  LLMProvider,
  EmbeddingProvider,
} from './types';

export { getLLMConfig, getEmbeddingConfig } from './config';

// provider factory
export function createLLMProvider(): LLMProvider {
  const config = getLLMConfig();

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAICompatibleProvider(config);
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

// context construction
function buildContext(query: string, chunks: CodeChunk[]): string {
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

  return `<codebase_context>
${chunksContext}
</codebase_context>

<instructions>
Answer the user's query based ONLY on the code above.
Always cite your sources with exact file paths and line numbers.
If information is not in the provided code, say so.
</instructions>

<query>
${query}
</query>`;
}

// main generation function
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const provider = createLLMProvider();
  const context = buildContext(options.query, options.chunks);

  const chatOptions: ChatOptions = {
    messages: [
      {
        role: 'system',
        content:
          'You are a code assistant. Answer questions about the provided codebase context. Always cite file paths and line numbers.',
      },
      {
        role: 'user',
        content: context,
      },
    ],
  };

  const result = await provider.chat(chatOptions);

  // TODO: parse citations from response
  const citations: Citation[] = [];

  return {
    response: result.content,
    citations,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
  };
}

// streaming generation
export async function* generateStream(
  options: GenerateOptions
): AsyncIterable<string> {
  const provider = createLLMProvider();
  const context = buildContext(options.query, options.chunks);

  const chatOptions: ChatOptions = {
    messages: [
      {
        role: 'system',
        content:
          'You are a code assistant. Answer questions about the provided codebase context. Always cite file paths and line numbers.',
      },
      {
        role: 'user',
        content: context,
      },
    ],
  };

  yield* provider.chatStream(chatOptions);
}

// embedding function
export async function embed(text: string | string[]): Promise<number[][]> {
  const provider = createEmbeddingProvider();
  const result = await provider.embed({ input: text });
  return result.embeddings;
}
