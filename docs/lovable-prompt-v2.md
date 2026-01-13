# Nexu UI Update: Connect to Real API

## Context
The Nexu API is now live with session continuity endpoints. Update the Dashboard to fetch real data instead of mock data.

## API Endpoints (Running on localhost:3001)

### List Projects
```
GET /api/projects

Response:
{
  "projects": [
    {
      "id": "string",
      "name": "string",
      "path": "string",
      "status": "active" | "recent" | "inactive",
      "addedAt": "ISO date",
      "lastAccessed": "ISO date",
      "currentTask": {
        "summary": "string",
        "branch": "string"
      },
      "git": {
        "branch": "string",
        "lastCommit": {
          "hash": "string",
          "message": "string",
          "date": "string",
          "author": "string"
        },
        "uncommittedChanges": number
      },
      "pendingItems": number,
      "suggestedNextStep": "string"
    }
  ]
}
```

### Add Project
```
POST /api/projects
Body: { "path": "/absolute/path/to/project" }

Response:
{ "project": { "id": "string", "name": "string", "path": "string", "addedAt": "ISO date" } }
```

### Get Project Context
```
GET /api/projects/:id/context
GET /api/projects/:id/context?format=markdown

Response (JSON):
{
  "project": { "id": "string", "name": "string", "path": "string" },
  "context": { /* full SessionContext object */ },
  "markdown": "## Project: name\n..."
}

Response (markdown):
Raw markdown string ready to copy
```

### Delete Project
```
DELETE /api/projects/:id
Response: { "success": true }
```

---

## Changes Required

### 1. Update API Configuration

In `src/lib/api.ts`, add:

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  status: 'active' | 'recent' | 'inactive';
  addedAt: string;
  lastAccessed?: string;
  currentTask: {
    summary: string;
    branch: string;
  };
  git: {
    branch: string;
    lastCommit: {
      hash: string;
      message: string;
      date: string;
      author: string;
    } | null;
    uncommittedChanges: number;
  };
  pendingItems: number;
  suggestedNextStep: string;
}

export async function getProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_URL}/api/projects`);
  const data = await response.json();
  return data.projects;
}

export async function addProject(path: string): Promise<{ id: string; name: string }> {
  const response = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await response.json();
  return data.project;
}

export async function getProjectContext(id: string, format: 'json' | 'markdown' = 'json') {
  const response = await fetch(`${API_URL}/api/projects/${id}/context?format=${format}`);
  if (format === 'markdown') {
    return response.text();
  }
  return response.json();
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`${API_URL}/api/projects/${id}`, { method: 'DELETE' });
}
```

### 2. Update Dashboard to Use Real Data

Replace mock data with React Query:

```typescript
// In Dashboard.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, addProject, deleteProject } from '../lib/api';

function Dashboard() {
  const queryClient = useQueryClient();

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    refetchInterval: 30000, // Refresh every 30s
  });

  const addMutation = useMutation({
    mutationFn: addProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  // ... rest of component
}
```

### 3. Update ProjectCard Component

Use real data structure:

```typescript
interface ProjectCardProps {
  project: ProjectSummary;
  onContinue: (id: string) => void;
  onCopyContext: (id: string) => void;
  onChat: (id: string) => void;
  onDelete: (id: string) => void;
}

function ProjectCard({ project, onContinue, onCopyContext, onChat, onDelete }: ProjectCardProps) {
  const statusColors = {
    active: 'bg-green-500',
    recent: 'bg-yellow-500',
    inactive: 'bg-gray-500',
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${statusColors[project.status]}`} />
        <h3 className="font-semibold">{project.name}</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {project.git.lastCommit?.date || 'No commits'}
        </span>
      </div>

      <p className="text-sm text-muted-foreground mb-2">{project.path}</p>

      <div className="mb-3">
        <p className="text-sm"><strong>Task:</strong> {project.currentTask.summary}</p>
        <p className="text-sm"><strong>Branch:</strong> <code>{project.currentTask.branch}</code></p>
      </div>

      {project.git.uncommittedChanges > 0 && (
        <p className="text-sm text-yellow-500 mb-2">
          ⚠️ {project.git.uncommittedChanges} uncommitted changes
        </p>
      )}

      {project.pendingItems > 0 && (
        <p className="text-sm text-muted-foreground mb-2">
          📝 {project.pendingItems} pending items
        </p>
      )}

      <p className="text-sm mb-4">
        <strong>Next:</strong> {project.suggestedNextStep}
      </p>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => onContinue(project.id)}>▶ Continue</Button>
        <Button size="sm" variant="outline" onClick={() => onCopyContext(project.id)}>📋 Copy</Button>
        <Button size="sm" variant="outline" onClick={() => onChat(project.id)}>💬 Chat</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">···</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onDelete(project.id)}>
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

### 4. Update ContextDrawer to Fetch Real Context

```typescript
function ContextDrawer({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['context', projectId],
    queryFn: () => getProjectContext(projectId, 'json'),
    enabled: open && !!projectId,
  });

  const handleCopy = async () => {
    const markdown = await getProjectContext(projectId, 'markdown');
    await navigator.clipboard.writeText(markdown);
    toast.success('Context copied to clipboard!');
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[500px]">
        <SheetHeader>
          <SheetTitle>Context for {data?.project?.name}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="mt-4 p-4 bg-muted rounded-lg max-h-[60vh] overflow-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {data?.markdown}
              </pre>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={handleCopy} className="flex-1">
                📋 Copy to Clipboard
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

### 5. Update AddProjectModal

```typescript
function AddProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [path, setPath] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: addProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project added!');
      onClose();
      setPath('');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add project');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (path.trim()) {
      mutation.mutate(path.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label>Local Path</Label>
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/Users/you/src/your-project"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the absolute path to your project directory
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Adding...' : 'Add Project'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Environment Variable

Make sure to set in `.env.local` or at runtime:

```
VITE_API_URL=http://localhost:3001
```

---

## Summary of Changes

1. ✅ Add API functions to `src/lib/api.ts`
2. ✅ Update Dashboard to use React Query with real endpoints
3. ✅ Update ProjectCard to display real project data
4. ✅ Update ContextDrawer to fetch and copy real context
5. ✅ Update AddProjectModal to POST to real API
6. ✅ Remove mock data file

The UI will now show real projects with live session context!
