// Sentiment + emotion enrichment.
// Calls into the Python sidecar (services/enrich-py) running XLM-RoBERTa
// for multilingual coverage. Claude is fallback for ambiguous cases.
// See PLAN.md §3.4.

import type { EnrichmentResult } from '$lib/types';

export interface SentimentClient {
  classify(text: string, lang?: string): Promise<{
    label: EnrichmentResult['sentiment']['label'];
    score: number;
    confidence: number;
    emotion?: Record<string, number>;
  }>;
}

// TODO(phase-1): implement HTTP client to services/enrich-py. Until then,
// callers can substitute a mock for tests.
export const sentimentClient: SentimentClient = {
  async classify() {
    return { label: 'neutral', score: 0, confidence: 0 };
  }
};
