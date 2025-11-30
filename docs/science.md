# Scientific Foundation - Nexu

Analysis of the evidence supporting design decisions.

## Research Question

**How do we allow an LLM to "understand" a 500k line codebase without exceeding its context window?**

## State of the Art

### 1. The Limited Context Problem

**Relevant paper:** "Lost in the Middle: How Language Models Use Long Contexts" (Liu et al., 2023)

Key finding:
> LLMs have U-shaped performance - they attend primarily to the start and end of context, the middle gets "lost".

**Implications:**
- Putting 200k tokens doesn't guarantee the model uses all the information
- A bigger "haystack" doesn't help if the "needle" is in the middle
- Optimal strategy: **small and relevant context** > giant and noisy context

### 2. RAG for Code vs. RAG for Text

**Fundamental difference:**

| Aspect | Text (docs, articles) | Code |
|--------|------------------------|--------|
| Structure | Paragraphs, sentences | AST, functions, classes |
| Dependencies | References, citations | Imports, types, calls |
| Boundaries | Relatively clear | Require parsing |
| Chunking | Semantic (paragraphs) | **Must respect syntax** |

**Base paper:** cAST (Carnegie Mellon, 2025)

### 3. cAST: Chunking via Abstract Syntax Trees

**Paper:** Yilin Zhang et al., "cAST: Enhancing Code Retrieval-Augmented Generation with Structural Chunking via Abstract Syntax Tree" (2025)

**URL:** https://arxiv.org/abs/2506.15655

**Problem it solves:**

Traditional chunking (fixed-size) breaks syntactic structures:
```typescript
// Fixed-size chunking can cut here ↓
function calculatePrice(items: Item[]) {
  const subtotal = items.reduce((sum, item) =>
--- CHUNK CUT ---
    sum + item.price, 0);
  return subtotal * 1.19; // tax
}
```

Result: The LLM loses context about what the function returns.

**cAST solution:**

1. Parse code into AST
2. Identify complete nodes (functions, classes)
3. Create chunks respecting syntactic boundaries
4. If node is too large, recursively divide
5. Merge small adjacent nodes

**Algorithm (pseudocode from paper):**
```
function chunk_ast(node, max_size):
  if size(node) ≤ max_size:
    return [node]

  chunks = []
  for each child in node.children:
    sub_chunks = chunk_ast(child, max_size)
    chunks.extend(sub_chunks)

  return merge_small_chunks(chunks, max_size)
```

**Experimental results:**

**Dataset:** RepoEval and SWE-bench

| Metric | Fixed-size | cAST | Improvement |
|---------|-----------|------|--------|
| Recall@5 (RepoEval) | 45.2% | 49.5% | +4.3 pts |
| Precision@5 (SWE-bench) | 38.1% | 39.5% | +1.4 pts |
| Pass@1 (code gen) | 24.3% | 27.0% | +2.67 pts |

**Paper conclusion:**
> "AST-aligned chunks provide richer and more accurate context for retrieval models, leading to consistent improvements across both retrieval and generation tasks."

### 4. Production Evidence

**Qodo.ai: "RAG for a Codebase with 10k Repos"** (2024)

**URL:** https://www.qodo.ai/blog/rag-for-large-scale-code-repos/

**Setup:**
- 10,000+ enterprise repositories
- Millions of indexed chunks
- Real production with developers

**Chunking strategy:**

> "For a large class, we create an embedding and index individual methods separately but include the class definition and relevant imports with each method chunk."

**Two-stage retrieval:**

1. **Stage 1:** Vector similarity search (initial)
2. **Stage 2:** LLM filtering & ranking

> "We use an LLM to filter and rank the results based on their relevance to the specific task or query."

**Example from paper:**
- Query: "how to handle API rate limiting"
- Stage 1 retrieves: 20 chunks about APIs
- Stage 2 LLM filter: 3 chunks specific to rate limiting
- **Result:** Precision ++, tokens used --

**Key finding:**
> "Simple vector similarity search often retrieves irrelevant or out-of-context code snippets, especially in large, diverse codebases."

### 5. Context Window Management

**Source:** Reddit post "My Claude Code Context Window Strategy" (Nov 2024)
**Author:** u/Goos_Kim
**Upvotes:** 452
**URL:** https://reddit.com/r/ClaudeAI/comments/1p05r7p/

**Post thesis:**
> "The problem usually isn't the window size, it's how we burn tokens."

**Author's experiment:**
```
With Auto-Compact ON:  85k / 200k tokens (43%)
With Auto-Compact OFF: 38k / 200k tokens (19%)
```

**Proposed rule:**
> "Initial context usage should never exceed 20% of total context window."

**Principle applied to Nexu:**

Instead of stuffing the whole codebase:
- Retrieve 5-10k relevant tokens (2.5-5% of 200k)
- Leave 95% of context available for reasoning
- LLM has space to think without being "drowned" in code

**Highlighted comment (u/tormenteddragon):**

> "Your thinking is directionally correct! But agentic AI in their current state are grossly inefficient. The key to solving this isn't in optimizing agentic AI. It's in using adjacency graphs and clustering to tailor context for particular tasks to achieve O(1) context for any given task regardless of codebase size."

**Translation:**
- Don't use agents that explore everything
- Use adjacency graphs to **pre-compute** relevant context
- O(1) complexity per query, independent of repo size

**Implementation in Nexu:** See "Dependency Graph" section in `architecture.md`

### 6. Graph-based Approaches

**Reddit comment (u/tormenteddragon):**

> "Codebases are just graphs of files and functions. For any given task, most of what you need is within a few hops in the graph. Give the AI only what it needs for the task."

**Theoretical validation:**

**Paper:** "Language-agnostic representation learning of source code" (Guo et al., 2021)

- Represents code as graphs
- Nodes: functions, classes
- Edges: calls, imports, inheritance
- **Finding:** Locality in code graphs is high

**"Code locality":**

In well-structured codebases:
- 80% of dependencies are 1-2 hops away
- Related functions tend to be in nearby files
- Imports are relatively shallow

**Application:**

If user asks about function X:
1. Retrieve function X (direct chunk)
2. Graph expansion 1 hop:
   - Parameter types
   - Functions it calls
   - Class containing it
3. Graph expansion 2 hops (optional):
   - Function callers
   - Related implementations

Total: ~5-10 chunks, ~5k tokens

### 7. Embeddings for Code

**Model used:** OpenAI text-embedding-3-small

**Alternatives evaluated:**

| Model | Dims | Cost | Code Performance |
|--------|------|-------|----------------------|
| OpenAI ada-002 | 1536 | $0.10/1M | Good |
| **OpenAI text-emb-3-small** | **1536** | **$0.02/1M** | **Very good** |
| Voyage AI code | 1024 | $0.10/1M | Excellent (code-specific) |
| CodeSage | 768 | Free | Good but slow |

**Paper:** "CodeRetriever: A Large Scale Contrastive Pre-training Method for Code Search" (Li et al., 2022)

Finding:
> General embeddings (trained on text) work surprisingly well for code, especially for semantic search.

**Decision:** OpenAI text-embedding-3-small
- Optimal cost/benefit
- Low latency
- Proven performance

### 8. LLM Selection: Claude vs. GPT

**Claude 3.5 Sonnet (selected):**
- Benchmarks: #1 on SWE-bench (coding)
- Context: 200k tokens
- Pricing: $3/MTok input

**GPT-4o:**
- Benchmarks: Comparable
- Context: 128k tokens
- Pricing: $5/MTok input

**Decision rationale:**

Reference paper: SWE-bench leaderboard (2024)
- Claude 3.5 Sonnet: 49.0% pass rate
- GPT-4o: 41.8% pass rate

For code understanding tasks, Claude leads.

## Critical Analysis of Alternatives

### Alternative 1: "Naive RAG"

**Approach:**
- Fixed-size chunking (500 tokens)
- Vector search only
- Retrieve Top 10 chunks
- Feed directly to LLM

**Pros:**
- Simple
- Quick to implement

**Cons:**
- Breaks syntactic structure
- No dependency context
- High probability of incomplete chunks
- Noisy retrieval

**Evidence against:**
- cAST paper shows 4.3 points less Recall
- Qodo.ai report: "Simple vector search retrieves irrelevant snippets"

### Alternative 2: "Agentic AI"

**Approach:**
- LLM with tools: read_file, search_files, list_directory
- LLM explores codebase dynamically
- Multiple tool calls per query

**Pros:**
- Flexible
- Can explore context dynamically

**Cons:**
- Very expensive (many tokens)
- Slow (multiple LLM calls)
- Can enter loops
- Contaminates context with irrelevant explorations

**Evidence against:**

Reddit comment (u/tormenteddragon):
> "Agentic AI in their current state are grossly inefficient. You get much better results in 10-20k token context than agentic AI in 200k."

### Alternative 3: "Fine-tuned Code LLM"

**Approach:**
- Fine-tune model on cal.com specifically
- Model "memorizes" the codebase

**Pros:**
- No RAG complexity
- Potentially fast responses

**Cons:**
- Expensive to train
- Doesn't scale (one model per repo)
- Hallucinations still possible
- Doesn't cite sources

**Evidence against:**
- RAG paper (Lewis et al., 2020): "RAG outperforms fine-tuning for knowledge-intensive tasks"

### Alternative 4: "Entire context (1M tokens)"

**Approach:**
- Use model with 1M token context
- Put all of cal.com

**Pros:**
- No information loss
- No retrieval complexity

**Cons:**
- Very expensive ($$$)
- High latency
- "Lost in the middle" problem
- Not everyone has access to 1M context

**Evidence against:**
- "Lost in the Middle" paper: Performance degrades with massive context
- Reddit post: "Bigger haystack makes needle harder to find"

## Our Architecture: Scientific Justification

**Decision matrix:**

| Component | Alternative considered | Why chosen |
|-----------|----------------------|------------|
| **Chunking** | Fixed-size | **AST-based** | cAST paper: +4.3 pts Recall |
| **Retrieval** | Vector only | **Vector + Graph** | Qodo.ai: reduces noise significantly |
| **Context size** | 50k-100k tokens | **5-10k tokens** | Reddit: "Lean context" + Lost-in-middle paper |
| **LLM** | GPT-4o | **Claude 3.5 Sonnet** | SWE-bench: 49.0% vs 41.8% |
| **Reranking** | No reranking | **LLM rerank** | Qodo.ai: "LLM filtering crucial at scale" |

## Proposed Evaluation

To validate that Nexu works:

### Metrics

**1. Retrieval accuracy**
- Precision@K: % of correct chunks in top K
- Recall@K: % of total relevant chunks found
- MRR (Mean Reciprocal Rank): position of first correct result

**2. Citation accuracy**
- % of citations with correct path
- % of citations with correct lines
- False citation rate

**3. User satisfaction**
- Thumbs up/down
- Task completion rate
- Time to answer (latency)

### Evaluation Dataset

**50 queries about cal.com:**

Examples:
1. "Where is hourly availability validated?"
   - Ground truth: `packages/lib/slots.ts`, lines X-Y

2. "How is a booking payment processed?"
   - Ground truth: `apps/web/lib/payment.ts`, lines A-B

3. "What middleware is used for authentication?"
   - Ground truth: `apps/web/middleware.ts`, lines M-N

**Process:**

1. Expert developer in cal.com annotates ground truth
2. Nexu answers the 50 queries
3. Compare citations vs. ground truth
4. Calculate metrics

### Baseline Comparison

Compare Nexu against:

1. **GitHub Copilot Chat** (if available)
2. **Cursor with codebase** (reference)
3. **Naive RAG** (fixed-size chunking)

**Hypothesis:**
Nexu will have Precision@1 > 80% vs. Naive RAG < 60%

## Limitations of the Approach

**1. Assumes structured code**
- AST chunking requires parseable code
- Unstructured legacy code may fail

**2. Graph expansion can explode**
- Highly coupled files
- Mitigation: depth limit

**3. Doesn't understand "global architecture"**
- Nexu is local-first
- Queries like "describe the entire architecture" require different approach

**4. Dependent on embedding quality**
- If embedding model is bad for code, it fails
- Mitigation: use code-specific model

## Conclusions

**What we know (with evidence):**
1. ✅ AST chunking > fixed-size (cAST paper)
2. ✅ Two-stage retrieval improves precision (Qodo.ai)
3. ✅ Lean context > massive context (Lost-in-middle + Reddit)
4. ✅ Claude 3.5 Sonnet leads in coding (SWE-bench)

**What we assume (reasonable but unproven):**
1. ⚠️ Graph expansion improves over vector-only
2. ⚠️ LLM reranking is worth the extra cost
3. ⚠️ 5-10k tokens is the sweet spot (not benchmarked)

**What we must validate:**
1. ❓ Performance on cal.com specifically
2. ❓ User satisfaction with citations
3. ❓ Production costs at scale

**Next steps:**

1. Implement system
2. Evaluate with 50-query dataset
3. Iterate based on metrics
4. Publish results

If Nexu demonstrates Precision@1 > 80%, we will have scientifically validated the approach.
