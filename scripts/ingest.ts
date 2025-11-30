// Ingestion script for indexing a codebase
// Usage: npm run ingest -- --path /path/to/codebase

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, lstatSync } from 'fs';
import { join, resolve, relative } from 'path';
import { parseFile, getSupportedExtensions, type CodeChunk } from '../src/lib/ast';
import { buildGraph, attachChunksToGraph, getGraphStats, type DependencyGraph } from '../src/lib/graph';
import { createStore, addToStore, saveStore, type VectorStore, type VectorEntry } from '../src/lib/retrieval';
import { embed, getEmbeddingConfig } from '../src/lib/llm';

// config
const DATA_DIR = join(process.cwd(), '.nexu');
const STORE_FILE = join(DATA_DIR, 'vectors.json');
const GRAPH_FILE = join(DATA_DIR, 'graph.json');
const META_FILE = join(DATA_DIR, 'meta.json');

// ignore patterns
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.cache',
  '__pycache__',
  'venv',
  '.venv',
]);

const IGNORE_FILES = new Set([
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

interface IngestOptions {
  path: string;
  batchSize: number;
  verbose: boolean;
}

// find all supported files in directory
function findFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);

      // skip ignored dirs
      if (IGNORE_DIRS.has(entry)) continue;
      if (IGNORE_FILES.has(entry)) continue;

      // use lstatSync to handle symlinks, wrap in try-catch for broken symlinks
      let stat;
      try {
        const lstat = lstatSync(fullPath);
        // skip symlinks (may be broken or point outside repo)
        if (lstat.isSymbolicLink()) continue;
        stat = lstat;
      } catch {
        // skip files we can't stat (broken symlinks, permission issues)
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = entry.slice(entry.lastIndexOf('.'));
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

// batch array into chunks
function batch<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

// embedding dimension based on model
function getEmbeddingDimension(model: string): number {
  // common embedding dimensions
  const dimensions: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
    'text-embedding-004': 768, // gemini
    'nomic-embed-text': 768, // ollama
    'mxbai-embed-large': 1024, // ollama
    'all-minilm': 384, // ollama
  };

  return dimensions[model] || 1536; // default to OpenAI dimension
}

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║         nexu codebase indexer         ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');

  // parse args
  const args = process.argv.slice(2);
  const pathIdx = args.indexOf('--path');
  const verboseIdx = args.indexOf('--verbose');
  const batchIdx = args.indexOf('--batch-size');

  const options: IngestOptions = {
    path: pathIdx >= 0 ? args[pathIdx + 1] : process.cwd(),
    batchSize: batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : 10,
    verbose: verboseIdx >= 0,
  };

  const targetPath = resolve(options.path);

  if (!existsSync(targetPath)) {
    console.error(`Error: path does not exist: ${targetPath}`);
    process.exit(1);
  }

  console.log(`Target: ${targetPath}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log('');

  // ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // step 1: find files
  console.log('→ Scanning for files...');
  const extensions = getSupportedExtensions();
  const files = findFiles(targetPath, extensions);
  console.log(`  Found ${files.length} files`);

  if (files.length === 0) {
    console.log('No supported files found. Exiting.');
    process.exit(0);
  }

  // step 2: parse files and extract chunks
  console.log('');
  console.log('→ Parsing files with tree-sitter...');
  const allChunks: CodeChunk[] = [];
  const fileContents: Array<{ filepath: string; content: string }> = [];
  let parseErrors = 0;

  for (const filepath of files) {
    try {
      const content = readFileSync(filepath, 'utf-8');
      fileContents.push({ filepath, content });

      const chunks = parseFile(filepath, content);
      allChunks.push(...chunks);

      if (options.verbose) {
        console.log(`  ✓ ${relative(targetPath, filepath)} (${chunks.length} chunks)`);
      }
    } catch (error) {
      parseErrors++;
      if (options.verbose) {
        console.log(`  ✗ ${relative(targetPath, filepath)}: ${error}`);
      }
    }
  }

  console.log(`  Parsed ${files.length - parseErrors} files`);
  console.log(`  Extracted ${allChunks.length} chunks`);
  if (parseErrors > 0) {
    console.log(`  Skipped ${parseErrors} files with errors`);
  }

  // step 3: build dependency graph
  console.log('');
  console.log('→ Building dependency graph...');
  const graph = buildGraph(fileContents, targetPath);
  attachChunksToGraph(graph, allChunks);
  const graphStats = getGraphStats(graph);
  console.log(`  ${graphStats.totalFiles} files, ${graphStats.totalEdges} edges`);
  console.log(`  Avg imports per file: ${graphStats.avgImportsPerFile.toFixed(1)}`);

  // step 4: generate embeddings
  console.log('');
  console.log('→ Generating embeddings...');

  const embeddingConfig = getEmbeddingConfig();
  console.log(`  Provider: ${embeddingConfig.provider}`);
  console.log(`  Model: ${embeddingConfig.model}`);

  const dimension = getEmbeddingDimension(embeddingConfig.model);
  const store = createStore(dimension, embeddingConfig.model);

  const batches = batch(allChunks, options.batchSize);
  let processedChunks = 0;

  for (let i = 0; i < batches.length; i++) {
    const chunkBatch = batches[i];
    const texts = chunkBatch.map(c => `${c.nodeType}: ${c.name}\n\n${c.content}`);

    try {
      const embeddings = await embed(texts);

      const entries: VectorEntry[] = chunkBatch.map((chunk, j) => ({
        id: chunk.id,
        embedding: embeddings[j],
        chunk,
      }));

      addToStore(store, entries);
      processedChunks += chunkBatch.length;

      // progress
      const progress = Math.round((processedChunks / allChunks.length) * 100);
      process.stdout.write(`\r  Progress: ${progress}% (${processedChunks}/${allChunks.length})`);
    } catch (error) {
      console.error(`\n  Error embedding batch ${i + 1}: ${error}`);
    }
  }

  console.log('');

  // step 5: save to disk
  console.log('');
  console.log('→ Saving index...');

  // save vector store
  saveStore(store, STORE_FILE);
  console.log(`  Vectors: ${STORE_FILE}`);

  // save graph (serialize Maps to objects)
  const graphData = {
    nodes: Object.fromEntries(
      Array.from(graph.nodes.entries()).map(([k, v]) => [
        k,
        {
          filepath: v.filepath,
          exports: Array.from(v.exports),
          imports: v.imports,
          chunkIds: v.chunks.map(c => c.id),
        },
      ])
    ),
    edges: Object.fromEntries(Array.from(graph.edges.entries()).map(([k, v]) => [k, Array.from(v)])),
    reverseEdges: Object.fromEntries(
      Array.from(graph.reverseEdges.entries()).map(([k, v]) => [k, Array.from(v)])
    ),
  };
  const graphJson = JSON.stringify(graphData);
  const { writeFileSync } = await import('fs');
  writeFileSync(GRAPH_FILE, graphJson, 'utf-8');
  console.log(`  Graph: ${GRAPH_FILE}`);

  // save metadata
  const meta = {
    version: '1.0.0',
    indexedAt: new Date().toISOString(),
    targetPath,
    stats: {
      files: files.length,
      chunks: allChunks.length,
      embeddings: processedChunks,
      ...graphStats,
    },
    config: {
      embeddingProvider: embeddingConfig.provider,
      embeddingModel: embeddingConfig.model,
    },
  };
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`  Meta: ${META_FILE}`);

  // done
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║           Indexing complete!          ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  console.log('Summary:');
  console.log(`  Files indexed: ${files.length}`);
  console.log(`  Chunks created: ${allChunks.length}`);
  console.log(`  Embeddings: ${processedChunks}`);
  console.log(`  Graph edges: ${graphStats.totalEdges}`);
  console.log('');
  console.log(`Data saved to: ${DATA_DIR}`);
  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
