// Unit tests for vector store

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  createStore,
  addToStore,
  searchStore,
  getStoreStats,
  deleteFromStore,
  getEntriesByFilepath,
  deleteByFilepath,
} from '../../src/lib/retrieval/vector-store';
import type { VectorEntry } from '../../src/lib/retrieval/vector-store';
import type { CodeChunk } from '../../src/lib/ast';

function createMockChunk(id: string, filepath: string): CodeChunk {
  return {
    id,
    content: 'test content',
    filepath,
    startLine: 1,
    endLine: 10,
    nodeType: 'function',
    name: 'testFunc',
    language: 'typescript',
    imports: [],
    exports: [],
    types: [],
  };
}

function createMockEntry(id: string, filepath: string, embedding: number[]): VectorEntry {
  return {
    id,
    embedding,
    chunk: createMockChunk(id, filepath),
  };
}

describe('createStore', () => {
  test('creates empty store with correct dimension', () => {
    const store = createStore(384, 'test-model');

    assert.strictEqual(store.dimension, 384);
    assert.strictEqual(store.entries.length, 0);
    assert.strictEqual(store.metadata.model, 'test-model');
  });
});

describe('addToStore', () => {
  test('adds entries to store', () => {
    const store = createStore(3, 'test');
    const entry = createMockEntry('1', '/test.ts', [0.1, 0.2, 0.3]);

    addToStore(store, [entry]);

    assert.strictEqual(store.entries.length, 1);
    assert.strictEqual(store.entries[0].id, '1');
  });

  test('upserts existing entries', () => {
    const store = createStore(3, 'test');
    const entry1 = createMockEntry('1', '/test.ts', [0.1, 0.2, 0.3]);
    const entry2 = createMockEntry('1', '/test.ts', [0.4, 0.5, 0.6]);

    addToStore(store, [entry1]);
    addToStore(store, [entry2]);

    assert.strictEqual(store.entries.length, 1);
    assert.deepStrictEqual(store.entries[0].embedding, [0.4, 0.5, 0.6]);
  });

  test('throws on dimension mismatch', () => {
    const store = createStore(3, 'test');
    const entry = createMockEntry('1', '/test.ts', [0.1, 0.2]); // wrong dimension

    assert.throws(() => addToStore(store, [entry]), /dimension/i);
  });
});

describe('searchStore', () => {
  test('returns results sorted by similarity', () => {
    const store = createStore(3, 'test');
    addToStore(store, [
      createMockEntry('a', '/a.ts', [1, 0, 0]),
      createMockEntry('b', '/b.ts', [0.9, 0.1, 0]),
      createMockEntry('c', '/c.ts', [0, 1, 0]),
    ]);

    const results = searchStore(store, [1, 0, 0], { topK: 10 });

    assert.strictEqual(results[0].entry.id, 'a'); // exact match
    assert.strictEqual(results[1].entry.id, 'b'); // close match
    assert.strictEqual(results[0].score, 1); // perfect cosine similarity
  });

  test('respects topK limit', () => {
    const store = createStore(3, 'test');
    addToStore(store, [
      createMockEntry('a', '/a.ts', [1, 0, 0]),
      createMockEntry('b', '/b.ts', [0.9, 0.1, 0]),
      createMockEntry('c', '/c.ts', [0.8, 0.2, 0]),
    ]);

    const results = searchStore(store, [1, 0, 0], { topK: 2 });

    assert.strictEqual(results.length, 2);
  });

  test('filters by minScore', () => {
    const store = createStore(3, 'test');
    addToStore(store, [
      createMockEntry('a', '/a.ts', [1, 0, 0]),
      createMockEntry('b', '/b.ts', [0, 1, 0]), // orthogonal, score ~0
    ]);

    const results = searchStore(store, [1, 0, 0], { minScore: 0.5 });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].entry.id, 'a');
  });

  test('throws on query dimension mismatch', () => {
    const store = createStore(3, 'test');
    addToStore(store, [createMockEntry('a', '/a.ts', [1, 0, 0])]);

    assert.throws(() => searchStore(store, [1, 0], { topK: 10 }), /dimension/i);
  });
});

describe('getStoreStats', () => {
  test('returns correct stats', () => {
    const store = createStore(384, 'text-embedding-3-small');
    addToStore(store, [
      createMockEntry('a', '/a.ts', new Array(384).fill(0.1)),
      createMockEntry('b', '/b.ts', new Array(384).fill(0.2)),
    ]);

    const stats = getStoreStats(store);

    assert.strictEqual(stats.totalEntries, 2);
    assert.strictEqual(stats.dimension, 384);
    assert.strictEqual(stats.model, 'text-embedding-3-small');
  });
});

describe('deleteFromStore', () => {
  test('deletes entries by id', () => {
    const store = createStore(3, 'test');
    addToStore(store, [
      createMockEntry('a', '/a.ts', [1, 0, 0]),
      createMockEntry('b', '/b.ts', [0, 1, 0]),
      createMockEntry('c', '/c.ts', [0, 0, 1]),
    ]);

    const deleted = deleteFromStore(store, ['a', 'c']);

    assert.strictEqual(deleted, 2);
    assert.strictEqual(store.entries.length, 1);
    assert.strictEqual(store.entries[0].id, 'b');
  });
});

describe('getEntriesByFilepath', () => {
  test('returns entries for filepath', () => {
    const store = createStore(3, 'test');
    addToStore(store, [
      createMockEntry('a1', '/a.ts', [1, 0, 0]),
      createMockEntry('a2', '/a.ts', [0.9, 0.1, 0]),
      createMockEntry('b', '/b.ts', [0, 1, 0]),
    ]);

    const entries = getEntriesByFilepath(store, '/a.ts');

    assert.strictEqual(entries.length, 2);
    assert.ok(entries.every(e => e.chunk.filepath === '/a.ts'));
  });
});

describe('deleteByFilepath', () => {
  test('deletes all entries for filepath', () => {
    const store = createStore(3, 'test');
    addToStore(store, [
      createMockEntry('a1', '/a.ts', [1, 0, 0]),
      createMockEntry('a2', '/a.ts', [0.9, 0.1, 0]),
      createMockEntry('b', '/b.ts', [0, 1, 0]),
    ]);

    const deleted = deleteByFilepath(store, '/a.ts');

    assert.strictEqual(deleted, 2);
    assert.strictEqual(store.entries.length, 1);
    assert.strictEqual(store.entries[0].id, 'b');
  });
});
