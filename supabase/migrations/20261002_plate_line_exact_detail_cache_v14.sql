create table if not exists public.plate_line_detail_cache (
  seq text primary key,
  fetched_at timestamptz not null,
  excluded_plates jsonb not null default '[]'::jsonb,
  source_hash text,
  bytes integer not null default 0
);

alter table public.plate_line_detail_cache enable row level security;
revoke all on public.plate_line_detail_cache from anon, authenticated;
