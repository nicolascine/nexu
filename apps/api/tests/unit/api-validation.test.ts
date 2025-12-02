// Unit tests for API route input validation

import { test, describe } from 'node:test';
import assert from 'node:assert';

// validation constants (mirrored from routes)
const VALID_RERANKERS = ['bge', 'llm', 'none'] as const;
const MAX_QUERY_LENGTH = 2000;
const MAX_TOP_K = 50;
const MAX_HOPS = 5;
const MAX_EXPANDED_CHUNKS = 100;
const MAX_MESSAGES = 50;

interface SearchOptions {
  topK?: number;
  reranker?: 'bge' | 'llm' | 'none';
  expandGraph?: boolean;
  maxHops?: number;
  maxExpandedChunks?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  topK?: number;
  reranker?: 'bge' | 'llm' | 'none';
  expandGraph?: boolean;
  repository?: string;
}

// validation functions (extracted for testing)
function validateSearchOptions(options: SearchOptions | undefined): string | null {
  if (!options) return null;

  if (options.topK !== undefined) {
    if (typeof options.topK !== 'number' || options.topK < 1 || options.topK > MAX_TOP_K) {
      return `topK must be a number between 1 and ${MAX_TOP_K}`;
    }
  }
  if (options.maxHops !== undefined) {
    if (typeof options.maxHops !== 'number' || options.maxHops < 0 || options.maxHops > MAX_HOPS) {
      return `maxHops must be a number between 0 and ${MAX_HOPS}`;
    }
  }
  if (options.maxExpandedChunks !== undefined) {
    if (typeof options.maxExpandedChunks !== 'number' || options.maxExpandedChunks < 1 || options.maxExpandedChunks > MAX_EXPANDED_CHUNKS) {
      return `maxExpandedChunks must be a number between 1 and ${MAX_EXPANDED_CHUNKS}`;
    }
  }
  if (options.reranker !== undefined) {
    if (!VALID_RERANKERS.includes(options.reranker)) {
      return `reranker must be one of: ${VALID_RERANKERS.join(', ')}`;
    }
  }
  return null;
}

function validateChatRequest(messages: ChatMessage[], options?: ChatOptions): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'Messages array is required and must not be empty';
  }
  if (messages.length > MAX_MESSAGES) {
    return `Maximum ${MAX_MESSAGES} messages allowed`;
  }
  for (const msg of messages) {
    if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
      return 'Each message must have a valid role (user or assistant)';
    }
    if (typeof msg.content !== 'string') {
      return 'Each message must have a string content';
    }
    if (msg.content.length > MAX_QUERY_LENGTH) {
      return `Message content must be at most ${MAX_QUERY_LENGTH} characters`;
    }
  }
  if (options?.topK !== undefined) {
    if (typeof options.topK !== 'number' || options.topK < 1 || options.topK > MAX_TOP_K) {
      return `topK must be a number between 1 and ${MAX_TOP_K}`;
    }
  }
  if (options?.reranker !== undefined) {
    if (!VALID_RERANKERS.includes(options.reranker)) {
      return `reranker must be one of: ${VALID_RERANKERS.join(', ')}`;
    }
  }
  return null;
}

function validateQuery(query: unknown): string | null {
  if (!query || typeof query !== 'string') {
    return 'Query string is required';
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return `Query must be at most ${MAX_QUERY_LENGTH} characters`;
  }
  return null;
}

describe('Search API validation', () => {
  test('accepts valid query', () => {
    assert.strictEqual(validateQuery('How does auth work?'), null);
  });

  test('rejects empty query', () => {
    assert.ok(validateQuery(''));
    assert.ok(validateQuery(null));
    assert.ok(validateQuery(undefined));
  });

  test('rejects query exceeding max length', () => {
    const longQuery = 'a'.repeat(MAX_QUERY_LENGTH + 1);
    assert.ok(validateQuery(longQuery)?.includes('at most'));
  });

  test('accepts valid topK', () => {
    assert.strictEqual(validateSearchOptions({ topK: 10 }), null);
    assert.strictEqual(validateSearchOptions({ topK: 1 }), null);
    assert.strictEqual(validateSearchOptions({ topK: MAX_TOP_K }), null);
  });

  test('rejects invalid topK', () => {
    assert.ok(validateSearchOptions({ topK: 0 }));
    assert.ok(validateSearchOptions({ topK: -1 }));
    assert.ok(validateSearchOptions({ topK: MAX_TOP_K + 1 }));
    assert.ok(validateSearchOptions({ topK: 'ten' as unknown as number }));
  });

  test('accepts valid maxHops', () => {
    assert.strictEqual(validateSearchOptions({ maxHops: 0 }), null);
    assert.strictEqual(validateSearchOptions({ maxHops: 2 }), null);
    assert.strictEqual(validateSearchOptions({ maxHops: MAX_HOPS }), null);
  });

  test('rejects invalid maxHops', () => {
    assert.ok(validateSearchOptions({ maxHops: -1 }));
    assert.ok(validateSearchOptions({ maxHops: MAX_HOPS + 1 }));
  });

  test('accepts valid reranker', () => {
    assert.strictEqual(validateSearchOptions({ reranker: 'bge' }), null);
    assert.strictEqual(validateSearchOptions({ reranker: 'llm' }), null);
    assert.strictEqual(validateSearchOptions({ reranker: 'none' }), null);
  });

  test('rejects invalid reranker', () => {
    assert.ok(validateSearchOptions({ reranker: 'invalid' as 'bge' }));
  });

  test('accepts undefined options', () => {
    assert.strictEqual(validateSearchOptions(undefined), null);
  });
});

describe('Chat API validation', () => {
  test('accepts valid messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    assert.strictEqual(validateChatRequest(messages), null);
  });

  test('rejects empty messages array', () => {
    assert.ok(validateChatRequest([]));
  });

  test('rejects non-array messages', () => {
    assert.ok(validateChatRequest('hello' as unknown as ChatMessage[]));
  });

  test('rejects messages exceeding max count', () => {
    const messages: ChatMessage[] = Array(MAX_MESSAGES + 1).fill({
      role: 'user',
      content: 'test',
    });
    assert.ok(validateChatRequest(messages)?.includes('Maximum'));
  });

  test('rejects message with invalid role', () => {
    const messages = [{ role: 'system' as 'user', content: 'test' }];
    assert.ok(validateChatRequest(messages)?.includes('role'));
  });

  test('rejects message with non-string content', () => {
    const messages = [{ role: 'user' as const, content: 123 as unknown as string }];
    assert.ok(validateChatRequest(messages)?.includes('string content'));
  });

  test('rejects message content exceeding max length', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'a'.repeat(MAX_QUERY_LENGTH + 1) },
    ];
    assert.ok(validateChatRequest(messages)?.includes('at most'));
  });

  test('validates chat options', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'test' }];
    assert.strictEqual(validateChatRequest(messages, { topK: 10 }), null);
    assert.ok(validateChatRequest(messages, { topK: -1 }));
    assert.ok(validateChatRequest(messages, { reranker: 'invalid' as 'bge' }));
  });
});
