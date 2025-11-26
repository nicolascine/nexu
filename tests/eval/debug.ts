// Debug script to analyze retrieval results
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { parseFile } from '../../src/lib/ast';
import { createStore, addToStore, searchStore } from '../../src/lib/retrieval';
import { embed } from '../../src/lib/llm';

process.env.EMBEDDING_PROVIDER = 'ollama';

const NEXU_SRC = join(__dirname, '../../src');

function findFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isFile() && entry.endsWith('.ts')) files.push(fullPath);
    else if (stat.isDirectory()) files.push(...findFiles(fullPath));
  }
  return files;
}

async function debug() {
  const files = findFiles(NEXU_SRC);
  const fileContents = files.map(f => ({ filepath: f, content: readFileSync(f, 'utf-8') }));

  const allChunks: any[] = [];
  for (const file of fileContents) {
    allChunks.push(...parseFile(file.filepath, file.content));
  }

  console.log(`Indexed ${files.length} files, ${allChunks.length} chunks`);

  const texts = allChunks.map(c => `${c.nodeType}: ${c.name}\n\n${c.content}`);
  const embeddings = await embed(texts);

  console.log('First embedding sample:', embeddings[0].slice(0, 5));
  console.log('Embedding dimension:', embeddings[0].length);

  const store = createStore(embeddings[0].length, 'debug');
  addToStore(store, allChunks.map((chunk, i) => ({ id: chunk.id, embedding: embeddings[i], chunk })));

  // Test queries
  const queries = [
    'how does vector search work?',
    'how is the vector store saved?',
    'what LLM providers are supported?',
    'how does the Anthropic provider work?',
    'how is the LLM configured?',
  ];

  for (const query of queries) {
    const [qEmb] = await embed([query]);
    console.log(`\nQuery embedding sample:`, qEmb.slice(0, 5));
    const results = searchStore(store, qEmb, { topK: 5 });

    console.log(`\nQuery: "${query}"`);
    console.log('Top 5 results:');
    results.forEach((r, i) => {
      console.log(`  ${i+1}. ${basename(r.entry.chunk.filepath)} - ${r.entry.chunk.name} (score: ${r.score.toFixed(3)})`);
    });
  }
}

debug().catch(console.error);
