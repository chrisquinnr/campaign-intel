// Hybrid retrieval: BM25 (Postgres FTS) + vector similarity, fused via
// reciprocal rank. Used by the query endpoint and by the briefing
// retriever. See PLAN.md §3.7.

import type { Document } from '$lib/types';

export interface RetrievalInput {
  query: string;
  topK: number;
  /** optional time + topic filters */
  filters?: {
    publishedAfter?: string;
    publishedBefore?: string;
    topics?: string[];
    sourceIds?: string[];
  };
}

export interface RetrievalHit {
  document: Document;
  bm25Score: number;
  vectorScore: number;
  fusedScore: number;
}

export async function hybridRetrieve(_input: RetrievalInput): Promise<RetrievalHit[]> {
  // TODO(phase-1): wire up Postgres FTS + pgvector queries.
  return [];
}
