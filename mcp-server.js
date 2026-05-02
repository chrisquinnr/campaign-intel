/**
 * MAGI MCP Server
 *
 * Exposes the MAGI deliberation system as a Claude tool via the Model Context
 * Protocol. Register this with Claude Desktop or claude.ai MCP settings so any
 * Claude chat session can call `magi_deliberate` to consult the MAGI.
 *
 * Run:   node mcp-server.js          (or: npm run mcp)
 * Env:   MAGI_URL   override server address (default: http://localhost:5173)
 *
 * The MAGI SvelteKit server must be running separately (npm run dev / npm start).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const MAGI_URL = process.env.MAGI_URL?.replace(/\/$/, '') ?? 'http://localhost:5173';

const server = new Server(
  { name: 'magi', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── Tool registry ────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'magi_deliberate',
      description:
        'Submit a question or decision to the MAGI supercomputer for multi-agent deliberation. ' +
        'Three specialist Claude agents assess independently — MELCHIOR-1 (scientist/technical), ' +
        'BALTHASAR-2 (guardian/relational), CASPER-3 (arbiter/strategic) — then challenge each ' +
        "other's reasoning if they disagree, and reach a consensus verdict. " +
        'ARTABAN-4 provides an ethical review when execution is approved. ' +
        'Returns each agent\'s full reasoning, the consensus (yes/no/conditional), and ' +
        "Artaban's ruling. Use this when you need a rigorous, multi-perspective decision on " +
        'any consequential question.',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question or decision to deliberate on. Be specific.',
          },
        },
        required: ['question'],
      },
    },
  ],
}));

// ── Tool handler ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'magi_deliberate') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const question = String(request.params.arguments?.question ?? '').trim();
  if (!question) {
    return { content: [{ type: 'text', text: 'Error: question is required' }], isError: true };
  }

  // ── Step 1: Push the question to any open MAGI browser windows ────────────
  // The /api/live SSE channel delivers it instantly; connected tabs start the
  // live deliberation without any user interaction. If no tab is open, we
  // fall back to opening a new browser window automatically.
  let windowStatus = 'no browser window opened';
  try {
    const pushRes = await fetch(`${MAGI_URL}/api/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(5_000),
    });
    if (pushRes.ok) {
      const { subscribers = 0 } = await pushRes.json().catch(() => ({}));
      if (subscribers > 0) {
        windowStatus = `pushed to ${subscribers} open window${subscribers === 1 ? '' : 's'}`;
      } else {
        // No tab is open — pop one in the default browser so the user can watch live.
        const { execFile } = await import('child_process');
        const url = `${MAGI_URL}/?question=${encodeURIComponent(question)}`;
        if (process.platform === 'win32') {
          execFile('cmd', ['/c', 'start', url]);
        } else if (process.platform === 'darwin') {
          execFile('open', [url]);
        } else {
          execFile('xdg-open', [url]);
        }
        windowStatus = 'opened new browser window';
      }
    }
  } catch {
    // Push failure is non-fatal — the deliberation result still comes from /api/ask.
    windowStatus = 'MAGI push unavailable (server may be starting)';
  }

  // ── Step 2: Run deliberation via /api/ask (fast path, no streaming delay) ──
  let data;
  try {
    const res = await fetch(`${MAGI_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return {
        content: [{ type: 'text', text: `MAGI returned ${res.status}: ${text}` }],
        isError: true,
      };
    }

    data = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text:
            `MAGI system unreachable at ${MAGI_URL}\n` +
            `Error: ${msg}\n\n` +
            `Make sure the MAGI server is running:\n` +
            `  cd /Users/chris/Sites/magi && npm run dev`,
        },
      ],
      isError: true,
    };
  }

  // ── Format result ──────────────────────────────────────────────────────────

  const { consensus, answers = [], artaban } = data;

  const statusIcon = { yes: '✅', no: '❌', conditional: '⚠️', info: 'ℹ️', error: '💀' };
  const agentLabel = { melchior: 'MELCHIOR-1', balthasar: 'BALTHASAR-2', casper: 'CASPER-3' };

  const lines = [
    '╔══════════════════════════════════════════════════╗',
    '║            MAGI DELIBERATION COMPLETE            ║',
    '╚══════════════════════════════════════════════════╝',
    '',
    `QUESTION: ${question}`,
    '',
  ];

  for (const a of answers) {
    const icon = statusIcon[a.finalStatus] ?? '•';
    const name = agentLabel[a.agent] ?? a.agent.toUpperCase();

    // Show position change if the agent shifted during the challenge round
    const positionChanged = a.status && a.finalStatus && a.status !== a.finalStatus;
    const statusLine = positionChanged
      ? `${name}  ${icon} [${a.status.toUpperCase()} → ${a.finalStatus.toUpperCase()}]`
      : `${name}  ${icon} [${(a.finalStatus ?? a.status).toUpperCase()}]`;

    lines.push(statusLine);

    // Split reasoning into initial assessment and challenge response (if present)
    const fullReasoning = (a.reasoning ?? '').trim();
    const challengeSplit = fullReasoning.indexOf('\n\n[Challenge]\n');
    if (challengeSplit !== -1) {
      const initial = fullReasoning.slice(0, challengeSplit).trim();
      const challenge = fullReasoning.slice(challengeSplit + '\n\n[Challenge]\n'.length).trim();
      lines.push(`  Initial: ${initial}`);
      lines.push(`  After debate: ${challenge}`);
    } else {
      lines.push(`  ${fullReasoning}`);
    }
    lines.push('');
  }

  const cIcon = statusIcon[consensus?.status] ?? '•';
  const execLabel = consensus?.canExecute ? 'execution approved' : 'execution blocked';
  lines.push(`CONSENSUS ───── ${cIcon} ${(consensus?.status ?? 'unknown').toUpperCase()}  (${execLabel})`);

  if (artaban) {
    if (artaban.verdict === 'approved') {
      lines.push('ARTABAN-4  ✅ [APPROVED]');
    } else if (artaban.verdict === 'yes') {
      lines.push('ARTABAN-4  ✅ [DECIDED: YES] — tie-breaking ethical vote');
      if (artaban.concern) lines.push(`  Concern noted: ${artaban.concern}`);
      if (artaban.reasoning) lines.push(`  ${artaban.reasoning.trim()}`);
    } else if (artaban.verdict === 'no') {
      lines.push('ARTABAN-4  ❌ [DECIDED: NO] — tie-breaking ethical vote');
      if (artaban.concern) lines.push(`  Concern: ${artaban.concern}`);
      if (artaban.reasoning) lines.push(`  ${artaban.reasoning.trim()}`);
    } else {
      const vIcon = artaban.verdict === 'escalate' ? '🚫' : '⏸️';
      lines.push(`ARTABAN-4  ${vIcon} [${artaban.verdict.toUpperCase()}]`);
      if (artaban.concern) lines.push(`  Concern: ${artaban.concern}`);
      if (artaban.reasoning) lines.push(`  ${artaban.reasoning.trim()}`);
    }
  }

  lines.push('');
  lines.push(`Browser: ${windowStatus}`);
  lines.push(`Watch:   ${MAGI_URL}/?question=${encodeURIComponent(question)}`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
