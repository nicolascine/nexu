import OpenAI from 'openai';

async function test() {
  const client = new OpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });

  console.log('Test 1: default encoding');
  const r1 = await client.embeddings.create({
    model: 'nomic-embed-text',
    input: ['hello world'],
  });
  console.log('  Length:', r1.data[0]?.embedding?.length);
  console.log('  First 5:', r1.data[0]?.embedding?.slice(0, 5));

  console.log('\nTest 2: explicit float encoding');
  const r2 = await client.embeddings.create({
    model: 'nomic-embed-text',
    input: ['hello world'],
    encoding_format: 'float',
  });
  console.log('  Length:', r2.data[0]?.embedding?.length);
  console.log('  First 5:', r2.data[0]?.embedding?.slice(0, 5));
}

test().catch(e => console.error('Error:', e));
