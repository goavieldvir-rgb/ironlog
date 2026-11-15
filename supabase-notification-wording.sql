-- Notification wording, November 2026. Run once in the SQL editor.
--  1. The owner's new-record alert (ntfy and email) in the owner's language,
--     Hebrew by default.
--  2. "Gone quiet" comes once: the separate morning alert and email stop,
--     the coach's To do item (and its morning summary) stays.
--  3. The morning summary's ntfy backup says "new tasks", like the app.
--  4. A second coach's new-record push also gets the Hebrew detail line.
-- Built on the live definitions from supabase-multi-coach.sql (PR 88).
-- The Edge Function send-workout-reminders is deployed with it.
-- Undo: supabase-notification-wording-rollback.sql.

-- The language for the owner's own alerts (ntfy and email): the language of
-- the owner's most recent phone with app notifications, Hebrew otherwise.
create or replace function public.owner_lang()
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select s.lang from push_subscriptions s join profiles p on p.id = s.user_id
    where p.is_admin order by s.updated_at desc limit 1
  ), 'he')
$function$;
revoke execute on function public.owner_lang() from public, anon, authenticated;

-- A trainee's new record, to the owner by email and ntfy, in the owner's
-- language. detail_en is also what the app stores and shows.
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

CREATE OR REPLACE FUNCTION public.check_for_new_prs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  entry jsonb;
  set_row jsonb;
  ex_category text;
  ex_bodyweight boolean;
  ex_name text;
  ex_id text;
  ex_unit text;
  this_top numeric;
  this_top_set jsonb;
  prev_best numeric;
  reps_set jsonb;
  reps_top numeric;
  prev_reps numeric;
  prev_cnt int;
  trainee_name text;
  detail_text text;
  detail_he text;
  numeric_pattern text := '^-?[0-9]+\.?[0-9]*$';
begin
  begin
    for entry in select * from jsonb_array_elements(NEW.entries)
    loop
      ex_name := entry->>'name';
      ex_id := entry->>'exerciseId';
      ex_category := coalesce(entry->>'category', 'strength');
      ex_bodyweight := coalesce((entry->>'bodyweight')::boolean, false);
      ex_unit := coalesce(entry->>'unit', 'kg');
      this_top := null;
      this_top_set := null;

      for set_row in select * from jsonb_array_elements(entry->'sets')
      loop
        if ex_category = 'cardio' then
          if nullif(set_row->>'duration', '') is not null
            and (set_row->>'duration') ~ numeric_pattern
            and (this_top is null or (set_row->>'duration')::numeric > this_top) then
            this_top := (set_row->>'duration')::numeric;
            this_top_set := set_row;
          end if;
        elsif ex_bodyweight then
          if nullif(set_row->>'reps', '') is not null
            and (set_row->>'reps') ~ numeric_pattern
            and (this_top is null or (set_row->>'reps')::numeric > this_top) then
            this_top := (set_row->>'reps')::numeric;
            this_top_set := set_row;
          end if;
        else
          if nullif(set_row->>'weight', '') is not null
            and (set_row->>'weight') ~ numeric_pattern
            and (this_top is null or (set_row->>'weight')::numeric > this_top) then
            this_top := (set_row->>'weight')::numeric;
            this_top_set := set_row;
          end if;
        end if;
      end loop;

      if this_top is null or this_top = 0 then
        continue;
      end if;

      select max(
        case
          when ex_category = 'cardio' then (s.set_elem->>'duration')::numeric
          when ex_bodyweight then (s.set_elem->>'reps')::numeric
          else (s.set_elem->>'weight')::numeric
        end
      ) into prev_best
      from sessions sess,
        jsonb_array_elements(sess.entries) as e(entry_elem),
        jsonb_array_elements(e.entry_elem -> 'sets') as s(set_elem)
      where sess.user_id = NEW.user_id
        and sess.id != NEW.id
        -- Records count per gym: a machine at one gym isn't the same weight
        -- as at another. No gym (null) is the person's main gym.
        and sess.gym_id is not distinct from NEW.gym_id
        and e.entry_elem ->> 'exerciseId' = ex_id
        and (
          case
            when ex_category = 'cardio' then s.set_elem->>'duration'
            when ex_bodyweight then s.set_elem->>'reps'
            else s.set_elem->>'weight'
          end
        ) ~ numeric_pattern;

      -- First time at this gym but done before at another: no record to
      -- beat yet, the same as the workout screen shows.
      if (prev_best is null and not exists (
            select 1 from sessions sess
            where sess.user_id = NEW.user_id and sess.id != NEW.id
              and sess.entries @> jsonb_build_array(jsonb_build_object('exerciseId', ex_id))))
        or this_top > prev_best then
        select coalesce(full_name, email) into trainee_name from profiles where id = NEW.user_id;

        -- Build a full description of the actual set, not just the one
        -- headline number.
        if ex_category = 'cardio' then
          detail_text := this_top || ' min';
          detail_he := this_top || ' דק׳';
          if nullif(this_top_set->>'intensity', '') is not null then
            detail_text := detail_text || ' · intensity ' || (this_top_set->>'intensity');
            detail_he := detail_he || ' · עצימות ' || (this_top_set->>'intensity');
          end if;
          if nullif(this_top_set->>'distance', '') is not null then
            detail_text := detail_text || ' · ' || (this_top_set->>'distance') || ' ' || ex_unit;
            detail_he := detail_he || ' · ' || (this_top_set->>'distance') || ' ' || ex_unit;
          end if;
        elsif ex_bodyweight then
          detail_text := this_top || ' reps';
          detail_he := this_top || ' חזרות';
          if nullif(this_top_set->>'weight', '') is not null
            and (this_top_set->>'weight') ~ numeric_pattern
            and (this_top_set->>'weight')::numeric > 0 then
            detail_text := '+' || (this_top_set->>'weight') || ex_unit || ' × ' || detail_text;
            detail_he := '+' || (this_top_set->>'weight') || ex_unit || ' × ' || detail_he;
          end if;
        else
          detail_text := this_top || ex_unit;
          if nullif(this_top_set->>'reps', '') is not null then
            detail_text := detail_text || ' × ' || (this_top_set->>'reps');
          end if;
          detail_he := detail_text;
        end if;

        if public.owner_gets_alerts(NEW.user_id) then
        perform send_pr_alert(trainee_name, ex_name, detail_text, detail_he);
        else
          perform public.notify_coach_pr(NEW.user_id, ex_name || ' — ' || detail_text, ex_name || ' — ' || detail_he);
        end if;

        insert into admin_notifications (type, trainee_id, detail)
        values ('pr', NEW.user_id, ex_name || ': ' || detail_text);

      elsif coalesce(ex_category, '') <> 'cardio' and not coalesce(ex_bodyweight, false) then
        -- Not a heavier lift, but maybe more reps than ever at this weight
        -- or heavier (a Reps PR). Needs an earlier set to beat. Mirrors the
        -- app: working sets only, judged against other sessions.
        reps_set := null;
        reps_top := null;
        for set_row in select * from jsonb_array_elements(entry->'sets')
        loop
          -- CASE keeps the numeric casts from running on blank or non-numeric
          -- text (SQL does not promise AND/OR short-circuiting).
          if coalesce(set_row->>'warmup', '') = 'true'
            or coalesce(case when (set_row->>'weight') ~ numeric_pattern then (set_row->>'weight')::numeric end, 0) <= 0
            or coalesce(case when (set_row->>'reps') ~ numeric_pattern then (set_row->>'reps')::numeric end, 0) <= 0 then
            continue;
          end if;

          select max((s.set_elem->>'reps')::numeric), count(*)
            into prev_reps, prev_cnt
          from sessions sess,
            jsonb_array_elements(sess.entries) as e(entry_elem),
            jsonb_array_elements(e.entry_elem -> 'sets') as s(set_elem)
          where sess.user_id = NEW.user_id
            and sess.id != NEW.id
            and sess.gym_id is not distinct from NEW.gym_id
            and e.entry_elem ->> 'exerciseId' = ex_id
            and coalesce(s.set_elem->>'warmup', '') <> 'true'
            and coalesce(case when (s.set_elem->>'weight') ~ numeric_pattern
                               and (s.set_elem->>'reps') ~ numeric_pattern
                              then (s.set_elem->>'weight')::numeric end, -1) >= (set_row->>'weight')::numeric;

          if prev_cnt > 0 and (set_row->>'reps')::numeric > prev_reps
            and (reps_top is null or (set_row->>'reps')::numeric > reps_top) then
            reps_top := (set_row->>'reps')::numeric;
            reps_set := set_row;
          end if;
        end loop;

        if reps_set is not null then
          select coalesce(full_name, email) into trainee_name from profiles where id = NEW.user_id;
          detail_text := 'Reps PR ' || (reps_set->>'weight') || ex_unit || ' × ' || (reps_set->>'reps') || ' reps';
          detail_he := 'שיא חזרות: ' || (reps_set->>'weight') || ex_unit || ' × ' || (reps_set->>'reps');

          if public.owner_gets_alerts(NEW.user_id) then
          perform send_pr_alert(trainee_name, ex_name, detail_text, detail_he);
          else
            perform public.notify_coach_pr(NEW.user_id, ex_name || ' — ' || detail_text, ex_name || ' — ' || detail_he);
          end if;

          insert into admin_notifications (type, trainee_id, detail)
          values ('pr', NEW.user_id, ex_name || ': ' || detail_text);
        end if;
      end if;
    end loop;
  exception when others then
    raise warning 'check_for_new_prs failed (session still saved normally): %', sqlerrm;
  end;

  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_coach_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  secret text;
  pending integer;
begin
  perform refresh_coach_tasks(today);

  select count(*) into pending from coach_tasks where done_at is null and notified_at is null;
  if pending = 0 then return; end if;

  select value into secret from push_config where key = 'cron_secret';
  -- The function sends each coach their own trainees' tasks, and falls back
  -- to ntfy (the owner's phone) for the owner's tasks.
  if secret is not null and exists (
    select 1 from push_subscriptions s join profiles p on p.id = s.user_id where p.is_admin or p.is_coach
  ) then
    perform net.http_post(
      url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('coach_tasks', true)
    );
  else
    select count(*) into pending from coach_tasks
      where done_at is null and notified_at is null
        and case when trainee_id is null
          then coach_id in (select id from profiles where is_admin)
          else public.owner_gets_alerts(trainee_id) end;
    if pending = 0 then return; end if;
    perform send_admin_push(
      'Ironlog: ' || case when pending = 1 then 'משימה חדשה אחת' else pending || ' משימות חדשות' end,
      case when pending = 1 then 'יש דבר חדש אחד שדורש תשומת לב.' else 'יש ' || pending || ' דברים חדשים שדורשים תשומת לב.' end || ' פתחו את מסך המתאמנים.'
    );
    update coach_tasks set notified_at = now() where done_at is null and notified_at is null
      and case when trainee_id is null
          then coach_id in (select id from profiles where is_admin)
          else public.owner_gets_alerts(trainee_id) end;
  end if;
end;
$function$;

revoke execute on function public.run_coach_tasks() from public, anon, authenticated;

-- The two-argument version is replaced by the one above.
drop function if exists public.notify_coach_pr(uuid, text);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-inactivity-check') then
    perform cron.unschedule('daily-inactivity-check');
  end if;
end $$;
