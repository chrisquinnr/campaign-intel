// Reranker pass for top-k retrieval results.
// Phase 1: Claude-based rerank (no extra vendor). Phase 3: Cohere Rerank
// if quality demands it. See PLAN.md §3.7.

import type { RetrievalHit } from './hybrid';

export interface Reranker {
  rerank(query: string, hits: RetrievalHit[]): Promise<RetrievalHit[]>;
}

export const passthroughReranker: Reranker = {
  async rerank(_query, hits) {
    return hits;
  }
};
