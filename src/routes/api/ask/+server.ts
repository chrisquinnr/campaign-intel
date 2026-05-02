/**
 * POST /api/ask
 *
 * Synchronous (non-streaming) alternative to /api/query.
 * Runs the full MAGI pipeline and returns the deliberation result as JSON
 * once all agents, consensus, and Artaban (if applicable) have completed.
 *
 * Intended for programmatic callers: CLI tools, Claude skills, scripts, etc.
 * The streaming delay used for the SSE UI is bypassed (streamDelay: 0) so
 * the response arrives as fast as the underlying Claude calls allow.
 *
 * Body: { "question": string }
 *
 * Response:
 * {
 *   "isYesNo": boolean,
 *   "consensus": { "status": string, "canExecute": boolean },
 *   "answers": [{ "agent": string, "status": string, "finalStatus": string, "reasoning": string }],
 *   "artaban": { "verdict": string, "concern": string, "reasoning": string } | null
 * }
 */

import { json, error } from '@sveltejs/kit';
import { runPipeline } from '$lib/server/pipeline';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const question = (body?.question ?? '').trim();

  if (!question) {
    return error(400, 'question is required');
  }

  // Capture Artaban output — it isn't included in PipelineResult directly.
  let artaban: { verdict: string; concern: string; reasoning: string } | null = null;
  let artabanReasoning = '';

  const io = {
    emit(channel: string, payload: Record<string, unknown>) {
      if (channel === 'artaban:verdict') {
        artaban = {
          verdict: String(payload.verdict ?? 'approved'),
          concern: String(payload.concern ?? ''),
          reasoning: ''
        };
      } else if (channel === 'artaban:reasoning' && payload.delta) {
        artabanReasoning += String(payload.delta);
      }
    },
    streamDelay: 0 // skip artificial chunking delays — this is a REST caller
  };

  try {
    const result = await runPipeline(question, io);
    if (artaban) (artaban as { reasoning: string }).reasoning = artabanReasoning;
    return json({ ...result, artaban });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(500, message);
  }
};
