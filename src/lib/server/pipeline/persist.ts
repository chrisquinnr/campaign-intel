// Briefing persistence + run lifecycle.
//
// Wraps runBriefingPipeline so callers (CLI, future scheduler, future
// API route) get a single function that records the run, persists the
// briefing, and returns ids for both. Errors are surfaced AND recorded.

import {
  runBriefingPipeline,
  type BriefingEmitter,
  type BriefingInput
} from './briefing';
import { supabaseService, type DB } from '$lib/db/client';
import type { Json } from '$lib/db/database.types';

export interface PersistResult {
  runId: string;
  briefingId: string;
  /** echo of the briefing for downstream rendering */
  briefing: {
    headline: string;
    summary: string;
    sections: Array<{ heading: string; body: string; citations: string[] }>;
    conscienceVerdict: 'approved' | 'revise' | 'block';
    conscienceConcerns: string[];
    conscienceNotes: string;
    evidenceCount: number;
  };
}

const NOOP_EMITTER: BriefingEmitter = { emit: () => {}, streamDelay: 0 };

export async function runAndPersistBriefing(
  input: BriefingInput,
  opts: { db?: DB; emitter?: BriefingEmitter } = {}
): Promise<PersistResult> {
  const db = opts.db ?? supabaseService();
  const emitter = opts.emitter ?? NOOP_EMITTER;

  // Phase 0: open run row.
  const { data: runRow, error: runErr } = await db
    .from('runs')
    .insert({
      kind: 'briefing',
      status: 'running',
      input: input as unknown as Json
    })
    .select('id')
    .single();
  if (runErr || !runRow) {
    throw new Error(`failed to open run: ${runErr?.message ?? 'no id returned'}`);
  }
  const runId = runRow.id;

  try {
    const { briefing, pack } = await runBriefingPipeline(input, emitter);

    // Persist briefing first so we have a stable id to point the run at.
    const { data: briefingRow, error: bErr } = await db
      .from('briefings')
      .insert({
        audience: briefing.audience,
        cadence: briefing.cadence,
        topic: briefing.topic,
        window_start: briefing.windowStart,
        window_end: briefing.windowEnd,
        headline: briefing.headline,
        summary: briefing.summary,
        sections: briefing.sections as unknown as Json,
        trend_ids: briefing.trendIds,
        lens_findings: briefing.lensFindings as unknown as Json,
        conscience_verdict: briefing.conscienceReview.verdict,
        conscience_concerns: briefing.conscienceReview.concerns,
        conscience_notes: briefing.conscienceReview.notes,
        run_id: runId
      })
      .select('id')
      .single();
    if (bErr || !briefingRow) {
      throw new Error(`failed to persist briefing: ${bErr?.message ?? 'no id returned'}`);
    }

    // Close run row with summary + lens findings (so the deliberation is
    // inspectable later, separate from the briefing itself).
    const { error: closeErr } = await db
      .from('runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        lens_findings: briefing.lensFindings as unknown as Json,
        output: {
          briefing_id: briefingRow.id,
          headline: briefing.headline,
          evidence_count: pack.documents.length,
          conscience_verdict: briefing.conscienceReview.verdict
        } as unknown as Json
      })
      .eq('id', runId);
    if (closeErr) {
      // Run is functionally complete; log but don't abort.
      console.error(`runs close failed (non-fatal): ${closeErr.message}`);
    }

    return {
      runId,
      briefingId: briefingRow.id,
      briefing: {
        headline: briefing.headline,
        summary: briefing.summary,
        sections: briefing.sections,
        conscienceVerdict: briefing.conscienceReview.verdict,
        conscienceConcerns: briefing.conscienceReview.concerns,
        conscienceNotes: briefing.conscienceReview.notes,
        evidenceCount: pack.documents.length
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: message
      })
      .eq('id', runId);
    throw err;
  }
}
