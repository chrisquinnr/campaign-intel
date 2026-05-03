// Embedding client. text-embedding-3-small (1536 dims).
// See PLAN.md §3.4.
//
// Why text-embedding-3-small:
//   - cheap ($0.02 / 1M tokens; 100k docs ~ a couple of dollars)
//   - decent multilingual quality, good enough for phase 1 retrieval
//   - 1536-dim aligns with the documents.embedding column
//
// Batching strategy:
//   - OpenAI accepts up to 2048 inputs per call; we use 50 to keep payloads
//     small and per-batch retry cheap.
//   - Each input is truncated to ~24,000 chars (~6k tokens) to stay well
//     under the 8191 token-per-input cap. News articles rarely exceed this.

import OpenAI from 'openai';

export interface EmbedClient {
  /** Returns a single embedding. Caller writes to documents.embedding. */
  embed(text: string): Promise<number[]>;
  /** Batch embedding — inputs map 1:1 to outputs. */
  embedMany(texts: string[]): Promise<number[][]>;
  dim: number;
}

const MODEL = 'text-embedding-3-small';
const DIM = 1536;
const MAX_CHARS = 24_000;
const BATCH_SIZE = 50;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  _client = new OpenAI({ apiKey: key });
  return _client;
}

function prepare(text: string): string {
  // OpenAI rejects empty inputs; substitute a single space.
  const trimmed = text.trim();
  if (!trimmed) return ' ';
  return trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;
}

export const embedClient: EmbedClient = {
  dim: DIM,

  async embed(text: string): Promise<number[]> {
    const out = await this.embedMany([text]);
    return out[0];
  },

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map(prepare);
      const response = await client().embeddings.create({
        model: MODEL,
        input: batch
      });
      // OpenAI guarantees response.data is in input order.
      for (let j = 0; j < batch.length; j += 1) {
        results[i + j] = response.data[j].embedding;
      }
    }
    return results;
  }
};

/** Postgres pgvector text format: '[v1,v2,...,vN]'. supabase-js sends as text. */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
