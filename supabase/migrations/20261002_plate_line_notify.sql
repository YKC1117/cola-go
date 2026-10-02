-- COLA GO Plate Center V12 - LINE personalized notifications
-- No LINE credential is stored in this migration or in the public repository.

create extension if not exists pgcrypto;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.plate_line_pairings (
  id uuid primary key,
  code_hash text not null unique,
  profile jsonb not null,
  return_url text,
  expires_at timestamptz not null,
  line_user_id text,
  device_token text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.plate_line_subscriptions (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  device_token_hash text not null unique,
  profile jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plate_line_delivery_log (
  line_user_id text not null,
  event_key text not null,
  sent_at timestamptz not null default now(),
  primary key (line_user_id,event_key)
);

create table if not exists public.plate_line_announcement_state (
  announcement_id text primary key,
  start_at text,
  end_at text,
  updated_at timestamptz not null default now()
);

alter table public.plate_line_pairings enable row level security;
alter table public.plate_line_subscriptions enable row level security;
alter table public.plate_line_delivery_log enable row level security;
alter table public.plate_line_announcement_state enable row level security;

revoke all on public.plate_line_pairings from anon, authenticated;
revoke all on public.plate_line_subscriptions from anon, authenticated;
revoke all on public.plate_line_delivery_log from anon, authenticated;
revoke all on public.plate_line_announcement_state from anon, authenticated;

create or replace function public.colago_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  order by created_at desc
  limit 1
$$;

revoke all on function public.colago_secret(text) from public, anon, authenticated;
grant execute on function public.colago_secret(text) to service_role;
