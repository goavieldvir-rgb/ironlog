-- Ironlog: coach settings for alerts and the To do list.
--
-- Run after supabase-custom-measurements.sql (it creates coach_settings).
-- Safe to run more than once. Nothing changes for a coach until they save
-- Coach settings: every value below defaults to how the app worked before.
--
-- - tasks_off: To do item kinds this coach doesn't want (quiet, food,
--   birthday, checkin, weigh, welcome).
-- - weigh_days: days without a weigh-in before a To do item (was 14).
-- - food_days: finished days without food logs before a To do item (was 3).
-- - behind_pct: People flags a trainee under this % of their plan (was 60).
-- - checkin_days: "Check-in done" moves the next check-in this many days (was 7).
-- - pr_alerts: email/push when a trainee sets a record (records still show
--   in the app either way).

alter table public.coach_settings add column if not exists tasks_off text[] not null default '{}';
alter table public.coach_settings add column if not exists weigh_days integer not null default 14;
alter table public.coach_settings add column if not exists food_days integer not null default 3;
alter table public.coach_settings add column if not exists behind_pct integer not null default 60;
alter table public.coach_settings add column if not exists checkin_days integer not null default 7;
alter table public.coach_settings add column if not exists pr_alerts boolean not null default true;

alter table public.coach_settings drop constraint if exists coach_settings_prefs_check;
alter table public.coach_settings add constraint coach_settings_prefs_check check (
  tasks_off <@ array['quiet', 'food', 'birthday', 'checkin', 'weigh', 'welcome']
  and weigh_days between 3 and 90
  and food_days between 1 and 30
  and behind_pct between 10 and 100
  and checkin_days between 1 and 90
);

-- ---------- the To do list reads the coach's settings ----------
CREATE OR REPLACE FUNCTION public.refresh_coach_tasks(p_today date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  added integer := 0;
  c integer;
begin
  -- Signed-in callers must be the coach; the cron job runs with no user.
  if auth.uid() is not null and not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
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
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and l.last is not null
    and p_today - l.last >= coalesce(p.inactivity_alert_days, 5)
    and not ('quiet' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Not logging food: nutrition on with a calorie target, account older than
  -- three days, and nothing logged in the coach's number of finished days
  -- (default 3).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'food', 'food:' || p.id || ':' || coalesce(l.last::text, 'none'), l.last,
         case when l.last is null then null else p_today - l.last end, p_today
  from profiles p
  join nutrition_targets nt on nt.user_id = p.id and nt.kcal is not null
  join lateral (select max(f.date) as last from food_logs f where f.user_id = p.id and f.date < p_today) l on true
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and p.nutrition_enabled
    and p.created_at::date <= p_today - 3
    and (l.last is null or l.last < p_today - coalesce(cs.food_days, 3))
    and not ('food' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Birthday today (29 Feb birthdays on 28 Feb in other years).
  insert into coach_tasks (trainee_id, kind, dedupe_key, n, due)
  select p.id, 'birthday', 'birthday:' || p.id || ':' || extract(year from p_today),
         extract(year from age(p_today, p.birthday))::int, p_today
  from profiles p
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and p.birthday is not null
    and not ('birthday' = any(coalesce(cs.tasks_off, '{}')))
    and (to_char(p.birthday, 'MM-DD') = to_char(p_today, 'MM-DD')
      or (to_char(p.birthday, 'MM-DD') = '02-29' and to_char(p_today, 'MM-DD') = '02-28'
          and extract(day from (date_trunc('year', p_today) + interval '1 month 28 days')) <> 29))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Check-in date reached (set on the trainee's coach page).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, due)
  select g.trainee_id, 'checkin', 'checkin:' || g.trainee_id || ':' || g.next_checkin, g.next_checkin, g.next_checkin
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin and not p.is_coach
    and g.author_id = coalesce(p.coach_id, (select o.id from profiles o where o.is_admin order by o.created_at limit 1))
  left join coach_settings cs on cs.coach_id = g.author_id
  where g.next_checkin is not null and g.next_checkin <= p_today
    and not ('checkin' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- No weigh-in for the coach's number of days (default 14), for people who
  -- do weigh in.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'weigh', 'weigh:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(b.date) as last from body_weight_logs b where b.user_id = p.id) l on true
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and l.last is not null and l.last <= p_today - coalesce(cs.weigh_days, 14)
    and not ('weigh' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- New trainee, three days in: see how the first week is going.
  insert into coach_tasks (trainee_id, kind, dedupe_key, due)
  select p.id, 'welcome', 'welcome:' || p.id, p_today
  from profiles p
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach
    and p.created_at::date between p_today - 10 and p_today - 3
    and not ('welcome' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  return case when auth.uid() is null then added
    else (select count(*)::integer from coach_tasks t
          where t.created_at = now() and t.trainee_id is not null and public.can_coach(t.trainee_id)) end;
end;
$function$;

revoke execute on function public.refresh_coach_tasks(date) from public, anon;
grant execute on function public.refresh_coach_tasks(date) to authenticated;

-- ---------- record alerts can be switched off ----------
-- Same as supabase-notification-wording.sql, plus the pr_alerts check.
create or replace function public.send_pr_alert(trainee_name text, ex_name text, detail_en text, detail_he text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- The owner can switch record alerts off (Coach settings).
  if exists (select 1 from coach_settings cs join profiles o on o.id = cs.coach_id and o.is_admin where not cs.pr_alerts) then
    return;
  end if;
  if owner_lang() = 'he' then
    perform send_admin_email(
      'שיא חדש של ' || trainee_name || ' 🏆',
      '<p dir="rtl">שיא אישי חדש של <strong>' || public.html_escape(trainee_name) || '</strong> ב-<strong>' ||
      public.html_escape(ex_name) || '</strong>: <span dir="ltr">' || public.html_escape(detail_he) || '</span>.</p>'
    );
    perform send_admin_push('🏆 שיא חדש: ' || trainee_name, ex_name || ' — ' || detail_he);
  else
    perform send_admin_email(
      trainee_name || ' just hit a new PR 🏆',
      '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
      public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_en) || '.</p>'
    );
    perform send_admin_push('🏆 New PR: ' || trainee_name, ex_name || ' — ' || detail_en);
  end if;
end;
$function$;
revoke execute on function public.send_pr_alert(text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_coach_pr(trainee uuid, detail text, detail_he text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  -- The coach can switch record alerts off (Coach settings).
  if exists (select 1 from public.coach_settings cs where cs.coach_id = public.coach_for(trainee) and not cs.pr_alerts) then
    return;
  end if;
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('pr_trainee_id', trainee, 'pr_detail', detail, 'pr_detail_he', detail_he)
  );
exception when others then
  raise warning 'notify_coach_pr failed: %', sqlerrm;
end;
$$;
revoke execute on function public.notify_coach_pr(uuid, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
