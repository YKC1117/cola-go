-- COLA GO Plate Center V13 - allow the background runner enough time to finish.
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
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.colago_plate_line_tick() from public, anon, authenticated;
