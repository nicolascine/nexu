// Projects Storage - SQLite-backed storage for registered projects

import { existsSync } from 'fs';
import { getSessionContext, SessionContext } from './index';
import * as db from '../db';

export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  lastAccessed?: string;
}

export interface ProjectWithContext extends Project {
  context: SessionContext;
  status: 'active' | 'recent' | 'inactive';
}

function generateId(path: string): string {
  return path
    .replace(/^\//, '')
    .replace(/\//g, '--')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .slice(-50);
}

function getProjectStatus(context: SessionContext): 'active' | 'recent' | 'inactive' {
  if (!context.git.lastCommit) return 'inactive';

  const lastCommitDate = new Date(context.git.lastCommit.date);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60);

  if (hoursDiff < 24) return 'active';
  if (hoursDiff < 24 * 7) return 'recent';
  return 'inactive';
}

function dbProjectToProject(dbProject: db.DbProject): Project {
  return {
    id: dbProject.id,
    name: dbProject.name,
    path: dbProject.path,
    addedAt: dbProject.created_at,
    lastAccessed: dbProject.last_accessed || undefined,
  };
}

export function listProjects(): ProjectWithContext[] {
  const dbProjects = db.getAllProjects();

  return dbProjects
    .map((dbProject) => {
      try {
        const project = dbProjectToProject(dbProject);
        const context = getSessionContext(project.path);
        const status = getProjectStatus(context);
        return { ...project, context, status };
      } catch {
        // Project path might not exist anymore
        return null;
      }
    })
    .filter((p): p is ProjectWithContext => p !== null)
    .sort((a, b) => {
      // Sort by status: active > recent > inactive
      const statusOrder = { active: 0, recent: 1, inactive: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      // Then by last commit date
      const aDate = a.context.git.lastCommit?.date || '';
      const bDate = b.context.git.lastCommit?.date || '';
      return bDate.localeCompare(aDate);
    });
}

export function getProject(id: string): ProjectWithContext | null {
  const dbProject = db.getProject(id);
  if (!dbProject) return null;

  try {
    const project = dbProjectToProject(dbProject);
    const context = getSessionContext(project.path);
    const status = getProjectStatus(context);

    // Update last accessed
    db.touchProject(id);

    return { ...project, context, status };
  } catch {
    return null;
  }
}

export function addProject(path: string): Project {
  // Validate path exists
  if (!existsSync(path)) {
    throw new Error(`Path does not exist: ${path}`);
  }

  // Check if already exists
  const existing = db.getProjectByPath(path);
  if (existing) {
    return dbProjectToProject(existing);
  }

  const id = generateId(path);
  const name = path.split('/').pop() || 'unknown';

  const dbProject = db.createProject(id, name, path);
  return dbProjectToProject(dbProject);
}

export function removeProject(id: string): boolean {
  return db.deleteProject(id);
}

export function getProjectByPath(path: string): ProjectWithContext | null {
  const dbProject = db.getProjectByPath(path);
  if (!dbProject) return null;
  return getProject(dbProject.id);
}

// Session management
export function startProjectSession(projectId: string): db.DbSession | null {
  const project = db.getProject(projectId);
  if (!project) return null;

  // Get current context for the session
  try {
    const context = getSessionContext(project.path);
    return db.startSession(projectId, context.git.branch, context);
  } catch {
    return db.startSession(projectId);
  }
}

export function endProjectSession(
  sessionId: string,
  summary?: string,
  notes?: string
): db.DbSession | null {
  return db.endSession(sessionId, summary, notes);
}

export function getProjectSessions(projectId: string, limit: number = 20): db.DbSession[] {
  return db.getProjectSessions(projectId, limit);
}

export function getActiveSession(projectId: string): db.DbSession | null {
  return db.getActiveSession(projectId);
}

// Timeline
export function getProjectTimeline(projectId: string, limit: number = 50) {
  return db.getProjectTimeline(projectId, limit);
}

export function addProjectNote(projectId: string, note: string): void {
  const session = db.getActiveSession(projectId);
  db.recordNote(projectId, note, session?.id);
}

export function addProjectMilestone(projectId: string, title: string, description?: string): void {
  db.recordMilestone(projectId, title, description);
}

export function addProjectBlocker(projectId: string, title: string, description?: string): void {
  const session = db.getActiveSession(projectId);
  db.recordBlocker(projectId, title, description, session?.id);
}

// Sync git commits to timeline
export function syncProjectCommits(projectId: string): number {
  const project = db.getProject(projectId);
  if (!project) return 0;

  // Get recent commits from git
  const context = getSessionContext(project.path);
  const session = db.getActiveSession(projectId);

  let synced = 0;

  // Get the last commit first (most important)
  if (context.git.lastCommit && !db.hasCommit(projectId, context.git.lastCommit.hash)) {
    db.recordCommit(
      projectId,
      context.git.lastCommit.hash,
      context.git.lastCommit.message,
      context.git.lastCommit.author,
      session?.id
    );
    synced++;
  }

  // Sync recent commits (in reverse order so timeline is chronological)
  const recentCommits = [...context.git.recentCommits].reverse();
  for (const commit of recentCommits) {
    if (!db.hasCommit(projectId, commit.hash)) {
      db.recordCommit(
        projectId,
        commit.hash,
        commit.message,
        (commit as { author?: string }).author || 'unknown',
        session?.id
      );
      synced++;
    }
  }

  return synced;
}
