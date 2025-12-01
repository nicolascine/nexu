// POST /api/chat - Streaming chat endpoint
// Compatible with Vercel AI SDK useChat hook

import { NextRequest } from 'next/server';
import { chatStream, search, initIndexAsync, type ChatRequest } from '@/lib/nexu';
import type { CodeChunk } from '@/lib/ast';
import { generateStream } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  options?: {
    topK?: number;
    reranker?: 'bge' | 'llm' | 'none';
    expandGraph?: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { messages, options } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
