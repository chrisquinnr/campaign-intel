// Enrichment worker — embed pass.
//
// Phase 1 scope: add embeddings to documents that don't have them yet, and
// drop a stub enrichments row recording the embedding dim. Sentiment, NER,
// topics, stance come in subsequent passes (PLAN §3.4) and live on the
// same enrichments row.
//
// Strategy:
//   1. Pull N oldest-unembedded documents (by published_at).
//   2. Build inputs: prefer "title — text" so the embedding captures the
//      headline; fall back to text alone when title is null.
//   3. Batch via embedClient.embedMany (50/call).
//   4. Update each documents.embedding with pgvector text format.
//   5. Upsert enrichments row (document_id, embedding_dim).
//
// Per-batch failure isolates: a flaky batch doesn't abort the rest.

import { embedClient, toPgVector } from './embed';
import { supabaseService, type DB } from '$lib/db/client';

export interface EnrichmentSummary {
  startedAt: string;
  finishedAt: string;
  attempted: number;
  embedded: number;
  failed: number;
  errors: string[];
}

const DEFAULT_LIMIT = 200;
const BATCH_SIZE = 50;

export async function runEnrichOnce(opts: { limit?: number } = {}): Promise<EnrichmentSummary> {
  const startedAt = new Date().toISOString();
  const db = supabaseService();
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const candidates = await listUnembedded(db, limit);
  const summary: EnrichmentSummary = {
    startedAt,
    finishedAt: '',
    attempted: candidates.length,
    embedded: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    try {
      await embedBatch(db, batch);
      summary.embedded += batch.length;
    } catch (err) {
      summary.failed += batch.length;
      summary.errors.push(err instanceof Error ? err.message : String(err));
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

async function listUnembedded(db: DB, limit: number): Promise<Candidate[]> {
  const { data, error } = await db
    .from('documents')
    .select('id, title, text')
    .is('embedding', null)
    .order('published_at', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`list unembedded failed: ${error.message}`);
  return data ?? [];
}

function inputFor(c: Candidate): string {
  return c.title ? `${c.title} — ${c.text}` : c.text;
}

async function embedBatch(db: DB, batch: Candidate[]): Promise<void> {
  const inputs = batch.map(inputFor);
  const vectors = await embedClient.embedMany(inputs);

  // Update documents.embedding row by row. supabase-js doesn't have a clean
  // "update many with different values" so this is N small writes; fine at
  // phase 1 volume. If/when this becomes hot, replace with a single UPDATE
  // ... FROM (VALUES ...) via execute_sql or a stored procedure.
  for (let i = 0; i < batch.length; i += 1) {
    const id = batch[i].id;
    const vec = toPgVector(vectors[i]);
    const { error: docErr } = await db
      .from('documents')
      .update({ embedding: vec })
      .eq('id', id);
    if (docErr) throw new Error(`document update ${id}: ${docErr.message}`);

    const { error: enrErr } = await db
      .from('enrichments')
      .upsert(
        { document_id: id, embedding_dim: embedClient.dim },
        { onConflict: 'document_id' }
      );
    if (enrErr) throw new Error(`enrichment upsert ${id}: ${enrErr.message}`);
  }
}
