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
const CHECKPOINT_DIR = join(DATA_DIR, 'checkpoints');

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
  resume: boolean;
}

interface Checkpoint {
  repositoryId: string;
  entries: Array<{ id: string; embedding: number[]; chunk: CodeChunk; repositoryId: string }>;
  processedChunkIds: Set<string>;
  timestamp: string;
}

function getCheckpointPath(repositoryId: string): string {
  return join(CHECKPOINT_DIR, `${repositoryId.replace(/[/:]/g, '_')}.json`);
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  if (!existsSync(CHECKPOINT_DIR)) {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
  const data = {
    ...checkpoint,
    processedChunkIds: Array.from(checkpoint.processedChunkIds),
  };
  writeFileSync(getCheckpointPath(checkpoint.repositoryId), JSON.stringify(data), 'utf-8');
}

function loadCheckpoint(repositoryId: string): Checkpoint | null {
  const path = getCheckpointPath(repositoryId);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return {
      ...data,
      processedChunkIds: new Set(data.processedChunkIds),
    };
  } catch {
    return null;
  }
}

function clearCheckpoint(repositoryId: string): void {
  const path = getCheckpointPath(repositoryId);
  if (existsSync(path)) {
    rmSync(path);
  }
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

async function testSupabaseConnection(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set. Use --prod with valid .env.local');
  }

  console.log('→ Testing Supabase connection...');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT 1 as ok');
    if (result.rows[0]?.ok !== 1) {
      throw new Error('Unexpected response from database');
    }

    // verify tables exist
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('chunks', 'repositories')
    `);
    if (tablesResult.rows.length < 2) {
      throw new Error('Required tables (chunks, repositories) not found. Run migrations first.');
    }

    client.release();
    console.log('  ✓ Connected to Supabase');
    console.log('  ✓ Required tables exist');
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH') {
      throw new Error(`Cannot reach Supabase: ${error.message}. Check your network connection.`);
    }
    throw error;
  } finally {
    await pool.end();
  }
}

async function saveToPgVector(
  entries: Array<{ id: string; embedding: number[]; chunk: CodeChunk; repositoryId: string }>,
  graph: DependencyGraph,
  repositoryId: string,
) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set. Use --prod with valid .env');

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 30000 });

  const BATCH_SIZE = 100; // commit every 100 chunks

  try {
    const client = await pool.connect();

    try {
      // Step 1: Delete old data (separate transaction)
      await client.query('BEGIN');
      await client.query('DELETE FROM chunks WHERE repository_id = $1', [repositoryId]);
      await client.query('DELETE FROM graph_edges WHERE from_file LIKE $1', [`${repositoryId}:%`]);
      await client.query('DELETE FROM graph_nodes WHERE filepath LIKE $1', [`${repositoryId}:%`]);
      await client.query('COMMIT');
      console.log(`  Cleared old data for ${repositoryId}`);

      // Step 2: Insert chunks in batches with progress
      const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
      let insertedCount = 0;

      for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        const start = batchNum * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, entries.length);
        const batchEntries = entries.slice(start, end);

        await client.query('BEGIN');

        for (const entry of batchEntries) {
          const embeddingStr = `[${entry.embedding.join(',')}]`;
          await client.query(`
            INSERT INTO chunks (
              id, filepath, start_line, end_line, node_type, name, language,
              content, imports, exports, types, embedding, repository_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::vector, $13)
            ON CONFLICT (id) DO UPDATE SET
              filepath = EXCLUDED.filepath,
              start_line = EXCLUDED.start_line,
              end_line = EXCLUDED.end_line,
              node_type = EXCLUDED.node_type,
              name = EXCLUDED.name,
              language = EXCLUDED.language,
              content = EXCLUDED.content,
              imports = EXCLUDED.imports,
              exports = EXCLUDED.exports,
              types = EXCLUDED.types,
              embedding = EXCLUDED.embedding,
              repository_id = EXCLUDED.repository_id
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

        await client.query('COMMIT');
        insertedCount += batchEntries.length;
        const progress = Math.round((insertedCount / entries.length) * 100);
        process.stdout.write(`\r  Saving chunks: ${progress}% (${insertedCount}/${entries.length})`);
      }

      console.log(''); // newline after progress

      // Step 3: Insert graph data (separate transaction)
      await client.query('BEGIN');

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
    resume: hasFlag('resume'),
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
    console.log('  --resume            Resume from last checkpoint');
    process.exit(1);
  }

  // PREFLIGHT CHECK: Test Supabase connection BEFORE doing any expensive work
  if (options.prod) {
    await testSupabaseConnection();
    console.log('');
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
  let entries: Array<{ id: string; embedding: number[]; chunk: CodeChunk; repositoryId: string }> = [];
  let processedChunkIds = new Set<string>();

  // Check for checkpoint if resuming
  const repoIdForCheckpoint = repositoryId || 'local';
  if (options.resume) {
    const checkpoint = loadCheckpoint(repoIdForCheckpoint);
    if (checkpoint) {
      entries = checkpoint.entries;
      processedChunkIds = checkpoint.processedChunkIds;
      console.log(`  ✓ Resuming from checkpoint (${entries.length} embeddings cached)`);
      console.log(`  Checkpoint from: ${checkpoint.timestamp}`);
    } else {
      console.log('  No checkpoint found, starting fresh');
    }
  }

  // Truncate chunks that exceed token limit
  // OpenAI text-embedding-3-small has 8192 token limit for the ENTIRE batch
  // With batch size 10, each chunk should be ~800 tokens max (~3000 chars)
  // Use conservative limit to account for nodeType/name prefix overhead
  const MAX_CHUNK_CHARS = 2500;
  const truncatedChunks = allChunks.map(chunk => {
    if (chunk.content.length > MAX_CHUNK_CHARS) {
      return { ...chunk, content: chunk.content.slice(0, MAX_CHUNK_CHARS) + '\n// ... truncated' };
    }
    return chunk;
  });

  // Filter out already processed chunks
  const remainingChunks = truncatedChunks.filter(c => !processedChunkIds.has(c.id));
  const skippedCount = truncatedChunks.length - remainingChunks.length;
  if (skippedCount > 0) {
    console.log(`  Skipping ${skippedCount} already embedded chunks`);
  }

  const batches = batch(remainingChunks, options.batchSize);
  let processedChunks = skippedCount;
  let batchesSinceCheckpoint = 0;
  const CHECKPOINT_INTERVAL = 50; // save checkpoint every 50 batches

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
        processedChunkIds.add(chunkBatch[j].id);
      }

      processedChunks += chunkBatch.length;
      batchesSinceCheckpoint++;

      // Save checkpoint periodically
      if (batchesSinceCheckpoint >= CHECKPOINT_INTERVAL) {
        saveCheckpoint({
          repositoryId: repoIdForCheckpoint,
          entries,
          processedChunkIds,
          timestamp: new Date().toISOString(),
        });
        batchesSinceCheckpoint = 0;
      }

      const progress = Math.round((processedChunks / allChunks.length) * 100);
      process.stdout.write(`\r  Progress: ${progress}% (${processedChunks}/${allChunks.length})`);
    } catch (error) {
      // Save checkpoint on error so we can resume
      saveCheckpoint({
        repositoryId: repoIdForCheckpoint,
        entries,
        processedChunkIds,
        timestamp: new Date().toISOString(),
      });
      console.error(`\n  Error embedding batch ${i + 1}: ${error}`);
      console.log(`  Checkpoint saved. Use --resume to continue.`);
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
    // Clear checkpoint after successful save
    clearCheckpoint(repoIdForCheckpoint);
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
    // Clear checkpoint after successful save
    clearCheckpoint(repoIdForCheckpoint);
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
