// GET /api/projects/:id/sessions/:sessionId - Get session details
// POST /api/projects/:id/sessions/:sessionId/end - End a session

import { NextRequest, NextResponse } from 'next/server';
import { getProject, endProjectSession } from '../../../../../../lib/session/projects';
import * as db from '../../../../../../lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  try {
    const project = getProject(params.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const session = db.getProjectSessions(params.id, 100).find(
      (s) => s.id === params.sessionId
    );

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        id: session.id,
        projectId: session.project_id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationMinutes: session.duration_minutes,
        branch: session.branch,
        summary: session.summary,
        notes: session.notes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  try {
    const project = getProject(params.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const { summary, notes } = body;

    const session = endProjectSession(params.sessionId, summary, notes);

    if (!session) {
      return NextResponse.json({ error: 'Session not found or already ended' }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        id: session.id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationMinutes: session.duration_minutes,
        summary: session.summary,
        notes: session.notes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
