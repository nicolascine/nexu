// Projects Storage - Simple file-based storage for registered projects
// In production, this would be a database

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getSessionContext, SessionContext } from './index';

const DATA_DIR = join(process.cwd(), '.nexu');
const PROJECTS_FILE = join(DATA_DIR, 'projects.json');

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

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadProjects(): Project[] {
  ensureDataDir();
  if (!existsSync(PROJECTS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(PROJECTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]) {
  ensureDataDir();
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

function generateId(path: string): string {
  // Create a simple ID from the path
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

export function listProjects(): ProjectWithContext[] {
  const projects = loadProjects();

  return projects
    .map(project => {
      try {
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
  const projects = loadProjects();
  const project = projects.find(p => p.id === id);

  if (!project) return null;

  try {
    const context = getSessionContext(project.path);
    const status = getProjectStatus(context);

    // Update last accessed
    project.lastAccessed = new Date().toISOString();
    saveProjects(projects);

    return { ...project, context, status };
  } catch {
    return null;
  }
}

export function addProject(path: string): Project {
  const projects = loadProjects();

  // Check if already exists
  const existing = projects.find(p => p.path === path);
  if (existing) {
    return existing;
  }

  // Validate path exists
  if (!existsSync(path)) {
    throw new Error(`Path does not exist: ${path}`);
  }

  const project: Project = {
    id: generateId(path),
    name: path.split('/').pop() || 'unknown',
    path,
    addedAt: new Date().toISOString(),
  };

  projects.push(project);
  saveProjects(projects);

  return project;
}

export function removeProject(id: string): boolean {
  const projects = loadProjects();
  const index = projects.findIndex(p => p.id === id);

  if (index === -1) return false;

  projects.splice(index, 1);
  saveProjects(projects);

  return true;
}

export function getProjectByPath(path: string): ProjectWithContext | null {
  const projects = loadProjects();
  const project = projects.find(p => p.path === path);

  if (!project) return null;

  return getProject(project.id);
}
