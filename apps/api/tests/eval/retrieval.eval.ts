// Retrieval evaluation harness
// Measures precision, recall, and MRR against ground-truth test cases
// Usage: npm run eval [--real] [--ollama] [--no-graph] [--rerank]

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import { parseFile, type CodeChunk } from '../../src/lib/ast';
import { buildGraph, attachChunksToGraph } from '../../src/lib/graph';
import { createStore, addToStore, searchStore, graphExpand, rerank, type RetrievalResult } from '../../src/lib/retrieval';
import { embed } from '../../src/lib/llm';
import { TEST_CASES, type TestCase } from './test-cases';

const USE_REAL_EMBEDDINGS = process.argv.includes('--real') || process.argv.includes('--ollama');
const USE_OLLAMA = process.argv.includes('--ollama');
const SKIP_GRAPH = process.argv.includes('--no-graph');

// Reranker options: --rerank (bge default), --reranker=bge, --reranker=llm
const RERANKER_ARG = process.argv.find(arg => arg.startsWith('--reranker='));
const RERANKER: 'bge' | 'llm' | 'none' = RERANKER_ARG
  ? (RERANKER_ARG.split('=')[1] as 'bge' | 'llm')
  : process.argv.includes('--rerank')
    ? 'bge'  // --rerank defaults to bge
    : 'none';

// Set environment for Ollama if requested
if (USE_OLLAMA) {
  process.env.EMBEDDING_PROVIDER = 'ollama';
  process.env.LLM_PROVIDER = 'ollama';
}

// Simple deterministic mock embedding for offline testing
function mockEmbed(texts: string[], dimension: number = 384): number[][] {
  return texts.map(text => {
    const hash = createHash('sha256').update(text).digest();
    const vector: number[] = [];
    for (let i = 0; i < dimension; i++) {
      const byte = hash[i % hash.length];
      vector.push((byte / 255) * 2 - 1);
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => v / norm);
  });
}

// embedding function - uses real or mock based on flag
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (USE_REAL_EMBEDDINGS) {
    return embed(texts);
  }
  return mockEmbed(texts);
}

const FIXTURES_PATH = join(__dirname, '../fixtures/sample-project/src');

interface EvalResult {
  testId: string;
  query: string;
  // retrieval metrics
  precision: number;  // relevant retrieved / total retrieved
  recall: number;     // relevant retrieved / total relevant
  mrr: number;        // 1 / rank of first relevant result
  // details
  retrievedFiles: string[];
  retrievedChunks: string[];
  expectedFiles: string[];
  expectedChunks: string[];
}

interface EvalSummary {
  totalCases: number;
  avgPrecision: number;
  avgRecall: number;
  avgMRR: number;
  results: EvalResult[];
}

// find all files in directory
function findFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith('.ts')) {
      files.push(fullPath);
    } else if (stat.isDirectory()) {
      files.push(...findFiles(fullPath));
    }
  }

  return files;
}

// calculate precision
function calcPrecision(retrieved: string[], expected: string[]): number {
  if (retrieved.length === 0) return 0;
  const relevant = retrieved.filter(r => expected.some(e => r.includes(e)));
  return relevant.length / retrieved.length;
}

// calculate recall
function calcRecall(retrieved: string[], expected: string[]): number {
  if (expected.length === 0) return 1;
  const found = expected.filter(e => retrieved.some(r => r.includes(e)));
  return found.length / expected.length;
}

// calculate MRR (Mean Reciprocal Rank)
function calcMRR(retrieved: string[], expected: string[]): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.some(e => retrieved[i].includes(e))) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

async function runEvaluation(): Promise<EvalSummary> {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║      Retrieval Evaluation             ║');
  console.log('╚═══════════════════════════════════════╝');
  const mode = USE_OLLAMA ? 'Ollama' : USE_REAL_EMBEDDINGS ? 'OpenAI' : 'Mock';
  const graphMode = SKIP_GRAPH ? 'disabled' : 'enabled';
  const rerankMode = RERANKER === 'none' ? 'disabled' : RERANKER;
  console.log(`  Embeddings: ${mode} | Graph: ${graphMode} | Rerank: ${rerankMode}`);
  console.log('');

  // Step 1: Index the sample project
  console.log('→ Indexing sample project...');
  const files = findFiles(FIXTURES_PATH);
  const fileContents = files.map(f => ({
    filepath: f,
    content: readFileSync(f, 'utf-8'),
  }));

  // Parse files
  const allChunks: CodeChunk[] = [];
  for (const file of fileContents) {
    const chunks = parseFile(file.filepath, file.content);
    allChunks.push(...chunks);
  }
  console.log(`  Parsed ${files.length} files, ${allChunks.length} chunks`);

  // Build graph
  const graph = buildGraph(fileContents, FIXTURES_PATH);
  attachChunksToGraph(graph, allChunks);
  console.log(`  Built graph with ${graph.nodes.size} nodes`);

  // Generate embeddings
  const embeddingType = USE_OLLAMA ? 'Ollama (nomic-embed-text)' : USE_REAL_EMBEDDINGS ? 'real (OpenAI)' : 'mock';
  console.log(`  Generating ${embeddingType} embeddings...`);
  const texts = allChunks.map(c => `${c.nodeType}: ${c.name}\n\n${c.content}`);
  const embeddings = await getEmbeddings(texts);

  // Create store
  const dimension = embeddings[0].length;
  const store = createStore(dimension, 'eval');
  const entries = allChunks.map((chunk, i) => ({
    id: chunk.id,
    embedding: embeddings[i],
    chunk,
  }));
  addToStore(store, entries);
  console.log(`  Created vector store (${dimension}d)`);

  // Step 2: Run test cases
  console.log('');
  console.log('→ Running test cases...');
  const results: EvalResult[] = [];

  for (const testCase of TEST_CASES) {
    // Vector search
    const [queryEmbedding] = await getEmbeddings([testCase.query]);
    const searchResults = searchStore(store, queryEmbedding, { topK: 5, minScore: 0 });

    const vectorResult: RetrievalResult = {
      chunks: searchResults.map(r => r.entry.chunk),
      scores: searchResults.map(r => r.score),
      expandedFrom: [],
      stage: 'vector',
    };

    // Graph expansion (skip if --no-graph flag)
    let finalResult = SKIP_GRAPH
      ? vectorResult
      : graphExpand(vectorResult, graph, { maxHops: 1, maxExpandedChunks: 10 });

    // Stage 3: Reranking (if enabled)
    if (RERANKER !== 'none' && finalResult.chunks.length > 5) {
      finalResult = await rerank(testCase.query, finalResult, { reranker: RERANKER, rerankTopK: 5 });
    }

    // Get retrieved file names and chunk names
    const retrievedFiles = [...new Set(finalResult.chunks.map(c => basename(c.filepath)))];
    const retrievedChunks = finalResult.chunks.map(c => c.name);

    // Calculate metrics
    const precision = calcPrecision(retrievedFiles, testCase.expectedFiles);
    const recall = calcRecall(retrievedFiles, testCase.expectedFiles);
    const mrrFiles = calcMRR(retrievedFiles, testCase.expectedFiles);
    const mrrChunks = calcMRR(retrievedChunks, testCase.expectedChunks);
    const mrr = Math.max(mrrFiles, mrrChunks);

    results.push({
      testId: testCase.id,
      query: testCase.query,
      precision,
      recall,
      mrr,
      retrievedFiles,
      retrievedChunks,
      expectedFiles: testCase.expectedFiles,
      expectedChunks: testCase.expectedChunks,
    });

    // Print result
    const status = recall >= 0.5 ? '✓' : '✗';
    console.log(`  ${status} ${testCase.id}: P=${precision.toFixed(2)} R=${recall.toFixed(2)} MRR=${mrr.toFixed(2)}`);
  }

  // Calculate summary
  const avgPrecision = results.reduce((s, r) => s + r.precision, 0) / results.length;
  const avgRecall = results.reduce((s, r) => s + r.recall, 0) / results.length;
  const avgMRR = results.reduce((s, r) => s + r.mrr, 0) / results.length;

  const summary: EvalSummary = {
    totalCases: results.length,
    avgPrecision,
    avgRecall,
    avgMRR,
    results,
  };

  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('Summary:');
  console.log(`  Total test cases: ${summary.totalCases}`);
  console.log(`  Avg Precision:    ${(avgPrecision * 100).toFixed(1)}%`);
  console.log(`  Avg Recall:       ${(avgRecall * 100).toFixed(1)}%`);
  console.log(`  Avg MRR:          ${(avgMRR * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════');
  console.log('');

  return summary;
}

// Run if executed directly
runEvaluation().catch(console.error);

export { runEvaluation, type EvalResult, type EvalSummary };
