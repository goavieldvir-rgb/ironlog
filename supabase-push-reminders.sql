-- Workout reminders (web push). Run once in the Supabase SQL editor.
-- The private VAPID key and the cron secret are NOT in this file: they are
-- inserted separately into push_config, which nobody but the server can read.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
  p256dh text not null,
  auth text not null,
  remind_time time not null default '08:00',
  tz text not null default 'UTC',
  lang text not null default 'en' check (lang in ('en', 'he')),
  last_sent_date date,
  last_test_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
-- RLS doesn't cover TRUNCATE, so signed-in users don't get it.
revoke truncate, references, trigger on public.push_subscriptions from authenticated;
create policy "own push subs select" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "own push subs insert" on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "own push subs update" on public.push_subscriptions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subs delete" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);

-- Server-only settings (VAPID keys, cron secret). RLS on with no policies
-- and no grants: only the service role / postgres can touch it.
create table if not exists public.push_config (
  key text primary key,
  value text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- Called by pg_cron every 15 minutes; asks the Edge Function to send due reminders.
create or replace function public.run_workout_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function public.run_workout_reminders() from public, anon, authenticated;

select cron.schedule('workout-reminders', '*/15 * * * *', 'select public.run_workout_reminders()');
