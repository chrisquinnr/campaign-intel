// Ingest worker.
// One pass: list active sources → resolve connector → poll → upsert documents
// → mark source polled. Per-source errors are isolated; a flaky feed never
// kills the run.
//
// Run via scripts/ingest-once.ts during dev. Hook to pg-boss or a cron in
// phase 1+ once we want continuous polling.

import { getConnector, hasConnector } from './connectors';
import { externalIdFor } from './normalize';
import { supabaseService, type DB } from '$lib/db/client';
import type { Tables, TablesInsert } from '$lib/db/client';
import type { Json } from '$lib/db/database.types';

export interface IngestSummary {
  startedAt: string;
  finishedAt: string;
  sourceResults: SourceResult[];
  totals: { fetched: number; inserted: number; skipped: number; errored: number };
}

export interface SourceResult {
  sourceId: string;
  label: string;
  fetched: number;
  inserted: number;
  skipped: number; // duplicates
  error?: string;
}

const BATCH_INSERT_SIZE = 200;

export async function runIngestOnce(opts: { onlySourceId?: string } = {}): Promise<IngestSummary> {
  const startedAt = new Date().toISOString();
  const db = supabaseService();
  const sources = await listActiveSources(db, opts.onlySourceId);

  const sourceResults: SourceResult[] = [];
  for (const source of sources) {
    sourceResults.push(await pollOneSource(db, source));
  }

  const totals = sourceResults.reduce(
    (acc, r) => {
      acc.fetched += r.fetched;
      acc.inserted += r.inserted;
      acc.skipped += r.skipped;
      if (r.error) acc.errored += 1;
      return acc;
    },
    { fetched: 0, inserted: 0, skipped: 0, errored: 0 }
  );

  return { startedAt, finishedAt: new Date().toISOString(), sourceResults, totals };
}

// ─────────────────────────────────────────────────────────────
// internals
// ─────────────────────────────────────────────────────────────

async function listActiveSources(db: DB, onlySourceId?: string): Promise<Tables<'sources'>[]> {
  const q = db.from('sources').select('*').eq('active', true);
  const { data, error } = onlySourceId ? await q.eq('id', onlySourceId) : await q;
  if (error) throw new Error(`Failed to list sources: ${error.message}`);
  return data ?? [];
}

async function pollOneSource(db: DB, source: Tables<'sources'>): Promise<SourceResult> {
  const result: SourceResult = {
    sourceId: source.id,
    label: source.label,
    fetched: 0,
    inserted: 0,
    skipped: 0
  };

  if (!hasConnector(source.kind)) {
    result.error = `no connector for kind=${source.kind}`;
    return result;
  }

  try {
    const connector = getConnector(source.kind);
    const since = source.last_polled_at ? new Date(source.last_polled_at) : null;
    // The connector takes the canonical Source type; the DB row is structurally
    // close enough that we can adapt it inline.
    const items = await connector.poll(
      {
        id: source.id,
        kind: source.kind,
        label: source.label,
        endpoint: source.endpoint,
        lang: source.lang,
        topics: source.topics,
        pollSeconds: source.poll_seconds,
        active: source.active,
        createdAt: source.created_at
      },
      since
    );
    result.fetched = items.length;

    if (items.length > 0) {
      const rows: TablesInsert<'documents'>[] = items.map((raw) => ({
        source_id: source.id,
        external_id: externalIdFor(raw),
        url: raw.url ?? null,
        author: raw.author ?? null,
        published_at: raw.publishedAt ?? null,
        title: raw.title ?? null,
        text: raw.text,
        lang: raw.lang ?? source.lang ?? 'und',
        raw_payload: (raw.rawPayload ?? null) as Json | null
      }));

      // Upsert in batches with ignoreDuplicates so unique-key conflicts
      // (source_id, external_id) silently no-op. Returning='representation'
      // lets us count actual inserts.
      for (let i = 0; i < rows.length; i += BATCH_INSERT_SIZE) {
        const batch = rows.slice(i, i + BATCH_INSERT_SIZE);
        const { data, error } = await db
          .from('documents')
          .upsert(batch, { onConflict: 'source_id,external_id', ignoreDuplicates: true })
          .select('id');
        if (error) throw new Error(`upsert failed: ${error.message}`);
        const inserted = data?.length ?? 0;
        result.inserted += inserted;
        result.skipped += batch.length - inserted;
      }
    }

    const { error: tickErr } = await db
      .from('sources')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('id', source.id);
    if (tickErr) throw new Error(`mark polled failed: ${tickErr.message}`);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

