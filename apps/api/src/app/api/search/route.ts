// POST /api/search - Search endpoint (retrieval only, no generation)
// Returns relevant code chunks for a query

import { NextRequest, NextResponse } from 'next/server';
import { search, initIndexAsync } from '@/lib/nexu';

export const runtime = 'nodejs';

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
