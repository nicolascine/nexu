// Unit tests for dependency graph

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  buildGraph,
  attachChunksToGraph,
  getDependencies,
  getDependents,
  expandContext,
  getGraphStats,
  findExportingFiles,
} from '../../src/lib/graph';
import type { CodeChunk } from '../../src/lib/ast';

describe('buildGraph', () => {
  test('creates nodes for all files', () => {
    const files = [
      { filepath: '/project/a.ts', content: 'export const x = 1;' },
      { filepath: '/project/b.ts', content: 'export const y = 2;' },
    ];
    const graph = buildGraph(files, '/project');

    assert.strictEqual(graph.nodes.size, 2);
    assert.ok(graph.nodes.has('/project/a.ts'));
    assert.ok(graph.nodes.has('/project/b.ts'));
  });

  test('extracts exports', () => {
    const files = [
      {
        filepath: '/project/utils.ts',
        content: `export function add(a: number, b: number) { return a + b; }
export const PI = 3.14;
export class Calculator {}
export interface Config {}
export type ID = string;`,
      },
    ];
    const graph = buildGraph(files, '/project');
    const node = graph.nodes.get('/project/utils.ts');

    assert.ok(node);
    assert.ok(node.exports.has('add'));
    assert.ok(node.exports.has('PI'));
    assert.ok(node.exports.has('Calculator'));
    assert.ok(node.exports.has('Config'));
    assert.ok(node.exports.has('ID'));
  });

  test('extracts imports', () => {
    const files = [
      {
        filepath: '/project/main.ts',
        content: `import { foo, bar } from './utils';
import type { Config } from './config';
import * as path from 'path';`,
      },
    ];
    const graph = buildGraph(files, '/project');
    const node = graph.nodes.get('/project/main.ts');

    assert.ok(node);
    assert.strictEqual(node.imports.length, 4);
    assert.ok(node.imports.some(i => i.symbol === 'foo' && i.from === './utils'));
    assert.ok(node.imports.some(i => i.symbol === 'bar' && i.from === './utils'));
    assert.ok(node.imports.some(i => i.symbol === 'Config' && i.isType === true));
  });

  test('creates edges between files', () => {
    const files = [
      { filepath: '/project/a.ts', content: "import { x } from './b';" },
      { filepath: '/project/b.ts', content: 'export const x = 1;' },
    ];
    const graph = buildGraph(files, '/project');

    const deps = getDependencies(graph, '/project/a.ts');
    assert.ok(deps.includes('/project/b.ts'));
  });

  test('creates reverse edges', () => {
    const files = [
      { filepath: '/project/a.ts', content: "import { x } from './b';" },
      { filepath: '/project/b.ts', content: 'export const x = 1;' },
    ];
    const graph = buildGraph(files, '/project');

    const dependents = getDependents(graph, '/project/b.ts');
    assert.ok(dependents.includes('/project/a.ts'));
  });
});

describe('attachChunksToGraph', () => {
  test('attaches chunks to correct nodes', () => {
    const files = [
      { filepath: '/project/a.ts', content: 'export const x = 1;' },
    ];
    const graph = buildGraph(files, '/project');

    const chunk: CodeChunk = {
      id: 'chunk-1',
      content: 'export const x = 1;',
      filepath: '/project/a.ts',
      startLine: 1,
      endLine: 1,
      nodeType: 'function',
      name: 'x',
      language: 'typescript',
      imports: [],
      exports: ['x'],
      types: [],
    };

    attachChunksToGraph(graph, [chunk]);

    const node = graph.nodes.get('/project/a.ts');
    assert.ok(node);
    assert.strictEqual(node.chunks.length, 1);
    assert.strictEqual(node.chunks[0].id, 'chunk-1');
  });
});

describe('expandContext', () => {
  test('expands to imported files', () => {
    const files = [
      { filepath: '/project/a.ts', content: "import { x } from './b';" },
      { filepath: '/project/b.ts', content: "import { y } from './c';" },
      { filepath: '/project/c.ts', content: 'export const y = 1;' },
    ];
    const graph = buildGraph(files, '/project');

    const expanded = expandContext(graph, ['/project/a.ts'], {
      maxHops: 2,
      includeImports: true,
      includeDependents: false,
    });

    assert.ok(expanded.includes('/project/a.ts'));
    assert.ok(expanded.includes('/project/b.ts'));
    assert.ok(expanded.includes('/project/c.ts'));
  });

  test('respects maxHops', () => {
    const files = [
      { filepath: '/project/a.ts', content: "import { x } from './b';" },
      { filepath: '/project/b.ts', content: "import { y } from './c';" },
      { filepath: '/project/c.ts', content: 'export const y = 1;' },
    ];
    const graph = buildGraph(files, '/project');

    const expanded = expandContext(graph, ['/project/a.ts'], {
      maxHops: 1,
      includeImports: true,
      includeDependents: false,
    });

    assert.ok(expanded.includes('/project/a.ts'));
    assert.ok(expanded.includes('/project/b.ts'));
    assert.ok(!expanded.includes('/project/c.ts'));
  });

  test('respects maxFiles', () => {
    const files = [
      { filepath: '/project/a.ts', content: "import { x } from './b';" },
      { filepath: '/project/b.ts', content: "import { y } from './c';" },
      { filepath: '/project/c.ts', content: 'export const y = 1;' },
    ];
    const graph = buildGraph(files, '/project');

    const expanded = expandContext(graph, ['/project/a.ts'], {
      maxHops: 10,
      maxFiles: 2,
    });

    assert.strictEqual(expanded.length, 2);
  });
});

describe('getGraphStats', () => {
  test('returns correct statistics', () => {
    const files = [
      { filepath: '/project/a.ts', content: "import { x } from './b';" },
      { filepath: '/project/b.ts', content: 'export const x = 1;' },
    ];
    const graph = buildGraph(files, '/project');
    const stats = getGraphStats(graph);

    assert.strictEqual(stats.totalFiles, 2);
    assert.strictEqual(stats.totalEdges, 1);
  });
});

describe('findExportingFiles', () => {
  test('finds files exporting a symbol', () => {
    const files = [
      { filepath: '/project/a.ts', content: 'export const foo = 1;' },
      { filepath: '/project/b.ts', content: 'export const bar = 2;' },
      { filepath: '/project/c.ts', content: 'export const foo = 3;' },
    ];
    const graph = buildGraph(files, '/project');

    const exporters = findExportingFiles(graph, 'foo');
    assert.strictEqual(exporters.length, 2);
    assert.ok(exporters.includes('/project/a.ts'));
    assert.ok(exporters.includes('/project/c.ts'));
  });
});
