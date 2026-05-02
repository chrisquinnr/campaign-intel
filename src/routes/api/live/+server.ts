/**
 * GET /api/live
 *
 * SSE endpoint that streams pushed questions to connected browser tabs.
 * The MAGI UI subscribes to this when idle; when the MCP server (or any
 * other caller) POSTs to /api/push, every connected tab receives the event
 * and can auto-start deliberation without a page reload.
 */

import { subscribe } from '$lib/server/broadcast';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
  const enc = new TextEncoder();

  const body = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (question: string) => {
        if (closed) return;
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ question })}\n\n`));
      };

      const unsub = subscribe(send);

      request.signal.addEventListener('abort', () => {
        unsub();
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
    },
    cancel() {
      // stream was closed by the runtime; nothing extra to do
    }
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
};
