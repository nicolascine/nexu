# Next Steps for Nexu

## Current Status

Retrieval evaluation on nexu codebase (11 files, 98 chunks):

| Metric | No Rerank | BGE Reranker | qwen2.5:7b | deepseek-coder-v2 |
|--------|-----------|--------------|------------|-------------------|
| MRR | **83.3%** | 70.8% | 75.0% | 75.0% |
| Recall | **75.0%** | 58.3% | 58.3% | 66.7% |
| Precision | 54.2% | 54.2% | 58.3% | **62.5%** |

**Findings:**
- BGE reranker (general-purpose) doesn't help for code - same precision, worse recall
- Small 7B LLM hurts recall significantly (-16.7%) for minimal precision gain
- DeepSeek-Coder-V2 (code-specialized) best: +8.3% precision, -8.3% recall
- **Recommendation:** Use code-specialized LLM for reranking, or skip it

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

### 4. Reranking
- ✅ Multiple rerankers available: `--reranker=bge`, `--reranker=llm`
- ⚠️ BGE (general-purpose) doesn't help for code
- ⚠️ 7B LLMs hurt recall significantly
- ✅ DeepSeek-Coder-V2 (16B) works well: `--reranker=llm`
- **Next:** Try code-specific rerankers (if available)
- **Next:** Focus on improving embeddings instead

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
