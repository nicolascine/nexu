import OpenAI from 'openai';

async function test() {
  const client = new OpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });

  console.log('Calling OpenAI SDK directly...');
  const response = await client.embeddings.create({
    model: 'nomic-embed-text',
    input: ['hello world'],
  });

  console.log('Response data length:', response.data.length);
  console.log('First embedding length:', response.data[0]?.embedding?.length);
  console.log('First 5 values:', response.data[0]?.embedding?.slice(0, 5));
}

test().catch(e => console.error('Error:', e));
