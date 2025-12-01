# Nexu Architecture Overview

Code RAG system implementing the cAST approach (AST-based chunking + graph expansion + LLM reranking).

## System Architecture

```mermaid
flowchart TB
    subgraph Ingestion["Ingestion Pipeline"]
        A[Source Files] --> B[Tree-sitter Parser]
        B --> C[AST Chunking]
        C --> D[Code Chunks]
        D --> E[Embedding Model]
        E --> F[Vector Store]

        A --> G[Import Extractor]
        G --> H[Dependency Graph]
    end

    subgraph Retrieval["Retrieval Pipeline"]
        Q[User Query] --> R[Query Embedding]
        R --> S[Vector Search]
        S --> T[Top-K Chunks]
        T --> U[Graph Expansion]
        U --> V[Expanded Context]
        V --> W[LLM Reranking]
        W --> X[Final Chunks]
    end

    subgraph Generation["Generation"]
        X --> Y[Context Builder]
        Y --> Z[LLM Generation]
        Z --> OUT[Response + Citations]
    end

    F -.-> S
    H -.-> U
```

## Component Details

### 1. AST Parser (`src/lib/ast/index.ts`)

Multi-language code parsing using tree-sitter.

```mermaid
flowchart LR
    subgraph Languages
        TS[TypeScript/JS]
        PY[Python]
        GO[Go]
        RS[Rust]
    end

    subgraph Parser
        TS --> TSG[tree-sitter-typescript]
        PY --> PYG[tree-sitter-python]
        GO --> GOG[tree-sitter-go]
        RS --> RSG[tree-sitter-rust]
    end

    subgraph Output
        TSG --> AST[AST Tree]
        PYG --> AST
        GOG --> AST
        RSG --> AST
        AST --> CHUNKS[Code Chunks]
    end
```

**Chunk types extracted:**
- Functions/methods
- Classes
- Interfaces/types
- Structs (Go/Rust)
- Modules

**Chunk metadata:**
```typescript
interface CodeChunk {
  id: string;           // hash-based unique ID
  content: string;      // source code
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
```

### 2. Dependency Graph (`src/lib/graph/index.ts`)

Tracks import/export relationships for context expansion.

```mermaid
flowchart TB
    subgraph Files
        F1[auth.ts]
        F2[user.ts]
        F3[crypto.ts]
    end

    subgraph Graph["Dependency Graph"]
        N1[auth.ts<br/>exports: login, logout]
        N2[user.ts<br/>exports: User, getUser]
        N3[crypto.ts<br/>exports: hash, verify]

        N1 -->|imports User| N2
        N1 -->|imports hash| N3
        N2 -->|imports hash| N3
    end

    F1 --> N1
    F2 --> N2
    F3 --> N3
```

**Graph operations:**
- `getDependencies(file)` - files this file imports
- `getDependents(file)` - files that import this file
- `expandContext(files, maxHops)` - BFS expansion

### 3. Retrieval Pipeline (`src/lib/retrieval/index.ts`)

Three-stage retrieval following cAST/Qodo.ai approach:

```mermaid
flowchart LR
    subgraph Stage1["Stage 1: Vector Search"]
        Q[Query] --> EMB[Embed]
        EMB --> VS[Cosine Similarity]
        VS --> TOP[Top-K=10]
    end

    subgraph Stage2["Stage 2: Graph Expansion"]
        TOP --> GE[Follow Imports]
        GE --> EXP[Expanded ~20 chunks]
    end

    subgraph Stage3["Stage 3: LLM Reranking"]
        EXP --> LLM[Claude/GPT]
        LLM --> FINAL[Top 5 Relevant]
    end

    Stage1 --> Stage2 --> Stage3
```

**Current parameters:**
| Parameter | Value | Description |
|-----------|-------|-------------|
| topK | 10 | Initial vector search results |
| minScore | 0.3 | Minimum similarity threshold |
| maxHops | 2 | Graph expansion depth |
| maxExpandedChunks | 20 | Max chunks after expansion |
| rerankTopK | 5 | Final chunks after reranking |

### 4. LLM Integration (`src/lib/llm/`)

Provider-agnostic LLM layer.

```mermaid
flowchart TB
    subgraph Providers
        ANT[Anthropic<br/>Claude]
        OAI[OpenAI<br/>GPT-4]
        GEM[Google<br/>Gemini]
        OLL[Ollama<br/>Local]
    end

    subgraph Interface
        CHAT[chat/chatStream]
        EMBED[embed]
    end

    ANT --> CHAT
    OAI --> CHAT
    OAI --> EMBED
    GEM --> CHAT
    GEM --> EMBED
    OLL --> CHAT
    OLL --> EMBED
```

**Environment variables:**
```bash
# LLM (for generation/reranking)
LLM_PROVIDER=anthropic|openai|gemini|ollama
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Embeddings
EMBEDDING_PROVIDER=openai|gemini|ollama
EMBEDDING_MODEL=text-embedding-3-small
```

## Data Flow

### Ingestion Flow

```mermaid
sequenceDiagram
    participant FS as File System
    participant AST as AST Parser
    participant EMB as Embedding Model
    participant VS as Vector Store
    participant GR as Graph Builder

    FS->>AST: Read source files
    AST->>AST: Parse with tree-sitter
    AST->>EMB: Send chunks for embedding
    EMB->>VS: Store vectors + metadata
    FS->>GR: Extract imports/exports
    GR->>GR: Build adjacency graph
```

### Query Flow

```mermaid
sequenceDiagram
    participant U as User
    participant R as Retriever
    participant VS as Vector Store
    participant GR as Graph
    participant LLM as LLM

    U->>R: "How does auth work?"
    R->>VS: Vector search (top 10)
    VS->>R: Candidate chunks
    R->>GR: Expand via imports
    GR->>R: +10 related chunks
    R->>LLM: Rerank 20 → 5
    LLM->>R: Relevance ranking
    R->>LLM: Generate answer
    LLM->>U: Response + citations
```

## File Structure

```
src/
├── lib/
│   ├── ast/
│   │   └── index.ts          # Tree-sitter parsing, chunking
│   ├── graph/
│   │   └── index.ts          # Dependency graph construction
│   ├── retrieval/
│   │   ├── index.ts          # Retrieval pipeline orchestration
│   │   └── vector-store.ts   # In-memory vector store
│   └── llm/
│       ├── index.ts          # LLM abstraction layer
│       ├── config.ts         # Provider configuration
│       ├── types.ts          # Type definitions
│       └── providers/
│           ├── anthropic.ts  # Claude integration
│           ├── gemini.ts     # Gemini integration
│           └── openai-compatible.ts  # OpenAI/Ollama
├── app/                      # Next.js app router (UI)
scripts/
├── ingest.ts                 # Index a codebase
├── query.ts                  # Single query
└── chat.ts                   # Interactive chat
tests/
├── unit/                     # Unit tests
├── eval/                     # Evaluation harness
└── fixtures/                 # Test data
```

## Evaluation Metrics

Current performance on nexu codebase (11 files, 98 chunks):

| Metric | Score | Target |
|--------|-------|--------|
| MRR | 83.3% | >80% |
| Recall | 75.0% | >80% |
| Precision | 54.2% | >70% |

**Note:** Current eval does NOT use LLM reranking. Enabling it should improve precision.

## Key Design Decisions

1. **AST-based chunking** over fixed-size: Preserves semantic boundaries (cAST paper: +4.3 pts recall)

2. **Graph expansion** over vector-only: Follows imports for related context (80% of deps are 1-2 hops)

3. **Lean context** (5-10k tokens) over massive context: Avoids "lost in the middle" problem

4. **LLM reranking** as final stage: Filters noise from vector search (Qodo.ai: "crucial at scale")

5. **Provider abstraction**: No vendor lock-in, easy to switch LLMs

## References

- [cAST Paper](https://arxiv.org/abs/2506.15655) - AST-based chunking approach
- [Qodo.ai Blog](https://www.qodo.ai/blog/rag-for-large-scale-code-repos/) - Production RAG at scale
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) - Why lean context matters
