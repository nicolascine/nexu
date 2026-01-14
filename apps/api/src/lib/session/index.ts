// Session Context Library
// Provides session state tracking for projects (git, TODOs, recent files)

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';

export interface SessionContext {
  project: {
    name: string;
    path: string;
  };
  git: {
    branch: string;
    lastCommit: {
      hash: string;
      message: string;
      date: string;
      author: string;
    } | null;
    recentCommits: Array<{
      hash: string;
      message: string;
      date: string;
    }>;
    uncommittedChanges: string[];
    stashes: string[];
  };
  currentTask: {
    summary: string;
    branch: string;
  };
  pendingItems: Array<{
    type: 'todo' | 'fixme' | 'hack' | 'stash' | 'uncommitted';
    description: string;
    file?: string;
    line?: number;
  }>;
  recentFiles: Array<{
    path: string;
    modified: Date;
    status: 'modified' | 'new' | 'deleted';
  }>;
  suggestedNextStep: string;
}

function exec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

export function isGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'));
}

export function getGitBranch(path: string): string {
  return exec('git rev-parse --abbrev-ref HEAD', path) || 'unknown';
}

export function getLastCommit(path: string): SessionContext['git']['lastCommit'] {
  const log = exec('git log -1 --format="%H|%s|%ai|%an"', path);
  if (!log) return null;

  const [hash, message, date, author] = log.split('|');
  return { hash: hash.slice(0, 7), message, date, author };
}

export function getRecentCommits(
  path: string,
  count: number = 5
): Array<{
  hash: string;
  message: string;
  date: string;
  author: string;
}> {
  const log = exec(`git log -${count} --format="%H|%s|%ar|%an"`, path);
  if (!log) return [];

  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, message, date, author] = line.split('|');
      return { hash: hash.slice(0, 7), message, date, author: author || 'unknown' };
    });
}

export function getUncommittedChanges(path: string): string[] {
  const status = exec('git status --porcelain', path);
  if (!status) return [];

  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2).trim();
      const file = line.slice(3);
      return `${statusCode} ${file}`;
    });
}

export function getStashes(path: string): string[] {
  const stashes = exec('git stash list', path);
  if (!stashes) return [];
  return stashes.split('\n').filter(Boolean);
}

export function findTodos(path: string, limit: number = 20): SessionContext['pendingItems'] {
  const todos: SessionContext['pendingItems'] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
  const ignorePatterns = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '__pycache__',
    'venv',
    '.nexu',
  ];

  function walk(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (ignorePatterns.some((p) => entry.includes(p))) continue;
        if (todos.length >= limit) return;

        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (stat.isFile() && extensions.some((ext) => entry.endsWith(ext))) {
            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');

            lines.forEach((line, idx) => {
              if (todos.length >= limit) return;
              const todoMatch =
                line.match(/\/\/\s*(TODO|FIXME|HACK):\s*(.+)/i) ||
                line.match(/#\s*(TODO|FIXME|HACK):\s*(.+)/i);
              if (todoMatch) {
                todos.push({
                  type: todoMatch[1].toLowerCase() as 'todo' | 'fixme' | 'hack',
                  description: todoMatch[2].trim(),
                  file: relative(path, fullPath),
                  line: idx + 1,
                });
              }
            });
          }
        } catch {
          /* skip unreadable files */
        }
      }
    } catch {
      /* skip unreadable directories */
    }
  }

  walk(path);
  return todos;
}

export function getRecentFiles(path: string, limit: number = 15): SessionContext['recentFiles'] {
  const recentFiles: SessionContext['recentFiles'] = [];
  const ignorePatterns = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'package-lock',
    'pnpm-lock',
  ];

  const gitFiles = exec(
    'git diff --name-status HEAD~10 HEAD 2>/dev/null || git diff --name-status --cached',
    path
  );
  if (gitFiles) {
    gitFiles
      .split('\n')
      .filter(Boolean)
      .forEach((line) => {
        if (recentFiles.length >= limit) return;
        const [status, file] = line.split('\t');
        if (file && !ignorePatterns.some((p) => file.includes(p))) {
          const statusMap: Record<string, 'modified' | 'new' | 'deleted'> = {
            M: 'modified',
            A: 'new',
            D: 'deleted',
          };
          recentFiles.push({
            path: file,
            modified: new Date(),
            status: statusMap[status] || 'modified',
          });
        }
      });
  }

  return recentFiles;
}

export function inferCurrentTask(context: Partial<SessionContext>): {
  summary: string;
  branch: string;
} {
  const branch = context.git?.branch || 'main';
  let summary = 'Working on project';

  if (branch.startsWith('feat/') || branch.startsWith('feature/')) {
    summary = `Implementing ${branch.replace(/^feat(ure)?\//, '').replace(/-/g, ' ')}`;
  } else if (branch.startsWith('fix/') || branch.startsWith('bugfix/')) {
    summary = `Fixing ${branch.replace(/^(bug)?fix\//, '').replace(/-/g, ' ')}`;
  } else if (branch.startsWith('refactor/')) {
    summary = `Refactoring ${branch.replace(/^refactor\//, '').replace(/-/g, ' ')}`;
  } else if (context.git?.lastCommit?.message) {
    summary = context.git.lastCommit.message;
  }

  return { summary, branch };
}

export function inferNextStep(context: SessionContext): string {
  if (context.git.uncommittedChanges.length > 0) {
    return `Review and commit ${context.git.uncommittedChanges.length} uncommitted changes`;
  }

  const todos = context.pendingItems.filter((p) => p.type === 'todo' || p.type === 'fixme');
  if (todos.length > 0) {
    const next = todos[0];
    return `${next.description}${next.file ? ` (${next.file}:${next.line})` : ''}`;
  }

  if (context.git.stashes.length > 0) {
    return `Review stashed changes: ${context.git.stashes[0]}`;
  }

  return `Continue working on: ${context.currentTask.summary}`;
}

export function getSessionContext(projectPath: string): SessionContext {
  const resolvedPath = projectPath.startsWith('~')
    ? projectPath.replace('~', process.env.HOME || '')
    : projectPath;

  const context: SessionContext = {
    project: {
      name: basename(resolvedPath),
      path: resolvedPath,
    },
    git: {
      branch: '',
      lastCommit: null,
      recentCommits: [],
      uncommittedChanges: [],
      stashes: [],
    },
    currentTask: { summary: '', branch: '' },
    pendingItems: [],
    recentFiles: [],
    suggestedNextStep: '',
  };

  if (isGitRepo(resolvedPath)) {
    context.git.branch = getGitBranch(resolvedPath);
    context.git.lastCommit = getLastCommit(resolvedPath);
    context.git.recentCommits = getRecentCommits(resolvedPath);
    context.git.uncommittedChanges = getUncommittedChanges(resolvedPath);
    context.git.stashes = getStashes(resolvedPath);
  }

  context.pendingItems = findTodos(resolvedPath);

  context.git.stashes.forEach((stash) => {
    context.pendingItems.push({
      type: 'stash',
      description: stash,
    });
  });

  if (context.git.uncommittedChanges.length > 0) {
    context.pendingItems.unshift({
      type: 'uncommitted',
      description: `${context.git.uncommittedChanges.length} uncommitted changes`,
    });
  }

  context.recentFiles = getRecentFiles(resolvedPath);
  context.currentTask = inferCurrentTask(context);
  context.suggestedNextStep = inferNextStep(context);

  return context;
}

export function formatSessionContextAsMarkdown(context: SessionContext): string {
  const lines: string[] = [];

  lines.push(`## Project: ${context.project.name}`);
  lines.push(`**Path:** \`${context.project.path}\``);
  lines.push('');

  lines.push('### Current Task');
  lines.push(`${context.currentTask.summary}`);
  lines.push(`**Branch:** \`${context.currentTask.branch}\``);
  lines.push('');

  if (context.git.lastCommit) {
    lines.push('### Last Session');
    lines.push(
      `- **Last commit:** ${context.git.lastCommit.message} (\`${context.git.lastCommit.hash}\`, ${context.git.lastCommit.date})`
    );

    if (context.git.recentCommits.length > 1) {
      lines.push('- **Recent commits:**');
      context.git.recentCommits.slice(1, 4).forEach((c) => {
        lines.push(`  - ${c.message} (${c.date})`);
      });
    }
    lines.push('');
  }

  if (context.git.uncommittedChanges.length > 0) {
    lines.push('### Uncommitted Changes');
    context.git.uncommittedChanges.slice(0, 10).forEach((change) => {
      lines.push(`- ${change}`);
    });
    if (context.git.uncommittedChanges.length > 10) {
      lines.push(`- ... and ${context.git.uncommittedChanges.length - 10} more`);
    }
    lines.push('');
  }

  if (context.recentFiles.length > 0) {
    lines.push('### Recently Modified Files');
    context.recentFiles.slice(0, 10).forEach((f) => {
      const icon = f.status === 'new' ? '(new)' : f.status === 'deleted' ? '(deleted)' : '';
      lines.push(`- \`${f.path}\` ${icon}`);
    });
    lines.push('');
  }

  const todos = context.pendingItems.filter((p) => p.type === 'todo' || p.type === 'fixme');
  if (todos.length > 0) {
    lines.push('### TODOs in Code');
    todos.slice(0, 8).forEach((todo) => {
      const location = todo.file ? `${todo.file}:${todo.line}` : '';
      lines.push(`- [ ] ${todo.description}${location ? ` (\`${location}\`)` : ''}`);
    });
    if (todos.length > 8) {
      lines.push(`- ... and ${todos.length - 8} more`);
    }
    lines.push('');
  }

  if (context.git.stashes.length > 0) {
    lines.push('### Stashed Changes');
    context.git.stashes.slice(0, 3).forEach((stash) => {
      lines.push(`- ${stash}`);
    });
    lines.push('');
  }

  lines.push('### Suggested Next Step');
  lines.push(context.suggestedNextStep);
  lines.push('');

  return lines.join('\n');
}
