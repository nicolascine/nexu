// Agent tools - functions the agent can call to explore the codebase

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import type { Tool, ToolCall, ToolResult } from './types';
import { search, initIndexAsync } from '../nexu';
import { logger } from '../logger';

// repository base path (set during agent init)
let repoBasePath: string | null = null;

export function setRepoBasePath(path: string) {
  repoBasePath = path;
}

export function getRepoBasePath(): string | null {
  return repoBasePath;
}

// tool definitions (Anthropic format)
export const AGENT_TOOLS: Tool[] = [
  {
    name: 'search_code',
    description: 'Search for code semantically in the codebase. Use this to find relevant functions, classes, or code patterns. Returns the most relevant code chunks with file paths and line numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query describing what you are looking for. Be specific about functionality, not file names.',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default: 5, max: 15)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a specific file. Use this when you know the exact file path and want to see more context than what search_code returned.',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: 'Relative path to the file from repository root (e.g., "apps/web/pages/api/auth.ts")',
        },
        startLine: {
          type: 'number',
          description: 'Starting line number (1-indexed, optional)',
        },
        endLine: {
          type: 'number',
          description: 'Ending line number (1-indexed, optional)',
        },
      },
      required: ['filepath'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories in a directory. Use this to explore the project structure and find relevant files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the directory (e.g., "apps/web/pages"). Use empty string or "/" for root.',
        },
        recursive: {
          type: 'boolean',
          description: 'If true, list files recursively (max depth 2). Default: false',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_file_dependencies',
    description: 'Get the import dependencies of a file and what files depend on it. Use this to understand how a file connects to the rest of the codebase.',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: 'Relative path to the file',
        },
      },
      required: ['filepath'],
    },
  },
  {
    name: 'find_symbol',
    description: 'Find where a symbol (function, class, type, variable) is defined in the codebase. Use this to locate specific definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Name of the symbol to find (e.g., "handleBooking", "UserType", "getAvailability")',
        },
        type: {
          type: 'string',
          description: 'Type of symbol to search for',
          enum: ['function', 'class', 'type', 'interface', 'variable', 'any'],
        },
      },
      required: ['symbol'],
    },
  },
];

// tool implementations
async function searchCode(
  query: string,
  topK: number = 5,
  repositoryId?: string
): Promise<string> {
  try {
    const result = await search({
      query,
      repositoryId,
      options: {
        topK: Math.min(topK, 15),
        reranker: 'llm',
        rerankTopK: Math.min(topK, 10),
        expandGraph: true,
        maxHops: 1,
        maxExpandedChunks: 10,
      },
    });

    if (result.chunks.length === 0) {
      return 'No results found for this query. Try rephrasing or being more specific.';
    }

    const formatted = result.chunks.map((chunk, i) => {
      const lines = chunk.startLine === chunk.endLine
        ? `line ${chunk.startLine}`
        : `lines ${chunk.startLine}-${chunk.endLine}`;
      return `[${i + 1}] ${chunk.filepath} (${lines})
Type: ${chunk.nodeType} | Name: ${chunk.name}
Score: ${chunk.score.toFixed(3)}

\`\`\`${chunk.language}
${chunk.content}
\`\`\``;
    }).join('\n\n---\n\n');

    return `Found ${result.chunks.length} relevant code chunks:\n\n${formatted}`;
  } catch (error) {
    logger.error('search_code tool error', { query }, error);
    return `Error searching code: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

function readFile(
  filepath: string,
  startLine?: number,
  endLine?: number
): string {
  if (!repoBasePath) {
    return 'Error: Repository base path not set. Cannot read files.';
  }

  // security: prevent path traversal
  const normalizedPath = filepath.replace(/\.\./g, '').replace(/^\/+/, '');
  const fullPath = join(repoBasePath, normalizedPath);

  if (!fullPath.startsWith(repoBasePath)) {
    return 'Error: Path traversal detected. Access denied.';
  }

  if (!existsSync(fullPath)) {
    return `Error: File not found: ${filepath}`;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    // apply line range if specified
    if (startLine !== undefined || endLine !== undefined) {
      const start = Math.max(1, startLine || 1) - 1;
      const end = Math.min(lines.length, endLine || lines.length);
      const selectedLines = lines.slice(start, end);

      return `File: ${filepath} (lines ${start + 1}-${end} of ${lines.length})\n\n\`\`\`\n${selectedLines.map((line, i) => `${start + i + 1}: ${line}`).join('\n')}\n\`\`\``;
    }

    // limit output for very large files
    if (lines.length > 500) {
      return `File: ${filepath} (${lines.length} lines total, showing first 500)\n\n\`\`\`\n${lines.slice(0, 500).map((line, i) => `${i + 1}: ${line}`).join('\n')}\n\`\`\`\n\n[File truncated. Use startLine/endLine to read specific sections.]`;
    }

    return `File: ${filepath} (${lines.length} lines)\n\n\`\`\`\n${lines.map((line, i) => `${i + 1}: ${line}`).join('\n')}\n\`\`\``;
  } catch (error) {
    return `Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

function listDirectory(path: string, recursive: boolean = false): string {
  if (!repoBasePath) {
    return 'Error: Repository base path not set.';
  }

  const normalizedPath = path.replace(/\.\./g, '').replace(/^\/+/, '');
  const fullPath = normalizedPath ? join(repoBasePath, normalizedPath) : repoBasePath;

  if (!fullPath.startsWith(repoBasePath)) {
    return 'Error: Path traversal detected. Access denied.';
  }

  if (!existsSync(fullPath)) {
    return `Error: Directory not found: ${path || '/'}`;
  }

  try {
    const entries = readdirSync(fullPath, { withFileTypes: true });

    // filter out common noise
    const filtered = entries.filter(e =>
      !e.name.startsWith('.') &&
      e.name !== 'node_modules' &&
      e.name !== '__pycache__' &&
      e.name !== 'dist' &&
      e.name !== 'build' &&
      e.name !== '.next'
    );

    const dirs: string[] = [];
    const files: string[] = [];

    for (const entry of filtered) {
      const entryPath = normalizedPath ? join(normalizedPath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        dirs.push(`${entryPath}/`);

        // recursive listing (max depth 2)
        if (recursive) {
          try {
            const subPath = join(fullPath, entry.name);
            const subEntries = readdirSync(subPath, { withFileTypes: true });
            for (const sub of subEntries.slice(0, 20)) {
              if (sub.name.startsWith('.') || sub.name === 'node_modules') continue;
              const subFullPath = join(entryPath, sub.name);
              if (sub.isDirectory()) {
                dirs.push(`  ${subFullPath}/`);
              } else {
                files.push(`  ${subFullPath}`);
              }
            }
          } catch {
            // skip unreadable subdirs
          }
        }
      } else {
        files.push(entryPath);
      }
    }

    const result = [
      `Directory: ${path || '/'}`,
      '',
      'Directories:',
      ...dirs.map(d => `  ${d}`),
      '',
      'Files:',
      ...files.map(f => `  ${f}`),
    ].join('\n');

    return result;
  } catch (error) {
    return `Error listing directory: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function getFileDependencies(
  filepath: string,
  repositoryId?: string
): Promise<string> {
  // use search to find imports and dependents
  try {
    const filename = filepath.split('/').pop() || filepath;

    // search for files that import this one
    const importersResult = await search({
      query: `import from "${filename}" require("${filename}")`,
      repositoryId,
      options: {
        topK: 10,
        reranker: 'none',
        expandGraph: false,
      },
    });

    // search for what this file imports
    const importsResult = await search({
      query: `imports in ${filepath}`,
      repositoryId,
      options: {
        topK: 5,
        reranker: 'none',
        expandGraph: false,
      },
    });

    const importedBy = importersResult.chunks
      .filter(c => c.filepath !== filepath && c.content.includes(filename))
      .map(c => c.filepath)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 10);

    return `Dependencies for: ${filepath}

Imported by (${importedBy.length} files):
${importedBy.length > 0 ? importedBy.map(f => `  - ${f}`).join('\n') : '  (no direct importers found in index)'}

Note: For accurate import/export information, use read_file to examine the file directly.`;
  } catch (error) {
    return `Error getting dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function findSymbol(
  symbol: string,
  type: string = 'any',
  repositoryId?: string
): Promise<string> {
  try {
    const typeQuery = type !== 'any' ? ` ${type}` : '';
    const query = `${symbol}${typeQuery} definition declaration`;

    const result = await search({
      query,
      repositoryId,
      options: {
        topK: 10,
        reranker: 'llm',
        rerankTopK: 5,
        expandGraph: false,
      },
    });

    // filter for actual definitions
    const definitions = result.chunks.filter(chunk => {
      const content = chunk.content.toLowerCase();
      const symbolLower = symbol.toLowerCase();

      // check if this looks like a definition
      const isDefinition =
        chunk.name.toLowerCase().includes(symbolLower) ||
        content.includes(`function ${symbolLower}`) ||
        content.includes(`const ${symbolLower}`) ||
        content.includes(`let ${symbolLower}`) ||
        content.includes(`class ${symbolLower}`) ||
        content.includes(`interface ${symbolLower}`) ||
        content.includes(`type ${symbolLower}`) ||
        content.includes(`export { ${symbolLower}`) ||
        content.includes(`export default ${symbolLower}`);

      return isDefinition;
    });

    if (definitions.length === 0) {
      return `No definition found for symbol "${symbol}". Try search_code with a more specific query.`;
    }

    const formatted = definitions.slice(0, 5).map((chunk, i) => {
      return `[${i + 1}] ${chunk.filepath}:${chunk.startLine}
Type: ${chunk.nodeType} | Name: ${chunk.name}

\`\`\`${chunk.language}
${chunk.content.slice(0, 500)}${chunk.content.length > 500 ? '...' : ''}
\`\`\``;
    }).join('\n\n');

    return `Found ${definitions.length} potential definitions for "${symbol}":\n\n${formatted}`;
  } catch (error) {
    return `Error finding symbol: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// execute a tool call
export async function executeTool(
  toolCall: ToolCall,
  repositoryId?: string
): Promise<ToolResult> {
  const { id, name, input } = toolCall;

  try {
    let result: string;

    switch (name) {
      case 'search_code':
        result = await searchCode(
          input.query as string,
          input.topK as number | undefined,
          repositoryId
        );
        break;

      case 'read_file':
        result = readFile(
          input.filepath as string,
          input.startLine as number | undefined,
          input.endLine as number | undefined
        );
        break;

      case 'list_directory':
        result = listDirectory(
          input.path as string,
          input.recursive as boolean | undefined
        );
        break;

      case 'get_file_dependencies':
        result = await getFileDependencies(
          input.filepath as string,
          repositoryId
        );
        break;

      case 'find_symbol':
        result = await findSymbol(
          input.symbol as string,
          input.type as string | undefined,
          repositoryId
        );
        break;

      default:
        result = `Unknown tool: ${name}`;
    }

    return { toolCallId: id, content: result };
  } catch (error) {
    logger.error('Tool execution error', { tool: name, input }, error);
    return {
      toolCallId: id,
      content: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}
