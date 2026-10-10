-- Security round 2. Run once in the Supabase SQL editor; safe to run again.
--
--  1. html_escape(): small helper so user-controlled text (a trainee's name,
--     an exercise name, set details) can't inject links or images into the
--     HTML emails the coach receives.
--  2. check_for_new_prs() and check_inactive_trainees() recreated with the
--     email body escaped. Subjects, push text and admin_notifications are
--     plain text and are left as they were. Both keep security definer.
--  3. push_subscriptions: users can no longer edit last_test_at /
--     last_sent_date, so they can't reset the test-notification cooldown.
--     The edge function uses the service role and is unaffected.
--  4. error_logs: automatic purge of entries older than 90 days, matching
--     the privacy notice.
--
-- Run the verification queries at the bottom afterwards.

-- ---------- 1. HTML escaping helper ----------
create or replace function public.html_escape(t text)
 returns text
 language sql
 immutable
 set search_path = ''
as $$
  select replace(replace(replace(replace(coalesce(t,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;')
$$;

-- Not for the public API. The security-definer functions below are owned by
-- postgres and can still call it.
revoke execute on function public.html_escape(text) from public, anon, authenticated;

-- ---------- 2a. PR alert (same as supabase-reps-pr-alert.sql, email body escaped) ----------
create or replace function public.check_for_new_prs()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
        and e.entry_elem ->> 'exerciseId' = ex_id
        and (
          case
            when ex_category = 'cardio' then s.set_elem->>'duration'
            when ex_bodyweight then s.set_elem->>'reps'
            else s.set_elem->>'weight'
          end
        ) ~ numeric_pattern;

      if prev_best is null or this_top > prev_best then
        select coalesce(full_name, email) into trainee_name from profiles where id = NEW.user_id;

        -- Build a full description of the actual set, not just the one
        -- headline number.
        if ex_category = 'cardio' then
          detail_text := this_top || ' min';
          if nullif(this_top_set->>'intensity', '') is not null then
            detail_text := detail_text || ' · intensity ' || (this_top_set->>'intensity');
          end if;
          if nullif(this_top_set->>'distance', '') is not null then
            detail_text := detail_text || ' · ' || (this_top_set->>'distance') || ' ' || ex_unit;
          end if;
        elsif ex_bodyweight then
          detail_text := this_top || ' reps';
          if nullif(this_top_set->>'weight', '') is not null
            and (this_top_set->>'weight') ~ numeric_pattern
            and (this_top_set->>'weight')::numeric > 0 then
            detail_text := '+' || (this_top_set->>'weight') || ex_unit || ' × ' || detail_text;
          end if;
        else
          detail_text := this_top || ex_unit;
          if nullif(this_top_set->>'reps', '') is not null then
            detail_text := detail_text || ' × ' || (this_top_set->>'reps');
          end if;
        end if;

        perform send_admin_email(
          trainee_name || ' just hit a new PR 🏆',
          '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
          public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
        );
        perform send_admin_push(
          '🏆 New PR: ' || trainee_name,
          ex_name || ' — ' || detail_text
        );

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

          perform send_admin_email(
            trainee_name || ' just hit a new PR 🏆',
            '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
            public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
          );
          perform send_admin_push(
            '🏆 New PR: ' || trainee_name,
            ex_name || ' — ' || detail_text
          );

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

-- ---------- 2b. Inactivity alert (email body escaped) ----------
create or replace function public.check_inactive_trainees()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  last_date date;
  days_since integer;
  already_alerted boolean;
begin
  for r in
    select distinct p.id, coalesce(p.full_name, p.email) as name, p.inactivity_alert_days
    from profiles p
    where p.is_admin = false
      and exists (select 1 from routines rt where rt.user_id = p.id)
  loop
    begin
      select max(date) into last_date from sessions where user_id = r.id;
      if last_date is null then continue; end if;
      days_since := current_date - last_date;
      if days_since < r.inactivity_alert_days then continue; end if;
      select exists (
        select 1 from admin_notifications
        where type = 'inactivity' and trainee_id = r.id and sent_at::date > last_date
      ) into already_alerted;
      if already_alerted then continue; end if;
      perform send_admin_email(
        r.name || ' has gone quiet',
        '<p><strong>' || public.html_escape(r.name) || '</strong> hasn''t logged a session in ' || days_since || ' days (last one: ' || last_date || ').</p>'
      );
      perform send_admin_push('💤 ' || r.name || ' has gone quiet', days_since || ' days since their last session (' || last_date || ')');
      insert into admin_notifications (type, trainee_id, detail) values ('inactivity', r.id, days_since || ' days since last session');
    exception when others then
      raise warning 'check_inactive_trainees failed for %: %', r.name, sqlerrm;
    end;
  end loop;
end;
$function$;

revoke execute on function public.check_inactive_trainees() from public, anon, authenticated;

-- ---------- 3. Test-notification cooldown can't be reset ----------
-- Column privileges: signed-in users may update only the columns the app's
-- upsert in src/lib/push.js writes. last_test_at and last_sent_date stay
-- writable by the server (service role / postgres) only.
revoke update on public.push_subscriptions from authenticated;
grant update (endpoint, p256dh, auth, remind_time, tz, lang, updated_at, user_id)
  on public.push_subscriptions to authenticated;

-- ---------- 4. Error log retention: delete after 90 days ----------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-old-error-logs') then
    perform cron.unschedule('purge-old-error-logs');
  end if;
  perform cron.schedule(
    'purge-old-error-logs',
    '30 3 * * *',
    $job$delete from public.error_logs where created_at < now() - interval '90 days'$job$
  );
end $$;

-- ---------- Verification (read-only) ----------
-- html_escape: all three should be false
select has_function_privilege('anon', 'public.html_escape(text)', 'execute') as anon_can_escape,
       has_function_privilege('authenticated', 'public.html_escape(text)', 'execute') as authed_can_escape,
       has_function_privilege('anon', 'public.check_inactive_trainees()', 'execute') as anon_can_inactive,
       has_function_privilege('authenticated', 'public.check_inactive_trainees()', 'execute') as authed_can_inactive;

-- Escaping works: expect &lt;a href=&quot;x&quot;&gt;hi&lt;/a&gt; &amp; co
select public.html_escape('<a href="x">hi</a> & co');

-- Column update rights for signed-in users: last_test_at / last_sent_date should be false
select column_name,
       has_column_privilege('authenticated', 'public.push_subscriptions', column_name, 'update') as authed_can_update
from information_schema.columns
where table_schema = 'public' and table_name = 'push_subscriptions'
order by ordinal_position;

-- Both alert functions should show html_escape in their source
select proname, prosrc like '%html_escape%' as escapes_html
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('check_for_new_prs', 'check_inactive_trainees');

-- Purge job scheduled daily at 03:30
select jobname, schedule, command, active from cron.job where jobname = 'purge-old-error-logs';
