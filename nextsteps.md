# Next Steps for Nexu

## Current Status

Retrieval evaluation on nexu codebase (11 files, 98 chunks):

| Metric | No Rerank | qwen2.5-coder:7b | deepseek-coder-v2 |
|--------|-----------|------------------|-------------------|
| MRR | 83.3% | 75.0% | 75.0% |
| Recall | 75.0% | 58.3% | 66.7% |
| Precision | 54.2% | 58.3% | **62.5%** |

**Findings:**
- Small 7B model hurts recall significantly (-16.7%) for minimal precision gain (+4.1%)
- DeepSeek-Coder-V2 (16B) achieves better balance: +8.3% precision, -8.3% recall
- Larger models recommended for production reranking

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
- ✅ Reranking available via `--rerank` flag
- ⚠️ 7B models hurt recall significantly
- ✅ DeepSeek-Coder-V2 (16B) works well: `LLM_MODEL=deepseek-coder-v2`
- **Next:** Test with Claude/GPT-4 API for comparison
- **Next:** Tune reranking prompt for better chunk selection

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
