// POST /api/search - Search endpoint (retrieval only, no generation)
// Returns relevant code chunks for a query

import { NextRequest, NextResponse } from 'next/server';
import { search, initIndexAsync } from '@/lib/nexu';

export const runtime = 'nodejs';

const VALID_RERANKERS = ['bge', 'llm', 'none'] as const;
const MAX_QUERY_LENGTH = 2000;
const MAX_TOP_K = 50;
const MAX_HOPS = 5;
const MAX_EXPANDED_CHUNKS = 100;

interface RequestBody {
  query: string;
  options?: {
    topK?: number;
    reranker?: 'bge' | 'llm' | 'none';
    expandGraph?: boolean;
    maxHops?: number;
    maxExpandedChunks?: number;
  };
}

function validateOptions(options: RequestBody['options']): string | null {
  if (!options) return null;

  if (options.topK !== undefined) {
    if (typeof options.topK !== 'number' || options.topK < 1 || options.topK > MAX_TOP_K) {
      return `topK must be a number between 1 and ${MAX_TOP_K}`;
    }
  }
  if (options.maxHops !== undefined) {
    if (typeof options.maxHops !== 'number' || options.maxHops < 0 || options.maxHops > MAX_HOPS) {
      return `maxHops must be a number between 0 and ${MAX_HOPS}`;
    }
  }
  if (options.maxExpandedChunks !== undefined) {
    if (typeof options.maxExpandedChunks !== 'number' || options.maxExpandedChunks < 1 || options.maxExpandedChunks > MAX_EXPANDED_CHUNKS) {
      return `maxExpandedChunks must be a number between 1 and ${MAX_EXPANDED_CHUNKS}`;
    }
  }
  if (options.reranker !== undefined) {
    if (!VALID_RERANKERS.includes(options.reranker)) {
      return `reranker must be one of: ${VALID_RERANKERS.join(', ')}`;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { query, options } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query string is required' },
        { status: 400 }
      );
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Query must be at most ${MAX_QUERY_LENGTH} characters` },
        { status: 400 }
      );
    }

    const optionsError = validateOptions(options);
    if (optionsError) {
      return NextResponse.json({ error: optionsError }, { status: 400 });
    }

    // check index is loaded (supports both JSON and pgvector)
    const { jsonStore, pgStore } = await initIndexAsync();
    if (!jsonStore && !pgStore) {
      return NextResponse.json(
        { error: 'Index not initialized. Run `npm run ingest` first.' },
        { status: 503 }
      );
    }

    const result = await search({
      query,
      options: {
        topK: options?.topK || 10,
        reranker: options?.reranker || 'llm',
        rerankTopK: 5,
        expandGraph: options?.expandGraph !== false,
        maxHops: options?.maxHops || 2,
        maxExpandedChunks: options?.maxExpandedChunks || 15,
      },
    });

    return NextResponse.json({
      query,
      chunks: result.chunks,
      stage: result.stage,
      count: result.chunks.length,
    });
  } catch (error) {
    console.error('Search API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
