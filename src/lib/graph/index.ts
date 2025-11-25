// Dependency graph construction
// TODO: implement import/export graph building

export interface DependencyNode {
  filepath: string;
  exports: string[];
  imports: Import[];
}

export interface Import {
  symbol: string;
  from: string;
  line: number;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, Set<string>>;
}

export function buildGraph(_files: string[]): DependencyGraph {
  throw new Error('Not implemented');
}

export function getImports(_graph: DependencyGraph, _filepath: string): Import[] {
  throw new Error('Not implemented');
}

export function getDependents(_graph: DependencyGraph, _filepath: string): string[] {
  throw new Error('Not implemented');
}
