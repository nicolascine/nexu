// Google Gemini provider

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider, EmbeddingProvider, ChatOptions, ChatResult, EmbedOptions, EmbedResult } from '../types';
import type { LLMConfig, EmbeddingConfig } from '../config';

export class GeminiProvider implements LLMProvider, EmbeddingProvider {
  private client: GoogleGenerativeAI;
  private model: string;
  private embeddingModel: string;

  constructor(config: LLMConfig | EmbeddingConfig) {
    if (!config.apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model;
    this.embeddingModel = 'text-embedding-004';
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const model = this.client.getGenerativeModel({
      model: options.model || this.model,
    });

    const systemMessage = options.messages.find((m) => m.role === 'system');
    const nonSystemMessages = options.messages.filter((m) => m.role !== 'system');

    // build chat history (all but last message)
    const history = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];

    const chat = model.startChat({
      history: history as Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
      systemInstruction: systemMessage?.content,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens || 4096,
      },
    });

    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      content: text,
      usage: {
        inputTokens: usage?.promptTokenCount || 0,
        outputTokens: usage?.candidatesTokenCount || 0,
      },
    };
  }

  async *chatStream(options: ChatOptions): AsyncIterable<string> {
    const model = this.client.getGenerativeModel({
      model: options.model || this.model,
    });

    const systemMessage = options.messages.find((m) => m.role === 'system');
    const nonSystemMessages = options.messages.filter((m) => m.role !== 'system');

    const history = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];

    const chat = model.startChat({
      history: history as Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
      systemInstruction: systemMessage?.content,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens || 4096,
      },
    });

    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    const model = this.client.getGenerativeModel({
      model: options.model || this.embeddingModel,
    });

    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const embeddings: number[][] = [];
    let totalTokens = 0;

    for (const input of inputs) {
      const result = await model.embedContent(input);
      embeddings.push(result.embedding.values);
      // Gemini doesn't return token count for embeddings, estimate
      totalTokens += Math.ceil(input.length / 4);
    }

    return {
      embeddings,
      usage: {
        totalTokens,
      },
    };
  }
}
