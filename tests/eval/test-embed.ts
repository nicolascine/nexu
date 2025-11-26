import { embed } from '../../src/lib/llm';
import { getEmbeddingConfig } from '../../src/lib/llm/config';

process.env.EMBEDDING_PROVIDER = 'ollama';

async function test() {
  const config = getEmbeddingConfig();
  console.log('Config:', config);

  console.log('Testing embed...');
  const result = await embed(['hello world']);
  console.log('Result length:', result.length);
  console.log('First vector length:', result[0]?.length);
  console.log('First 5 values:', result[0]?.slice(0, 5));
}

test().catch(e => console.error('Error:', e));
