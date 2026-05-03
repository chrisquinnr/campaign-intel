// Hybrid retrieval — BM25 + vector similarity, fused via reciprocal rank.
//
// Server-side fusion lives in the SQL function `hybrid_search` (migration
// 0003). This module:
//   - embeds the query string via OpenAI
//   - calls the RPC with whatever filters are set
//   - shapes the response into RetrievalHit[]
//
// Either branch can be skipped: pass query='' for vector-only, omit
// embedding via opts.bm25Only for text-only. The default is fused.

import { embedClient, toPgVector } from '$lib/enrich/embed';
import { supabaseService, type DB } from '$lib/db/client';

export interface RetrievalInput {
  query: string;
  topK: number;
  filters?: {
    publishedAfter?: string;
    publishedBefore?: string;
    topics?: string[];
    sourceIds?: string[];
  };
  /** Skip vector similarity (BM25 only). Saves an embedding call. */
  bm25Only?: boolean;
  /** Skip BM25 (vector only). Useful when the query is conceptual. */
  vectorOnly?: boolean;
  /** Inject a custom DB client (tests). Defaults to service-role. */
  db?: DB;
}

export interface RetrievalHit {
  id: string;
  sourceId: string;
  url: string | null;
  title: string | null;
  text: string;
  publishedAt: string | null;
  lang: string;
  bm25Score: number;
  vectorScore: number;
  fusedScore: number;
}

export async function hybridRetrieve(input: RetrievalInput): Promise<RetrievalHit[]> {
  const db = input.db ?? supabaseService();

  // Embedding is the expensive part — skip if BM25-only or query empty.
  let qEmbedding: string | undefined;
  if (!input.bm25Only && input.query.trim()) {
    const vec = await embedClient.embed(input.query);
    qEmbedding = toPgVector(vec);
  }

  const qText = input.vectorOnly ? undefined : input.query.trim() || undefined;

  if (!qText && !qEmbedding) {
    // Nothing to search on — caller should have caught this.
    return [];
  }

  const { data, error } = await db.rpc('hybrid_search', {
    q_text: qText,
    q_embedding: qEmbedding,
    match_count: input.topK,
    published_after: input.filters?.publishedAfter,
    published_before: input.filters?.publishedBefore,
    topic_filter: input.filters?.topics,
    source_ids: input.filters?.sourceIds
  });

  if (error) throw new Error(`hybrid_search failed: ${error.message}`);
  if (!data) return [];

  return data.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    url: r.url,
    title: r.title,
    text: r.text,
    publishedAt: r.published_at,
    lang: r.lang,
    bm25Score: r.bm25_score,
    vectorScore: r.vector_score,
    fusedScore: r.fused_score
  }));
}
