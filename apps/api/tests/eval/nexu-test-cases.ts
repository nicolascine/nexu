// Ground-truth test cases for evaluating retrieval on the nexu codebase itself

export interface TestCase {
  id: string;
  query: string;
  expectedFiles: string[];
  expectedChunks: string[];
  answerKeywords?: string[];
}

export const NEXU_TEST_CASES: TestCase[] = [
  {
    id: 'embedding-generation',
    query: 'how are embeddings generated?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['embed', 'createEmbeddingProvider'],
    answerKeywords: ['embedding', 'provider'],
  },
  {
    id: 'vector-search',
    query: 'how does vector search work?',
    expectedFiles: ['vector-store.ts'],
    expectedChunks: ['searchStore', 'cosineSimilarity'],
    answerKeywords: ['cosine', 'similarity', 'topK'],
  },
  {
    id: 'ast-parsing',
    query: 'how is code parsed into chunks?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['parseFile', 'CodeChunk'],
    answerKeywords: ['tree-sitter', 'chunk'],
  },
  {
    id: 'graph-building',
    query: 'how is the dependency graph built?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['buildGraph', 'DependencyGraph'],
    answerKeywords: ['edges', 'imports'],
  },
  {
    id: 'graph-expansion',
    query: 'how does context expansion work?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['expandContext', 'getExpandedChunks'],
    answerKeywords: ['hops', 'neighbors'],
  },
  {
    id: 'llm-providers',
    query: 'what LLM providers are supported?',
    expectedFiles: ['anthropic.ts', 'gemini.ts', 'openai-compatible.ts'],
    expectedChunks: ['AnthropicProvider', 'GeminiProvider', 'OpenAICompatibleProvider'],
    answerKeywords: ['anthropic', 'openai', 'gemini'],
  },
  {
    id: 'anthropic-chat',
    query: 'how does the Anthropic provider work?',
    expectedFiles: ['anthropic.ts'],
    expectedChunks: ['AnthropicProvider', 'chat'],
    answerKeywords: ['claude', 'messages'],
  },
  {
    id: 'retrieval-pipeline',
    query: 'what are the stages of the retrieval pipeline?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['vectorSearch', 'graphExpand', 'rerank'],
    answerKeywords: ['vector', 'graph', 'rerank'],
  },
  {
    id: 'store-persistence',
    query: 'how is the vector store saved and loaded?',
    expectedFiles: ['vector-store.ts'],
    expectedChunks: ['saveStore', 'loadStore'],
    answerKeywords: ['file', 'JSON'],
  },
  {
    id: 'language-support',
    query: 'what programming languages are supported?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['LANGUAGE_CONFIGS', 'getSupportedLanguages'],
    answerKeywords: ['typescript', 'python', 'go', 'rust'],
  },
  {
    id: 'config',
    query: 'how is the LLM configured?',
    expectedFiles: ['config.ts'],
    expectedChunks: ['getLLMConfig', 'getEmbeddingConfig'],
    answerKeywords: ['environment', 'provider'],
  },
  {
    id: 'reranking',
    query: 'how does LLM reranking work?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['rerank'],
    answerKeywords: ['relevance', 'rank'],
  },
];
