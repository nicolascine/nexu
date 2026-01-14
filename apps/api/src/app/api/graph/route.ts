// GET /api/graph - Get dependency graph for visualization
// GET /api/graph?file=src/foo.ts - Get dependencies for a specific file

import { NextRequest, NextResponse } from 'next/server';
import { initIndex } from '../../../lib/nexu';

export async function GET(request: NextRequest) {
  try {
    const { graph, meta } = initIndex();

    if (!graph) {
      return NextResponse.json(
        { error: 'No graph available. Index may not be loaded.' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const file = url.searchParams.get('file');
    const format = url.searchParams.get('format') || 'json';

    // If a specific file is requested, return its dependencies
    if (file) {
      const node = graph.nodes.get(file);
      if (!node) {
        return NextResponse.json({ error: 'File not found in graph' }, { status: 404 });
      }

      const dependencies = graph.edges.get(file) || new Set();
      const dependents = graph.reverseEdges.get(file) || new Set();

      return NextResponse.json({
        file: node.filepath,
        exports: Array.from(node.exports),
        imports: node.imports,
        dependencies: Array.from(dependencies),
        dependents: Array.from(dependents),
        chunkCount: node.chunks.length,
      });
    }

    // Return full graph data for visualization
    const nodes: Array<{
      id: string;
      label: string;
      exports: string[];
      importCount: number;
      dependencyCount: number;
      dependentCount: number;
    }> = [];

    const edges: Array<{
      source: string;
      target: string;
    }> = [];

    for (const [filepath, node] of graph.nodes) {
      nodes.push({
        id: filepath,
        label: filepath.split('/').pop() || filepath,
        exports: Array.from(node.exports),
        importCount: node.imports.length,
        dependencyCount: graph.edges.get(filepath)?.size || 0,
        dependentCount: graph.reverseEdges.get(filepath)?.size || 0,
      });

      const deps = graph.edges.get(filepath);
      if (deps) {
        for (const dep of deps) {
          edges.push({ source: filepath, target: dep });
        }
      }
    }

    // Format for different visualization libraries
    if (format === 'cytoscape') {
      return NextResponse.json({
        elements: {
          nodes: nodes.map((n) => ({
            data: n,
          })),
          edges: edges.map((e, i) => ({
            data: { id: `e${i}`, source: e.source, target: e.target },
          })),
        },
      });
    }

    if (format === 'd3') {
      return NextResponse.json({
        nodes,
        links: edges.map((e) => ({ source: e.source, target: e.target })),
      });
    }

    // Default: raw format with stats
    return NextResponse.json({
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgDependencies: edges.length / nodes.length || 0,
      },
      nodes,
      edges,
      meta: meta
        ? {
            indexedAt: meta.indexedAt,
            files: meta.stats.files,
            chunks: meta.stats.chunks,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
