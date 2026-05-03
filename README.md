# magi-sent

Sentiment and trend analysis engine for Avaaz, built on the magi multi-agent foundation. Aggregates media and social signals, surfaces emergent narratives, generates intel briefings for campaigners and leadership.

Architecture and roadmap live in [PLAN.md](./PLAN.md). PLAN is the source of truth for scope and phasing decisions.

## Status

Phase 0 foundation done. Ingest + embeddings + classification + hybrid retrieval are live.

| Layer | State |
|---|---|
| Schema (Supabase) | applied: 0001 init, 0002 RSS sources, 0003 hybrid_search |
| Ingest (RSS) | working, 19 sources seeded (15 active) |
| Embeddings | OpenAI text-embedding-3-small, 1536 dims |
| Classifier | Claude Haiku, multilingual sentiment + topics + language |
| Retrieval | BM25 + vector fused via reciprocal rank, server-side function |
| Briefing pipeline | scaffolded, not yet wired to retrieval |
| Trend detection | stubbed |
| UI | original MAGI shell still in place, not yet retargeted |

## Quick start

### 1. Environment

Copy `.env.example` to `.env` and fill in:

- `SUPABASE_URL` (already set in the example)
- `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from the [Supabase dashboard](https://supabase.com/dashboard/project/yefoofucailpzrasmzeh/settings/api)
- `ANTHROPIC_API_KEY` for the lens agents and the Haiku classifier
- `OPENAI_API_KEY` for embeddings (text-embedding-3-small only)

The service role key bypasses RLS. Server-side only, never ship to a browser.

### 2. Install

```bash
npm install
```

### 3. Run the dev server (legacy MAGI UI)

```bash
npm run dev
```

This still points at the original yes/no decision pipeline. The sentiment surfaces are wired through CLI scripts for now while the pipeline matures.

## Operating commands

All commands are CLI scripts using the same Supabase + AI clients the eventual long-running workers will run on.

### Ingest

```bash
npm run ingest:once
```

Polls every active source, normalises items, dedupes against existing documents, inserts new rows. Updates `sources.last_polled_at`. Per-source errors do not stop the run.

Filter to a single source while debugging:

```bash
npm run ingest:once -- --source <source-uuid>
```

Validate connector output without writing to the DB:

```bash
npm run rss:check
```

### Enrich

```bash
npm run enrich:once
```

For each document with `embedding IS NULL`, oldest first:

1. Embeds via OpenAI text-embedding-3-small (batched 50/call).
2. Classifies via Claude Haiku: sentiment, emotion breakdown, language, topics from the Avaaz taxonomy. Concurrency capped at 5 parallel calls.
3. Upserts the `enrichments` row.

Throttle while testing:

```bash
npm run enrich:once -- --limit 50
```

Per-document failures are isolated. A flaky classifier call does not block embedding.

### Query

```bash
npm run query -- "iran nuclear deal"
```

Embeds the query, runs `hybrid_search` (BM25 + vector + RRF), prints the top hits with both raw scores and the fused score.

Flags:

- `--topic sudan` (repeatable)
- `--since 2026-04-01`
- `--top 10`
- `--bm25` to skip the vector branch
- `--vec` to skip BM25

## Database

Project: `magi-sent`, eu-west-1, Postgres 17. Dashboard: [supabase.com/dashboard/project/yefoofucailpzrasmzeh](https://supabase.com/dashboard/project/yefoofucailpzrasmzeh).

Migrations live under `infra/supabase/migrations/`. Apply via the Supabase CLI, the SQL editor, or the Supabase MCP. Order matters.

To regenerate `src/lib/db/database.types.ts` after a schema change:

```bash
supabase gen types typescript --project-id yefoofucailpzrasmzeh > src/lib/db/database.types.ts
```

## Layout

```
src/
  lib/
    db/                    Supabase client + generated types
    ingest/                connectors, normalisation, queue stub, worker
    enrich/                embed, sentiment classifier, worker
    retrieval/             hybrid retrieval, reranker stub
    trends/                detect + cluster stubs
    server/
      agents.ts            legacy yes/no agents + new lens agents
      claude.ts            Anthropic SDK wrapper with model fallback
      pipeline/briefing.ts briefing pipeline scaffold
infra/
  supabase/migrations/     numbered SQL migrations
scripts/
  check-rss.ts             validate RSS connector against three feeds
  ingest-once.ts           one ingest pass
  enrich-once.ts           one enrichment pass
  query.ts                 hybrid retrieval test
```

## Troubleshooting

**`npm run check` fails with svelte-kit sync errors.**
This is a SvelteKit type-generation issue, unrelated to the new code paths. The TS compile of the `src/lib/**` and `scripts/**` modules is clean (verified separately). Fix when we move the UI off the legacy shell.

**Embedding worker writes embeddings but no enrichments.**
Check that `ANTHROPIC_API_KEY` is set. Without it, the classifier returns mock text and the parser yields a `neutral` row with no topics. Embedding succeeds independently.

**Hybrid search returns `vector_score = 0` for every hit.**
You have not run `enrich:once` yet (or it has not caught up). The vector branch needs `documents.embedding` populated. Until then, ranking is BM25-only with vector_score reported as 0.

**RSS connector returns 0 items for a feed.**
Some sources in the seed list (Reuters, AP, FT, Radio Farda) are flagged `active = false` because their public RSS endpoints are unstable or paywalled. Validate the URL before flipping active.

**Anthropic 429s during `enrich:once`.**
Tier 1 caps Haiku at 50 RPM. The classifier paces calls in-process via a sliding-window limiter (default 45 RPM, 10% margin). If you upgrade to a higher tier, set `ANTHROPIC_HAIKU_RPM` in `.env` to the new ceiling. The SDK also retries 429s with the response's retry-after header, so stragglers self-recover.

## Cost notes

At MVP volume (200 docs per run, run a few times a day):

- Embeddings: about $0.002 per run.
- Classification (Haiku): about $0.18 per run.
- Anthropic lens agents: not yet running. Expect $0.01 to $0.10 per briefing depending on evidence pack size.

Cap and meter from day one when the briefing pipeline goes live.

## Plan and decisions

Full architecture, phased delivery, locked scope, and risk register: [PLAN.md](./PLAN.md).
