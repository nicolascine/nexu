// LLM provider abstraction types

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface EmbedOptions {
  input: string | string[];
  model?: string;
}

export interface EmbedResult {
  embeddings: number[][];
  usage: {
    totalTokens: number;
  };
}

export interface LLMProvider {
  chat(options: ChatOptions): Promise<ChatResult>;
  chatStream(options: ChatOptions): AsyncIterable<string>;
}

export interface EmbeddingProvider {
  embed(options: EmbedOptions): Promise<EmbedResult>;
}

export type LLMProviderType = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'custom';
export type EmbeddingProviderType = 'openai' | 'gemini' | 'ollama';
