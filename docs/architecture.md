# Architecture - Nexu

Technical design of the RAG system for codebases.

## Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                         INGESTION PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub API ──► Clone Repo ──► AST Parser ──► Chunking         │
│                                      │                          │
│                                      ▼                          │
│                              Extract Metadata:                  │
│                              • Imports                          │
│                              • Exports                          │
│                              • Types                            │
│                              • Function signatures             │
│                                      │                          │
│                                      ▼                          │
│                              Generate Embeddings                │
│                              (OpenAI text-embedding-3)          │
│                                      │                          │
│                                      ▼                          │
│                              Store in Vector DB                 │
│                              + Build Dependency Graph           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         RETRIEVAL PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Query ──► Embed Query ──► Vector Search                  │
│                                      │                          │
│                                      ▼                          │
│                              Retrieve Top K chunks              │
│                              (K = 10, configurable)             │
│                                      │                          │
│                                      ▼                          │
│                              Graph Expansion:                   │
│                              • Follow imports                   │
│                              • Include type definitions         │
│                              • Add callers (if relevant)        │
│                                      │                          │
│                                      ▼                          │
│                              LLM Reranking:                     │
│                              • Score relevance                  │
│                              • Filter noise                     │
│                              • Select Top 3-5                   │
│                                      │                          │
│                                      ▼                          │
│                              Construct Context                  │
│                              (~5-10k tokens)                    │
│                                      │                          │
│                                      ▼                          │
│                              LLM Generation                     │
│                              (Claude API)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. AST Parser

**Goal:** Divide code into semantically complete chunks.

**Implementation:**
- Uses `tree-sitter` to parse code
- Supports TypeScript, JavaScript, Python (extensible)
- Identifies nodes: functions, classes, interfaces, types

**Chunking algorithm:**

Based on the cAST paper (CMU 2025):

1. Parse complete file into AST
2. Top-down tree traversal
3. For each high-level node (function, class):
   - If size < MAX_CHUNK_SIZE: create chunk
   - If size > MAX_CHUNK_SIZE: recursively divide
4. Merge small adjacent nodes
5. Add context (imports, class definition)

**Parameters:**
- `MAX_CHUNK_SIZE`: 512 tokens (balanced for embeddings)
- `MIN_CHUNK_SIZE`: 50 tokens (avoid trivial chunks)
- `OVERLAP`: 0 tokens (AST already provides clean boundaries)

**Metadata extracted per chunk:**
```typescript
interface CodeChunk {
  id: string;
  content: string;          // The chunk's code
  filepath: string;         // Relative path from repo root
  startLine: number;
  endLine: number;
  nodeType: 'function' | 'class' | 'interface' | 'type' | 'other';
  name: string;             // Function/class name
  imports: string[];        // Imports used in this chunk
  exports: string[];        // What this chunk exports
  types: string[];          // Referenced types
  package: string;          // For monorepos: @calcom/web, @calcom/api, etc.
}
```

### 2. Dependency Graph

**Goal:** Map relationships between files/functions.

**Structure:**
```typescript
interface DependencyNode {
  filepath: string;
  exports: string[];        // What this file exports
  imports: Import[];        // What it imports
}

interface Import {
  symbol: string;           // Imported name
  from: string;             // Source file path
  line: number;             // Import line
}

interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, Set<string>>;  // filepath -> dependencies
}
```

**Construction:**

1. For each file in repo:
   - Extract imports with AST
   - Extract exports with AST
   - Resolve relative paths → absolute
2. Build directed graph
3. Index for fast lookup

**Supported queries:**

- `getImports(filepath)` - What this file imports
- `getExports(filepath)` - What this file exports
- `getDependents(filepath)` - Who uses this file
- `getTransitiveDeps(filepath, depth)` - Recursive dependencies

### 3. Vector Search

**Embedding model:** OpenAI `text-embedding-3-small`
- Dimensions: 1536
- Cost: $0.02 / 1M tokens
- Performance: good for code

**Vector DB:** Pinecone
- Free tier: 100k vectors (enough for cal.com)
- Latency: ~50-100ms
- Native metadata filtering

**Index structure:**
```
Namespace: "calcom-main"

Vector record:
{
  id: "chunk-{filepath}-{startLine}",
  values: [1536-dim vector],
  metadata: {
    filepath: string,
    startLine: number,
    endLine: number,
    nodeType: string,
    name: string,
    package: string,
    content: string  // For debugging, optional
  }
}
```

**Query process:**

1. User query → Embed with same model
2. Pinecone similarity search
3. Retrieve Top K (K=10) with metadata
4. Return chunks sorted by score

**Alternative:** Supabase pgvector
- Free up to a point
- Familiar SQL
- Native Postgres
- Latency: ~100-200ms

### 4. Retrieval Strategy

**Stage 1: Semantic Search**
```
Input: User query
Output: Top 10 chunks (raw)

Process:
1. Embed query
2. Vector similarity search
3. Return chunks with score > 0.7
```

**Stage 2: Graph Expansion**
```
Input: Top 10 chunks
Output: Expanded context (~15-20 chunks)

Process:
For each chunk:
  1. If function/method:
     - Add class definition (if applicable)
     - Add parameter types
     - Add direct imports
  2. If type/interface:
     - Add usages of this type
  3. If class:
     - Add main methods
```

**Stage 3: LLM Reranking**
```
Input: ~15-20 expanded chunks
Output: Top 3-5 final chunks

Process:
1. Prompt to LLM (Claude):
   "Given query: {query}
    Rank these code chunks by relevance.
    Return only the indices of top 5."

2. Reduced context:
   - Only function signatures
   - Only first 5 lines of each chunk
   - Total: ~2k tokens

3. LLM returns: [2, 7, 1, 9, 4]

4. Select those complete chunks
```

**Final result:**
- 3-5 chunks (most relevant)
- Total: 5-10k tokens
- Includes metadata for citation

### 5. Context Construction

**Goal:** Build optimal context for LLM.

**Template:**
```
<codebase_context>
Repository: calcom/cal.com
Query: {user_query}

Relevant code chunks:

--- Chunk 1 ---
File: {filepath}
Lines: {startLine}-{endLine}
Type: {nodeType}

{content}

[Imports used here: {imports}]
[Exports: {exports}]

--- Chunk 2 ---
...

</codebase_context>

<instructions>
Answer the user's query based ONLY on the code above.
Always cite your sources with exact file paths and line numbers.
If information is not in the provided code, say so.
</instructions>

<query>
{user_query}
</query>
```

**Token estimation:**
- Template overhead: ~200 tokens
- 5 chunks × 1000 tokens: 5000 tokens
- Metadata: ~300 tokens
- **Total context:** ~5500 tokens

Within Claude's sweet spot (200k).

### 6. LLM Integration

**Model:** Claude 3.5 Sonnet (Anthropic)
- Context window: 200k tokens
- Output: 4k tokens max
- Pricing: $3/MTok input, $15/MTok output

**Prompt engineering:**

System prompt emphasizes:
1. Always cite with path + lines
2. Don't invent code not in context
3. If unknown, say "not found in provided chunks"
4. Use specific format for citations

**Streaming:**
- Use Vercel AI SDK for streaming
- UI shows response token-by-token
- Better UX vs. waiting for complete response

## Data Flow

**Ingestion (offline):**
```
GitHub → Clone → Parse (tree-sitter) → Chunk → Embed → Store
                                              ↓
                                       Build Graph
```

**Query (online):**
```
User → Embed → Vector Search → Graph Expand → Rerank → Context → LLM → Response
                                                                         ↓
                                                                   UI (stream)
```

## Optimizations

### 1. Caching

- **Embeddings cache:** Avoid re-embedding same code
- **Graph cache:** Dependency graph in memory
- **LLM cache:** Anthropic prompt caching for repeated system prompts

### 2. Batching

For ingestion:
- Process 100 files at a time
- Batch embeddings (OpenAI allows up to 2048 inputs)
- Batch upsert to Pinecone

### 3. Monitoring

Key metrics:
- **Retrieval latency:** Vector search time
- **Token usage:** Input + output per query
- **Cache hit rate:** % queries using cache
- **User satisfaction:** Thumbs up/down

## Scalability

**Cal.com stats:**
- ~500k lines of code
- ~2000 TypeScript files
- Estimated: ~15k chunks

**Capabilities:**
- Pinecone free tier: 100k vectors ✅
- Ingestion time: ~15-20 mins (one-time)
- Query latency: <2s (p95)

**For larger repos:**
- Use Pinecone paid tier
- Sharding by package in monorepos
- Filter by metadata (package, file type)

## Failure Modes

**1. Query too broad:**
- "Explain the entire architecture"
- Mitigation: Detect and suggest more specific queries

**2. Graph explosion:**
- File with 50 imports
- Mitigation: Limit expansion depth to 2 levels

**3. Unparsed code:**
- Non-code files (JSON, MD)
- Mitigation: Skip in AST parser, use simple chunking

**4. Path hallucination:**
- LLM invents files
- Mitigation: Post-process to validate cited paths exist

## API Layer

nexu exposes a REST API designed for multiple frontends.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           FRONTENDS                              │
├─────────────────────────────────────────────────────────────────┤
│  React Web App │ Electron Desktop │ Ink CLI │ VSCode Plugin     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP API
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API ROUTES                          │
├─────────────────────────────────────────────────────────────────┤
│  /api/chat (streaming)  │  /api/search  │  /api/status          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 CORE SERVICE (src/lib/nexu)                      │
├─────────────────────────────────────────────────────────────────┤
│  initIndex()  │  search()  │  chat()  │  chatStream()           │
└────────────────────────────┬────────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ Retrieval  │    │   Graph    │    │    LLM     │
    │   Layer    │    │   Layer    │    │   Layer    │
    └────────────┘    └────────────┘    └────────────┘
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Streaming chat, Vercel AI SDK compatible |
| `/api/search` | POST | Retrieval only, returns chunks |
| `/api/status` | GET | Index status and configuration |

### Core Service (src/lib/nexu)

The core service provides a unified API for all frontends:

```typescript
// Initialize and cache the index
initIndex(): { store, graph, meta }

// Get system status
getStatus(): NexuStatus

// Search (retrieval only)
search(request: SearchRequest): Promise<SearchResponse>

// Chat with generation (non-streaming)
chat(request: ChatRequest): Promise<ChatResponse>

// Chat with generation (streaming)
chatStream(request: ChatRequest): AsyncIterable<string>
```

### Chat API Request/Response

**Request:**
```typescript
{
  messages: [
    { role: "user", content: "Where is availability validated?" }
  ],
  options: {
    topK: 10,
    reranker: "llm" | "bge" | "none",
    expandGraph: true
  }
}
```

**Response (streaming):**
- Vercel AI SDK compatible streaming format
- Sends chunk metadata first, then streams text
- Format: `0:"text chunk"\n` for text, `2:[{type:"chunks",data:[...]}]\n` for metadata

### Search API Request/Response

**Request:**
```typescript
{
  query: "availability validation",
  options: {
    topK: 10,
    reranker: "llm",
    expandGraph: true
  }
}
```

**Response:**
```typescript
{
  query: "availability validation",
  chunks: [
    {
      filepath: "/tmp/cal.com/packages/features/availability/...",
      startLine: 45,
      endLine: 120,
      nodeType: "function",
      name: "getUserAvailability",
      content: "...",
      score: 0.89,
      language: "typescript"
    }
  ],
  stage: "reranked",
  count: 5
}
```

### Vercel AI SDK Integration

The `/api/chat` endpoint is compatible with Vercel AI SDK's `useChat` hook:

```typescript
import { useChat } from 'ai/react';

function Chat() {
  const { messages, input, handleSubmit, handleInputChange } = useChat({
    api: '/api/chat'
  });

  return (
    // ... chat UI
  );
}
```

## Testing Strategy

**Unit tests:**
- AST parser with synthetic files
- Graph builder with small repos
- Retrieval with known queries

**Integration tests:**
- End-to-end: query → response
- Validate citations are correct
- Measure latency

**Evaluation:**
- Dataset of 50 queries about cal.com
- Ground truth: correct file + lines
- Metrics: Precision@1, Recall@5

See `science.md` for rigorous evaluation.
