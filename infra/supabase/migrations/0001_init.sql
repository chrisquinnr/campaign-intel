-- magi-sent — initial schema
-- Phase 0 foundation. See PLAN.md §3.2.
--
-- Conventions:
--   * snake_case in DB, camelCase in TS layer (see src/lib/types.ts).
--   * timestamps are timestamptz, default now().
--   * ids are uuid v4 unless content has a natural key (sources.endpoint).
--   * RLS is enabled on every table; policies are added in 0002_rls.sql once
--     auth roles are wired up. Service role bypasses for ingest workers.

create extension if not exists "uuid-ossp";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- ─────────────────────────────────────────────────────────────
-- taxonomy_topics
-- Avaaz-managed topic vocabulary used for classification + briefing scoping.
-- ─────────────────────────────────────────────────────────────
create table if not exists taxonomy_topics (
  slug         text primary key,
  label        text not null,
  description  text,
  parent_slug  text references taxonomy_topics(slug) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Phase 1 priority topics (Sudan, Iran, US politics, EU politics).
insert into taxonomy_topics (slug, label, description) values
  ('sudan',        'Sudan',         'Conflict, humanitarian crisis, RSF/SAF dynamics'),
  ('iran',         'Iran',          'Domestic politics, protests, regional posture'),
  ('us_politics',  'US politics',   'Breaking US politics — federal, electoral, civil rights'),
  ('eu_politics',  'EU politics',   'Breaking EU politics — institutions, member states, elections')
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────
-- sources
-- One row per ingestion endpoint. Connectors poll on a schedule.
-- ─────────────────────────────────────────────────────────────
create type source_kind as enum ('rss', 'gdelt', 'newsapi', 'bluesky', 'mastodon', 'reddit');

create table if not exists sources (
  id              uuid primary key default uuid_generate_v4(),
  kind            source_kind not null,
  label           text not null,
  endpoint        text not null,
  lang            text,                       -- ISO 639-1, null when mixed
  topics          text[] not null default '{}',
  poll_seconds    integer,                    -- override; null = kind default
  active          boolean not null default true,
  last_polled_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (kind, endpoint)
);

create index if not exists sources_active_idx on sources (active) where active;

-- ─────────────────────────────────────────────────────────────
-- documents
-- Normalised content unit. One row per fetched item. Dedup by
-- (source_id, external_id). Full text + embedding live here so
-- hybrid retrieval is one join away.
-- ─────────────────────────────────────────────────────────────
create table if not exists documents (
  id            uuid primary key default uuid_generate_v4(),
  source_id     uuid not null references sources(id) on delete cascade,
  external_id   text not null,
  url           text,
  author        text,
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  title         text,
  text          text not null,
  lang          text not null default 'und',
  raw_payload   jsonb,
  -- Full-text search column maintained by trigger below.
  fts           tsvector,
  -- Embedding (text-embedding-3-small = 1536 dims).
  embedding     vector(1536),
  unique (source_id, external_id)
);

create index if not exists documents_published_idx on documents (published_at desc);
create index if not exists documents_fetched_idx   on documents (fetched_at  desc);
create index if not exists documents_fts_idx       on documents using gin (fts);
create index if not exists documents_embed_idx     on documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function documents_fts_refresh() returns trigger as $$
begin
  new.fts :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.text,  '')), 'B');
  return new;
end;
$$ language plpgsql;

drop trigger if exists documents_fts_trg on documents;
create trigger documents_fts_trg
  before insert or update of title, text on documents
  for each row execute function documents_fts_refresh();

-- ─────────────────────────────────────────────────────────────
-- enrichments
-- One row per document, written by enrichment workers.
-- ─────────────────────────────────────────────────────────────
create type sentiment_label as enum ('positive', 'negative', 'neutral', 'mixed');

create table if not exists enrichments (
  document_id        uuid primary key references documents(id) on delete cascade,
  detected_lang      text,
  text_en            text,                    -- translation when lang != 'en'
  entities           jsonb not null default '[]',
  topics             text[] not null default '{}',
  sentiment_label    sentiment_label,
  sentiment_score    real,                    -- -1..1
  sentiment_conf     real,                    -- 0..1
  emotion            jsonb,                   -- { anger, fear, joy, sadness, ... }
  stance             jsonb,                   -- [{cause, value, confidence}]
  embedding_dim      integer,                 -- documents.embedding stays canonical
  enriched_at        timestamptz not null default now()
);

create index if not exists enrichments_topics_idx on enrichments using gin (topics);

-- ─────────────────────────────────────────────────────────────
-- runs
-- A single execution of a pipeline (briefing generation, ad-hoc query).
-- Lets us inspect lens deliberation for transparency / audit.
-- ─────────────────────────────────────────────────────────────
create type run_kind as enum ('briefing', 'query', 'trend_detect');
create type run_status as enum ('pending', 'running', 'completed', 'failed');

create table if not exists runs (
  id            uuid primary key default uuid_generate_v4(),
  kind          run_kind not null,
  status        run_status not null default 'pending',
  input         jsonb,                        -- query text / window / topic
  output        jsonb,                        -- summarised result
  lens_findings jsonb,                        -- AgentLensFinding[]
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists runs_kind_started_idx on runs (kind, started_at desc);

-- ─────────────────────────────────────────────────────────────
-- trends
-- Output of the trend detection job. Briefings cite these.
-- ─────────────────────────────────────────────────────────────
create type trend_kind as enum ('volume_spike', 'sentiment_shift', 'narrative_emergence', 'entity_cooccurrence');

create table if not exists trends (
  id            uuid primary key default uuid_generate_v4(),
  kind          trend_kind not null,
  scope         jsonb not null,               -- { topic?, entity?, clusterId? }
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  magnitude     real not null,                -- z-score or comparable
  document_ids  uuid[] not null default '{}',
  summary       text not null,
  detected_at   timestamptz not null default now()
);

create index if not exists trends_window_idx on trends (window_end desc);
create index if not exists trends_kind_idx   on trends (kind);

-- ─────────────────────────────────────────────────────────────
-- briefings
-- First-class deliverable. Versioned, audience-targeted.
-- ─────────────────────────────────────────────────────────────
create type briefing_audience as enum ('campaigner', 'leadership');
create type briefing_cadence  as enum ('daily', 'weekly', 'ad_hoc');
create type conscience_verdict as enum ('approved', 'revise', 'block');

create table if not exists briefings (
  id                  uuid primary key default uuid_generate_v4(),
  audience            briefing_audience not null,
  cadence             briefing_cadence not null,
  topic               text references taxonomy_topics(slug) on delete set null,
  window_start        timestamptz not null,
  window_end          timestamptz not null,
  headline            text not null,
  summary             text not null,
  sections            jsonb not null default '[]',  -- BriefingSection[]
  trend_ids           uuid[] not null default '{}',
  lens_findings       jsonb not null default '[]',
  conscience_verdict  conscience_verdict not null default 'approved',
  conscience_concerns text[] not null default '{}',
  conscience_notes    text,
  run_id              uuid references runs(id) on delete set null,
  version             integer not null default 1,
  published_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists briefings_topic_published_idx on briefings (topic, published_at desc);
create index if not exists briefings_audience_idx        on briefings (audience, published_at desc);

-- ─────────────────────────────────────────────────────────────
-- briefing_subscriptions
-- Who gets which briefings, on which channel.
-- Users come from Supabase Auth (auth.users).
-- ─────────────────────────────────────────────────────────────
create type delivery_channel as enum ('email', 'slack', 'in_app');

create table if not exists briefing_subscriptions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null,                 -- auth.users.id
  audience     briefing_audience not null,
  cadence      briefing_cadence not null,
  topic        text references taxonomy_topics(slug) on delete set null,
  channel      delivery_channel not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists briefing_subs_user_idx on briefing_subscriptions (user_id) where active;

-- ─────────────────────────────────────────────────────────────
-- pg_boss schema (queue) is created by the pg-boss client itself.
-- We don't define it here. See src/lib/ingest/queue.ts.
-- ─────────────────────────────────────────────────────────────
