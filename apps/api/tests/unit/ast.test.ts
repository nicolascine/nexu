// Unit tests for AST parser

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseFile, getSupportedExtensions, getSupportedLanguages } from '../../src/lib/ast';

describe('parseFile', () => {
  test('parses TypeScript function', () => {
    const code = `function hello(name: string): string {
  return 'Hello, ' + name;
}`;
    const chunks = parseFile('test.ts', code);

    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].nodeType, 'function');
    assert.strictEqual(chunks[0].name, 'hello');
    assert.strictEqual(chunks[0].language, 'typescript');
  });

  test('parses TypeScript class', () => {
    const code = `class UserService {
  private users: Map<string, User> = new Map();

  getUser(id: string): User | null {
    return this.users.get(id) || null;
  }
}`;
    const chunks = parseFile('test.ts', code);

    assert.ok(chunks.length >= 1);
    const classChunk = chunks.find(c => c.nodeType === 'class');
    assert.ok(classChunk);
    assert.strictEqual(classChunk.name, 'UserService');
  });

  test('parses TypeScript interface', () => {
    const code = `interface User {
  id: string;
  name: string;
  email: string;
}`;
    const chunks = parseFile('test.ts', code);

    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].nodeType, 'interface');
    assert.strictEqual(chunks[0].name, 'User');
  });

  test('parses TypeScript arrow function', () => {
    const code = `const greet = (name: string): string => {
  return 'Hello, ' + name;
};`;
    const chunks = parseFile('test.ts', code);

    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].nodeType, 'function');
    assert.strictEqual(chunks[0].name, 'greet');
  });

  test('extracts imports', () => {
    const code = `import { User } from './user';
import * as crypto from 'crypto';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}`;
    const chunks = parseFile('test.ts', code);

    assert.ok(chunks.length >= 1);
    const funcChunk = chunks.find(c => c.nodeType === 'function');
    assert.ok(funcChunk);
    assert.ok(funcChunk.imports.includes('./user'));
    assert.ok(funcChunk.imports.includes('crypto'));
  });

  test('handles empty file', () => {
    const chunks = parseFile('test.ts', '');
    assert.strictEqual(chunks.length, 0);
  });

  test('handles file with only comments', () => {
    const code = `// This is a comment
/* Multi-line
   comment */`;
    const chunks = parseFile('test.ts', code);
    assert.strictEqual(chunks.length, 0);
  });

  test('returns empty for unsupported extensions', () => {
    const chunks = parseFile('test.txt', 'const x = 1;');
    assert.strictEqual(chunks.length, 0);
  });
});

describe('getSupportedExtensions', () => {
  test('returns array of extensions', () => {
    const extensions = getSupportedExtensions();
    assert.ok(Array.isArray(extensions));
    assert.ok(extensions.includes('.ts'));
    assert.ok(extensions.includes('.py'));
    assert.ok(extensions.includes('.go'));
    assert.ok(extensions.includes('.rs'));
  });
});

describe('getSupportedLanguages', () => {
  test('returns array of languages', () => {
    const languages = getSupportedLanguages();
    assert.ok(Array.isArray(languages));
    assert.ok(languages.includes('typescript'));
    assert.ok(languages.includes('python'));
    assert.ok(languages.includes('go'));
    assert.ok(languages.includes('rust'));
  });
});
