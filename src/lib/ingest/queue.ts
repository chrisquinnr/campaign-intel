// Ingest + enrichment job queue.
// pg-boss (Postgres-backed) chosen for MVP — same Postgres as Supabase, no
// extra Redis dependency. See PLAN.md §3.2.
//
// Phase 0: stub. Wire pg-boss client once Supabase is provisioned.

export type JobName =
  | 'ingest.poll'        // payload: { sourceId }
  | 'ingest.fetch'       // payload: { sourceId, url } — single-item retry
  | 'enrich.document'    // payload: { documentId }
  | 'trend.detect'       // payload: { windowSeconds }
  | 'briefing.generate'; // payload: { topic, audience, cadence, window }

export interface JobEnvelope<T = unknown> {
  name: JobName;
  data: T;
  /** ISO timestamp; pg-boss handles delay scheduling */
  startAfter?: string;
  /** retry budget */
  retryLimit?: number;
}

// TODO(phase-0): export `enqueue()` + `worker()` once pg-boss is added.
// For now, log-and-noop so the rest of the code can import without crashing.
export async function enqueue<T>(envelope: JobEnvelope<T>): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[queue:stub] would enqueue', envelope.name, envelope.data);
}
