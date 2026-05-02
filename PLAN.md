# magi-sent — Architecture and Build Plan

Sentiment and trend analysis engine for Avaaz, built on the magi multi-agent foundation.

## 1. Goal

Aggregate media and social signals, surface emergent trends and causes, generate scheduled intel briefings, and let campaign staff query the corpus in natural language. Outputs feed campaign decision making.

## 2. What we keep from current magi

- SvelteKit + TS app shell, SSE streaming, Tailwindless CSS aesthetic.
- Claude SDK wrapper (`src/lib/server/claude.ts`) with model fallback.
- Agent abstraction (`agents.ts`, `pipeline.ts`) — repurposed below.
- MCP server stub (`mcp-server.js`) — extended with new tools.

## 3. What changes

### 3.1 Reframe the agent panel

The current Magi pipeline is a yes/no decision machine. For sentiment and trend work it should become a multi-lens analytic panel. Same three voices, new roles:

- MELCHIOR (Signals): quantitative reading of volumes, velocity, anomaly detection, source reliability.
- BALTHASAR (Voices): qualitative reading of narratives, emotion, framing, who is speaking and how.
- CASPER (Strategy): geopolitical and movement context, actor motivations, second-order effects.
- ARTABAN (Conscience): bias, harm, vulnerable group impact, ethical sourcing checks before publication.

Output mode shifts from `YES / NO / CONDITIONAL` to structured briefings with confidence scores and citations. Keep the deliberation pattern (independent assessment, challenge round, synthesis), drop the veto-style consensus.

### 3.2 New data plane

magi today is stateless. magi-sent needs persistence. Pragmatic stack:

- Postgres (Supabase) for documents, sources, runs, briefings, users.
- pgvector for embeddings on the same Postgres instance — keeps ops simple.
- Object storage (Supabase Storage or S3) for raw payloads, screenshots, archived HTML.
- Redis or Postgres-backed queue (BullMQ or pg-boss) for ingest jobs and scheduled briefings.

Why not a separate vector DB? Single store, single backup story, one connection pool. Move to a dedicated vector DB only if recall or scale forces it.

### 3.3 Ingestion layer

A new `src/lib/ingest/` module with one connector per source type. Connectors normalise to a common `Document` shape (id, source, url, author, published_at, text, lang, raw_payload, fetched_at).

Phase 1 connectors:

- RSS and Atom (Avaaz already tracks lots of outlets, easiest win).
- News APIs: GDELT 2.0 (free, global, near real-time), NewsAPI or MediaCloud as backup.
- Bluesky firehose (open, no enterprise fees, growing among advocacy orgs).
- Mastodon public timelines for relevant instances.
- Reddit JSON endpoints for chosen subs.

Phase 2 (only if needed):

- X / Twitter via paid tier or partner.
- YouTube transcripts via youtube-transcript-api.
- Telegram public channels via tdlib.

Each connector runs on a schedule (default 15 min for news, 5 min for social), deduplicates by URL hash, drops into the queue for enrichment.

### 3.4 Enrichment pipeline

For each new document, run a chain of small, cheap workers:

1. Language detect and translate to English (keep original).
2. Named entity recognition (people, orgs, places, causes).
3. Topic classification against an Avaaz-managed taxonomy (climate, democracy, conflict, rights, etc).
4. Sentiment and emotion scoring. Pragmatic stack: a finetuned small model (RoBERTa, XLM-T for multilingual) running locally via a Python sidecar service, with Claude as fallback for ambiguous cases. Cheaper than Claude per doc, fast at scale.
5. Stance detection where relevant (pro / against / neutral on a tracked cause).
6. Embedding (OpenAI text-embedding-3-small or Voyage) into pgvector.
7. Claim extraction for fact-check candidates (low priority, phase 2).

The Python sidecar runs in its own container, exposes a small HTTP API, and is called from a TypeScript worker. Avoid putting Python into the SvelteKit process.

### 3.5 Trend detection

A scheduled job runs hourly:

- Counts entity and topic mentions per source bucket and time window.
- Flags z-score anomalies vs trailing 7 and 30 day baseline.
- Clusters fresh documents by embedding similarity (HDBSCAN or simple online clustering) to detect emergent narratives.
- Tracks sentiment drift on tracked causes and named campaigns.
- Surfaces co-occurring entities (which actors, which places, which framings).

Outputs land in a `trends` table the agents and UI both read from.

### 3.6 Briefing generator

Replaces the current `runPipeline`. New `briefingPipeline`:

1. Window selector picks the time range and topic scope (daily, weekly, ad-hoc topic).
2. Retriever pulls top trending clusters and a representative sample of documents.
3. The three agents run in parallel over the same evidence pack with their lens-specific prompts.
4. Challenge round if assessments diverge materially.
5. Synthesiser composes a structured briefing: headline, three to five trends, signals to watch, actor map, recommended campaign questions, citations.
6. Artaban runs a bias and harm pass before publication.
7. Briefing is persisted, indexed, and pushed to subscribed users (email, Slack, in-app).

Briefings are first-class objects with versions, comments, and "promote to action" hooks.

### 3.7 Free-form query

A RAG endpoint at `/api/query`:

- Hybrid retrieval: BM25 (Postgres FTS) + vector similarity, fused with reciprocal rank.
- Reranker pass (Cohere Rerank or Claude-based) on top k.
- Claude composes the answer with inline citations linking back to source documents.
- Optional agent panel mode: same query routed through the three lenses for a multi-perspective answer.
- Conversations persist per user for follow-ups.

### 3.8 UI changes

Keep the MAGI terminal aesthetic. New surfaces:

- Dashboard: live trend tiles, sentiment timelines, source health.
- Briefing reader: structured view with citations, agent panel toggle, comment threads.
- Query console: chat-style with citation hover cards.
- Source admin: add or pause feeds, taxonomy management, alert rules.
- Run inspector: see the agent deliberation that produced a briefing (transparency for advocacy work).

## 4. Proposed directory layout

```
src/
  lib/
    server/
      agents/        # lens prompts and run logic
      pipeline/      # briefing and query pipelines
      claude.ts      # kept
      mcp/           # MCP tool exports for external clients
    ingest/
      connectors/    # rss, gdelt, bluesky, mastodon, reddit
      queue.ts
      normalize.ts
    enrich/
      ner.ts
      sentiment.ts   # client to python sidecar
      embed.ts
      topics.ts
    trends/
      detect.ts
      cluster.ts
    retrieval/
      hybrid.ts
      rerank.ts
    db/              # supabase client, schema, migrations
    types.ts
  routes/
    api/
      query/         # RAG endpoint, kept and rewritten
      briefings/     # CRUD + subscribe
      sources/
      ingest/        # internal webhook receivers
services/
  enrich-py/         # python sidecar for sentiment, NER
  workers/           # node workers for ingest, enrich, trends, briefings
infra/
  docker-compose.yml
  supabase/migrations/
```

## 5. Tech additions

Required: pgvector (Supabase), pg-boss or BullMQ, an embedding provider, a small Python service (FastAPI + transformers).

Optional but recommended: Cohere Rerank, GDELT account, Bluesky app password, sentry for observability, posthog or plausible for usage analytics.

Avoid for now: Kafka, dedicated vector DB, k8s. Single Fly.io or Railway deployment with Supabase keeps ops light until traffic justifies more.

## 6. Phased delivery

Phase 0 (1 to 2 weeks): foundation
- Add Supabase, schema, migrations, basic auth.
- Stand up the queue and one worker process.
- Refactor agents into lens-based prompts, retire yes/no consensus.

Phase 1 (3 to 4 weeks): minimum useful product
- RSS + GDELT ingestion.
- Sentiment and embeddings via sidecar.
- Daily briefing on a single Avaaz topic, delivered to email.
- Free-form query over the corpus with citations.

Phase 2 (4 to 6 weeks): real coverage
- Bluesky, Mastodon, Reddit connectors.
- Trend detection and clustering.
- Briefing reader UI with agent panel transparency.
- Source admin and taxonomy editor.

Phase 3: hardening and scale
- Reranker, multilingual quality pass, bias auditing dashboard.
- Alerting on threshold events for campaign team.
- Optional X / YouTube / Telegram connectors.

## 7. Risks worth flagging early

- Source licensing. News APIs and X have strict terms. Confirm Avaaz can store and process before building on them.
- Multilingual quality. Avaaz is global. Sentiment models in non-English need calibration.
- Bias and false signal. Trend detectors will surface bot amplification and astroturf. The Artaban pass needs teeth.
- Cost. Embedding and Claude calls scale with volume. Cap and meter from day one.
- Privacy. Even public posts can trigger GDPR concerns when stored. Check with Avaaz legal before social ingestion.

## 8. Confirmed scope decisions

- Priority topics for phase 1: Sudan, Iran, breaking US politics, breaking EU politics. These drive the initial taxonomy, connector source list, and the first daily briefing template.
- Hosting: standalone, optimised for fast deploy. Recommended stack is Railway (one-click Postgres + Redis + worker services + cron) or Fly.io if we want region pinning. Supabase remains the data layer. Decision: start on Railway, revisit at phase 3.
- Auth: standalone for now. Use Supabase Auth (magic link + Google) so swapping to Avaaz SSO later is a config change, not a rewrite.
- Paid APIs: free tier only for now. NewsAPI free, GDELT free, Bluesky free, Mastodon free. Embeddings via OpenAI text-embedding-3-small (cheap enough to ignore at testing volumes). Defer NewsAPI paid, X, Cohere Rerank until value is proven.
- Briefing audience: both campaigners and leadership. Two templates from the same evidence pack — a campaigner edition (operational, with suggested actions and signals to watch) and a leadership edition (shorter, framed around strategic implications and reputational risk). Both daily, with a weekly synthesis for leadership.

## 9. Phase 1 source list, locked

For Sudan, Iran, US politics, EU politics:

- RSS: Reuters, AP, BBC World, Al Jazeera English, Al Jazeera Arabic, France24, DW, Politico EU, Politico US, Axios, NYT politics, FT world, Le Monde, El País, Sudan Tribune, Dabanga, IranWire, Radio Farda.
- GDELT 2.0: filtered queries on country codes SU, IR, US, and EU member states with theme filters (PROTEST, GOV, ELECTION, MILITARY, HUMANITARIAN).
- NewsAPI free: keyword queries as redundancy and US-focused coverage.
- Bluesky firehose: filtered on relevant accounts (journalists, OSINT, regional analysts) and hashtags.
- Mastodon: journa.host and mstdn.social public timelines, filtered.
- Reddit JSON: r/sudan, r/iran, r/politics, r/europe, r/europeanunion, r/worldnews.

Arabic and Farsi support is a phase 1 requirement given Sudan and Iran focus. The sentiment sidecar must use a multilingual model (XLM-RoBERTa or similar) from day one, not English-only.
