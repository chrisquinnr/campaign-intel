/**
 * POST /api/push
 *
 * Accepts { "question": string } and broadcasts it to all browser tabs
 * currently subscribed to /api/live. Returns the number of tabs that received
 * the push so callers (e.g. the MCP server) can decide whether to open a new
 * browser window as a fallback.
 *
 * Body:    { "question": string }
 * Returns: { "ok": true, "subscribers": number }
 */

import { json } from '@sveltejs/kit';
import { broadcast, subscriberCount } from '$lib/server/broadcast';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const question = typeof (body as any)?.question === 'string'
    ? (body as any).question.trim()
    : '';

  if (!question) {
    return new Response('missing question', { status: 400 });
  }

  broadcast(question);

  return json({ ok: true, subscribers: subscriberCount() });
};
