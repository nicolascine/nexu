// OpenAI-compatible provider (works with OpenAI, Ollama, vLLM, LM Studio, etc.)

import OpenAI from 'openai';
import type {
  LLMProvider,
  EmbeddingProvider,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
} from '../types';
import type { LLMConfig, EmbeddingConfig } from '../config';

export class OpenAICompatibleProvider implements LLMProvider, EmbeddingProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: LLMConfig | EmbeddingConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey || 'ollama', // ollama doesn't need a real key
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
    });
    this.model = config.model;
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const response = await this.client.chat.completions.create({
      model: options.model || this.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error('No response content from OpenAI-compatible API');
    }

    return {
      content: choice.message.content,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  async *chatStream(options: ChatOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: options.model || this.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    const input = Array.isArray(options.input) ? options.input : [options.input];

    const response = await this.client.embeddings.create({
      model: options.model || this.model,
      input,
    });

    return {
      embeddings: response.data.map((d) => d.embedding),
      usage: {
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }
}

// convenience factory for ollama
export function createOllamaProvider(config: LLMConfig): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    ...config,
    baseUrl: config.baseUrl || 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });
}
