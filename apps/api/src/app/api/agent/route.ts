// POST /api/agent - Agentic chat with tool use
// Supports both streaming and non-streaming modes

import { NextRequest } from 'next/server';
import { runAgent, runAgentStream, type AgentEvent } from '@/lib/agent';
import { initIndexAsync } from '@/lib/nexu';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 120; // agent may need more time for multi-step reasoning

const MAX_QUERY_LENGTH = 4000;
const MAX_STEPS = 15;

interface RequestBody {
  query: string;
  options?: {
    repository?: string;
    maxSteps?: number;
    stream?: boolean;
  };
}

function validateRequest(body: RequestBody): string | null {
  if (!body.query || typeof body.query !== 'string') {
    return 'Query is required and must be a string';
  }
  if (body.query.length > MAX_QUERY_LENGTH) {
    return `Query must be at most ${MAX_QUERY_LENGTH} characters`;
  }
  if (body.options?.maxSteps !== undefined) {
    if (typeof body.options.maxSteps !== 'number' || body.options.maxSteps < 1 || body.options.maxSteps > MAX_STEPS) {
      return `maxSteps must be between 1 and ${MAX_STEPS}`;
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

    const { query, options } = body;

    // check index is loaded
    const { jsonStore, pgStore } = await initIndexAsync();
    if (!jsonStore && !pgStore) {
      return new Response(
        JSON.stringify({ error: 'Index not initialized. Run ingestion first.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // non-streaming mode
    if (!options?.stream) {
      const result = await runAgent(query, {
        repositoryId: options?.repository,
        maxSteps: options?.maxSteps,
      });

      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // streaming mode
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of runAgentStream(query, {
            repositoryId: options?.repository,
            maxSteps: options?.maxSteps,
          })) {
            // send event as SSE
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));

            // if done or error, close stream
            if (event.type === 'done' || event.type === 'error') {
              break;
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          logger.error('Agent streaming error', { query }, error);
          const errorEvent: AgentEvent = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('Agent API error', {}, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// GET endpoint to list available tools
export async function GET() {
  const { AGENT_TOOLS } = await import('@/lib/agent');

  return new Response(
    JSON.stringify({
      tools: AGENT_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema.properties,
      })),
      maxSteps: MAX_STEPS,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
