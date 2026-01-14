#!/usr/bin/env node
// MCP Server - Exposes nexu capabilities to Claude Desktop, Cursor, and other MCP clients
// Run with: npx tsx src/mcp/server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { search, getStatus, initIndexAsync } from '../lib/nexu/index.js';
import { runAgent } from '../lib/agent/index.js';
import {
  getSessionContext,
  formatSessionContextAsMarkdown,
  getRecentFiles,
  getGitBranch,
  getLastCommit,
  getUncommittedChanges,
  findTodos,
  isGitRepo,
} from '../lib/session/index.js';
import {
  getProjectByPath,
  addProject,
  addProjectNote,
  addProjectMilestone,
  addProjectBlocker,
  startProjectSession,
  endProjectSession,
  getActiveSession,
  getProjectTimeline,
  syncProjectCommits,
} from '../lib/session/projects.js';

// server instance
const server = new Server(
  {
    name: 'nexu-mcp',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
    instructions: `Nexu is your coding memory assistant. It helps you remember where you left off, tracks your progress, and provides context about projects.

IMPORTANT: When the user says "use nexu" in their prompt, you MUST call one of the nexu session tools before answering:
- nexu_session_context: Full context (git, commits, TODOs, recent files)
- nexu_continue: Quick summary of where you left off
- nexu_recent_files: Just the recently modified files

Example triggers:
- "use nexu" → call nexu_session_context
- "where did we leave off?" → call nexu_continue
- "what was I working on?" → call nexu_continue
- "what files changed recently?" → call nexu_recent_files

For code search and questions about the codebase, use:
- nexu_search: Semantic search in indexed code
- nexu_agent: Complex questions requiring exploration

For tracking progress and timeline:
- nexu_add_note: Record observations or decisions
- nexu_add_milestone: Mark significant completions
- nexu_add_blocker: Record problems for future reference
- nexu_start_session: Start tracking a work session
- nexu_end_session: End session with summary
- nexu_get_timeline: View project history

Proactive usage: When the user completes something significant, offer to add a milestone. When they mention a blocker, offer to record it. When starting work, offer to start a session.

Always provide the projectPath when calling session tools. If not specified, ask the user for it.`,
  }
);

// list available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'nexu_search',
        description:
          'Search for code in an indexed repository using semantic search. Returns relevant code chunks with file paths, line numbers, and content.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Natural language query describing what you are looking for in the codebase',
            },
            repository: {
              type: 'string',
              description: 'Optional repository ID to search in (e.g., "calcom/cal.com")',
            },
            topK: {
              type: 'number',
              description: 'Number of results to return (default: 5, max: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'nexu_agent',
        description:
          'Use an AI agent to answer complex questions about the codebase. The agent can search, read files, and follow dependencies to provide comprehensive answers.',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Complex question about the codebase that requires exploration',
            },
            repository: {
              type: 'string',
              description: 'Optional repository ID to analyze',
            },
            maxSteps: {
              type: 'number',
              description: 'Maximum reasoning steps (default: 8, max: 15)',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'nexu_status',
        description:
          'Get the current status of the nexu index, including indexed repositories and configuration.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'nexu_session_context',
        description:
          'Get the current session context for a project. Returns git state, current task, recent commits, uncommitted changes, TODOs, and suggested next steps. Use this when the user says "use nexu" or asks "where did we leave off?"',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            includeGit: {
              type: 'boolean',
              description: 'Include git information (branch, commits, changes). Default: true',
            },
            includeTodos: {
              type: 'boolean',
              description: 'Include TODO/FIXME comments from code. Default: true',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'nexu_recent_files',
        description:
          'Get recently modified files in a project. Useful for understanding what has changed recently.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of files to return. Default: 15',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'nexu_continue',
        description:
          'Quick summary of where you left off in a project. Returns current task, branch, last commit, and suggested next step. Perfect for resuming work.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'nexu_add_note',
        description:
          'Add a note to the project timeline. Use this to record observations, decisions, or context for future sessions.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            note: {
              type: 'string',
              description: 'The note content to add',
            },
          },
          required: ['projectPath', 'note'],
        },
      },
      {
        name: 'nexu_add_milestone',
        description:
          'Record a milestone in the project timeline. Use when something significant is completed.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            title: {
              type: 'string',
              description: 'Short title for the milestone',
            },
            description: {
              type: 'string',
              description: 'Optional description of what was achieved',
            },
          },
          required: ['projectPath', 'title'],
        },
      },
      {
        name: 'nexu_add_blocker',
        description:
          'Record a blocker or issue in the timeline. Helps track problems for future sessions.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            title: {
              type: 'string',
              description: 'Short title for the blocker',
            },
            description: {
              type: 'string',
              description: 'Optional description of the problem',
            },
          },
          required: ['projectPath', 'title'],
        },
      },
      {
        name: 'nexu_start_session',
        description: 'Start a new work session for a project. Tracks time and context.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'nexu_end_session',
        description: 'End the current work session with a summary. Records duration and notes.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            summary: {
              type: 'string',
              description: 'What was accomplished in this session',
            },
            notes: {
              type: 'string',
              description: 'Notes for the next session',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'nexu_get_timeline',
        description:
          'Get the project timeline showing sessions, commits, milestones, notes, and blockers.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of events to return. Default: 20',
            },
          },
          required: ['projectPath'],
        },
      },
    ],
  };
});

// handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ensure index is initialized
    await initIndexAsync();

    switch (name) {
      case 'nexu_search': {
        const query = args?.query as string;
        const repository = args?.repository as string | undefined;
        const topK = Math.min((args?.topK as number) || 5, 20);

        if (!query) {
          throw new McpError(ErrorCode.InvalidParams, 'Query is required');
        }

        const result = await search({
          query,
          repositoryId: repository,
          options: {
            topK,
            reranker: 'llm',
            rerankTopK: Math.min(topK, 10),
            expandGraph: true,
            maxHops: 1,
          },
        });

        const formatted = result.chunks
          .map((chunk, i) => {
            return `[${i + 1}] ${chunk.filepath}:${chunk.startLine}-${chunk.endLine}
Type: ${chunk.nodeType} | Name: ${chunk.name} | Score: ${chunk.score.toFixed(3)}

\`\`\`${chunk.language}
${chunk.content}
\`\`\``;
          })
          .join('\n\n---\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${result.chunks.length} relevant code chunks:\n\n${formatted}`,
            },
          ],
        };
      }

      case 'nexu_agent': {
        const question = args?.question as string;
        const repository = args?.repository as string | undefined;
        const maxSteps = Math.min((args?.maxSteps as number) || 8, 15);

        if (!question) {
          throw new McpError(ErrorCode.InvalidParams, 'Question is required');
        }

        const result = await runAgent(question, {
          repositoryId: repository,
          maxSteps,
        });

        // format steps for transparency
        const stepsLog = result.steps
          .filter((s) => s.type === 'tool_call')
          .map((s) => `- ${s.content}`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `${result.answer}

---
**Agent Activity:**
- Steps: ${result.steps.length}
- Searches: ${result.searchesPerformed}
- Files accessed: ${result.filesAccessed.length}
- Tokens used: ${result.totalTokensUsed}

**Tool calls:**
${stepsLog || '(none)'}`,
            },
          ],
        };
      }

      case 'nexu_status': {
        const status = await getStatus();

        return {
          content: [
            {
              type: 'text',
              text: `**Nexu Status**
- Ready: ${status.ready ? 'Yes' : 'No'}
- Indexed: ${status.indexed ? 'Yes' : 'No'}
- LLM Provider: ${status.llm.provider} (${status.llm.model})
- Embedding Provider: ${status.embedding.provider} (${status.embedding.model})
${
  status.meta
    ? `
**Index Stats:**
- Files: ${status.meta.stats.files}
- Chunks: ${status.meta.stats.chunks}
- Indexed at: ${status.meta.indexedAt}`
    : ''
}`,
            },
          ],
        };
      }

      case 'nexu_session_context': {
        const projectPath = args?.projectPath as string;
        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }

        const context = getSessionContext(projectPath);
        const markdown = formatSessionContextAsMarkdown(context);

        return {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        };
      }

      case 'nexu_recent_files': {
        const projectPath = args?.projectPath as string;
        const limit = (args?.limit as number) || 15;

        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }

        const files = getRecentFiles(projectPath, limit);

        if (files.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No recently modified files found in the last 10 commits.',
              },
            ],
          };
        }

        const formatted = files
          .map((f) => {
            const icon =
              f.status === 'new' ? '(new)' : f.status === 'deleted' ? '(deleted)' : '(modified)';
            return `- \`${f.path}\` ${icon}`;
          })
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `**Recently Modified Files:**\n\n${formatted}`,
            },
          ],
        };
      }

      case 'nexu_continue': {
        const projectPath = args?.projectPath as string;
        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }

        const context = getSessionContext(projectPath);

        let summary = `**Project:** ${context.project.name}\n`;
        summary += `**Branch:** \`${context.currentTask.branch}\`\n`;
        summary += `**Current Task:** ${context.currentTask.summary}\n\n`;

        if (context.git.lastCommit) {
          summary += `**Last Commit:** ${context.git.lastCommit.message} (${context.git.lastCommit.date})\n\n`;
        }

        if (context.git.uncommittedChanges.length > 0) {
          summary += `**⚠️ Uncommitted Changes:** ${context.git.uncommittedChanges.length} files\n\n`;
        }

        summary += `**Suggested Next Step:** ${context.suggestedNextStep}`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
        };
      }

      case 'nexu_add_note': {
        const projectPath = args?.projectPath as string;
        const note = args?.note as string;

        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }
        if (!note) {
          throw new McpError(ErrorCode.InvalidParams, 'note is required');
        }

        // Ensure project is registered
        let project = getProjectByPath(projectPath);
        if (!project) {
          addProject(projectPath);
          project = getProjectByPath(projectPath);
        }

        if (project) {
          addProjectNote(project.id, note);
          return {
            content: [{ type: 'text', text: `✅ Note added to ${project.name} timeline.` }],
          };
        }

        return {
          content: [{ type: 'text', text: '❌ Failed to add note. Could not register project.' }],
          isError: true,
        };
      }

      case 'nexu_add_milestone': {
        const projectPath = args?.projectPath as string;
        const title = args?.title as string;
        const description = args?.description as string | undefined;

        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }
        if (!title) {
          throw new McpError(ErrorCode.InvalidParams, 'title is required');
        }

        let project = getProjectByPath(projectPath);
        if (!project) {
          addProject(projectPath);
          project = getProjectByPath(projectPath);
        }

        if (project) {
          addProjectMilestone(project.id, title, description);
          return {
            content: [{ type: 'text', text: `🎯 Milestone "${title}" added to ${project.name}.` }],
          };
        }

        return {
          content: [{ type: 'text', text: '❌ Failed to add milestone.' }],
          isError: true,
        };
      }

      case 'nexu_add_blocker': {
        const projectPath = args?.projectPath as string;
        const title = args?.title as string;
        const description = args?.description as string | undefined;

        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }
        if (!title) {
          throw new McpError(ErrorCode.InvalidParams, 'title is required');
        }

        let project = getProjectByPath(projectPath);
        if (!project) {
          addProject(projectPath);
          project = getProjectByPath(projectPath);
        }

        if (project) {
          addProjectBlocker(project.id, title, description);
          return {
            content: [{ type: 'text', text: `🚧 Blocker "${title}" recorded in ${project.name}.` }],
          };
        }

        return {
          content: [{ type: 'text', text: '❌ Failed to add blocker.' }],
          isError: true,
        };
      }

      case 'nexu_start_session': {
        const projectPath = args?.projectPath as string;

        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }

        let project = getProjectByPath(projectPath);
        if (!project) {
          addProject(projectPath);
          project = getProjectByPath(projectPath);
        }

        if (!project) {
          return {
            content: [{ type: 'text', text: '❌ Could not register project.' }],
            isError: true,
          };
        }

        // Check for existing active session
        const existing = getActiveSession(project.id);
        if (existing) {
          return {
            content: [
              {
                type: 'text',
                text: `⚠️ Session already active since ${existing.started_at}.\nBranch: ${existing.branch || 'unknown'}`,
              },
            ],
          };
        }

        const session = startProjectSession(project.id);
        if (session) {
          return {
            content: [
              {
                type: 'text',
                text: `▶️ Session started for ${project.name}\nBranch: ${session.branch || 'unknown'}\nSession ID: ${session.id}`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: '❌ Failed to start session.' }],
          isError: true,
        };
      }

      case 'nexu_end_session': {
        const projectPath = args?.projectPath as string;
        const summary = args?.summary as string | undefined;
        const notes = args?.notes as string | undefined;

        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }

        const project = getProjectByPath(projectPath);
        if (!project) {
          return {
            content: [{ type: 'text', text: '❌ Project not found. Start a session first.' }],
            isError: true,
          };
        }

        const active = getActiveSession(project.id);
        if (!active) {
          return {
            content: [{ type: 'text', text: '⚠️ No active session to end.' }],
          };
        }

        const session = endProjectSession(active.id, summary, notes);
        if (session) {
          return {
            content: [
              {
                type: 'text',
                text: `⏹️ Session ended for ${project.name}\nDuration: ${session.duration_minutes || 0} minutes\n${summary ? `Summary: ${summary}` : ''}`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: '❌ Failed to end session.' }],
          isError: true,
        };
      }

      case 'nexu_get_timeline': {
        const projectPath = args?.projectPath as string;
        const limit = (args?.limit as number) || 20;

        if (!projectPath) {
          throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
        }

        let project = getProjectByPath(projectPath);
        if (!project) {
          addProject(projectPath);
          project = getProjectByPath(projectPath);
        }

        if (!project) {
          return {
            content: [{ type: 'text', text: '❌ Could not register project.' }],
            isError: true,
          };
        }

        // Sync commits before getting timeline
        syncProjectCommits(project.id);

        const events = getProjectTimeline(project.id, limit);
        if (events.length === 0) {
          return {
            content: [
              { type: 'text', text: 'No timeline events yet. Start a session or add a note!' },
            ],
          };
        }

        const formatted = events
          .map((event) => {
            const data = JSON.parse(event.event_data_json);
            const icons: Record<string, string> = {
              session_start: '▶️',
              session_end: '⏹️',
              commit: '💾',
              milestone: '🎯',
              note: '📝',
              blocker: '🚧',
            };
            const icon = icons[event.event_type] || '•';
            return `${icon} **${event.event_type}** (${event.timestamp})\n   ${data.title}${data.description ? `: ${data.description}` : ''}`;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `**Timeline for ${project.name}:**\n\n${formatted}`,
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// list resources (indexed repositories)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const status = await getStatus();

    if (!status.meta) {
      return { resources: [] };
    }

    return {
      resources: [
        {
          uri: `nexu://index/default`,
          name: 'Default Index',
          description: `${status.meta.stats.files} files, ${status.meta.stats.chunks} chunks`,
          mimeType: 'application/json',
        },
      ],
    };
  } catch {
    return { resources: [] };
  }
});

// read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'nexu://index/default') {
    const status = await getStatus();

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
});

// start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Nexu MCP server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
