// GET /api/projects/:id/timeline - Get project timeline
// POST /api/projects/:id/timeline - Add event to timeline

import { NextRequest, NextResponse } from 'next/server';
import {
  getProject,
  getProjectTimeline,
  addProjectNote,
  addProjectMilestone,
  addProjectBlocker,
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
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    const events = getProjectTimeline(params.id, limit);

    // Parse JSON data for each event
    const timeline = events.map(event => ({
      id: event.id,
      type: event.event_type,
      timestamp: event.timestamp,
      sessionId: event.session_id,
      ...JSON.parse(event.event_data_json),
    }));

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
      },
      timeline,
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

    const body = await request.json();
    const { type, title, description } = body;

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    switch (type) {
      case 'note':
        if (!description) {
          return NextResponse.json({ error: 'description is required for notes' }, { status: 400 });
        }
        addProjectNote(params.id, description);
        break;

      case 'milestone':
        if (!title) {
          return NextResponse.json({ error: 'title is required for milestones' }, { status: 400 });
        }
        addProjectMilestone(params.id, title, description);
        break;

      case 'blocker':
        if (!title) {
          return NextResponse.json({ error: 'title is required for blockers' }, { status: 400 });
        }
        addProjectBlocker(params.id, title, description);
        break;

      default:
        return NextResponse.json({ error: `Unknown event type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
