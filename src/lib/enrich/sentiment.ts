// Sentiment + topic + language classifier.
//
// Phase 1 implementation: Claude Haiku (claude-haiku-4-5). One call per
// document returns sentiment, emotion breakdown, detected language, and
// topic classification against the Avaaz taxonomy. Multilingual.
//
// Long-term path (PLAN §3.4): swap to a Python sidecar running XLM-RoBERTa
// for sentiment + emotion at lower per-call cost, keep Claude as fallback
// for ambiguous items and the topic classifier. The interface here stays
// stable so the swap is a one-file change.
//
// Cost rough-cut: Haiku at ~$1/M input + $5/M output. Avg news doc is
// ~500 input + ~80 output tokens → ~$0.0009/doc. 1k docs ≈ $0.90.

import { callClaudeText } from '$lib/server/claude';
import { SlidingWindowLimiter } from '$lib/util/rate-limit';
import {
  parseClassification,
  type ClassificationResult,
  type SentimentLabel,
  type TaxonomyEntry
} from './sentiment-parser';

export type { ClassificationResult, SentimentLabel, TaxonomyEntry };
export { parseClassification };

// ────────────────────────────────────────────────────────────
// Rate limiter for the Haiku endpoint.
//
// Anthropic Tier 1 caps Haiku at 50 RPM. We default to 45 to leave headroom
// for retries and concurrent processes. Override with ANTHROPIC_HAIKU_RPM
// when on a higher tier or when running multiple worker processes you want
// to share an in-process budget across (note: this limiter is per-process).
// ────────────────────────────────────────────────────────────

function readHaikuRpm(): number {
  const raw = process.env.ANTHROPIC_HAIKU_RPM;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 45;
}

const haikuLimiter = new SlidingWindowLimiter(readHaikuRpm(), 60_000);

export interface ClassifyInput {
  text: string;
  title?: string | null;
  taxonomy: TaxonomyEntry[];
}

const HAIKU_MODEL = 'claude-haiku-4-5';
const MAX_TEXT_CHARS = 8000;

function buildPrompt(input: ClassifyInput): string {
  const taxonomyList = input.taxonomy
    .map((t) => `  - ${t.slug}: ${t.label}${t.description ? ` — ${t.description}` : ''}`)
    .join('\n');

  const truncated =
    input.text.length > MAX_TEXT_CHARS ? input.text.slice(0, MAX_TEXT_CHARS) + '…' : input.text;

  return [
    'You are classifying a news or social-media item for an advocacy intelligence system.',
    'Read the item in its original language and respond in JSON only.',
    '',
    'Tasks:',
    '1. Sentiment toward the events and actors described (not the writer\'s tone).',
    '2. Emotion breakdown across anger, fear, joy, sadness (each 0..1, may sum >1).',
    '3. Detect the language as ISO 639-1.',
    '4. Topic classification against the Avaaz taxonomy. Return ONLY slugs that fit;',
    '   if nothing fits, return an empty array.',
    '',
    'Taxonomy:',
    taxonomyList || '  (empty)',
    '',
    'Item:',
    `TITLE: ${input.title ?? '(no title)'}`,
    `TEXT: ${truncated}`,
    '',
    'Respond with ONLY this JSON object, no markdown, no preamble:',
    '{',
    '  "sentiment_label": "positive"|"negative"|"neutral"|"mixed",',
    '  "sentiment_score": -1..1,',
    '  "sentiment_confidence": 0..1,',
    '  "emotion": { "anger": 0..1, "fear": 0..1, "joy": 0..1, "sadness": 0..1 },',
    '  "detected_lang": "en"|"ar"|"fa"|"fr"|"es"|"de"|"...",',
    '  "topics": ["slug", "..."]',
    '}'
  ].join('\n');
}

export async function classify(input: ClassifyInput): Promise<ClassificationResult> {
  // Pace through the Haiku rate limiter. Concurrent callers queue here and
  // exit at no more than ANTHROPIC_HAIKU_RPM per minute. The Anthropic SDK
  // also retries on 429 with retry-after, so stragglers that slip through
  // (e.g. on token-per-minute limits) still self-recover.
  await haikuLimiter.acquire();

  const raw = await callClaudeText({
    model: HAIKU_MODEL,
    system:
      'You are a precise multilingual classifier. Read carefully, classify accurately, ' +
      'return only valid JSON. Never invent topics outside the provided taxonomy.',
    prompt: buildPrompt(input),
    maxTokens: 400,
    temperature: 0.1
  });
  return parseClassification(raw, input.taxonomy);
}

// ────────────────────────────────────────────────────────────
// Legacy SentimentClient interface kept for backwards compatibility.
// ────────────────────────────────────────────────────────────
export interface SentimentClient {
  classify(text: string, lang?: string): Promise<{
    label: SentimentLabel;
    score: number;
    confidence: number;
    emotion?: Record<string, number>;
  }>;
}

export const sentimentClient: SentimentClient = {
  async classify(text: string) {
    const result = await classify({ text, taxonomy: [] });
    return {
      label: result.sentiment.label,
      score: result.sentiment.score,
      confidence: result.sentiment.confidence,
      emotion: result.emotion ?? undefined
    };
  }
};

export const SENTIMENT_MODEL = HAIKU_MODEL;
