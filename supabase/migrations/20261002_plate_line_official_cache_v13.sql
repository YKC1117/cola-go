-- COLA GO Plate Center V13 - live official announcement cache
create table if not exists public.plate_line_official_cache (
  cache_key text primary key,
  fetched_at timestamptz not null,
  source_updated_at text,
  source_hash text,
  count integer not null default 0,
  items jsonb not null default '[]'::jsonb
);

alter table public.plate_line_official_cache enable row level security;
revoke all on public.plate_line_official_cache from anon, authenticated;
