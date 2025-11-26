// Dependency graph construction for context expansion

import { CodeChunk } from '../ast';
import { resolve, dirname, relative } from 'path';

export interface Import {
  symbol: string;
  from: string;
  isType: boolean;
  line: number;
}

export interface DependencyNode {
  filepath: string;
  exports: Set<string>;
  imports: Import[];
  chunks: CodeChunk[];
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  // edges: filepath -> set of filepaths it depends on
  edges: Map<string, Set<string>>;
  // reverse edges: filepath -> set of filepaths that depend on it
  reverseEdges: Map<string, Set<string>>;
}

// resolve a relative import path to absolute
function resolveImportPath(fromFile: string, importPath: string, projectRoot: string): string | null {
  // skip external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const fromDir = dirname(fromFile);
  let resolved = resolve(fromDir, importPath);

  // try adding extensions if not present
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  if (!extensions.some(ext => resolved.endsWith(ext))) {
    // could be a directory import (index.ts) or missing extension
    for (const ext of extensions) {
      const withExt = resolved + ext;
      const indexFile = resolve(resolved, `index${ext}`);
      // return normalized relative path
      if (withExt.startsWith(projectRoot)) return withExt;
      if (indexFile.startsWith(projectRoot)) return indexFile;
    }
    // fallback to .ts
    resolved = resolved + '.ts';
  }

  return resolved;
}

// extract imports from code content using regex (fast, for initial graph building)
function extractImportsFromContent(content: string): Array<{ symbols: string[]; from: string; isType: boolean; line: number }> {
  const imports: Array<{ symbols: string[]; from: string; isType: boolean; line: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // import { foo, bar } from 'module'
    // import type { Foo } from 'module'
    // import Foo from 'module'
    // import * as Foo from 'module'
    const importMatch = line.match(/^import\s+(type\s+)?(?:(\*\s+as\s+\w+)|(?:\{([^}]+)\})|(\w+))?\s*(?:,\s*(?:\{([^}]+)\}))?\s*from\s+['"]([^'"]+)['"]/);

    if (importMatch) {
      const isType = !!importMatch[1];
      const starImport = importMatch[2];
      const namedImports = importMatch[3] || importMatch[5];
      const defaultImport = importMatch[4];
      const from = importMatch[6];

      const symbols: string[] = [];

      if (starImport) {
        const name = starImport.replace(/\*\s+as\s+/, '');
        symbols.push(name);
      }
      if (defaultImport) {
        symbols.push(defaultImport);
      }
      if (namedImports) {
        const parsed = namedImports.split(',').map(s => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts[parts.length - 1].trim();
        }).filter(Boolean);
        symbols.push(...parsed);
      }

      imports.push({ symbols, from, isType, line: i + 1 });
    }

    // dynamic import: import('module')
    const dynamicMatch = line.match(/import\(['"]([^'"]+)['"]\)/);
    if (dynamicMatch) {
      imports.push({ symbols: ['*'], from: dynamicMatch[1], isType: false, line: i + 1 });
    }

    // require: require('module')
    const requireMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
    if (requireMatch) {
      imports.push({ symbols: ['*'], from: requireMatch[1], isType: false, line: i + 1 });
    }
  }

  return imports;
}

// extract exports from code content
function extractExportsFromContent(content: string): string[] {
  const exports: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // export function foo
    const funcMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      exports.push(funcMatch[1]);
      continue;
    }

    // export class Foo
    const classMatch = line.match(/^export\s+class\s+(\w+)/);
    if (classMatch) {
      exports.push(classMatch[1]);
      continue;
    }

    // export interface Foo
    const interfaceMatch = line.match(/^export\s+interface\s+(\w+)/);
    if (interfaceMatch) {
      exports.push(interfaceMatch[1]);
      continue;
    }

    // export type Foo
    const typeMatch = line.match(/^export\s+type\s+(\w+)/);
    if (typeMatch) {
      exports.push(typeMatch[1]);
      continue;
    }

    // export const/let/var foo
    const varMatch = line.match(/^export\s+(?:const|let|var)\s+(\w+)/);
    if (varMatch) {
      exports.push(varMatch[1]);
      continue;
    }

    // export { foo, bar }
    const namedMatch = line.match(/^export\s+\{([^}]+)\}/);
    if (namedMatch) {
      const names = namedMatch[1].split(',').map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      }).filter(Boolean);
      exports.push(...names);
      continue;
    }

    // export default
    if (line.match(/^export\s+default/)) {
      exports.push('default');
    }
  }

  return exports;
}

// build graph from files
export function buildGraph(
  files: Array<{ filepath: string; content: string }>,
  projectRoot: string
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();
  const edges = new Map<string, Set<string>>();
  const reverseEdges = new Map<string, Set<string>>();

  // first pass: create nodes
  for (const file of files) {
    const rawImports = extractImportsFromContent(file.content);
    const exports = extractExportsFromContent(file.content);

    const imports: Import[] = rawImports.flatMap(imp =>
      imp.symbols.map(symbol => ({
        symbol,
        from: imp.from,
        isType: imp.isType,
        line: imp.line,
      }))
    );

    nodes.set(file.filepath, {
      filepath: file.filepath,
      exports: new Set(exports),
      imports,
      chunks: [],
    });

    edges.set(file.filepath, new Set());
    reverseEdges.set(file.filepath, new Set());
  }

  // second pass: resolve edges
  for (const [filepath, node] of nodes) {
    for (const imp of node.imports) {
      const resolved = resolveImportPath(filepath, imp.from, projectRoot);
      if (resolved && nodes.has(resolved)) {
        edges.get(filepath)!.add(resolved);
        reverseEdges.get(resolved)!.add(filepath);
      }
    }
  }

  return { nodes, edges, reverseEdges };
}

// add chunks to graph nodes
export function attachChunksToGraph(graph: DependencyGraph, chunks: CodeChunk[]): void {
  for (const chunk of chunks) {
    const node = graph.nodes.get(chunk.filepath);
    if (node) {
      node.chunks.push(chunk);
    }
  }
}

// get direct imports for a file
export function getImports(graph: DependencyGraph, filepath: string): Import[] {
  return graph.nodes.get(filepath)?.imports || [];
}

// get files that this file imports
export function getDependencies(graph: DependencyGraph, filepath: string): string[] {
  return Array.from(graph.edges.get(filepath) || []);
}

// get files that depend on this file (import it)
export function getDependents(graph: DependencyGraph, filepath: string): string[] {
  return Array.from(graph.reverseEdges.get(filepath) || []);
}

// expand context by following imports/dependents up to N hops
export function expandContext(
  graph: DependencyGraph,
  startFiles: string[],
  options: {
    maxHops?: number;
    includeImports?: boolean;
    includeDependents?: boolean;
    maxFiles?: number;
  } = {}
): string[] {
  const {
    maxHops = 2,
    includeImports = true,
    includeDependents = true,
    maxFiles = 20,
  } = options;

  const visited = new Set<string>(startFiles);
  const queue = startFiles.map(f => ({ file: f, hops: 0 }));
  const result: string[] = [...startFiles];

  while (queue.length > 0 && result.length < maxFiles) {
    const { file, hops } = queue.shift()!;

    if (hops >= maxHops) continue;

    const neighbors: string[] = [];

    if (includeImports) {
      neighbors.push(...getDependencies(graph, file));
    }

    if (includeDependents) {
      neighbors.push(...getDependents(graph, file));
    }

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && result.length < maxFiles) {
        visited.add(neighbor);
        result.push(neighbor);
        queue.push({ file: neighbor, hops: hops + 1 });
      }
    }
  }

  return result;
}

// get chunks for expanded context
export function getExpandedChunks(
  graph: DependencyGraph,
  startChunks: CodeChunk[],
  options: {
    maxHops?: number;
    maxChunks?: number;
  } = {}
): CodeChunk[] {
  const { maxHops = 2, maxChunks = 20 } = options;

  // get unique files from start chunks
  const startFiles = [...new Set(startChunks.map(c => c.filepath))];

  // expand to related files
  const expandedFiles = expandContext(graph, startFiles, {
    maxHops,
    maxFiles: maxChunks,
    includeImports: true,
    includeDependents: true,
  });

  // collect all chunks from expanded files
  const allChunks: CodeChunk[] = [];
  for (const filepath of expandedFiles) {
    const node = graph.nodes.get(filepath);
    if (node) {
      allChunks.push(...node.chunks);
    }
  }

  return allChunks.slice(0, maxChunks);
}

// find files that export a specific symbol
export function findExportingFiles(graph: DependencyGraph, symbol: string): string[] {
  const files: string[] = [];

  for (const [filepath, node] of graph.nodes) {
    if (node.exports.has(symbol)) {
      files.push(filepath);
    }
  }

  return files;
}

// get graph statistics
export function getGraphStats(graph: DependencyGraph): {
  totalFiles: number;
  totalEdges: number;
  avgImportsPerFile: number;
  avgDependentsPerFile: number;
} {
  let totalEdges = 0;
  let totalImports = 0;
  let totalDependents = 0;

  for (const edges of graph.edges.values()) {
    totalEdges += edges.size;
    totalImports += edges.size;
  }

  for (const deps of graph.reverseEdges.values()) {
    totalDependents += deps.size;
  }

  const totalFiles = graph.nodes.size;

  return {
    totalFiles,
    totalEdges,
    avgImportsPerFile: totalFiles > 0 ? totalImports / totalFiles : 0,
    avgDependentsPerFile: totalFiles > 0 ? totalDependents / totalFiles : 0,
  };
}
