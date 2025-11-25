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

- **cAST paper** (CMU 2025) - AST chunking beats fixed-size by 4.3 pts on Recall@5
- **Qodo.ai** (2024) - two-stage retrieval in production across 10k repos
- **"Lost in the Middle"** (Liu et al. 2023) - why bigger context ≠ better

## stack

- next.js 14 (app router) + tailwind + shadcn/ui
- pinecone (or supabase pgvector)
- claude api
- openai embeddings (text-embedding-3-small)
- tree-sitter for AST

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

## dev

```bash
pnpm install
pnpm run ingest  # index cal.com (one-time)
pnpm dev
```

## docs

- `docs/architecture.md` - system design
- `docs/science.md` - research backing
- `docs/ui.md` - interface design

## license

MIT
