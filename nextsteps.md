# Next Steps for Nexu

## Current Status

Retrieval evaluation on nexu codebase (11 files, 98 chunks):

| Metric | Score |
|--------|-------|
| MRR | 83.3% |
| Recall | 75.0% |
| Precision | 54.2% |

## Improvements to Explore

### 1. Better Embedding Models
- Try code-specific models (CodeBERT, StarCoder embeddings)
- Compare OpenAI `text-embedding-3-large` vs `text-embedding-3-small`
- Test Voyage AI code embeddings

### 2. Chunk Content Optimization
- Include file path in chunk text
- Add import context to each chunk
- Experiment with chunk size (currently AST-based)

### 3. Graph Expansion Tuning
- Adjust `maxHops` parameter (currently 1)
- Weight edges by import frequency
- Prioritize type imports vs value imports

### 4. LLM Reranking
- ✅ Reranking now available in eval via `--rerank` flag
- Test different reranking prompts
- Compare reranking cost vs quality improvement

### 5. Hybrid Search
- Combine vector search with keyword/BM25 search
- Boost exact matches (function names, class names)

### 6. Larger Test Suite
- Add more test cases for edge cases
- Test on external codebases (e.g., popular OSS projects)
- Add answer quality evaluation (not just retrieval)

## Commands

```bash
# Run unit tests
npm run test

# Run evaluation on sample fixtures (mock embeddings)
npm run eval

# Run evaluation on nexu codebase (requires Ollama)
npm run eval:nexu -- --ollama

# Run without graph expansion
npm run eval:nexu -- --ollama --no-graph

# Run with LLM reranking (requires LLM_PROVIDER env)
npm run eval:nexu -- --ollama --rerank

# Full pipeline: embeddings + graph + rerank
npm run eval:nexu -- --ollama --rerank

# Interactive chat
npm run chat

# Index a codebase
npm run ingest -- /path/to/codebase

# Query indexed codebase
npm run query -- "how does X work?"
```
