// Evaluation harness for the nexu codebase itself
// Usage: npm run eval:nexu [--ollama] [--no-graph]

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import { parseFile, type CodeChunk } from '../../src/lib/ast';
import { buildGraph, attachChunksToGraph } from '../../src/lib/graph';
import { createStore, addToStore, searchStore, graphExpand, type RetrievalResult } from '../../src/lib/retrieval';
import { embed } from '../../src/lib/llm';
import { NEXU_TEST_CASES, type TestCase } from './nexu-test-cases';

const USE_REAL_EMBEDDINGS = process.argv.includes('--real') || process.argv.includes('--ollama');
const USE_OLLAMA = process.argv.includes('--ollama');
const SKIP_GRAPH = process.argv.includes('--no-graph');

if (USE_OLLAMA) {
  process.env.EMBEDDING_PROVIDER = 'ollama';
}

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

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (USE_REAL_EMBEDDINGS) {
    return embed(texts);
  }
  return mockEmbed(texts);
}

const NEXU_SRC_PATH = join(__dirname, '../../src');

interface EvalResult {
  testId: string;
  query: string;
  precision: number;
  recall: number;
  mrr: number;
  retrievedFiles: string[];
  expectedFiles: string[];
}

interface EvalSummary {
  totalCases: number;
  avgPrecision: number;
  avgRecall: number;
  avgMRR: number;
  results: EvalResult[];
}

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

function calcPrecision(retrieved: string[], expected: string[]): number {
  if (retrieved.length === 0) return 0;
  const relevant = retrieved.filter(r => expected.some(e => r.includes(e)));
  return relevant.length / retrieved.length;
}

function calcRecall(retrieved: string[], expected: string[]): number {
  if (expected.length === 0) return 1;
  const found = expected.filter(e => retrieved.some(r => r.includes(e)));
  return found.length / expected.length;
}

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
  console.log('║   Nexu Self-Evaluation                ║');
  console.log('╚═══════════════════════════════════════╝');
  const mode = USE_OLLAMA ? 'Ollama' : USE_REAL_EMBEDDINGS ? 'OpenAI' : 'Mock';
  const graphMode = SKIP_GRAPH ? 'disabled' : 'enabled';
  console.log(`  Embeddings: ${mode} | Graph expansion: ${graphMode}`);
  console.log('');

  console.log('→ Indexing nexu codebase...');
  const files = findFiles(NEXU_SRC_PATH);
  const fileContents = files.map(f => ({
    filepath: f,
    content: readFileSync(f, 'utf-8'),
  }));

  const allChunks: CodeChunk[] = [];
  for (const file of fileContents) {
    const chunks = parseFile(file.filepath, file.content);
    allChunks.push(...chunks);
  }
  console.log(`  Parsed ${files.length} files, ${allChunks.length} chunks`);

  const graph = buildGraph(fileContents, NEXU_SRC_PATH);
  attachChunksToGraph(graph, allChunks);
  console.log(`  Built graph with ${graph.nodes.size} nodes`);

  console.log('  Generating embeddings...');
  const texts = allChunks.map(c => `${c.nodeType}: ${c.name}\n\n${c.content}`);
  const embeddings = await getEmbeddings(texts);

  const dimension = embeddings[0].length;
  const store = createStore(dimension, 'nexu-eval');
  const entries = allChunks.map((chunk, i) => ({
    id: chunk.id,
    embedding: embeddings[i],
    chunk,
  }));
  addToStore(store, entries);
  console.log(`  Created vector store (${dimension}d, ${entries.length} entries)`);

  console.log('');
  console.log('→ Running test cases...');
  const results: EvalResult[] = [];

  for (const testCase of NEXU_TEST_CASES) {
    const [queryEmbedding] = await getEmbeddings([testCase.query]);
    const searchResults = searchStore(store, queryEmbedding, { topK: 5, minScore: 0 });

    const vectorResult: RetrievalResult = {
      chunks: searchResults.map(r => r.entry.chunk),
      scores: searchResults.map(r => r.score),
      expandedFrom: [],
      stage: 'vector',
    };

    const finalResult = SKIP_GRAPH
      ? vectorResult
      : graphExpand(vectorResult, graph, { maxHops: 1, maxExpandedChunks: 10 });

    const retrievedFiles = [...new Set(finalResult.chunks.map(c => basename(c.filepath)))];
    const retrievedChunks = finalResult.chunks.map(c => c.name);

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
      expectedFiles: testCase.expectedFiles,
    });

    const status = recall >= 0.5 ? '✓' : '✗';
    console.log(`  ${status} ${testCase.id}: P=${precision.toFixed(2)} R=${recall.toFixed(2)} MRR=${mrr.toFixed(2)}`);
  }

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

runEvaluation().catch(console.error);

export { runEvaluation, type EvalResult, type EvalSummary };
