// AST parsing and chunking
// TODO: implement tree-sitter based chunking

export interface CodeChunk {
  id: string;
  content: string;
  filepath: string;
  startLine: number;
  endLine: number;
  nodeType: 'function' | 'class' | 'interface' | 'type' | 'other';
  name: string;
  imports: string[];
  exports: string[];
  types: string[];
}

export function parseFile(_filepath: string, _content: string): CodeChunk[] {
  throw new Error('Not implemented');
}
