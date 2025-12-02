// GET /api/repositories - List all indexed repositories
// Public endpoint, read-only

import { NextResponse } from 'next/server'
import { getRepositories } from '@/lib/repositories'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const repositories = await getRepositories()

    return NextResponse.json({
      ok: true,
      repositories,
      count: repositories.length,
    })
  } catch (error) {
    logger.error('Repositories API error', {}, error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch repositories' },
      { status: 500 }
    )
  }
}
