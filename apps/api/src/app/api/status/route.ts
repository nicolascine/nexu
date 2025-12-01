// GET /api/status - Health check and index status

import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/nexu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getStatus();

    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (error) {
    console.error('Status API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        ready: false,
        indexed: false,
      },
      { status: 500 }
    );
  }
}
