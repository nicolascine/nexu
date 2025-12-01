// Ingestion script for indexing a codebase
// Usage:
//   pnpm ingest -- --path /path/to/local/codebase
//   pnpm ingest -- --repo https://github.com/owner/repo
//   pnpm ingest -- --repo https://github.com/owner/repo --prod  (uses Supabase)

// Load .env.local for production credentials
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, readdirSync, existsSync, mkdirSync, lstatSync, rmSync, writeFileSync } from 'fs';
import { join, resolve, relative } from 'path';
import { execSync } from 'child_process';
import { parseFile, getSupportedExtensions, type CodeChunk } from '../src/lib/ast';
import { buildGraph, attachChunksToGraph, getGraphStats, type DependencyGraph } from '../src/lib/graph';
import { embed, getEmbeddingConfig } from '../src/lib/llm';
import {
  parseGitHubUrl,
  getRepositoryId,
  fetchGitHubMetadata,
  upsertRepository,
  updateRepositoryStatus,
} from '../src/lib/repositories';

// config
const DATA_DIR = join(process.cwd(), '.nexu');
const REPOS_DIR = join(DATA_DIR, 'repos');
const STORE_FILE = join(DATA_DIR, 'vectors.json');
const GRAPH_FILE = join(DATA_DIR, 'graph.json');
const META_FILE = join(DATA_DIR, 'meta.json');

// ignore patterns
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.turbo', '.cache', '__pycache__', 'venv', '.venv', 'vendor',
  '.idea', '.vscode', 'target', 'out', '.output',
]);

const IGNORE_FILES = new Set([
  '.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Cargo.lock', 'poetry.lock', 'go.sum',
]);

interface IngestOptions {
  path?: string;
  repo?: string;
  batchSize: number;
  verbose: boolean;
  prod: boolean;
  clean: boolean;
}

function findFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    let entries;
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      if (IGNORE_DIRS.has(entry)) continue;
      if (IGNORE_FILES.has(entry)) continue;

      let stat;
      try {
        const lstat = lstatSync(fullPath);
        if (lstat.isSymbolicLink()) continue;
        stat = lstat;
      } catch {
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

function batch<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

function getEmbeddingDimension(model: string): number {
  const dimensions: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
    'text-embedding-004': 768,
    'nomic-embed-text': 768,
    'mxbai-embed-large': 1024,
    'all-minilm': 384,
  };
  return dimensions[model] || 1536;
}

async function cloneRepo(url: string): Promise<string> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error(`Invalid GitHub URL: ${url}`);

  const repoDir = join(REPOS_DIR, parsed.owner, parsed.repo);

  if (!existsSync(REPOS_DIR)) {
    mkdirSync(REPOS_DIR, { recursive: true });
  }

  if (existsSync(repoDir)) {
    console.log(`  Repo exists, pulling latest...`);
    execSync('git pull --ff-only', { cwd: repoDir, stdio: 'pipe' });
  } else {
    console.log(`  Cloning ${parsed.owner}/${parsed.repo}...`);
    mkdirSync(join(REPOS_DIR, parsed.owner), { recursive: true });
    execSync(`git clone --depth 1 ${url} ${repoDir}`, { stdio: 'pipe' });
  }

  return repoDir;
}

async function saveToJson(
  store: { dimension: number; model: string; entries: any[] },
  graph: DependencyGraph,
  meta: any,
) {
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  console.log(`  Vectors: ${STORE_FILE}`);

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
  writeFileSync(GRAPH_FILE, JSON.stringify(graphData), 'utf-8');
  console.log(`  Graph: ${GRAPH_FILE}`);

  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`  Meta: ${META_FILE}`);
}

async function saveToPgVector(
  entries: Array<{ id: string; embedding: number[]; chunk: CodeChunk; repositoryId: string }>,
  graph: DependencyGraph,
  repositoryId: string,
) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set. Use --prod with valid .env');

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString });

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // delete old chunks for this repo
      await client.query('DELETE FROM chunks WHERE repository_id = $1', [repositoryId]);
      await client.query('DELETE FROM graph_edges WHERE from_file LIKE $1', [`${repositoryId}:%`]);
      await client.query('DELETE FROM graph_nodes WHERE filepath LIKE $1', [`${repositoryId}:%`]);

      // insert chunks
      for (const entry of entries) {
        const embeddingStr = `[${entry.embedding.join(',')}]`;
        await client.query(`
          INSERT INTO chunks (
            id, filepath, start_line, end_line, node_type, name, language,
            content, imports, exports, types, embedding, repository_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::vector, $13)
        `, [
          entry.id,
          entry.chunk.filepath,
          entry.chunk.startLine,
          entry.chunk.endLine,
          entry.chunk.nodeType,
          entry.chunk.name,
          entry.chunk.language,
          entry.chunk.content,
          entry.chunk.imports,
          entry.chunk.exports,
          entry.chunk.types,
          embeddingStr,
          repositoryId,
        ]);
      }

      // insert graph edges
      for (const [from, toSet] of graph.edges.entries()) {
        for (const to of toSet) {
          await client.query(`
            INSERT INTO graph_edges (from_file, to_file) VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [`${repositoryId}:${from}`, `${repositoryId}:${to}`]);
        }
      }

      // insert graph nodes
      for (const [filepath, node] of graph.nodes.entries()) {
        await client.query(`
          INSERT INTO graph_nodes (filepath, exports, imports) VALUES ($1, $2, $3)
          ON CONFLICT (filepath) DO UPDATE SET exports = $2, imports = $3
        `, [
          `${repositoryId}:${filepath}`,
          Array.from(node.exports),
          JSON.stringify(node.imports),
        ]);
      }

      await client.query('COMMIT');
      console.log(`  Saved ${entries.length} chunks to PostgreSQL`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║         nexu codebase indexer         ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');

  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
      return args[idx + 1];
    }
    return undefined;
  };
  const hasFlag = (name: string) => args.includes(`--${name}`);

  const options: IngestOptions = {
    path: getArg('path'),
    repo: getArg('repo'),
    batchSize: parseInt(getArg('batch-size') || '10', 10),
    verbose: hasFlag('verbose'),
    prod: hasFlag('prod'),
    clean: hasFlag('clean'),
  };

  if (!options.path && !options.repo) {
    console.log('Usage:');
    console.log('  pnpm ingest -- --path /path/to/codebase');
    console.log('  pnpm ingest -- --repo https://github.com/owner/repo');
    console.log('  pnpm ingest -- --repo https://github.com/owner/repo --prod');
    console.log('');
    console.log('Options:');
    console.log('  --path <path>       Local directory to index');
    console.log('  --repo <url>        GitHub repository URL to clone and index');
    console.log('  --prod              Save to Supabase (requires DATABASE_URL)');
    console.log('  --batch-size <n>    Embedding batch size (default: 10)');
    console.log('  --verbose           Show detailed progress');
    console.log('  --clean             Remove cloned repo after indexing');
    process.exit(1);
  }

  // determine target path and repository info
  let targetPath: string;
  let repositoryId: string | undefined;
  let repoMetadata: { owner: string; repo: string; description: string | null; stars: number; language: string | null; defaultBranch: string } | undefined;

  if (options.repo) {
    const parsed = parseGitHubUrl(options.repo);
    if (!parsed) {
      console.error('Invalid GitHub URL');
      process.exit(1);
    }

    repositoryId = getRepositoryId(options.repo);
    console.log(`Repository: ${parsed.owner}/${parsed.repo}`);
    console.log(`ID: ${repositoryId}`);

    // fetch github metadata
    console.log('');
    console.log('→ Fetching GitHub metadata...');
    const ghMeta = await fetchGitHubMetadata(parsed.owner, parsed.repo);
    repoMetadata = { ...parsed, ...ghMeta };
    console.log(`  ⭐ ${ghMeta.stars} stars`);
    if (ghMeta.language) console.log(`  📝 ${ghMeta.language}`);
    if (ghMeta.description) console.log(`  📄 ${ghMeta.description.slice(0, 60)}...`);

    // clone or update repo
    console.log('');
    console.log('→ Preparing repository...');
    targetPath = await cloneRepo(options.repo);

    // register repository if using prod
    if (options.prod) {
      await upsertRepository({
        id: repositoryId,
        name: parsed.repo,
        owner: parsed.owner,
        fullName: `${parsed.owner}/${parsed.repo}`,
        url: options.repo,
        description: ghMeta.description,
        stars: ghMeta.stars,
        language: ghMeta.language,
        defaultBranch: ghMeta.defaultBranch,
        chunkCount: 0,
        fileCount: 0,
        status: 'indexing',
      });
    }
  } else {
    targetPath = resolve(options.path!);
    if (!existsSync(targetPath)) {
      console.error(`Error: path does not exist: ${targetPath}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log(`Target: ${targetPath}`);
  console.log(`Mode: ${options.prod ? 'Production (Supabase)' : 'Local (JSON)'}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log('');

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
    if (options.prod && repositoryId) {
      await updateRepositoryStatus(repositoryId, 'error');
    }
    process.exit(0);
  }

  // step 2: parse files
  console.log('');
  console.log('→ Parsing files with tree-sitter...');
  const allChunks: CodeChunk[] = [];
  const fileContents: Array<{ filepath: string; content: string }> = [];
  let parseErrors = 0;

  for (const filepath of files) {
    try {
      const content = readFileSync(filepath, 'utf-8');
      const relPath = relative(targetPath, filepath);
      fileContents.push({ filepath: relPath, content });

      const chunks = parseFile(filepath, content);
      // update chunk filepaths to be relative
      for (const chunk of chunks) {
        chunk.filepath = relPath;
        chunk.id = `${relPath}:${chunk.startLine}-${chunk.endLine}`;
      }
      allChunks.push(...chunks);

      if (options.verbose) {
        console.log(`  ✓ ${relPath} (${chunks.length} chunks)`);
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

  // step 3: build graph
  console.log('');
  console.log('→ Building dependency graph...');
  const graph = buildGraph(fileContents, targetPath);
  attachChunksToGraph(graph, allChunks);
  const graphStats = getGraphStats(graph);
  console.log(`  ${graphStats.totalFiles} files, ${graphStats.totalEdges} edges`);

  // step 4: generate embeddings
  console.log('');
  console.log('→ Generating embeddings...');

  const embeddingConfig = getEmbeddingConfig();
  console.log(`  Provider: ${embeddingConfig.provider}`);
  console.log(`  Model: ${embeddingConfig.model}`);

  const dimension = getEmbeddingDimension(embeddingConfig.model);
  const entries: Array<{ id: string; embedding: number[]; chunk: CodeChunk; repositoryId: string }> = [];

  const batches = batch(allChunks, options.batchSize);
  let processedChunks = 0;

  for (let i = 0; i < batches.length; i++) {
    const chunkBatch = batches[i];
    const texts = chunkBatch.map(c => `${c.nodeType}: ${c.name}\n\n${c.content}`);

    try {
      const embeddings = await embed(texts);

      for (let j = 0; j < chunkBatch.length; j++) {
        entries.push({
          id: chunkBatch[j].id,
          embedding: embeddings[j],
          chunk: chunkBatch[j],
          repositoryId: repositoryId || 'local',
        });
      }

      processedChunks += chunkBatch.length;
      const progress = Math.round((processedChunks / allChunks.length) * 100);
      process.stdout.write(`\r  Progress: ${progress}% (${processedChunks}/${allChunks.length})`);
    } catch (error) {
      console.error(`\n  Error embedding batch ${i + 1}: ${error}`);
    }
  }

  console.log('');

  // step 5: save
  console.log('');
  console.log('→ Saving index...');

  if (options.prod && repositoryId) {
    await saveToPgVector(entries, graph, repositoryId);
    await updateRepositoryStatus(repositoryId, 'ready', {
      chunkCount: entries.length,
      fileCount: files.length - parseErrors,
    });
  } else {
    const store = {
      dimension,
      model: embeddingConfig.model,
      entries: entries.map(e => ({ id: e.id, embedding: e.embedding, chunk: e.chunk })),
    };
    const meta = {
      version: '1.0.0',
      indexedAt: new Date().toISOString(),
      targetPath,
      repositoryId,
      stats: { files: files.length, chunks: allChunks.length, embeddings: processedChunks, ...graphStats },
      config: { embeddingProvider: embeddingConfig.provider, embeddingModel: embeddingConfig.model },
    };
    await saveToJson(store, graph, meta);
  }

  // cleanup cloned repo if requested
  if (options.clean && options.repo) {
    console.log('');
    console.log('→ Cleaning up cloned repo...');
    rmSync(targetPath, { recursive: true, force: true });
  }

  // done
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║           Indexing complete!          ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  console.log('Summary:');
  console.log(`  Files indexed: ${files.length - parseErrors}`);
  console.log(`  Chunks created: ${allChunks.length}`);
  console.log(`  Embeddings: ${processedChunks}`);
  if (repositoryId) console.log(`  Repository: ${repositoryId}`);
  console.log('');
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
