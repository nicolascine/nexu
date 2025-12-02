// POST /api/chat - Streaming chat endpoint
// Compatible with Vercel AI SDK useChat hook

import { NextRequest } from 'next/server';
import { search, initIndexAsync } from '@/lib/nexu';
import type { CodeChunk } from '@/lib/ast';
import { generateStream } from '@/lib/llm';

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

    // check index is loaded (supports both JSON and pgvector)
    const { jsonStore, pgStore } = await initIndexAsync();
    if (!jsonStore && !pgStore) {
      return new Response(
        JSON.stringify({ error: 'Index not initialized. Run `npm run ingest` first.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // retrieve relevant chunks
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

    // create streaming response
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
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
              content: c.content, // Include code content for citations
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
          }

          // signal completion
          controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
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
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
