// GET /api/files - Get file tree from indexed repository
// GET /api/files?path=src/lib - Get files in a specific directory

import { NextRequest, NextResponse } from 'next/server';
import { initIndex } from '../../../lib/nexu';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  stats?: {
    exports: number;
    imports: number;
    chunks: number;
  };
}

function buildTree(filepaths: string[]): TreeNode[] {
  const root: Map<string, TreeNode> = new Map();

  for (const filepath of filepaths) {
    const parts = filepath.split('/');
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (!currentLevel.has(part)) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
        };
        if (!isFile) {
          node.children = [];
        }
        currentLevel.set(part, node);
      }

      const existingNode = currentLevel.get(part)!;
      if (!isFile) {
        if (!existingNode.children) {
          existingNode.children = [];
        }
        // Convert children array to map for next iteration
        const childMap = new Map<string, TreeNode>();
        for (const child of existingNode.children) {
          childMap.set(child.name, child);
        }
        currentLevel = childMap;
      }
    }
  }

  // Convert root map to sorted array
  function mapToArray(map: Map<string, TreeNode>): TreeNode[] {
    const arr = Array.from(map.values());
    // Sort: directories first, then alphabetically
    arr.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Recursively convert children
    for (const node of arr) {
      if (node.children && node.children.length > 0) {
        const childMap = new Map<string, TreeNode>();
        for (const child of node.children) {
          childMap.set(child.name, child);
        }
        node.children = mapToArray(childMap);
      }
    }

    return arr;
  }

  return mapToArray(root);
}

export async function GET(request: NextRequest) {
  try {
    const { graph } = initIndex();

    if (!graph) {
      return NextResponse.json(
        { error: 'No index available. Please index a repository first.' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const pathFilter = url.searchParams.get('path');
    const flat = url.searchParams.get('flat') === 'true';

    // Get all filepaths from the graph
    let filepaths = Array.from(graph.nodes.keys());

    // Filter by path if specified
    if (pathFilter) {
      filepaths = filepaths.filter(
        (fp) => fp.startsWith(pathFilter) || fp.startsWith(pathFilter + '/')
      );
    }

    // Return flat list if requested
    if (flat) {
      const files = filepaths.map((fp) => {
        const node = graph.nodes.get(fp)!;
        return {
          path: fp,
          name: fp.split('/').pop() || fp,
          exports: Array.from(node.exports),
          importCount: node.imports.length,
          chunkCount: node.chunks.length,
        };
      });

      return NextResponse.json({
        total: files.length,
        files,
      });
    }

    // Build tree structure
    const tree = buildTree(filepaths);

    // Add stats to file nodes
    function addStats(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === 'file') {
          const graphNode = graph!.nodes.get(node.path);
          if (graphNode) {
            node.stats = {
              exports: graphNode.exports.size,
              imports: graphNode.imports.length,
              chunks: graphNode.chunks.length,
            };
          }
        } else if (node.children) {
          addStats(node.children);
        }
      }
    }
    addStats(tree);

    return NextResponse.json({
      total: filepaths.length,
      tree,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
