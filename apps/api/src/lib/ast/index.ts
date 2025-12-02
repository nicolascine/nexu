// Multi-language AST parsing and chunking using tree-sitter

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import Go from 'tree-sitter-go';
import Rust from 'tree-sitter-rust';
import { createHash } from 'crypto';

export interface CodeChunk {
  id: string;
  content: string;
  filepath: string;
  startLine: number;
  endLine: number;
  nodeType: 'function' | 'class' | 'interface' | 'type' | 'struct' | 'module' | 'other';
  name: string;
  language: Language;
  imports: string[];
  exports: string[];
  types: string[];
}

export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust';

// language configuration
interface LanguageConfig {
  extensions: string[];
  grammar: unknown;
  chunkTypes: Set<string>;
  importTypes: Set<string>;
  nameFields: string[];
  typeMap: Record<string, CodeChunk['nodeType']>;
}

const LANGUAGE_CONFIGS: Record<Language, LanguageConfig> = {
  typescript: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    grammar: TypeScript.typescript, // TypeScript exports .typescript and .tsx
    chunkTypes: new Set([
      'function_declaration',
      'arrow_function',
      'method_definition',
      'class_declaration',
      'interface_declaration',
      'type_alias_declaration',
      'export_statement',
      'lexical_declaration',
    ]),
    importTypes: new Set(['import_statement']),
    nameFields: ['name'],
    typeMap: {
      function_declaration: 'function',
      arrow_function: 'function',
      method_definition: 'function',
      lexical_declaration: 'function',
      class_declaration: 'class',
      interface_declaration: 'interface',
      type_alias_declaration: 'type',
    },
  },
  javascript: {
    extensions: [], // handled by typescript
    grammar: TypeScript.typescript,
    chunkTypes: new Set([
      'function_declaration',
      'arrow_function',
      'method_definition',
      'class_declaration',
      'lexical_declaration',
    ]),
    importTypes: new Set(['import_statement']),
    nameFields: ['name'],
    typeMap: {
      function_declaration: 'function',
      arrow_function: 'function',
      method_definition: 'function',
      lexical_declaration: 'function',
      class_declaration: 'class',
    },
  },
  python: {
    extensions: ['.py', '.pyi'],
    grammar: Python, // use module directly
    chunkTypes: new Set([
      'function_definition',
      'async_function_definition',
      'class_definition',
      'decorated_definition',
    ]),
    importTypes: new Set(['import_statement', 'import_from_statement']),
    nameFields: ['name'],
    typeMap: {
      function_definition: 'function',
      async_function_definition: 'function',
      class_definition: 'class',
      decorated_definition: 'function', // could be class too, check inner
    },
  },
  go: {
    extensions: ['.go'],
    grammar: Go, // use module directly
    chunkTypes: new Set([
      'function_declaration',
      'method_declaration',
      'type_declaration',
      'type_spec',
    ]),
    importTypes: new Set(['import_declaration']),
    nameFields: ['name'],
    typeMap: {
      function_declaration: 'function',
      method_declaration: 'function',
      type_declaration: 'type',
      type_spec: 'struct',
    },
  },
  rust: {
    extensions: ['.rs'],
    grammar: Rust, // use module directly
    chunkTypes: new Set([
      'function_item',
      'impl_item',
      'struct_item',
      'enum_item',
      'trait_item',
      'mod_item',
      'type_item',
    ]),
    importTypes: new Set(['use_declaration']),
    nameFields: ['name'],
    typeMap: {
      function_item: 'function',
      impl_item: 'class', // impl blocks are like class methods
      struct_item: 'struct',
      enum_item: 'type',
      trait_item: 'interface',
      mod_item: 'module',
      type_item: 'type',
    },
  },
};

// detect language from filepath
function detectLanguage(filepath: string): Language | null {
  const lower = filepath.toLowerCase();

  // check each language's extensions
  for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS) as Array<[Language, LanguageConfig]>) {
    if (config.extensions.some(ext => lower.endsWith(ext))) {
      // special case: .tsx uses tsx grammar
      if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) {
        return 'typescript'; // will use tsx grammar below
      }
      return lang;
    }
  }

  return null;
}

// get the correct grammar for a language and file
function getGrammar(language: Language, filepath: string): unknown {
  if (language === 'typescript' && (filepath.endsWith('.tsx') || filepath.endsWith('.jsx'))) {
    return TypeScript.tsx;
  }
  return LANGUAGE_CONFIGS[language].grammar;
}

// generate chunk id from content hash
function generateChunkId(filepath: string, content: string, startLine: number): string {
  const hash = createHash('sha256')
    .update(`${filepath}:${startLine}:${content}`)
    .digest('hex')
    .slice(0, 12);
  return `${filepath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'chunk'}-${hash}`;
}

// extract name from node (language-aware)
function extractName(node: Parser.SyntaxNode, language: Language): string {
  const config = LANGUAGE_CONFIGS[language];

  // try standard name field
  for (const field of config.nameFields) {
    const nameNode = node.childForFieldName(field);
    if (nameNode) {
      return nameNode.text;
    }
  }

  // language-specific fallbacks
  switch (language) {
    case 'typescript':
    case 'javascript':
      return extractTypeScriptName(node);
    case 'python':
      return extractPythonName(node);
    case 'go':
      return extractGoName(node);
    case 'rust':
      return extractRustName(node);
    default:
      return 'anonymous';
  }
}

function extractTypeScriptName(node: Parser.SyntaxNode): string {
  // variable declarations with arrow functions
  if (node.type === 'lexical_declaration') {
    const declarator = node.descendantsOfType('variable_declarator')[0];
    if (declarator) {
      const varName = declarator.childForFieldName('name');
      if (varName) return varName.text;
    }
  }

  // export statements
  if (node.type === 'export_statement') {
    const declaration = node.childForFieldName('declaration');
    if (declaration) {
      return extractTypeScriptName(declaration);
    }
    const exportClause = node.descendantsOfType('export_clause')[0];
    if (exportClause) {
      const specifiers = exportClause.descendantsOfType('export_specifier');
      return specifiers.map(s => s.childForFieldName('name')?.text || s.text).join(', ');
    }
  }

  // method definitions
  if (node.type === 'method_definition') {
    const propName = node.childForFieldName('name');
    if (propName) return propName.text;
  }

  return 'anonymous';
}

function extractPythonName(node: Parser.SyntaxNode): string {
  // decorated definitions - get the inner function/class name
  if (node.type === 'decorated_definition') {
    const definition = node.childForFieldName('definition');
    if (definition) {
      return extractPythonName(definition);
    }
  }

  return 'anonymous';
}

function extractGoName(node: Parser.SyntaxNode): string {
  // method declarations have receiver
  if (node.type === 'method_declaration') {
    const name = node.childForFieldName('name');
    if (name) return name.text;
  }

  // type declarations
  if (node.type === 'type_declaration') {
    const spec = node.descendantsOfType('type_spec')[0];
    if (spec) {
      const name = spec.childForFieldName('name');
      if (name) return name.text;
    }
  }

  return 'anonymous';
}

function extractRustName(node: Parser.SyntaxNode): string {
  // impl blocks
  if (node.type === 'impl_item') {
    const type = node.childForFieldName('type');
    if (type) return `impl ${type.text}`;
  }

  return 'anonymous';
}

// map node type to chunk type
function mapNodeType(nodeType: string, language: Language): CodeChunk['nodeType'] {
  return LANGUAGE_CONFIGS[language].typeMap[nodeType] || 'other';
}

// extract imports from file (language-aware)
function extractImports(tree: Parser.Tree, language: Language): string[] {
  const config = LANGUAGE_CONFIGS[language];
  const imports: string[] = [];

  function walk(node: Parser.SyntaxNode) {
    if (config.importTypes.has(node.type)) {
      const importPath = extractImportPath(node, language);
      if (importPath) {
        imports.push(importPath);
      }
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(tree.rootNode);
  return imports;
}

function extractImportPath(node: Parser.SyntaxNode, language: Language): string | null {
  switch (language) {
    case 'typescript':
    case 'javascript': {
      const source = node.descendantsOfType('string')[0];
      return source ? source.text.replace(/['"]/g, '') : null;
    }
    case 'python': {
      // import foo.bar or from foo.bar import baz
      const module = node.childForFieldName('module_name') || node.descendantsOfType('dotted_name')[0];
      return module ? module.text : null;
    }
    case 'go': {
      const path = node.descendantsOfType('interpreted_string_literal')[0];
      return path ? path.text.replace(/"/g, '') : null;
    }
    case 'rust': {
      const path = node.descendantsOfType('scoped_identifier')[0] || node.descendantsOfType('identifier')[0];
      return path ? path.text : null;
    }
    default:
      return null;
  }
}

// extract type references from a node
function extractTypes(node: Parser.SyntaxNode, language: Language): string[] {
  const types = new Set<string>();

  switch (language) {
    case 'typescript':
    case 'javascript': {
      const typeNodes = node.descendantsOfType(['type_identifier', 'predefined_type']);
      for (const typeNode of typeNodes) {
        types.add(typeNode.text);
      }
      break;
    }
    case 'python': {
      // type annotations
      const typeNodes = node.descendantsOfType(['type', 'subscript']);
      for (const typeNode of typeNodes) {
        types.add(typeNode.text);
      }
      break;
    }
    case 'go': {
      const typeNodes = node.descendantsOfType(['type_identifier', 'qualified_type']);
      for (const typeNode of typeNodes) {
        types.add(typeNode.text);
      }
      break;
    }
    case 'rust': {
      const typeNodes = node.descendantsOfType(['type_identifier', 'generic_type', 'scoped_type_identifier']);
      for (const typeNode of typeNodes) {
        types.add(typeNode.text);
      }
      break;
    }
  }

  return Array.from(types);
}

// check if a lexical declaration contains a function (TypeScript/JS)
function containsFunction(node: Parser.SyntaxNode): boolean {
  if (node.type === 'lexical_declaration') {
    const hasArrowFunc = node.descendantsOfType('arrow_function').length > 0;
    const hasFuncExpr = node.descendantsOfType('function_expression').length > 0;
    return hasArrowFunc || hasFuncExpr;
  }
  return true;
}

// check if node should be skipped
function shouldSkipNode(node: Parser.SyntaxNode, language: Language): boolean {
  // TypeScript: skip lexical declarations without functions
  if (language === 'typescript' || language === 'javascript') {
    if (node.type === 'lexical_declaration' && !containsFunction(node)) {
      return true;
    }
  }

  return false;
}

// main parsing function
export function parseFile(filepath: string, content: string): CodeChunk[] {
  const language = detectLanguage(filepath);
  if (!language) {
    return []; // unsupported file type
  }

  const config = LANGUAGE_CONFIGS[language];
  const grammar = getGrammar(language, filepath);

  // skip if grammar not available (version mismatch)
  if (!grammar) {
    return [];
  }

  const parser = new Parser();
  try {
    // tree-sitter grammars don't export their types, cast required
    parser.setLanguage(grammar as Parameters<typeof parser.setLanguage>[0]);
  } catch {
    // grammar incompatible with tree-sitter version
    return [];
  }

  let tree: Parser.Tree;
  let fileImports: string[];
  try {
    tree = parser.parse(content);
    fileImports = extractImports(tree, language);
  } catch {
    // parsing failed - likely version mismatch
    return [];
  }

  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');

  function processNode(node: Parser.SyntaxNode, parentExported: boolean = false) {
    const isChunkable = config.chunkTypes.has(node.type);
    const isExport = node.type === 'export_statement';

    if (isChunkable && !shouldSkipNode(node, language!)) {
      // TypeScript exports - handle specially
      if (language === 'typescript' && isExport) {
        const declaration = node.childForFieldName('declaration');
        if (declaration && config.chunkTypes.has(declaration.type)) {
          const name = extractName(declaration, language);
          const nodeType = mapNodeType(declaration.type, language);
          const startLine = node.startPosition.row + 1;
          const endLine = node.endPosition.row + 1;
          const chunkContent = lines.slice(startLine - 1, endLine).join('\n');

          chunks.push({
            id: generateChunkId(filepath, chunkContent, startLine),
            content: chunkContent,
            filepath,
            startLine,
            endLine,
            nodeType,
            name,
            language,
            imports: fileImports,
            exports: [name],
            types: extractTypes(node, language),
          });
          return;
        }

        // named exports
        const exportClause = node.descendantsOfType('export_clause')[0];
        if (exportClause) {
          const startLine = node.startPosition.row + 1;
          const endLine = node.endPosition.row + 1;
          const chunkContent = lines.slice(startLine - 1, endLine).join('\n');

          chunks.push({
            id: generateChunkId(filepath, chunkContent, startLine),
            content: chunkContent,
            filepath,
            startLine,
            endLine,
            nodeType: 'other',
            name: extractName(node, language),
            language,
            imports: fileImports,
            exports: [],
            types: [],
          });
          return;
        }
      }

      // regular chunk
      if (!isExport) {
        const name = extractName(node, language!);
        const nodeType = mapNodeType(node.type, language!);
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        const chunkContent = lines.slice(startLine - 1, endLine).join('\n');

        chunks.push({
          id: generateChunkId(filepath, chunkContent, startLine),
          content: chunkContent,
          filepath,
          startLine,
          endLine,
          nodeType,
          name,
          language: language!,
          imports: fileImports,
          exports: parentExported ? [name] : [],
          types: extractTypes(node, language!),
        });

        // don't recurse into certain node types
        if (node.type === 'lexical_declaration') {
          return;
        }
      }
    }

    // recurse into children
    const declaration = isExport ? node.childForFieldName('declaration') : null;
    for (const child of node.children) {
      if (declaration && child.id === declaration.id) {
        continue;
      }
      processNode(child, isExport);
    }
  }

  processNode(tree.rootNode);

  return chunks;
}

// parse multiple files
export function parseFiles(files: Array<{ filepath: string; content: string }>): CodeChunk[] {
  const allChunks: CodeChunk[] = [];

  for (const file of files) {
    const chunks = parseFile(file.filepath, file.content);
    allChunks.push(...chunks);
  }

  return allChunks;
}

// get supported file extensions
export function getSupportedExtensions(): string[] {
  const extensions: string[] = [];
  for (const config of Object.values(LANGUAGE_CONFIGS)) {
    extensions.push(...config.extensions);
  }
  return extensions;
}

// get supported languages
export function getSupportedLanguages(): Language[] {
  return Object.keys(LANGUAGE_CONFIGS) as Language[];
}
