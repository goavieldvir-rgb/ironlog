-- Rest timer alerts that arrive while the app is in the background.
-- iPhone pauses the app as soon as it leaves the screen, so the in-app
-- timer can't raise its own alert. Instead the app writes the moment the
-- rest ends onto this phone's push subscription, and the server sends a
-- normal push at that moment. Skipping, pausing or finishing the rest
-- clears it, so nothing is sent.
-- Needs pg_cron, pg_net and push_config (supabase/schema.sql section 6).
-- Safe to re-run. Also folded into supabase/schema.sql.

alter table public.push_subscriptions add column if not exists rest_ends_at timestamptz;
create index if not exists push_subscriptions_rest_due
  on public.push_subscriptions (rest_ends_at) where rest_ends_at is not null;

-- Takes the alerts that are due and clears them in the same statement, so
-- each one is sent once even if two runs overlap, and a rest the app
-- cancelled a moment earlier is no longer there to take. Only the push
-- function (service role) may call it.
create or replace function public.claim_due_rest_alerts()
 returns table (id uuid, endpoint text, p256dh text, auth text, lang text, ends_at timestamptz)
 language sql
 security definer
 set search_path to ''
as $function$
  with due as (
    select d.id, d.rest_ends_at from public.push_subscriptions d
     where d.rest_ends_at <= now()
     for update skip locked
  )
  update public.push_subscriptions s
     set rest_ends_at = null
    from due
   where s.id = due.id
  returning s.id, s.endpoint, s.p256dh, s.auth, s.lang, due.rest_ends_at;
$function$;
revoke execute on function public.claim_due_rest_alerts() from public, anon, authenticated;
grant execute on function public.claim_due_rest_alerts() to service_role;

-- Runs every 10 seconds, but only wakes the push function when a rest has
-- actually ended, so a quiet gym costs one indexed lookup.
create or replace function public.run_rest_alerts()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secret text;
begin
  if not exists (select 1 from public.push_subscriptions where rest_ends_at <= now()) then
    return;
  end if;
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{"rest_alerts": true}'::jsonb
  );
end;
$function$;
revoke execute on function public.run_rest_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rest-timer-alerts') then
    perform cron.unschedule('rest-timer-alerts');
  end if;
  perform cron.schedule('rest-timer-alerts', '10 seconds', $job$select public.run_rest_alerts()$job$);
end $$;
