// GET /api/projects - List all registered projects
// POST /api/projects - Register a new project

import { NextRequest, NextResponse } from 'next/server';
import { listProjects, addProject } from '../../../lib/session/projects';

export async function GET() {
  try {
    const projects = listProjects();

    // Transform for the UI - simpler format
    const response = projects.map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      status: p.status,
      addedAt: p.addedAt,
      lastAccessed: p.lastAccessed,
      currentTask: p.context.currentTask,
      git: {
        branch: p.context.git.branch,
        lastCommit: p.context.git.lastCommit,
        uncommittedChanges: p.context.git.uncommittedChanges.length,
      },
      pendingItems: p.context.pendingItems.length,
      suggestedNextStep: p.context.suggestedNextStep,
    }));

    return NextResponse.json({ projects: response });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path } = body;

    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const project = addProject(path);

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
