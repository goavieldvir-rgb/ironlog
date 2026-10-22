-- Coach tasks: a to-do list on the People page of things worth the coach's
-- attention (a trainee gone quiet, not logging food, a birthday, a check-in
-- that's due, no weigh-in for a while, a new trainee's first week), plus
-- tasks the coach adds by hand. The coach ticks them off; tasks whose reason
-- went away (they trained, logged food, weighed in) close on their own.
-- Every morning new tasks reach the coach as an app notification, or by
-- ntfy when the coach's phone has no app notifications turned on.
-- Run once in the Supabase SQL editor. Safe to re-run. Also folded into
-- supabase/schema.sql. Needs pg_cron, pg_net and push_config (schema.sql
-- section 6), and the send-workout-reminders Edge Function redeployed.

-- The coach enters a trainee's birthday on the trainee's coach page.
alter table public.coach_goals add column if not exists birthday date;

create table if not exists public.coach_tasks (
  id uuid primary key default gen_random_uuid(),
  -- null for a task the coach wrote that isn't about one trainee.
  trainee_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quiet', 'food', 'birthday', 'checkin', 'weigh', 'welcome', 'custom')),
  -- Only for 'custom': the coach's own words.
  title text check (length(title) between 1 and 300),
  -- One task per reason: e.g. 'quiet:2026-10-15' is one quiet spell, so a
  -- task the coach ticked off isn't created again the next morning.
  dedupe_key text unique,
  -- The day the reason started (last session, last food log, last weigh-in),
  -- so the task can close itself once something newer is logged.
  since date,
  -- Days quiet / days since food / age turning, depending on kind.
  n integer,
  due date not null default current_date,
  done_at timestamptz,
  auto_done boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'custom') = (title is not null))
);
create index if not exists coach_tasks_open_idx on public.coach_tasks (done_at, due);
create index if not exists coach_tasks_trainee_idx on public.coach_tasks (trainee_id);

alter table public.coach_tasks enable row level security;
revoke all on public.coach_tasks from anon;
revoke truncate, references, trigger on public.coach_tasks from authenticated;
drop policy if exists "admins manage coach tasks" on public.coach_tasks;
create policy "admins manage coach tasks" on public.coach_tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Adds the tasks that are due as of p_today and closes the ones whose reason
-- went away. Returns how many tasks it added. The app calls it when the
-- People page opens (admins only); the morning job calls it too.
create or replace function public.refresh_coach_tasks(p_today date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  added integer := 0;
  c integer;
begin
  -- Signed-in callers must be the coach; the cron job runs with no user.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  -- Close tasks whose reason went away.
  update coach_tasks t set done_at = now(), auto_done = true
  where t.done_at is null and t.trainee_id is not null and (
    (t.kind = 'quiet' and exists (select 1 from sessions s where s.user_id = t.trainee_id and s.date > t.since))
    or (t.kind = 'food' and exists (select 1 from food_logs f where f.user_id = t.trainee_id and f.date > coalesce(t.since, '-infinity'::date)))
    or (t.kind = 'weigh' and exists (select 1 from body_weight_logs b where b.user_id = t.trainee_id and b.date > t.since))
    or (t.kind = 'checkin' and not exists (select 1 from coach_goals g where g.trainee_id = t.trainee_id and g.next_checkin = t.since))
  );

  -- Gone quiet: no session for their alert days (default 5).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'quiet', 'quiet:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(s.date) as last from sessions s where s.user_id = p.id) l on true
  where not p.is_admin and l.last is not null
    and p_today - l.last >= coalesce(p.inactivity_alert_days, 5)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Not logging food: nutrition on with a calorie target, account older than
  -- three days, and nothing logged in the last three finished days.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'food', 'food:' || p.id || ':' || coalesce(l.last::text, 'none'), l.last,
         case when l.last is null then null else p_today - l.last end, p_today
  from profiles p
  join nutrition_targets nt on nt.user_id = p.id and nt.kcal is not null
  join lateral (select max(f.date) as last from food_logs f where f.user_id = p.id and f.date < p_today) l on true
  where not p.is_admin and p.nutrition_enabled
    and p.created_at::date <= p_today - 3
    and (l.last is null or l.last < p_today - 3)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Birthday today (29 Feb birthdays on 28 Feb in other years).
  insert into coach_tasks (trainee_id, kind, dedupe_key, n, due)
  select g.trainee_id, 'birthday', 'birthday:' || g.trainee_id || ':' || extract(year from p_today),
         extract(year from age(p_today, g.birthday))::int, p_today
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin
  where g.birthday is not null
    and (to_char(g.birthday, 'MM-DD') = to_char(p_today, 'MM-DD')
      or (to_char(g.birthday, 'MM-DD') = '02-29' and to_char(p_today, 'MM-DD') = '02-28'
          and extract(day from (date_trunc('year', p_today) + interval '1 month 28 days')) <> 29))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Check-in date reached (set on the trainee's coach page).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, due)
  select g.trainee_id, 'checkin', 'checkin:' || g.trainee_id || ':' || g.next_checkin, g.next_checkin, g.next_checkin
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin
  where g.next_checkin is not null and g.next_checkin <= p_today
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- No weigh-in for 14 days, for people who do weigh in.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'weigh', 'weigh:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(b.date) as last from body_weight_logs b where b.user_id = p.id) l on true
  where not p.is_admin and l.last is not null and l.last <= p_today - 14
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- New trainee, three days in: see how the first week is going.
  insert into coach_tasks (trainee_id, kind, dedupe_key, due)
  select p.id, 'welcome', 'welcome:' || p.id, p_today
  from profiles p
  where not p.is_admin
    and p.created_at::date between p_today - 10 and p_today - 3
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  return added;
end;
$function$;

revoke execute on function public.refresh_coach_tasks(date) from public, anon;
grant execute on function public.refresh_coach_tasks(date) to authenticated;

-- The morning job: refresh, then tell the coach about tasks not yet sent.
-- App notification through the Edge Function when the coach has one turned
-- on (it marks the tasks as sent); otherwise ntfy, marked here.
create or replace function public.run_coach_tasks()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  secret text;
  pending integer;
begin
  perform refresh_coach_tasks(today);

  select count(*) into pending from coach_tasks where done_at is null and notified_at is null;
  if pending = 0 then return; end if;

  select value into secret from push_config where key = 'cron_secret';
  if secret is not null and exists (
    select 1 from push_subscriptions s join profiles p on p.id = s.user_id where p.is_admin
  ) then
    perform net.http_post(
      url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('coach_tasks', true)
    );
  else
    perform send_admin_push(
      'Ironlog: ' || pending || ' משימות למאמן',
      'יש ' || pending || ' דברים חדשים שדורשים תשומת לב. פתחו את מסך המתאמנים.'
    );
    update coach_tasks set notified_at = now() where done_at is null and notified_at is null;
  end if;
end;
$function$;

revoke execute on function public.run_coach_tasks() from public, anon, authenticated;

-- 05:30 UTC: 08:30 in Israel in summer, 07:30 in winter.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'coach-tasks') then
    perform cron.unschedule('coach-tasks');
  end if;
  perform cron.schedule('coach-tasks', '30 5 * * *', $job$select public.run_coach_tasks()$job$);
end $$;
