// Claude integration for response generation
// TODO: implement context construction and streaming

import type { CodeChunk } from '../ast';

export interface GenerateOptions {
  query: string;
  chunks: CodeChunk[];
  stream?: boolean;
}

export interface Citation {
  filepath: string;
  startLine: number;
  endLine: number;
}

export interface GenerateResult {
  response: string;
  citations: Citation[];
  tokensUsed: number;
}

export async function generate(_options: GenerateOptions): Promise<GenerateResult> {
  throw new Error('Not implemented');
}
