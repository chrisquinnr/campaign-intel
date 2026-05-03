// Enrichment worker.
//
// Runs three things idempotently:
//   1. Embedding (OpenAI text-embedding-3-small, batched 50/call)
//   2. Sentiment + topics + language classification (Claude Haiku, per-doc
//      with bounded concurrency)
//   3. Upsert enrichments row gathering all the above
//
// Handles two candidate populations in one run:
//   * needs-embed: documents.embedding IS NULL → embed AND classify
//   * needs-classify: embedding present but enrichments.sentiment_label NULL
//     (or no enrichments row) → classify only. This backfills earlier docs
//     that were embedded before the classifier landed.
//
// Per-batch and per-doc errors are isolated. A flaky classification call
// for one doc never blocks embeddings or other docs in the batch.

import { embedClient, toPgVector } from './embed';
import { classify, type ClassificationResult, type TaxonomyEntry } from './sentiment';
import { supabaseService, type DB } from '$lib/db/client';
import type { TablesInsert } from '$lib/db/client';
import type { Json } from '$lib/db/database.types';

export interface EnrichmentSummary {
  startedAt: string;
  finishedAt: string;
  attempted: number;
  embedded: number;
  classified: number;
  backfilled: number; // classify-only on already-embedded docs
  failed: number;
  errors: string[];
}

const DEFAULT_LIMIT = 200;
const BATCH_SIZE = 50;
const CLASSIFY_CONCURRENCY = 5;

export async function runEnrichOnce(opts: { limit?: number } = {}): Promise<EnrichmentSummary> {
  const startedAt = new Date().toISOString();
  const db = supabaseService();
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const taxonomy = await loadTaxonomy(db);

  const summary: EnrichmentSummary = {
    startedAt,
    finishedAt: '',
    attempted: 0,
    embedded: 0,
    classified: 0,
    backfilled: 0,
    failed: 0,
    errors: []
  };

  // Pass 1: docs that need embedding (and classification).
  const needsEmbed = await listNeedsEmbed(db, limit);
  summary.attempted += needsEmbed.length;
  for (let i = 0; i < needsEmbed.length; i += BATCH_SIZE) {
    const batch = needsEmbed.slice(i, i + BATCH_SIZE);
    try {
      const counts = await processNewBatch(db, batch, taxonomy);
      summary.embedded += counts.embedded;
      summary.classified += counts.classified;
    } catch (err) {
      summary.failed += batch.length;
      summary.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Pass 2: classify-only backfill, capped at remaining limit.
  const remaining = Math.max(0, limit - needsEmbed.length);
  if (remaining > 0) {
    const needsClassify = await listNeedsClassify(db, remaining);
    summary.attempted += needsClassify.length;
    for (let i = 0; i < needsClassify.length; i += BATCH_SIZE) {
      const batch = needsClassify.slice(i, i + BATCH_SIZE);
      try {
        const counts = await processBackfillBatch(db, batch, taxonomy);
        summary.backfilled += counts.classified;
      } catch (err) {
        summary.failed += batch.length;
        summary.errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

// ─────────────────────────────────────────────────────────────
// internals
// ─────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  title: string | null;
  text: string;
}

async function listNeedsEmbed(db: DB, limit: number): Promise<Candidate[]> {
  const { data, error } = await db
    .from('documents')
    .select('id, title, text')
    .is('embedding', null)
    .order('published_at', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`list needs-embed failed: ${error.message}`);
  return data ?? [];
}

/** Documents already embedded but missing classification.
 *
 * supabase-js can't express "left join enrichments where sentiment_label is
 * null OR no row exists" cleanly, so we run two queries and union the ids.
 */
async function listNeedsClassify(db: DB, limit: number): Promise<Candidate[]> {
  // Subquery 1: documents that have an enrichments row but null sentiment.
  const { data: stale, error: staleErr } = await db
    .from('enrichments')
    .select('document_id')
    .is('sentiment_label', null)
    .limit(limit);
  if (staleErr) throw new Error(`list stale enrichments failed: ${staleErr.message}`);
  const staleIds = (stale ?? []).map((r) => r.document_id);

  // Subquery 2: embedded documents that have no enrichments row at all.
  // PostgREST trick: `enrichments` foreign-table NULL filter via inner join.
  // Simpler approach: pull recent embedded docs and let the upsert handle
  // the no-row case naturally.
  let candidateIds = staleIds;
  if (candidateIds.length < limit) {
    const remaining = limit - candidateIds.length;
    const excludeFilter = candidateIds.length > 0 ? `(${candidateIds.join(',')})` : '(00000000-0000-0000-0000-000000000000)';
    const { data: orphans, error: orphErr } = await db
      .from('documents')
      .select('id, enrichments(document_id)')
      .not('embedding', 'is', null)
      .order('published_at', { ascending: true, nullsFirst: false })
      .limit(remaining * 2); // overshoot, filter client-side
    if (orphErr) throw new Error(`list orphan documents failed: ${orphErr.message}`);
    const orphanIds = (orphans ?? [])
      .filter((r) => !r.enrichments || (Array.isArray(r.enrichments) && r.enrichments.length === 0))
      .map((r) => r.id)
      .filter((id) => !candidateIds.includes(id))
      .slice(0, remaining);
    candidateIds = [...candidateIds, ...orphanIds];
    void excludeFilter;
  }

  if (candidateIds.length === 0) return [];

  const { data, error } = await db
    .from('documents')
    .select('id, title, text')
    .in('id', candidateIds)
    .order('published_at', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`list needs-classify failed: ${error.message}`);
  return data ?? [];
}

async function loadTaxonomy(db: DB): Promise<TaxonomyEntry[]> {
  const { data, error } = await db
    .from('taxonomy_topics')
    .select('slug, label, description')
    .eq('active', true);
  if (error) throw new Error(`load taxonomy failed: ${error.message}`);
  return data ?? [];
}

function inputFor(c: Candidate): string {
  return c.title ? `${c.title} — ${c.text}` : c.text;
}

interface BatchCounts {
  embedded: number;
  classified: number;
}

async function processNewBatch(
  db: DB,
  batch: Candidate[],
  taxonomy: TaxonomyEntry[]
): Promise<BatchCounts> {
  const inputs = batch.map(inputFor);
  const vectors = await embedClient.embedMany(inputs);

  let embedded = 0;
  for (let i = 0; i < batch.length; i += 1) {
    const id = batch[i].id;
    const vec = toPgVector(vectors[i]);
    const { error } = await db.from('documents').update({ embedding: vec }).eq('id', id);
    if (error) {
      console.error(`embedding update ${id}: ${error.message}`);
      continue;
    }
    embedded += 1;
  }

  const classifications = await classifyConcurrent(batch, taxonomy, CLASSIFY_CONCURRENCY);
  const classified = await writeEnrichments(db, batch, classifications, /* withDim */ true);
  return { embedded, classified };
}

async function processBackfillBatch(
  db: DB,
  batch: Candidate[],
  taxonomy: TaxonomyEntry[]
): Promise<BatchCounts> {
  const classifications = await classifyConcurrent(batch, taxonomy, CLASSIFY_CONCURRENCY);
  // embedding_dim already set on the row; preserve it via upsert ignore.
  const classified = await writeEnrichments(db, batch, classifications, /* withDim */ true);
  return { embedded: 0, classified };
}

async function writeEnrichments(
  db: DB,
  batch: Candidate[],
  classifications: (ClassificationResult | null)[],
  withDim: boolean
): Promise<number> {
  let classified = 0;
  for (let i = 0; i < batch.length; i += 1) {
    const doc = batch[i];
    const c = classifications[i];

    const row: TablesInsert<'enrichments'> = { document_id: doc.id };
    if (withDim) row.embedding_dim = embedClient.dim;
    if (c) {
      row.sentiment_label = c.sentiment.label;
      row.sentiment_score = c.sentiment.score;
      row.sentiment_conf = c.sentiment.confidence;
      row.emotion = (c.emotion ?? null) as Json | null;
      row.detected_lang = c.detectedLang;
      row.topics = c.topics;
      classified += 1;
    }

    const { error } = await db
      .from('enrichments')
      .upsert(row, { onConflict: 'document_id' });
    if (error) console.error(`enrichment upsert ${doc.id}: ${error.message}`);
  }
  return classified;
}

async function classifyConcurrent(
  batch: Candidate[],
  taxonomy: TaxonomyEntry[],
  concurrency: number
): Promise<(ClassificationResult | null)[]> {
  const results: (ClassificationResult | null)[] = new Array(batch.length).fill(null);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
    while (cursor < batch.length) {
      const idx = cursor;
      cursor += 1;
      const doc = batch[idx];
      try {
        results[idx] = await classify({ text: doc.text, title: doc.title, taxonomy });
      } catch (err) {
        console.error(`classify ${doc.id}: ${err instanceof Error ? err.message : err}`);
        results[idx] = null;
      }
    }
  });

  await Promise.all(workers);
  return results;
}
