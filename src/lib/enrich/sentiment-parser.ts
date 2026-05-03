// Pure parsing/validation for the Claude classifier response.
// Split out from sentiment.ts so the parser can be tested without pulling
// in the Claude SDK or SvelteKit module aliases.

export type SentimentLabel = 'positive' | 'negative' | 'neutral' | 'mixed';

export interface ClassificationResult {
  sentiment: {
    label: SentimentLabel;
    score: number;
    confidence: number;
  };
  emotion: Record<string, number> | null;
  detectedLang: string | null;
  topics: string[];
}

export interface TaxonomyEntry {
  slug: string;
  label: string;
  description: string | null;
}

const VALID_LABELS: SentimentLabel[] = ['positive', 'negative', 'neutral', 'mixed'];

function stripFences(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function asLabel(v: unknown): SentimentLabel {
  return typeof v === 'string' && (VALID_LABELS as string[]).includes(v)
    ? (v as SentimentLabel)
    : 'neutral';
}

function asTopics(v: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === 'string' && allowed.has(s));
}

function asEmotion(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' && !Number.isNaN(val)) {
      out[k] = clamp(val, 0, 1);
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Parse Claude's JSON response into a typed result. Defensive — Haiku
 * occasionally drops fields or formats differently. We never let one bad
 * response abort an enrichment run. */
export function parseClassification(raw: string, taxonomy: TaxonomyEntry[]): ClassificationResult {
  const allowed = new Set(taxonomy.map((t) => t.slug));
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(stripFences(raw)) as Record<string, unknown>;
  } catch {
    // fall through; defaults below kick in
  }

  return {
    sentiment: {
      label: asLabel(parsed.sentiment_label),
      score: clamp(Number(parsed.sentiment_score ?? 0), -1, 1),
      confidence: clamp(Number(parsed.sentiment_confidence ?? 0), 0, 1)
    },
    emotion: asEmotion(parsed.emotion),
    detectedLang:
      typeof parsed.detected_lang === 'string' && parsed.detected_lang.length <= 8
        ? parsed.detected_lang
        : null,
    topics: asTopics(parsed.topics, allowed)
  };
}
