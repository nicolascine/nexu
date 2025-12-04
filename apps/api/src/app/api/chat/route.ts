// POST /api/chat - Streaming chat endpoint
// Compatible with Vercel AI SDK useChat hook

import { NextRequest } from 'next/server';
import { search, initIndexAsync } from '@/lib/nexu';
import type { CodeChunk } from '@/lib/ast';
import { generateStream, getLLMConfig, getEmbeddingConfig } from '@/lib/llm';
import { logger } from '@/lib/logger';
import {
  startTrace,
  startSpan,
  endSpan,
  recordTokens,
  recordRetrieval,
  endTrace,
} from '@/lib/telemetry';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_RERANKERS = ['bge', 'llm', 'none'] as const;
const MAX_QUERY_LENGTH = 2000;
const MAX_MESSAGES = 50;
const MAX_TOP_K = 50;

interface RequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  options?: {
    topK?: number;
    reranker?: 'bge' | 'llm' | 'none';
    expandGraph?: boolean;
    repository?: string;
  };
}

function validateRequest(body: RequestBody): string | null {
  const { messages, options } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return 'Messages array is required and must not be empty';
  }
  if (messages.length > MAX_MESSAGES) {
    return `Maximum ${MAX_MESSAGES} messages allowed`;
  }
  for (const msg of messages) {
    if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
      return 'Each message must have a valid role (user or assistant)';
    }
    if (typeof msg.content !== 'string') {
      return 'Each message must have a string content';
    }
    if (msg.content.length > MAX_QUERY_LENGTH) {
      return `Message content must be at most ${MAX_QUERY_LENGTH} characters`;
    }
  }
  if (options?.topK !== undefined) {
    if (typeof options.topK !== 'number' || options.topK < 1 || options.topK > MAX_TOP_K) {
      return `topK must be a number between 1 and ${MAX_TOP_K}`;
    }
  }
  if (options?.reranker !== undefined) {
    if (!VALID_RERANKERS.includes(options.reranker)) {
      return `reranker must be one of: ${VALID_RERANKERS.join(', ')}`;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const llmConfig = getLLMConfig();
  const embeddingConfig = getEmbeddingConfig();
  let traceId: string | null = null;

  try {
    const body: RequestBody = await request.json();

    const validationError = validateRequest(body);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages, options } = body;

    // get the last user message as the query
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) {
      return new Response(
        JSON.stringify({ error: 'No user message found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const query = lastUserMessage.content;

    // start trace for observability
    traceId = startTrace(query, 'chat', options?.repository);

    // check index is loaded (supports both JSON and pgvector)
    const initSpan = startSpan(traceId, 'init_index');
    const { jsonStore, pgStore } = await initIndexAsync();
    endSpan(initSpan);

    if (!jsonStore && !pgStore) {
      endTrace(traceId, false, embeddingConfig.model, llmConfig.model, 'Index not initialized');
      return new Response(
        JSON.stringify({ error: 'Index not initialized. Run `npm run ingest` first.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // retrieve relevant chunks
    const retrievalSpan = startSpan(traceId, 'retrieval', {
      topK: options?.topK || 10,
      reranker: options?.reranker || 'llm',
    });

    const searchResult = await search({
      query,
      repositoryId: options?.repository,
      options: {
        topK: options?.topK || 10,
        reranker: options?.reranker || 'llm',
        rerankTopK: 5,
        expandGraph: options?.expandGraph !== false,
        maxHops: 2,
        maxExpandedChunks: 15,
      },
    });

    endSpan(retrievalSpan);

    // record retrieval stats
    recordRetrieval(traceId, searchResult.chunks.length, options?.reranker || 'llm');

    const chunks: CodeChunk[] = searchResult.chunks.map(c => ({
      id: `${c.filepath}:${c.startLine}-${c.endLine}`,
      filepath: c.filepath,
      startLine: c.startLine,
      endLine: c.endLine,
      nodeType: c.nodeType as CodeChunk['nodeType'],
      name: c.name,
      content: c.content,
      language: c.language as CodeChunk['language'],
      imports: [],
      exports: [],
      types: [],
    }));

    // estimate input tokens (rough: 4 chars per token)
    const contextSize = chunks.reduce((sum, c) => sum + c.content.length, 0);
    const estimatedInputTokens = Math.ceil((contextSize + query.length) / 4);

    // create streaming response
    const encoder = new TextEncoder();
    const currentTraceId = traceId; // capture for closure
    let outputTokenCount = 0;

    const stream = new ReadableStream({
      async start(controller) {
        const generationSpan = startSpan(currentTraceId, 'generation');

        try {
          // stream chunks metadata first as a special message
          const chunksData = {
            type: 'chunks',
            data: searchResult.chunks.map(c => ({
              filepath: c.filepath,
              startLine: c.startLine,
              endLine: c.endLine,
              nodeType: c.nodeType,
              name: c.name,
              content: c.content,
              language: c.language,
              score: c.score,
            })),
          };

          // send chunks metadata as data event (Vercel AI SDK format)
          controller.enqueue(encoder.encode(`2:${JSON.stringify([chunksData])}\n`));

          // stream the LLM response
          for await (const text of generateStream({ query, chunks })) {
            // Vercel AI SDK text streaming format: 0:"text"\n
            controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
            outputTokenCount += Math.ceil(text.length / 4); // rough estimate
          }

          endSpan(generationSpan);

          // record token usage
          recordTokens(currentTraceId, estimatedInputTokens, outputTokenCount);

          // end trace successfully
          endTrace(currentTraceId, true, embeddingConfig.model, llmConfig.model);

          // signal completion
          controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
          controller.close();
        } catch (error) {
          endSpan(generationSpan);
          endTrace(currentTraceId, false, embeddingConfig.model, llmConfig.model,
            error instanceof Error ? error.message : 'Generation failed');

          logger.error('Streaming error', { query }, error);
          controller.enqueue(
            encoder.encode(`3:${JSON.stringify({ error: 'Generation failed' })}\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
        'X-Trace-Id': traceId,
      },
    });
  } catch (error) {
    if (traceId) {
      endTrace(traceId, false, embeddingConfig.model, llmConfig.model,
        error instanceof Error ? error.message : 'Unknown error');
    }

    logger.error('Chat API error', {}, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
