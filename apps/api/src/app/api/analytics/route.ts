// GET /api/analytics - AI observability metrics and traces
// Provides tracing data, token usage, and cost analytics

import { NextRequest } from 'next/server';
import {
  getRecentTraces,
  getAggregatedMetrics,
  getTrace,
  PRICING,
} from '@/lib/telemetry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const view = searchParams.get('view') || 'summary';

  switch (view) {
    case 'summary': {
      // aggregated metrics
      const since = searchParams.get('since')
        ? parseInt(searchParams.get('since')!)
        : undefined;
      const until = searchParams.get('until')
        ? parseInt(searchParams.get('until')!)
        : undefined;

      const metrics = getAggregatedMetrics(since, until);

      return Response.json({
        type: 'summary',
        metrics,
        pricing: {
          note: 'Costs are estimates based on published pricing',
          models: {
            embedding: Object.keys(PRICING.embedding),
            llm: Object.keys(PRICING.llm),
          },
        },
      });
    }

    case 'traces': {
      // recent traces
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
      const traces = getRecentTraces(limit);

      return Response.json({
        type: 'traces',
        count: traces.length,
        traces: traces.map(t => ({
          id: t.id,
          timestamp: t.timestamp,
          query: t.query.slice(0, 100) + (t.query.length > 100 ? '...' : ''),
          mode: t.mode,
          success: t.success,
          totalTokens: t.tokenUsage.totalTokens,
          costUsd: t.costEstimate.totalCost,
          latencyMs: t.spans.reduce((sum, s) => sum + (s.durationMs ?? 0), 0),
          chunksRetrieved: t.chunksRetrieved,
          reranker: t.rerankerUsed,
        })),
      });
    }

    case 'trace': {
      // single trace detail
      const traceId = searchParams.get('id');
      if (!traceId) {
        return Response.json({ error: 'Trace ID required' }, { status: 400 });
      }

      const trace = getTrace(traceId);
      if (!trace) {
        return Response.json({ error: 'Trace not found' }, { status: 404 });
      }

      return Response.json({
        type: 'trace',
        trace,
      });
    }

    case 'costs': {
      // cost breakdown
      const since = searchParams.get('since')
        ? parseInt(searchParams.get('since')!)
        : Date.now() - 7 * 24 * 60 * 60 * 1000; // last 7 days

      const traces = getRecentTraces(1000).filter(t => t.timestamp >= since);

      const byDay: Record<string, { requests: number; tokens: number; cost: number }> = {};

      for (const trace of traces) {
        const day = new Date(trace.timestamp).toISOString().split('T')[0];
        if (!byDay[day]) {
          byDay[day] = { requests: 0, tokens: 0, cost: 0 };
        }
        byDay[day].requests++;
        byDay[day].tokens += trace.tokenUsage.totalTokens;
        byDay[day].cost += trace.costEstimate.totalCost;
      }

      const totalCost = Object.values(byDay).reduce((sum, d) => sum + d.cost, 0);
      const totalTokens = Object.values(byDay).reduce((sum, d) => sum + d.tokens, 0);

      return Response.json({
        type: 'costs',
        period: {
          start: since,
          end: Date.now(),
        },
        totals: {
          requests: traces.length,
          tokens: totalTokens,
          costUsd: totalCost,
        },
        byDay: Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, data]) => ({ date, ...data })),
        breakdown: {
          embedding: traces.reduce((sum, t) => sum + t.costEstimate.embeddingCost, 0),
          llmInput: traces.reduce((sum, t) => sum + t.costEstimate.llmInputCost, 0),
          llmOutput: traces.reduce((sum, t) => sum + t.costEstimate.llmOutputCost, 0),
        },
      });
    }

    case 'performance': {
      // performance metrics
      const traces = getRecentTraces(500);

      // latency by stage
      const stageLatencies: Record<string, number[]> = {};

      for (const trace of traces) {
        for (const span of trace.spans) {
          if (span.durationMs !== undefined) {
            if (!stageLatencies[span.name]) {
              stageLatencies[span.name] = [];
            }
            stageLatencies[span.name].push(span.durationMs);
          }
        }
      }

      const stageStats = Object.entries(stageLatencies).map(([name, latencies]) => {
        latencies.sort((a, b) => a - b);
        return {
          stage: name,
          count: latencies.length,
          avgMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          p50Ms: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
          p95Ms: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
          p99Ms: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
        };
      });

      return Response.json({
        type: 'performance',
        tracesAnalyzed: traces.length,
        byStage: stageStats,
        successRate: traces.length > 0
          ? (traces.filter(t => t.success).length / traces.length) * 100
          : 0,
      });
    }

    default:
      return Response.json({
        error: 'Invalid view',
        validViews: ['summary', 'traces', 'trace', 'costs', 'performance'],
      }, { status: 400 });
  }
}
