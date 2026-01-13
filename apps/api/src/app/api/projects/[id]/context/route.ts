// GET /api/projects/:id/context - Get session context for a project

import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '../../../../../lib/session/projects';
import { formatSessionContextAsMarkdown } from '../../../../../lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = getProject(params.id);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check format query param
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'json';

    if (format === 'markdown') {
      const markdown = formatSessionContextAsMarkdown(project.context);
      return new NextResponse(markdown, {
        headers: { 'Content-Type': 'text/markdown' },
      });
    }

    // Default: JSON
    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
      },
      context: project.context,
      markdown: formatSessionContextAsMarkdown(project.context),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
