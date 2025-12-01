// Ground-truth test cases for retrieval evaluation
// Each case has a query and expected relevant files/functions

export interface TestCase {
  id: string;
  query: string;
  // files that MUST be retrieved (recall)
  expectedFiles: string[];
  // functions/classes that SHOULD be in top results (precision)
  expectedChunks: string[];
  // optional: expected answer keywords
  answerKeywords?: string[];
}

export const TEST_CASES: TestCase[] = [
  {
    id: 'auth-login',
    query: 'how does user login work?',
    expectedFiles: ['auth.ts'],
    expectedChunks: ['AuthService', 'login'],
    answerKeywords: ['email', 'password', 'token'],
  },
  {
    id: 'auth-validation',
    query: 'how is the auth token validated?',
    expectedFiles: ['auth.ts'],
    expectedChunks: ['validateToken', 'decodeToken'],
    answerKeywords: ['token', 'expires', 'user'],
  },
  {
    id: 'auth-middleware',
    query: 'how does the authentication middleware work?',
    expectedFiles: ['auth.ts'],
    expectedChunks: ['createAuthMiddleware'],
    answerKeywords: ['authorization', 'header', 'Bearer'],
  },
  {
    id: 'user-create',
    query: 'how do I create a new user?',
    expectedFiles: ['user.ts'],
    expectedChunks: ['UserService', 'createUser'],
    answerKeywords: ['email', 'password', 'hash'],
  },
  {
    id: 'user-lookup',
    query: 'how to find a user by email?',
    expectedFiles: ['user.ts'],
    expectedChunks: ['getUserByEmail'],
    answerKeywords: ['email', 'user'],
  },
  {
    id: 'crypto-hash',
    query: 'how is password hashing done?',
    expectedFiles: ['crypto.ts'],
    expectedChunks: ['hash', 'verify'],
    answerKeywords: ['SHA-256', 'hash'],
  },
  {
    id: 'crypto-token',
    query: 'how to generate a random token?',
    expectedFiles: ['crypto.ts'],
    expectedChunks: ['generateToken'],
    answerKeywords: ['random', 'chars'],
  },
  {
    id: 'cross-module',
    query: 'how does auth use the user service?',
    expectedFiles: ['auth.ts', 'user.ts'],
    expectedChunks: ['AuthService', 'User'],
    answerKeywords: ['import', 'User'],
  },
  {
    id: 'exports',
    query: 'what does this module export?',
    expectedFiles: ['index.ts'],
    expectedChunks: ['AuthService', 'UserService'],
  },
];
