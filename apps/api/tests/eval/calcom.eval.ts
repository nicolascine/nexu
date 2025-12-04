#!/usr/bin/env tsx
// Cal.com Specific Evaluation Suite
// Tests precision on the actual challenge repository
// Usage: pnpm eval:calcom [--verbose]

import 'dotenv/config';
import { search, initIndexAsync, getStatus } from '../../src/lib/nexu';
import { runAgent } from '../../src/lib/agent';

const VERBOSE = process.argv.includes('--verbose');
const USE_AGENT = process.argv.includes('--agent');

interface CalcomTestCase {
  id: string;
  query: string;
  queryEs?: string; // Spanish version
  expectedPatterns: string[]; // patterns that should appear in results
  expectedFiles?: string[]; // specific files that should be found
  category: 'availability' | 'booking' | 'auth' | 'api' | 'payments' | 'architecture';
  difficulty: 'easy' | 'medium' | 'hard';
}

// Test cases based on the challenge requirements and real cal.com structure
const CALCOM_TEST_CASES: CalcomTestCase[] = [
  // AVAILABILITY (key feature mentioned in challenge)
  {
    id: 'avail-1',
    query: 'Where is availability validation logic?',
    queryEs: '¿Dónde se valida la disponibilidad horaria?',
    expectedPatterns: ['availability', 'getAvailability', 'checkAvailability', 'slots'],
    expectedFiles: ['availability', 'getSchedule'],
    category: 'availability',
    difficulty: 'medium',
  },
  {
    id: 'avail-2',
    query: 'How are available time slots calculated?',
    expectedPatterns: ['slots', 'getAvailableSlots', 'availability', 'schedule'],
    category: 'availability',
    difficulty: 'medium',
  },
  {
    id: 'avail-3',
    query: 'How does the system check for scheduling conflicts?',
    expectedPatterns: ['conflict', 'overlap', 'busy', 'availability'],
    category: 'availability',
    difficulty: 'hard',
  },

  // BOOKING FLOW
  {
    id: 'book-1',
    query: 'How is a booking created in the backend?',
    expectedPatterns: ['createBooking', 'booking', 'handleNewBooking'],
    expectedFiles: ['booking', 'handleNewBooking'],
    category: 'booking',
    difficulty: 'easy',
  },
  {
    id: 'book-2',
    query: 'What happens when a booking is cancelled?',
    expectedPatterns: ['cancel', 'cancelBooking', 'cancellation'],
    category: 'booking',
    difficulty: 'medium',
  },
  {
    id: 'book-3',
    query: 'How are booking confirmations sent?',
    expectedPatterns: ['email', 'notification', 'confirm', 'send'],
    category: 'booking',
    difficulty: 'medium',
  },

  // AUTHENTICATION
  {
    id: 'auth-1',
    query: 'How is user authentication handled?',
    expectedPatterns: ['auth', 'session', 'login', 'NextAuth', 'credentials'],
    expectedFiles: ['auth', 'session'],
    category: 'auth',
    difficulty: 'easy',
  },
  {
    id: 'auth-2',
    query: 'How does OAuth integration work?',
    expectedPatterns: ['OAuth', 'provider', 'google', 'calendar'],
    category: 'auth',
    difficulty: 'medium',
  },

  // API STRUCTURE
  {
    id: 'api-1',
    query: 'What API endpoints handle event types?',
    expectedPatterns: ['eventType', 'event-type', 'EventType'],
    expectedFiles: ['eventType', 'event-types'],
    category: 'api',
    difficulty: 'easy',
  },
  {
    id: 'api-2',
    query: 'How is the tRPC router structured?',
    expectedPatterns: ['trpc', 'router', 'procedure', 'createTRPCRouter'],
    category: 'api',
    difficulty: 'medium',
  },

  // PAYMENTS
  {
    id: 'pay-1',
    query: 'How are payments processed with Stripe?',
    expectedPatterns: ['stripe', 'payment', 'checkout', 'PaymentIntent'],
    category: 'payments',
    difficulty: 'medium',
  },

  // ARCHITECTURE
  {
    id: 'arch-1',
    query: 'What is the monorepo structure of Cal.com?',
    expectedPatterns: ['apps', 'packages', 'turbo', 'workspace'],
    category: 'architecture',
    difficulty: 'easy',
  },
  {
    id: 'arch-2',
    query: 'How is the database schema defined?',
    expectedPatterns: ['prisma', 'schema', 'model', 'database'],
    expectedFiles: ['schema.prisma', 'prisma'],
    category: 'architecture',
    difficulty: 'easy',
  },
];

interface EvalResult {
  id: string;
  query: string;
  category: string;
  difficulty: string;
  passed: boolean;
  patternsFound: string[];
  patternsMissed: string[];
  filesFound: string[];
  score: number;
  latencyMs: number;
  chunksRetrieved: number;
}

interface EvalSummary {
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  avgScore: number;
  avgLatencyMs: number;
  byCategory: Record<string, { passed: number; total: number; rate: number }>;
  byDifficulty: Record<string, { passed: number; total: number; rate: number }>;
  results: EvalResult[];
}

function checkPatterns(content: string, patterns: string[]): { found: string[]; missed: string[] } {
  const contentLower = content.toLowerCase();
  const found: string[] = [];
  const missed: string[] = [];

  for (const pattern of patterns) {
    if (contentLower.includes(pattern.toLowerCase())) {
      found.push(pattern);
    } else {
      missed.push(pattern);
    }
  }

  return { found, missed };
}

async function runEvaluation(): Promise<EvalSummary> {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║        Cal.com Precision Evaluation Suite             ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  // Check index status
  const status = await getStatus();
  if (!status.indexed) {
    console.error('Error: No index found. Run ingestion first.');
    process.exit(1);
  }

  console.log(`Index ready: ${status.indexed}`);
  console.log(`LLM: ${status.llm.provider}/${status.llm.model}`);
  console.log(`Mode: ${USE_AGENT ? 'Agent' : 'RAG'}`);
  console.log('');
  console.log('Running test cases...');
  console.log('─'.repeat(60));

  const results: EvalResult[] = [];

  for (const testCase of CALCOM_TEST_CASES) {
    const startTime = Date.now();

    try {
      let searchContent = '';
      let chunksRetrieved = 0;
      let filesFound: string[] = [];

      if (USE_AGENT) {
        // Use agent mode for more complex reasoning
        const agentResult = await runAgent(testCase.query, { maxSteps: 5 });
        searchContent = agentResult.answer + ' ' + agentResult.filesAccessed.join(' ');
        chunksRetrieved = agentResult.searchesPerformed;
        filesFound = agentResult.filesAccessed;
      } else {
        // Use standard RAG search
        const searchResult = await search({
          query: testCase.query,
          options: {
            topK: 10,
            reranker: 'llm',
            rerankTopK: 5,
            expandGraph: true,
          },
        });

        // Combine all chunk content for pattern matching
        searchContent = searchResult.chunks
          .map(c => `${c.filepath} ${c.name} ${c.content}`)
          .join('\n');

        chunksRetrieved = searchResult.chunks.length;
        filesFound = [...new Set(searchResult.chunks.map(c => c.filepath))];
      }

      const latencyMs = Date.now() - startTime;

      // Check patterns
      const { found, missed } = checkPatterns(searchContent, testCase.expectedPatterns);

      // Calculate score (percentage of patterns found)
      const score = found.length / testCase.expectedPatterns.length;
      const passed = score >= 0.5; // At least 50% of patterns found

      results.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        difficulty: testCase.difficulty,
        passed,
        patternsFound: found,
        patternsMissed: missed,
        filesFound,
        score,
        latencyMs,
        chunksRetrieved,
      });

      // Print result
      const icon = passed ? '✓' : '✗';
      const scoreStr = `${(score * 100).toFixed(0)}%`;
      console.log(`${icon} ${testCase.id.padEnd(10)} ${scoreStr.padStart(4)} ${latencyMs.toString().padStart(5)}ms  ${testCase.query.slice(0, 40)}...`);

      if (VERBOSE && !passed) {
        console.log(`   Missing: ${missed.join(', ')}`);
        console.log(`   Found in: ${filesFound.slice(0, 3).join(', ')}`);
      }
    } catch (error) {
      console.log(`✗ ${testCase.id}: Error - ${error instanceof Error ? error.message : 'Unknown'}`);
      results.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        difficulty: testCase.difficulty,
        passed: false,
        patternsFound: [],
        patternsMissed: testCase.expectedPatterns,
        filesFound: [],
        score: 0,
        latencyMs: Date.now() - startTime,
        chunksRetrieved: 0,
      });
    }
  }

  // Calculate summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const passRate = passed / results.length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  const avgLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;

  // Group by category
  const byCategory: Record<string, { passed: number; total: number; rate: number }> = {};
  for (const r of results) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { passed: 0, total: 0, rate: 0 };
    }
    byCategory[r.category].total++;
    if (r.passed) byCategory[r.category].passed++;
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].rate = byCategory[cat].passed / byCategory[cat].total;
  }

  // Group by difficulty
  const byDifficulty: Record<string, { passed: number; total: number; rate: number }> = {};
  for (const r of results) {
    if (!byDifficulty[r.difficulty]) {
      byDifficulty[r.difficulty] = { passed: 0, total: 0, rate: 0 };
    }
    byDifficulty[r.difficulty].total++;
    if (r.passed) byDifficulty[r.difficulty].passed++;
  }
  for (const diff of Object.keys(byDifficulty)) {
    byDifficulty[diff].rate = byDifficulty[diff].passed / byDifficulty[diff].total;
  }

  // Print summary
  console.log('');
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total:     ${results.length} cases`);
  console.log(`Passed:    ${passed} (${(passRate * 100).toFixed(1)}%)`);
  console.log(`Failed:    ${failed}`);
  console.log(`Avg Score: ${(avgScore * 100).toFixed(1)}%`);
  console.log(`Avg Latency: ${avgLatencyMs.toFixed(0)}ms`);
  console.log('');
  console.log('By Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    console.log(`  ${cat.padEnd(15)} ${stats.passed}/${stats.total} (${(stats.rate * 100).toFixed(0)}%)`);
  }
  console.log('');
  console.log('By Difficulty:');
  for (const [diff, stats] of Object.entries(byDifficulty)) {
    console.log(`  ${diff.padEnd(10)} ${stats.passed}/${stats.total} (${(stats.rate * 100).toFixed(0)}%)`);
  }
  console.log('═'.repeat(60));

  return {
    totalCases: results.length,
    passed,
    failed,
    passRate,
    avgScore,
    avgLatencyMs,
    byCategory,
    byDifficulty,
    results,
  };
}

// Run evaluation
runEvaluation()
  .then(summary => {
    // Exit with error code if pass rate is below threshold
    if (summary.passRate < 0.6) {
      console.log('\nWARNING: Pass rate below 60% threshold');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Evaluation failed:', error);
    process.exit(1);
  });

export { runEvaluation, CALCOM_TEST_CASES, type CalcomTestCase, type EvalResult, type EvalSummary };
