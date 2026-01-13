# Nexu UI Update: Project Timeline & Session History

## Context
Nexu now has a SQLite database storing session history and timeline events. Add a Timeline view to show project progress over time.

## New API Endpoints (localhost:3001)

### Get Project Timeline
```
GET /api/projects/:id/timeline?limit=50

Response:
{
  "project": { "id": "string", "name": "string" },
  "timeline": [
    {
      "id": number,
      "type": "session_start" | "session_end" | "commit" | "milestone" | "note" | "blocker",
      "timestamp": "ISO date",
      "sessionId": "string | null",
      "title": "string",
      "description": "string",
      "metadata": { /* varies by type */ }
    }
  ]
}
```

### Add Timeline Event
```
POST /api/projects/:id/timeline
Body: { "type": "note" | "milestone" | "blocker", "title": "string", "description": "string" }

Response: { "success": true }
```

### Get Session History
```
GET /api/projects/:id/sessions?limit=20

Response:
{
  "project": { "id": "string", "name": "string" },
  "activeSession": {
    "id": "string",
    "startedAt": "ISO date",
    "branch": "string"
  } | null,
  "sessions": [
    {
      "id": "string",
      "startedAt": "ISO date",
      "endedAt": "ISO date | null",
      "durationMinutes": number,
      "branch": "string",
      "summary": "string",
      "notes": "string"
    }
  ]
}
```

### Start/End Session
```
POST /api/projects/:id/sessions
Response: { "session": { "id": "string", "startedAt": "ISO date", "branch": "string" } }

POST /api/projects/:id/sessions/:sessionId/end
Body: { "summary": "string", "notes": "string" }
Response: { "session": { ... } }
```

---

## UI Changes Required

### 1. Add Timeline API Functions

In `src/lib/api.ts`, add:

```typescript
export interface TimelineEvent {
  id: number;
  type: 'session_start' | 'session_end' | 'commit' | 'milestone' | 'note' | 'blocker';
  timestamp: string;
  sessionId: string | null;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  branch: string | null;
  summary: string | null;
  notes: string | null;
}

export async function getProjectTimeline(projectId: string, limit = 50): Promise<TimelineEvent[]> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/timeline?limit=${limit}`);
  const data = await response.json();
  return data.timeline;
}

export async function addTimelineEvent(
  projectId: string,
  event: { type: 'note' | 'milestone' | 'blocker'; title?: string; description?: string }
): Promise<void> {
  await fetch(`${API_URL}/api/projects/${projectId}/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
}

export async function getProjectSessions(projectId: string): Promise<{
  activeSession: Session | null;
  sessions: Session[];
}> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/sessions`);
  const data = await response.json();
  return { activeSession: data.activeSession, sessions: data.sessions };
}

export async function startSession(projectId: string): Promise<Session> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/sessions`, {
    method: 'POST',
  });
  const data = await response.json();
  return data.session;
}
```

### 2. Create Timeline Component

Create `src/components/ProjectTimeline.tsx`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjectTimeline, addTimelineEvent, type TimelineEvent } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './ui/dialog';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface TimelineItemProps {
  event: TimelineEvent;
}

function TimelineItem({ event }: TimelineItemProps) {
  const typeConfig = {
    session_start: { icon: '▶️', color: 'bg-green-100 text-green-800', label: 'Session' },
    session_end: { icon: '⏹️', color: 'bg-gray-100 text-gray-800', label: 'Session' },
    commit: { icon: '💾', color: 'bg-blue-100 text-blue-800', label: 'Commit' },
    milestone: { icon: '🎯', color: 'bg-purple-100 text-purple-800', label: 'Milestone' },
    note: { icon: '📝', color: 'bg-yellow-100 text-yellow-800', label: 'Note' },
    blocker: { icon: '🚧', color: 'bg-red-100 text-red-800', label: 'Blocker' },
  };

  const config = typeConfig[event.type] || typeConfig.note;

  return (
    <div className="flex gap-4 pb-4 relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border" />

      {/* Icon */}
      <div className="w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center text-sm z-10">
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="secondary" className={config.color}>
            {config.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
          </span>
        </div>
        <p className="font-medium">{event.title}</p>
        {event.description && (
          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
        )}
      </div>
    </div>
  );
}

interface AddEventDialogProps {
  projectId: string;
  onSuccess: () => void;
}

function AddEventDialog({ projectId, onSuccess }: AddEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'note' | 'milestone' | 'blocker'>('note');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => addTimelineEvent(projectId, { type, title, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
      setOpen(false);
      setTitle('');
      setDescription('');
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">+ Add Event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Timeline Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'note' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('note')}
            >
              📝 Note
            </Button>
            <Button
              type="button"
              variant={type === 'milestone' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('milestone')}
            >
              🎯 Milestone
            </Button>
            <Button
              type="button"
              variant={type === 'blocker' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('blocker')}
            >
              🚧 Blocker
            </Button>
          </div>

          {type !== 'note' && (
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          )}

          <Textarea
            placeholder={type === 'note' ? 'Write your note...' : 'Description (optional)'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required={type === 'note'}
          />

          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? 'Adding...' : 'Add Event'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectTimelineProps {
  projectId: string;
}

export function ProjectTimeline({ projectId }: ProjectTimelineProps) {
  const { data: timeline, isLoading, error } = useQuery({
    queryKey: ['timeline', projectId],
    queryFn: () => getProjectTimeline(projectId),
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <span className="text-muted-foreground">Loading timeline...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <span className="text-red-500">Failed to load timeline</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Project Timeline</CardTitle>
        <AddEventDialog projectId={projectId} onSuccess={() => {}} />
      </CardHeader>
      <CardContent>
        {timeline && timeline.length > 0 ? (
          <div className="relative">
            {timeline.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No timeline events yet</p>
            <p className="text-sm mt-2">Start a session or add a note to begin tracking</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 3. Create Sessions Panel

Create `src/components/SessionsPanel.tsx`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjectSessions, startSession, type Session } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { formatDistanceToNow, formatDuration, intervalToDuration } from 'date-fns';

interface SessionsProps {
  projectId: string;
}

export function SessionsPanel({ projectId }: SessionsProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', projectId],
    queryFn: () => getProjectSessions(projectId),
  });

  const startMutation = useMutation({
    mutationFn: () => startSession(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
    },
  });

  if (isLoading) {
    return <Card><CardContent>Loading...</CardContent></Card>;
  }

  const { activeSession, sessions } = data || { activeSession: null, sessions: [] };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Sessions</CardTitle>
        {!activeSession && (
          <Button
            size="sm"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            ▶️ Start Session
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {activeSession && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-medium">Active Session</span>
              </div>
              <Badge variant="outline">{activeSession.branch}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Started {formatDistanceToNow(new Date(activeSession.startedAt), { addSuffix: true })}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Recent Sessions</h4>
          {sessions.length > 0 ? (
            sessions.slice(0, 5).map((session: Session) => (
              <div
                key={session.id}
                className="p-2 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                  </span>
                  {session.durationMinutes && (
                    <span className="text-xs text-muted-foreground">
                      {session.durationMinutes}min
                    </span>
                  )}
                </div>
                {session.summary && (
                  <p className="text-xs text-muted-foreground mt-1">{session.summary}</p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No previous sessions</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 4. Add Project Detail Page with Timeline

Create a new route or drawer that shows the full project view with timeline:

```typescript
// src/pages/ProjectDetail.tsx or as a Sheet/Drawer component
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '../lib/api';
import { ProjectTimeline } from '../components/ProjectTimeline';
import { SessionsPanel } from '../components/SessionsPanel';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const project = projects?.find(p => p.id === id);

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground">{project.path}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - Timeline */}
        <div className="lg:col-span-2">
          <ProjectTimeline projectId={id!} />
        </div>

        {/* Sidebar - Sessions & Quick Actions */}
        <div className="space-y-6">
          <SessionsPanel projectId={id!} />

          {/* Quick context copy */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                📋 Copy Session Context
              </Button>
              <Button variant="outline" className="w-full justify-start">
                💬 Open in Chat
              </Button>
              <Button variant="outline" className="w-full justify-start">
                🔄 Refresh Context
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

### 5. Update ProjectCard to Link to Timeline

Add a "View Timeline" action to the project card:

```typescript
// In ProjectCard.tsx, add to the buttons section:
<Button
  size="sm"
  variant="outline"
  onClick={() => navigate(`/projects/${project.id}`)}
>
  📊 Timeline
</Button>
```

---

## Design Guidelines

### Timeline Visual Style
- Vertical line connecting events (left side)
- Icon circles on the line representing event type
- Badges with color-coding by type:
  - **Sessions**: Green (start), Gray (end)
  - **Commits**: Blue
  - **Milestones**: Purple
  - **Notes**: Yellow
  - **Blockers**: Red

### Sessions Panel
- Show active session prominently with green indicator
- Show pulse animation for active state
- List recent sessions below

### Color Palette (Dark Mode Compatible)
```css
/* Sessions */
--session-active: hsl(142, 76%, 36%);
--session-ended: hsl(220, 9%, 46%);

/* Events */
--commit: hsl(217, 91%, 60%);
--milestone: hsl(271, 91%, 65%);
--note: hsl(48, 96%, 53%);
--blocker: hsl(0, 84%, 60%);
```

---

## Summary of Changes

1. ✅ Add timeline and session API functions to `src/lib/api.ts`
2. ✅ Create `ProjectTimeline` component with vertical timeline UI
3. ✅ Create `SessionsPanel` component for session management
4. ✅ Create `ProjectDetail` page/view combining timeline and sessions
5. ✅ Update `ProjectCard` to link to timeline view
6. ✅ Add event creation dialog for notes, milestones, blockers

The dashboard now shows your development journey over time!
