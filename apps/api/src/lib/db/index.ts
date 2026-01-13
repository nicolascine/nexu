// Database module - SQLite for local storage
// Stores sessions, timeline events, and project metadata

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), '.nexu');
const DB_PATH = join(DATA_DIR, 'nexu.db');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance

// Create tables
db.exec(`
  -- Projects table
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed DATETIME,
    settings_json TEXT DEFAULT '{}'
  );

  -- Sessions table - tracks work sessions
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    duration_minutes INTEGER,
    branch TEXT,
    summary TEXT,
    notes TEXT,
    context_json TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  -- Timeline events - granular activity tracking
  CREATE TABLE IF NOT EXISTS timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    session_id TEXT,
    event_type TEXT NOT NULL,
    event_data_json TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events(project_id);
  CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline_events(event_type);
`);

// Types
export interface DbProject {
  id: string;
  name: string;
  path: string;
  created_at: string;
  last_accessed: string | null;
  settings_json: string;
}

export interface DbSession {
  id: string;
  project_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  branch: string | null;
  summary: string | null;
  notes: string | null;
  context_json: string | null;
}

export type TimelineEventType =
  | 'session_start'
  | 'session_end'
  | 'commit'
  | 'branch_switch'
  | 'file_change'
  | 'todo_added'
  | 'todo_completed'
  | 'milestone'
  | 'note'
  | 'blocker'
  | 'ai_summary';

export interface DbTimelineEvent {
  id: number;
  project_id: string;
  session_id: string | null;
  event_type: TimelineEventType;
  event_data_json: string;
  timestamp: string;
}

export interface TimelineEventData {
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// Prepared statements for performance
const statements = {
  // Projects
  insertProject: db.prepare(`
    INSERT INTO projects (id, name, path) VALUES (?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET last_accessed = CURRENT_TIMESTAMP
  `),
  getProject: db.prepare('SELECT * FROM projects WHERE id = ?'),
  getProjectByPath: db.prepare('SELECT * FROM projects WHERE path = ?'),
  getAllProjects: db.prepare('SELECT * FROM projects ORDER BY last_accessed DESC'),
  updateProjectAccess: db.prepare('UPDATE projects SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?'),
  deleteProject: db.prepare('DELETE FROM projects WHERE id = ?'),

  // Sessions
  insertSession: db.prepare(`
    INSERT INTO sessions (id, project_id, branch, context_json)
    VALUES (?, ?, ?, ?)
  `),
  endSession: db.prepare(`
    UPDATE sessions
    SET ended_at = CURRENT_TIMESTAMP,
        duration_minutes = ROUND((JULIANDAY(CURRENT_TIMESTAMP) - JULIANDAY(started_at)) * 24 * 60),
        summary = ?,
        notes = ?
    WHERE id = ?
  `),
  getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  getProjectSessions: db.prepare(`
    SELECT * FROM sessions
    WHERE project_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `),
  getActiveSession: db.prepare(`
    SELECT * FROM sessions
    WHERE project_id = ? AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `),

  // Timeline
  insertEvent: db.prepare(`
    INSERT INTO timeline_events (project_id, session_id, event_type, event_data_json)
    VALUES (?, ?, ?, ?)
  `),
  getProjectTimeline: db.prepare(`
    SELECT * FROM timeline_events
    WHERE project_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),
  getTimelineByType: db.prepare(`
    SELECT * FROM timeline_events
    WHERE project_id = ? AND event_type = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),
  getTimelineRange: db.prepare(`
    SELECT * FROM timeline_events
    WHERE project_id = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp ASC
  `),
};

// Project functions
export function createProject(id: string, name: string, path: string): DbProject {
  statements.insertProject.run(id, name, path);
  return statements.getProject.get(id) as DbProject;
}

export function getProject(id: string): DbProject | null {
  return statements.getProject.get(id) as DbProject | null;
}

export function getProjectByPath(path: string): DbProject | null {
  return statements.getProjectByPath.get(path) as DbProject | null;
}

export function getAllProjects(): DbProject[] {
  return statements.getAllProjects.all() as DbProject[];
}

export function touchProject(id: string): void {
  statements.updateProjectAccess.run(id);
}

export function deleteProject(id: string): boolean {
  const result = statements.deleteProject.run(id);
  return result.changes > 0;
}

// Session functions
export function startSession(projectId: string, branch?: string, context?: object): DbSession {
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const contextJson = context ? JSON.stringify(context) : null;

  statements.insertSession.run(id, projectId, branch || null, contextJson);

  // Record timeline event
  addTimelineEvent(projectId, 'session_start', {
    title: 'Session started',
    description: branch ? `Working on branch: ${branch}` : undefined,
  }, id);

  return statements.getSession.get(id) as DbSession;
}

export function endSession(sessionId: string, summary?: string, notes?: string): DbSession | null {
  statements.endSession.run(summary || null, notes || null, sessionId);

  const session = statements.getSession.get(sessionId) as DbSession | null;

  if (session) {
    // Record timeline event
    addTimelineEvent(session.project_id, 'session_end', {
      title: 'Session ended',
      description: summary,
      metadata: {
        duration_minutes: session.duration_minutes,
        notes
      },
    }, sessionId);
  }

  return session;
}

export function getActiveSession(projectId: string): DbSession | null {
  return statements.getActiveSession.get(projectId) as DbSession | null;
}

export function getProjectSessions(projectId: string, limit: number = 20): DbSession[] {
  return statements.getProjectSessions.all(projectId, limit) as DbSession[];
}

// Timeline functions
export function addTimelineEvent(
  projectId: string,
  eventType: TimelineEventType,
  data: TimelineEventData,
  sessionId?: string
): number {
  const result = statements.insertEvent.run(
    projectId,
    sessionId || null,
    eventType,
    JSON.stringify(data)
  );
  return result.lastInsertRowid as number;
}

export function getProjectTimeline(projectId: string, limit: number = 50): DbTimelineEvent[] {
  return statements.getProjectTimeline.all(projectId, limit) as DbTimelineEvent[];
}

export function getTimelineByType(
  projectId: string,
  eventType: TimelineEventType,
  limit: number = 20
): DbTimelineEvent[] {
  return statements.getTimelineByType.all(projectId, eventType, limit) as DbTimelineEvent[];
}

export function getTimelineRange(
  projectId: string,
  startDate: string,
  endDate: string
): DbTimelineEvent[] {
  return statements.getTimelineRange.all(projectId, startDate, endDate) as DbTimelineEvent[];
}

// Utility: Record a commit
export function recordCommit(
  projectId: string,
  hash: string,
  message: string,
  author: string,
  sessionId?: string
): void {
  addTimelineEvent(projectId, 'commit', {
    title: message,
    description: `by ${author}`,
    metadata: { hash, author },
  }, sessionId);
}

// Utility: Record a milestone
export function recordMilestone(
  projectId: string,
  title: string,
  description?: string
): void {
  addTimelineEvent(projectId, 'milestone', {
    title,
    description,
  });
}

// Utility: Record a blocker
export function recordBlocker(
  projectId: string,
  title: string,
  description?: string,
  sessionId?: string
): void {
  addTimelineEvent(projectId, 'blocker', {
    title,
    description,
  }, sessionId);
}

// Utility: Record a note
export function recordNote(
  projectId: string,
  note: string,
  sessionId?: string
): void {
  addTimelineEvent(projectId, 'note', {
    title: 'Note',
    description: note,
  }, sessionId);
}

// Export database for advanced queries
export { db };
