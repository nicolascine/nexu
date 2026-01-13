// GET /api/projects/:id/sessions - Get project sessions history
// POST /api/projects/:id/sessions - Start a new session

import { NextRequest, NextResponse } from 'next/server';
import {
  getProject,
  getProjectSessions,
  startProjectSession,
  getActiveSession,
} from '../../../../../lib/session/projects';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = getProject(params.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const sessions = getProjectSessions(params.id, limit);
    const activeSession = getActiveSession(params.id);

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
      },
      activeSession: activeSession ? {
        id: activeSession.id,
        startedAt: activeSession.started_at,
        branch: activeSession.branch,
      } : null,
      sessions: sessions.map(s => ({
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        durationMinutes: s.duration_minutes,
        branch: s.branch,
        summary: s.summary,
        notes: s.notes,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = getProject(params.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if there's already an active session
    const activeSession = getActiveSession(params.id);
    if (activeSession) {
      return NextResponse.json({
        error: 'A session is already active',
        activeSession: {
          id: activeSession.id,
          startedAt: activeSession.started_at,
        },
      }, { status: 409 });
    }

    const session = startProjectSession(params.id);
    if (!session) {
      return NextResponse.json({ error: 'Failed to start session' }, { status: 500 });
    }

    return NextResponse.json({
      session: {
        id: session.id,
        startedAt: session.started_at,
        branch: session.branch,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
