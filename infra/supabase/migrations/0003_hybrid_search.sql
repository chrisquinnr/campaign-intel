-- hybrid_search: BM25 + vector similarity fused with reciprocal rank.
--
-- Why a SQL function rather than two queries from the client:
--   * supabase-js can't ORDER BY a pgvector distance expression directly
--     (only column names allowed in .order()), so the ANN sort must run
--     server-side anyway.
--   * One round-trip vs two; smaller payload (only union'd ids).
--   * RRF fusion stays where the data lives.
--
-- Arguments are all optional. Pass q_text=null for vector-only retrieval,
-- q_embedding=null for BM25-only. Pass both for fused.
--
-- Filters are AND-combined and apply to both branches.

create or replace function public.hybrid_search(
  q_text text default null,
  q_embedding vector(1536) default null,
  match_count int default 20,
  published_after timestamptz default null,
  published_before timestamptz default null,
  topic_filter text[] default null,
  source_ids uuid[] default null
)
returns table (
  id uuid,
  source_id uuid,
  url text,
  title text,
  text text,
  published_at timestamptz,
  lang text,
  bm25_score real,
  vector_score real,
  fused_score real
)
language plpgsql
stable
as $$
declare
  rrf_k constant int := 60;
begin
  return query
  with candidates as (
    select d.*
    from documents d
    join sources s on s.id = d.source_id
    where (published_after is null or d.published_at >= published_after)
      and (published_before is null or d.published_at <= published_before)
      and (source_ids is null or d.source_id = any(source_ids))
      and (topic_filter is null or s.topics && topic_filter)
  ),
  bm25 as (
    select c.id,
           ts_rank(c.fts, plainto_tsquery('simple', q_text)) as score,
           row_number() over (order by ts_rank(c.fts, plainto_tsquery('simple', q_text)) desc) as rk
    from candidates c
    where q_text is not null
      and c.fts @@ plainto_tsquery('simple', q_text)
    order by score desc
    limit match_count
  ),
  vec as (
    select c.id,
           (1 - (c.embedding <=> q_embedding))::real as score,
           row_number() over (order by c.embedding <=> q_embedding) as rk
    from candidates c
    where q_embedding is not null
      and c.embedding is not null
    order by c.embedding <=> q_embedding
    limit match_count
  ),
  union_ids as (
    select id from bm25
    union
    select id from vec
  ),
  fused as (
    select u.id,
           coalesce(b.score, 0)::real as bm25_score,
           coalesce(v.score, 0)::real as vector_score,
           (coalesce(1.0::real / (rrf_k + b.rk), 0::real)
            + coalesce(1.0::real / (rrf_k + v.rk), 0::real))::real as fused_score
    from union_ids u
    left join bm25 b using (id)
    left join vec v using (id)
  )
  select d.id, d.source_id, d.url, d.title, d.text,
         d.published_at, d.lang,
         f.bm25_score, f.vector_score, f.fused_score
  from fused f
  join documents d using (id)
  order by f.fused_score desc
  limit match_count;
end;
$$;

-- Allow service-role + authenticated to call it. Anon access is fine for
-- read-only retrieval at MVP; tighten in 0004_rls.sql when we add user auth.
grant execute on function public.hybrid_search(
  text, vector, int, timestamptz, timestamptz, text[], uuid[]
) to anon, authenticated, service_role;
