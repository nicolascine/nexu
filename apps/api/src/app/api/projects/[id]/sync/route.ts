// POST /api/projects/:id/sync - Sync git commits to timeline

import { NextRequest, NextResponse } from 'next/server';
import { getProject, syncProjectCommits } from '../../../../../lib/session/projects';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const project = getProject(params.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const synced = syncProjectCommits(params.id);

    return NextResponse.json({
      success: true,
      synced,
      message: synced > 0 ? `Synced ${synced} new commits` : 'No new commits to sync',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
