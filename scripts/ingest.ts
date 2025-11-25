// Ingestion script for indexing a codebase
// Usage: pnpm run ingest

async function main() {
  console.log('nexu ingestion');
  console.log('==============');
  console.log('');
  console.log('TODO: implement ingestion pipeline');
  console.log('');
  console.log('steps:');
  console.log('1. clone/fetch target repo');
  console.log('2. parse files with tree-sitter');
  console.log('3. create AST-aligned chunks');
  console.log('4. generate embeddings');
  console.log('5. store in vector db');
  console.log('6. build dependency graph');
}

main().catch(console.error);
