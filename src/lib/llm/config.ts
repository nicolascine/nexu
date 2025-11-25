// LLM configuration from environment

import type { LLMProviderType, EmbeddingProviderType } from './types';

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || 'anthropic') as LLMProviderType;

  return {
    provider,
    model: process.env.LLM_MODEL || getDefaultModel(provider),
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: getApiKey(provider),
  };
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = (process.env.EMBEDDING_PROVIDER || 'openai') as EmbeddingProviderType;

  return {
    provider,
    model: process.env.EMBEDDING_MODEL || getDefaultEmbeddingModel(provider),
    baseUrl: process.env.EMBEDDING_BASE_URL,
    apiKey: provider === 'openai' ? process.env.OPENAI_API_KEY : undefined,
  };
}

function getDefaultModel(provider: LLMProviderType): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'openai':
      return 'gpt-4o';
    case 'ollama':
      return 'deepseek-coder-v2';
    case 'custom':
      return 'default';
  }
}

function getDefaultEmbeddingModel(provider: EmbeddingProviderType): string {
  switch (provider) {
    case 'openai':
      return 'text-embedding-3-small';
    case 'ollama':
      return 'nomic-embed-text';
  }
}

function getApiKey(provider: LLMProviderType): string | undefined {
  switch (provider) {
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
    default:
      return undefined;
  }
}
