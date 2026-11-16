-- Ironlog: undo the parts of ironlog-coach-tools-all.sql that change what the
-- live app already uses. Run it only if something misbehaves after the main
-- script. It puts back the To do builder, the record alerts and the meal
-- check exactly as they were (supabase-multi-coach.sql and
-- supabase-notification-wording.sql), and removes the messages switch.
-- The new tables stay; the old app never reads them.
begin;

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
  where not p.is_admin and not p.is_coach and l.last is not null
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
  where not p.is_admin and not p.is_coach and p.nutrition_enabled
    and p.created_at::date <= p_today - 3
    and (l.last is null or l.last < p_today - 3)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Birthday today (29 Feb birthdays on 28 Feb in other years).
  insert into coach_tasks (trainee_id, kind, dedupe_key, n, due)
  select p.id, 'birthday', 'birthday:' || p.id || ':' || extract(year from p_today),
         extract(year from age(p_today, p.birthday))::int, p_today
  from profiles p
  where not p.is_admin and not p.is_coach and p.birthday is not null
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
  where g.next_checkin is not null and g.next_checkin <= p_today
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- No weigh-in for 14 days, for people who do weigh in.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'weigh', 'weigh:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(b.date) as last from body_weight_logs b where b.user_id = p.id) l on true
  where not p.is_admin and not p.is_coach and l.last is not null and l.last <= p_today - 14
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- New trainee, three days in: see how the first week is going.
  insert into coach_tasks (trainee_id, kind, dedupe_key, due)
  select p.id, 'welcome', 'welcome:' || p.id, p_today
  from profiles p
  where not p.is_admin and not p.is_coach
    and p.created_at::date between p_today - 10 and p_today - 3
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  return case when auth.uid() is null then added
    else (select count(*)::integer from coach_tasks t
          where t.created_at = now() and t.trainee_id is not null and public.can_coach(t.trainee_id)) end;
end;
$function$;
revoke execute on function public.refresh_coach_tasks(date) from public, anon;
grant execute on function public.refresh_coach_tasks(date) to authenticated;

create or replace function public.send_pr_alert(trainee_name text, ex_name text, detail_en text, detail_he text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
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

drop policy if exists "messages switched off" on public.coach_messages;
drop trigger if exists keep_coach_meals on public.nutrition_targets;

-- The meal check goes back to four slots, unless someone already logged
-- food in the new ones (then it stays wider so their food isn't lost).
do $$
begin
  if not exists (select 1 from public.food_logs where meal in ('snack2', 'snack3')) then
    alter table public.food_logs drop constraint if exists food_logs_meal_check;
    alter table public.food_logs add constraint food_logs_meal_check
      check (meal in ('breakfast', 'lunch', 'dinner', 'snack'));
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
