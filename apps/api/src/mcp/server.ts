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

// server instance
const server = new Server(
  {
    name: 'nexu-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// list available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'nexu_search',
        description: 'Search for code in an indexed repository using semantic search. Returns relevant code chunks with file paths, line numbers, and content.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language query describing what you are looking for in the codebase',
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
        description: 'Use an AI agent to answer complex questions about the codebase. The agent can search, read files, and follow dependencies to provide comprehensive answers.',
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
        description: 'Get the current status of the nexu index, including indexed repositories and configuration.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
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
        const topK = Math.min(args?.topK as number || 5, 20);

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

        const formatted = result.chunks.map((chunk, i) => {
          return `[${i + 1}] ${chunk.filepath}:${chunk.startLine}-${chunk.endLine}
Type: ${chunk.nodeType} | Name: ${chunk.name} | Score: ${chunk.score.toFixed(3)}

\`\`\`${chunk.language}
${chunk.content}
\`\`\``;
        }).join('\n\n---\n\n');

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
        const maxSteps = Math.min(args?.maxSteps as number || 8, 15);

        if (!question) {
          throw new McpError(ErrorCode.InvalidParams, 'Question is required');
        }

        const result = await runAgent(question, {
          repositoryId: repository,
          maxSteps,
        });

        // format steps for transparency
        const stepsLog = result.steps
          .filter(s => s.type === 'tool_call')
          .map(s => `- ${s.content}`)
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
${status.meta ? `
**Index Stats:**
- Files: ${status.meta.stats.files}
- Chunks: ${status.meta.stats.chunks}
- Indexed at: ${status.meta.indexedAt}` : ''}`,
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
