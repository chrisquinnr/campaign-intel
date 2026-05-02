# MAGI Decision Support System

A SvelteKit + TypeScript multi-agent decision support system inspired by the MAGI terminal aesthetic.

## Stack

- SvelteKit full-stack with TypeScript
- Claude API via `@anthropic-ai/sdk`
- Multi-channel SSE via `sveltekit-sse`
- Node deployment via `@sveltejs/adapter-node`
- Stateless runtime (no database)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

`ANTHROPIC_API_KEY` in `.env`

3. Run dev server:

```bash
npm run dev
```

4. Type-check:

```bash
npm run check
```

## Architecture

### Decision Pipeline

1. Phase 1 `CLASSIFY`
- Detect yes/no style question

2. Phase 2 `INDEPENDENT ASSESSMENT`
- MELCHIOR, BALTHASAR, CASPER run in parallel
- Stream agent output to separate SSE channels

3. Phase 3 `CHALLENGE ROUND` (only on disagreement)
- Each agent sees the other two positions
- Single rebuttal or revision

4. Phase 4 `CONSENSUS`
- Priority: `error > no > conditional > yes`
- `no` acts as veto

### SSE Channels

- `phase`
- `classify`
- `agent:melchior`
- `agent:balthasar`
- `agent:casper`
- `challenge:melchior`
- `challenge:balthasar`
- `challenge:casper`
- `consensus`
- `error`

### Execute Pipeline

When consensus is executable (`yes` or `conditional`), the UI enables execute mode and POSTs to `/api/execute`.

Claude can request these tools:

- `run_command`
- `read_file`
- `write_file`

The server executes tools inside the workspace and returns a final summary.

## Notes

- If `ANTHROPIC_API_KEY` is missing, analysis calls return mock text, while tool execution endpoint returns an error.
- UI includes challenge pulse links, agent flicker, modal inspection, phase readout, and execute panel.
