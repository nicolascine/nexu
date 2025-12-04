// AI Observability - tracing, token accounting, cost analytics
// Tracks performance and costs across the RAG pipeline

export interface TraceSpan {
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  children: TraceSpan[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  embeddingCost: number;
  llmInputCost: number;
  llmOutputCost: number;
  totalCost: number;
  currency: 'USD';
}

export interface RequestTrace {
  id: string;
  timestamp: number;
  query: string;
  repositoryId?: string;
  mode: 'chat' | 'search' | 'agent';
  spans: TraceSpan[];
  tokenUsage: TokenUsage;
  costEstimate: CostBreakdown;
  chunksRetrieved: number;
  rerankerUsed: string;
  success: boolean;
  error?: string;
}

export interface AggregatedMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgChunksRetrieved: number;
  requestsByMode: Record<string, number>;
  requestsByReranker: Record<string, number>;
  period: {
    start: number;
    end: number;
  };
}

// pricing per 1M tokens (as of 2024)
const PRICING = {
  embedding: {
    'text-embedding-3-small': 0.02,
    'text-embedding-3-large': 0.13,
    'text-embedding-ada-002': 0.10,
    'models/text-embedding-004': 0.00, // Gemini free tier
  },
  llm: {
    // Anthropic
    'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    // OpenAI
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    // Google
    'gemini-1.5-pro': { input: 1.25, output: 5.0 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  },
} as const;

// in-memory trace storage (replace with DB for production)
const traces: RequestTrace[] = [];
const MAX_TRACES = 1000;

// active traces for correlation
const activeTraces = new Map<string, RequestTrace>();

// generate trace ID
function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// calculate cost estimate
function calculateCost(
  tokenUsage: TokenUsage,
  embeddingModel: string,
  llmModel: string
): CostBreakdown {
  const embeddingPrice = PRICING.embedding[embeddingModel as keyof typeof PRICING.embedding] ?? 0.02;
  const llmPrice = PRICING.llm[llmModel as keyof typeof PRICING.llm] ?? { input: 3.0, output: 15.0 };

  // embedding cost (assuming 1 query embedding per request)
  const embeddingCost = (1 * embeddingPrice) / 1_000_000;

  // LLM cost
  const llmInputCost = (tokenUsage.inputTokens * llmPrice.input) / 1_000_000;
  const llmOutputCost = (tokenUsage.outputTokens * llmPrice.output) / 1_000_000;

  return {
    embeddingCost,
    llmInputCost,
    llmOutputCost,
    totalCost: embeddingCost + llmInputCost + llmOutputCost,
    currency: 'USD',
  };
}

// start a new trace
export function startTrace(
  query: string,
  mode: RequestTrace['mode'],
  repositoryId?: string
): string {
  const traceId = generateTraceId();

  const trace: RequestTrace = {
    id: traceId,
    timestamp: Date.now(),
    query,
    repositoryId,
    mode,
    spans: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    costEstimate: { embeddingCost: 0, llmInputCost: 0, llmOutputCost: 0, totalCost: 0, currency: 'USD' },
    chunksRetrieved: 0,
    rerankerUsed: 'none',
    success: false,
  };

  activeTraces.set(traceId, trace);
  return traceId;
}

// start a span within a trace
export function startSpan(
  traceId: string,
  name: string,
  metadata?: Record<string, unknown>
): TraceSpan | null {
  const trace = activeTraces.get(traceId);
  if (!trace) return null;

  const span: TraceSpan = {
    name,
    startTime: Date.now(),
    metadata,
    children: [],
  };

  trace.spans.push(span);
  return span;
}

// end a span
export function endSpan(span: TraceSpan | null): void {
  if (!span) return;
  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
}

// record token usage
export function recordTokens(
  traceId: string,
  inputTokens: number,
  outputTokens: number
): void {
  const trace = activeTraces.get(traceId);
  if (!trace) return;

  trace.tokenUsage.inputTokens += inputTokens;
  trace.tokenUsage.outputTokens += outputTokens;
  trace.tokenUsage.totalTokens = trace.tokenUsage.inputTokens + trace.tokenUsage.outputTokens;
}

// record retrieval stats
export function recordRetrieval(
  traceId: string,
  chunksRetrieved: number,
  rerankerUsed: string
): void {
  const trace = activeTraces.get(traceId);
  if (!trace) return;

  trace.chunksRetrieved = chunksRetrieved;
  trace.rerankerUsed = rerankerUsed;
}

// end trace and store
export function endTrace(
  traceId: string,
  success: boolean,
  embeddingModel: string,
  llmModel: string,
  error?: string
): RequestTrace | null {
  const trace = activeTraces.get(traceId);
  if (!trace) return null;

  trace.success = success;
  trace.error = error;
  trace.costEstimate = calculateCost(trace.tokenUsage, embeddingModel, llmModel);

  // store trace
  traces.push(trace);
  if (traces.length > MAX_TRACES) {
    traces.shift(); // remove oldest
  }

  activeTraces.delete(traceId);
  return trace;
}

// get recent traces
export function getRecentTraces(limit: number = 50): RequestTrace[] {
  return traces.slice(-limit).reverse();
}

// get trace by ID
export function getTrace(traceId: string): RequestTrace | undefined {
  return traces.find(t => t.id === traceId) || activeTraces.get(traceId);
}

// calculate aggregated metrics
export function getAggregatedMetrics(
  since?: number,
  until?: number
): AggregatedMetrics {
  const start = since ?? Date.now() - 24 * 60 * 60 * 1000; // last 24h
  const end = until ?? Date.now();

  const filtered = traces.filter(t => t.timestamp >= start && t.timestamp <= end);

  if (filtered.length === 0) {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokensUsed: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      avgChunksRetrieved: 0,
      requestsByMode: {},
      requestsByReranker: {},
      period: { start, end },
    };
  }

  const latencies = filtered.map(t => {
    const totalLatency = t.spans.reduce((sum, span) => sum + (span.durationMs ?? 0), 0);
    return totalLatency;
  }).sort((a, b) => a - b);

  const p95Index = Math.floor(latencies.length * 0.95);

  const requestsByMode: Record<string, number> = {};
  const requestsByReranker: Record<string, number> = {};

  for (const trace of filtered) {
    requestsByMode[trace.mode] = (requestsByMode[trace.mode] ?? 0) + 1;
    requestsByReranker[trace.rerankerUsed] = (requestsByReranker[trace.rerankerUsed] ?? 0) + 1;
  }

  return {
    totalRequests: filtered.length,
    successfulRequests: filtered.filter(t => t.success).length,
    failedRequests: filtered.filter(t => !t.success).length,
    totalTokensUsed: filtered.reduce((sum, t) => sum + t.tokenUsage.totalTokens, 0),
    totalCostUsd: filtered.reduce((sum, t) => sum + t.costEstimate.totalCost, 0),
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p95LatencyMs: latencies[p95Index] ?? 0,
    avgChunksRetrieved: filtered.reduce((sum, t) => sum + t.chunksRetrieved, 0) / filtered.length,
    requestsByMode,
    requestsByReranker,
    period: { start, end },
  };
}

// clear all traces (for testing)
export function clearTraces(): void {
  traces.length = 0;
  activeTraces.clear();
}

// export types and pricing for external use
export { PRICING };
