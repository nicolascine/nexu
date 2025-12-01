// GET /api/status - Health check and index status

import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/nexu';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await getStatus();

    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to get status',
        ready: false,
        indexed: false,
      },
      { status: 500 }
    );
  }
}
