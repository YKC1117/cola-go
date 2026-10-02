-- COLA GO Plate Center V12 - free background notification scheduler
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.colago_plate_line_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id bigint;
  runner_secret text;
begin
  runner_secret := public.colago_secret('colago_cron_secret');
  if runner_secret is null or length(runner_secret)=0 then
    raise exception 'COLA GO cron secret unavailable';
  end if;

  select net.http_post(
    url := 'https://papqrnqbfauwuipjwwdh.supabase.co/functions/v1/cola-go-line/v1/plate-line/run',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-colago-cron-secret',runner_secret
    ),
    body := '{}'::jsonb
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.colago_plate_line_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname='cola_go_plate_line_tick') then
    perform cron.unschedule('cola_go_plate_line_tick');
  end if;
  perform cron.schedule(
    'cola_go_plate_line_tick',
    '*/2 * * * *',
    'select public.colago_plate_line_tick();'
  );
end $$;
