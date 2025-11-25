# nexu

RAG for codebases. AST-aware chunking + graph expansion.

## the problem

LLMs have token limits. Cal.com has ~500k LOC. The question isn't "how do we fit all the code?" - it's "how do we retrieve exactly what matters?"

## approach

nexu doesn't try to shove the whole codebase into context. instead:

1. **structural chunking** - AST-based, preserves syntactic integrity
2. **rich metadata** - imports, types, exports per chunk
3. **dependency graph** - expands context following real relationships
4. **two-stage retrieval** - semantic search + LLM reranking
5. **precise citations** - path + lines, always

## why it works

### the "lost in the middle" problem

research shows LLMs degrade on massive contexts - they attend to start and end, middle gets lost. more tokens ≠ better understanding.

### our take

instead of fighting the limit, work with it:
- ~5k tokens of ultra-relevant context
- AST chunking preserves structure
- graph expansion adds only what's needed
- LLM sees complete, coherent code

## backed by research

### cAST: structural chunking via AST

our core approach is based on the **cAST paper** from Carnegie Mellon University (2025).

**paper:** [arxiv.org/abs/2506.15655](https://arxiv.org/abs/2506.15655)
**reference implementation:** [github.com/yilinjz/astchunk](https://github.com/yilinjz/astchunk)

**why cAST matters:**

traditional RAG systems chunk code by token count or line count. this breaks code mid-function, mid-class, destroying semantic meaning. cAST uses Abstract Syntax Trees to create chunks that respect code structure:

- **+4.3 pts on Recall@5** vs fixed-size chunking
- chunks align with functions, classes, types - never mid-statement
- metadata (imports, exports, types) preserved per chunk
- enables dependency graph construction for context expansion

```
fixed-size chunking:        cAST chunking:
┌──────────────┐            ┌──────────────┐
│ function foo │            │ function foo │
│   const x =  │  broken!   │   const x =  │  complete
├──────────────┤            │   return x   │  semantic
│   return x   │            │ }            │  unit
│ }            │            └──────────────┘
│ function bar │            ┌──────────────┐
└──────────────┤            │ function bar │
```

### other research

- **Qodo.ai** (2024) - two-stage retrieval in production across 10k repos
- **"Lost in the Middle"** (Liu et al. 2023) - why bigger context ≠ better

## stack

vendor lock-in free by design.

**core**
- next.js 14 (app router) + tailwind + shadcn/ui
- tree-sitter for AST parsing

**vector storage**
- pgvector (supabase or self-hosted postgres)

**LLM providers** (swappable via abstraction layer)
- anthropic (claude)
- openai
- local LLMs via OpenAI-compatible API:
  - [ollama](https://ollama.ai) - simplest local setup
  - [vllm](https://github.com/vllm-project/vllm) - production-grade inference
  - [lm studio](https://lmstudio.ai) - GUI + local server
  - deepseek, qwen, llama, etc.

**embeddings** (also swappable)
- openai text-embedding-3-small
- local: nomic-embed-text, bge, etc. via ollama

## architecture

```
query → semantic search (vector) → top chunks
                                       ↓
                              graph expansion (imports/exports)
                                       ↓
                              LLM reranking
                                       ↓
                              ~5-10k tokens → claude
                                       ↓
                              response + citations
```

see `docs/architecture.md` for implementation details.

## comparison

| approach | context used | precision | cost |
|----------|-------------|-----------|------|
| naive (whole repo) | 200k+ tokens | low | high |
| fixed-size chunking | 20-50k tokens | medium | medium |
| **nexu (AST + graph)** | **5-10k tokens** | **high** | **low** |
| agentic (with tools) | variable (50-150k) | medium | very high |

## limitations

- **broad queries** - "explain the whole architecture" needs multiple queries
- **highly coupled code** - graph expansion can explode
- **obscure languages** - tree-sitter might not have a parser
- **legacy spaghetti** - AST chunking assumes somewhat structured code

## configuration

```bash
# .env.local

# LLM provider: "anthropic" | "openai" | "ollama" | "custom"
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514

# for local LLMs (ollama, vllm, lm studio)
# LLM_PROVIDER=ollama
# LLM_BASE_URL=http://localhost:11434/v1
# LLM_MODEL=deepseek-coder-v2

# embeddings: "openai" | "ollama"
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small

# for local embeddings
# EMBEDDING_PROVIDER=ollama
# EMBEDDING_BASE_URL=http://localhost:11434/v1
# EMBEDDING_MODEL=nomic-embed-text

# API keys (only needed for cloud providers)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# vector db
DATABASE_URL=postgresql://...
```

## dev

```bash
pnpm install
pnpm run ingest  # index cal.com (one-time)
pnpm dev
```

### running with local LLMs

```bash
# install ollama
curl -fsSL https://ollama.ai/install.sh | sh

# pull a model
ollama pull deepseek-coder-v2
ollama pull nomic-embed-text

# update .env.local to use ollama
# then run normally
pnpm dev
```

## docs

- `docs/architecture.md` - system design
- `docs/science.md` - research backing
- `docs/ui.md` - interface design

## license

MIT
